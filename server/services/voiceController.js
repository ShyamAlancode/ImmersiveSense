import { getCapabilitySnapshot, hasCredentials } from "./modelRouter.js";
import { converseWithModelFailover, invokeTranscriptionWithModelFailover } from "./modelInvoker.js";
import {
  buildNarrationPrompt,
  buildVoiceCoachPrompt,
  buildVoiceFallback,
  decodeBase64Audio,
  getVoiceConversationSession,
} from "./voiceCommon.js";

export async function respondWithVoice({
  text = "",
  audioBase64 = null,
  conversationId = null,
  _playbackMode = "auto",
  _voiceId = null,
  mode = "narrate",
  context = null,
}) {
  const session = getVoiceConversationSession(conversationId);
  const audioBuffer = audioBase64 ? decodeBase64Audio(audioBase64) : null;
  const userMessage = String(text || "").trim();
  const fallbackText = buildVoiceFallback({
    text,
    context,
    userMessage,
  });

  if (!hasCredentials()) {
    if (userMessage) {
      session.history.push({ role: "user", content: userMessage });
    }
    session.history.push({ role: "assistant", content: fallbackText });
    return {
      conversationId: session.id,
      transcript: fallbackText,
      assistantText: fallbackText,
      inputTranscript: userMessage || null,
      audioBase64: null,
      contentType: null,
      source: "caption-only",
      fallbackUsed: true,
      capabilities: getCapabilitySnapshot(),
    };
  }

  try {
    // 1. STT: transcribe audio if present, otherwise use text input
    let inputTranscript = userMessage;
    if (audioBuffer?.length && !inputTranscript) {
      inputTranscript = await invokeTranscriptionWithModelFailover("voice_stt", audioBuffer);
    }

    // 2. LLM: generate assistant response
    const systemPrompt = mode === "coach"
      ? buildVoiceCoachPrompt(context, session)
      : buildNarrationPrompt();

    const messages = [
      ...session.history.slice(-6),
      { role: "user", content: inputTranscript || userMessage },
    ];

    const assistantText = await converseWithModelFailover(
      "chat",
      systemPrompt,
      messages,
      {
        maxTokens: 400,
        temperature: 0.2,
        modelIds: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gemini-2.5-flash"],
      }
    );

    // 3. Persist turn
    if (inputTranscript) {
      session.history.push({ role: "user", content: inputTranscript });
    }
    session.history.push({ role: "assistant", content: assistantText });

    // Note: Audio synthesis is now handled client-side by Browser TTS.
    // The server returns the text and the client speaks it.
    return {
      conversationId: session.id,
      transcript: assistantText,
      assistantText,
      inputTranscript: inputTranscript || null,
      audioBase64: null,
      contentType: null,
      source: "hybrid-discrete",
      fallbackUsed: false,
    };
  } catch (error) {
    console.warn("Voice synthesis fallback:", error?.message || error);
    if (userMessage) {
      session.history.push({ role: "user", content: userMessage });
    }
    session.history.push({ role: "assistant", content: fallbackText });
    return {
      conversationId: session.id,
      transcript: fallbackText,
      assistantText: fallbackText,
      inputTranscript: userMessage || null,
      audioBase64: null,
      contentType: null,
      source: "caption-only",
      fallbackUsed: true,
      capabilities: getCapabilitySnapshot(),
    };
  }
}
