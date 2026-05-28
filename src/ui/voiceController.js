import {
  createVoiceSession,
  startVoiceSessionTurn,
  subscribeToVoiceSession,
} from "../ai/client.js";

// ─── Browser TTS State ────────────────────────────────────────────────────────
let ttsSessionId = null;
let ttsUnsubscribe = null;
let pendingTtsResolve = null;
let pendingTtsTimeoutId = null;
let currentSpeechUtterance = null;

// ─── Text cleanup ─────────────────────────────────────────────────────────────
function replaceFraction(match, numerator, denominator) {
  return `${numerator} over ${denominator}`;
}

export function stripMarkupForSpeech(text = "") {
  return String(text || "")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\$(?!\$)([\s\S]+?)\$(?!\$)/g, "$1")
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, replaceFraction)
    .replace(/\\vec\s*\{([^}]*)\}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Voice Selection (Progressive Fallback) ───────────────────────────────────
/**
 * Selects the best available browser voice.
 * Priority order:
 *   1. Google UK English Female
 *   2. Google US English
 *   3. Any Google English voice
 *   4. Microsoft English voice
 *   5. Any English voice
 *   6. System default
 */
export function getBestVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;

  const enVoices = voices.filter((v) =>
    v.lang?.toLowerCase().startsWith("en")
  );

  const preferredNames = [
    "Google UK English Female",
    "Google US English",
    "Google UK English Male",
  ];

  for (const name of preferredNames) {
    const match = enVoices.find((v) => v.name === name);
    if (match) return match;
  }

  const googleEnglish = enVoices.find((v) => v.name?.startsWith("Google"));
  if (googleEnglish) return googleEnglish;

  const microsoftEnglish = enVoices.find((v) =>
    v.name?.startsWith("Microsoft") && v.lang?.startsWith("en")
  );
  if (microsoftEnglish) return microsoftEnglish;

  return enVoices[0] || voices[0] || null;
}

// ─── TTS Playback ─────────────────────────────────────────────────────────────
function clearPendingTtsTimeout() {
  if (!pendingTtsTimeoutId) return;
  window.clearTimeout(pendingTtsTimeoutId);
  pendingTtsTimeoutId = null;
}

function resolvePendingTts() {
  clearPendingTtsTimeout();
  if (currentSpeechUtterance) {
    window.speechSynthesis?.cancel();
    currentSpeechUtterance = null;
  }
  if (!pendingTtsResolve) return;
  pendingTtsResolve();
  pendingTtsResolve = null;
}

/**
 * Speaks text via the Browser Web Speech API.
 * Returns a Promise that resolves when speech ends.
 */
function speakViaBrowser(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Defer voice selection to allow voices to load
    const assignVoice = () => {
      const voice = getBestVoice();
      if (voice) utterance.voice = voice;
    };

    if (window.speechSynthesis.getVoices().length) {
      assignVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        assignVoice();
        window.speechSynthesis.onvoiceschanged = null;
      };
    }

    currentSpeechUtterance = utterance;
    utterance.onend = () => {
      currentSpeechUtterance = null;
      resolve();
    };
    utterance.onerror = (event) => {
      // "interrupted" is benign — it happens when speech is cancelled from our side
      if (event.error !== "interrupted") {
        console.warn("Browser TTS error:", event.error);
      }
      currentSpeechUtterance = null;
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

// ─── Voice Session (for turn-based voice coach mode) ─────────────────────────
function handleVoiceSessionEvent(event = {}) {
  if (event.type === "assistant_text" && event.generationStage === "FINAL") {
    // Final LLM text received — dispatch to Browser TTS
    const text = stripMarkupForSpeech(event.content || "");
    if (text) {
      speakViaBrowser(text).then(() => resolvePendingTts());
    }
    return;
  }

  if (event.type === "done" || event.type === "interrupted") {
    // If no TTS was dispatched from assistant_text, resolve directly
    if (pendingTtsResolve && !currentSpeechUtterance) {
      resolvePendingTts();
    }
  }
}

async function ensureVoiceSession() {
  if (ttsSessionId && ttsUnsubscribe) {
    return ttsSessionId;
  }

  const session = await createVoiceSession();
  ttsSessionId = session.conversationId || session.sessionId || ttsSessionId;
  ttsUnsubscribe = subscribeToVoiceSession(ttsSessionId, {
    onEvent: handleVoiceSessionEvent,
    onError: (error) => {
      console.warn("Voice session stream error:", error);
      resolvePendingTts();
    },
  });
  return ttsSessionId;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Speak text via the tutor voice pipeline:
 *   1. Send text to backend voice session (for context tracking)
 *   2. Receive final text via SSE
 *   3. Speak via Browser Web Speech API
 */
async function startTextOnlyTurn(text) {
  const sessionId = await ensureVoiceSession();

  window.speechSynthesis?.cancel();
  currentSpeechUtterance = null;

  const playbackDone = new Promise((resolve) => {
    pendingTtsResolve = resolve;
    clearPendingTtsTimeout();
    // 12s timeout — longer than before since streaming → TTS adds latency
    pendingTtsTimeoutId = window.setTimeout(resolvePendingTts, 12000);
  });

  try {
    await startVoiceSessionTurn({
      sessionId,
      mode: "narrate",
      text,
      context: null,
      playbackMode: "auto",
    });
    await playbackDone;
  } catch (error) {
    resolvePendingTts();
    // Fallback: speak directly without session tracking
    try {
      await speakViaBrowser(text);
    } catch {
      // Silent fallthrough — TTS is best-effort
    }
    throw error;
  }
}

/**
 * Direct Browser TTS dispatch — bypasses session tracking.
 * Use for narration and non-coaching contexts.
 */
export async function speakDirect(text) {
  const plainText = stripMarkupForSpeech(text);
  if (!plainText || !window.speechSynthesis) return;
  await speakViaBrowser(plainText);
}

/**
 * Full TTS dispatch (session-tracked + Browser TTS).
 */
export async function dispatchTTS(text) {
  if (!window.speechSynthesis) return;
  const plainText = stripMarkupForSpeech(text);
  if (!plainText) return;
  await startTextOnlyTurn(plainText);
}

/**
 * Stop any in-progress TTS immediately.
 */
export function cancelTTS() {
  window.speechSynthesis?.cancel();
  currentSpeechUtterance = null;
  resolvePendingTts();
}
