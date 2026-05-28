function getModels() {
  return {
    GEMINI: {
      FLASH: process.env.GEMINI_FLASH_MODEL || "gemini-2.5-flash",
      PRO: "gemini-2.0-pro",
      EMBEDDING: process.env.GEMINI_EMBEDDING_MODEL || "models/gemini-embedding-001",
    },
    GROQ: {
      CHAT: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
      FALLBACK: "llama-3.1-8b-instant",
      WHISPER: process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo",
    },
  };
}

function getDefaultModels() {
  const MODELS = getModels();
  const preferGroq = process.env.DEFAULT_VISION_PROVIDER === "groq";
  const groqVisionModel = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

  return {
    vision: preferGroq
      ? [groqVisionModel, MODELS.GEMINI.FLASH]
      : [MODELS.GEMINI.FLASH, groqVisionModel],
    chat: preferGroq
      ? [MODELS.GROQ.CHAT, MODELS.GROQ.FALLBACK, MODELS.GEMINI.FLASH]
      : [MODELS.GEMINI.FLASH, MODELS.GROQ.CHAT, MODELS.GROQ.FALLBACK],
    embeddings: [MODELS.GEMINI.EMBEDDING],
    voice_stt: [MODELS.GROQ.WHISPER],
  };
}

const workingModelByKind = new Map();

function uniqueNonEmpty(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

export function hasCredentials() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

export function hasAwsCredentials() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export function resolveModelCandidates(kind) {
  if (kind === "voice") {
    const rawId = process.env.NOVA_SONIC_MODEL_ID || "amazon.nova-2-sonic-v1:0";
    const normalized = rawId.replace(/^(?:global|us|eu|apac)\./, "");
    return uniqueNonEmpty([normalized, "amazon.nova-sonic-v1:0"]);
  }
  const normalizedKind = kind === "text" ? "chat" : kind;
  return uniqueNonEmpty(getDefaultModels()[normalizedKind] || []);
}

export function rememberWorkingModel(kind, modelId) {
  const normalizedKind = String(kind || "").trim();
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedKind || !normalizedModelId) return null;
  workingModelByKind.set(normalizedKind, normalizedModelId);
  return normalizedModelId;
}

export function clearWorkingModelCache(kind = null) {
  if (!kind) {
    workingModelByKind.clear();
    return;
  }
  workingModelByKind.delete(String(kind || "").trim());
}

export function getWorkingModelId(kind) {
  return workingModelByKind.get(String(kind || "").trim()) || null;
}

export function getModelCandidateOrder(kind) {
  return uniqueNonEmpty([
    getWorkingModelId(kind),
    ...resolveModelCandidates(kind),
  ]);
}

export function resolveModelId(kind) {
  return getModelCandidateOrder(kind)[0] || null;
}

export function getCapabilitySnapshot() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);

  return {
    configured: hasGemini || hasGroq,
    providers: {
      gemini: hasGemini,
      groq: hasGroq,
    },
    models: {
      vision: {
        preferred: resolveModelId("vision"),
        candidates: getModelCandidateOrder("vision"),
      },
      text: {
        preferred: resolveModelId("chat"),
        candidates: getModelCandidateOrder("chat"),
      },
      chat: {
        preferred: resolveModelId("chat"),
        candidates: getModelCandidateOrder("chat"),
      },
      embeddings: {
        preferred: resolveModelId("embeddings"),
        candidates: getModelCandidateOrder("embeddings"),
      },
    },
    inputs: {
      camera: hasGemini,
      mic: hasGroq,
    },
    fallbacks: {
      vision: "placeholder-scene-spec",
      chat: "client-side-logic",
      embeddings: "lexical-search",
      voice: hasGroq ? "native-sonic" : "caption-only",
    },
  };
}
