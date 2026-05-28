import {
  converseGemini,
  converseGeminiStream,
  embedGemini,
  visionGemini,
} from "../middleware/gemini.js";
import {
  converseGroq,
  converseGroqStream,
  transcribeGroq,
  visionGroq,
} from "../middleware/groq.js";
import { getModelCandidateOrder, rememberWorkingModel } from "./modelRouter.js";
import { PLACEHOLDER_SCENE_SPEC } from "./plan/shared.js";

function normalizeModelIds(kind, modelIds = null) {
  const ids = Array.isArray(modelIds) ? modelIds : getModelCandidateOrder(kind);
  return [...new Set(
    ids
      .map((modelId) => String(modelId || "").trim())
      .filter(Boolean)
  )];
}

function buildAggregateModelError(kind, attempts = []) {
  const detail = attempts
    .map(({ modelId, error }) => `${modelId}: ${error?.message || error}`)
    .join(" | ");
  return new Error(detail
    ? `All ${kind} model candidates failed. ${detail}`
    : `All ${kind} model candidates failed.`);
}

/**
 * Core invoker that tries model candidates in order.
 */
export async function runWithModelFailover(kind, run, options = {}) {
  const modelIds = normalizeModelIds(kind, options.modelIds);
  if (!modelIds.length) {
    if (kind === "vision") return PLACEHOLDER_SCENE_SPEC;
    throw new Error(`No ${kind} model candidates are configured.`);
  }

  const attempts = [];
  for (const modelId of modelIds) {
    try {
      const result = await run(modelId);
      rememberWorkingModel(kind, modelId);
      return result;
    } catch (error) {
      const errorMsg = error?.message || String(error);
      const isRetryable = errorMsg.includes("Connection error") || errorMsg.includes("ECONNRESET") || errorMsg.includes("ETIMEDOUT");
      
      if (isRetryable) {
        console.warn(`[Failover] Model ${modelId} failed with transient error. Retrying...`);
        try {
          const retryResult = await run(modelId);
          rememberWorkingModel(kind, modelId);
          return retryResult;
        } catch (retryError) {
          console.warn(`[Failover] Model ${modelId} retry failed:`, retryError.message);
        }
      }
      
      console.warn(`[Failover] Model ${modelId} failed for ${kind}:`, errorMsg.slice(0, 200));
      attempts.push({ modelId, error });
    }
  }

  // Final emergency fallbacks
  if (kind === "vision") {
    console.error("Critical vision failure, returning placeholder.");
    return PLACEHOLDER_SCENE_SPEC;
  }

  throw buildAggregateModelError(kind, attempts);
}

/**
 * Higher-level wrapper for Chat/Reasoning (Handles both Groq and Gemini).
 */
export async function converseWithModelFailover(kind, systemPrompt, messages, options = {}) {
  return runWithModelFailover(kind, (modelId) => {
    if (modelId.startsWith("gemini")) {
      return converseGemini(modelId, systemPrompt, messages, options);
    }
    return converseGroq(modelId, systemPrompt, messages, options);
  }, options);
}

/**
 * Streaming Chat/Reasoning.
 */
export async function* converseStreamWithModelFailover(kind, systemPrompt, messages, options = {}, overrides = {}) {
  const modelIds = normalizeModelIds(kind, overrides.modelIds || options.modelIds);
  if (!modelIds.length) {
    throw new Error(`No ${kind} model candidates are configured.`);
  }

  const attempts = [];
  for (const modelId of modelIds) {
    let yieldedChunk = false;
    try {
      const stream = overrides.converseNovaStream
        ? overrides.converseNovaStream(modelId, systemPrompt, messages, options)
        : (modelId.startsWith("gemini")
          ? converseGeminiStream(modelId, systemPrompt, messages, options)
          : converseGroqStream(modelId, systemPrompt, messages, options));

      for await (const chunk of stream) {
        yieldedChunk = true;
        yield chunk;
      }
      rememberWorkingModel(kind, modelId);
      return;
    } catch (error) {
      attempts.push({ modelId, error });
      if (yieldedChunk) throw error;
    }
  }

  throw buildAggregateModelError(kind, attempts);
}

/**
 * Embedding-specific wrapper.
 */
export async function invokeEmbeddingWithModelFailover(kind, text, options = {}) {
  return runWithModelFailover(kind, (modelId) => embedGemini(modelId, text, options));
}

/**
 * Vision-specific wrapper.
 */
export async function invokeVisionWithModelFailover(kind, prompt, imageAsset, options = {}) {
  return runWithModelFailover(kind, (modelId) => {
    if (modelId.startsWith("gemini")) {
      return visionGemini(modelId, prompt, imageAsset, options);
    }
    return visionGroq(modelId, prompt, imageAsset, options);
  });
}

/**
 * Transcription-specific wrapper.
 */
export async function invokeTranscriptionWithModelFailover(kind, audioSource, options = {}) {
  return runWithModelFailover(kind, (_modelId) => transcribeGroq(audioSource, options));
}
