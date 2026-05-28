import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY in environment");
  return key;
}

function getClient() {
  // Re-create client lazily so process.env is read after dotenv loads
  if (!genAI || !process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(getApiKey());
  }
  return genAI;
}

function getFlashModel() {
  return process.env.GEMINI_FLASH_MODEL || "gemini-2.0-flash";
}

function getEmbeddingModel() {
  return process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
}

/**
 * Call Gemini model synchronously.
 * Returns the full response text.
 */
export async function converseGemini(modelId, systemPrompt, messages, _options = {}) {
  const model = getClient().getGenerativeModel({
    model: modelId || getFlashModel(),
    systemInstruction: systemPrompt,
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content instanceof Array ? m.content.map(c => c.text || c).join(" ") : String(m.content || "") }],
  }));

  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage.content instanceof Array
    ? lastMessage.content.map(c => c.text || c).join(" ")
    : String(lastMessage.content || "");

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastContent);
  const response = await result.response;
  return response.text().trim();
}

/**
 * Stream a Gemini model response.
 * Yields text chunks as they arrive.
 */
export async function* converseGeminiStream(modelId, systemPrompt, messages, _options = {}) {
  const model = getClient().getGenerativeModel({
    model: modelId || getFlashModel(),
    systemInstruction: systemPrompt,
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = model.startChat({ history });

  const result = await chat.sendMessageStream(String(lastMessage.content || ""));
  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}

/**
 * Generate embeddings using Gemini embedding model.
 */
export async function embedGemini(modelId, text, options = {}) {
  // If only 1 argument is passed and it's not a model string, shift parameters (backwards compatibility)
  let resolvedModel = modelId;
  let resolvedText = text;
  let resolvedOptions = options;
  if (typeof resolvedModel !== "string" && resolvedText === undefined) {
    resolvedText = modelId;
    resolvedModel = getEmbeddingModel();
    resolvedOptions = text || {};
  } else if (typeof resolvedModel === "string" && typeof resolvedText !== "string") {
    // If 2 arguments are passed and second is an object, shift parameters
    resolvedOptions = resolvedText || {};
    resolvedText = resolvedModel;
    resolvedModel = getEmbeddingModel();
  }

  const model = getClient().getGenerativeModel({ model: resolvedModel || getEmbeddingModel() });
  const result = await model.embedContent({
    content: { parts: [{ text: String(resolvedText || "") }] },
    taskType: resolvedOptions.taskType || "RETRIEVAL_DOCUMENT",
  });
  return result.embedding.values;
}

/**
 * Vision-specific reasoning using Gemini.
 * Handles images passed as buffers/base64.
 */
export async function visionGemini(modelId, prompt, imageAsset, _options = {}) {
  const model = getClient().getGenerativeModel({ model: modelId || getFlashModel() });

  const parts = [{ text: prompt }];

  if (imageAsset && imageAsset.bytes) {
    parts.push({
      inlineData: {
        data: imageAsset.bytes instanceof Buffer
          ? imageAsset.bytes.toString("base64")
          : String(imageAsset.bytes || ""),
        mimeType: imageAsset.format === "png" ? "image/png" : "image/jpeg",
      },
    });
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  return response.text().trim();
}
