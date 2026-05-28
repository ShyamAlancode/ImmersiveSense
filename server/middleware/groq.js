import Groq from "groq-sdk";

let client = null;

function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY in environment");
  return key;
}

function getChatModel() {
  return process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile";
}

function getWhisperModel() {
  return process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
}

function getClient() {
  if (!client || !process.env.GROQ_API_KEY) {
    client = new Groq({ apiKey: getApiKey() });
  }
  return client;
}

function normalizeMessagesForGroq(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    let content = msg.content;
    if (Array.isArray(content)) {
      // Check if it's a multimodal request with image_url, keep as is
      const hasImage = content.some((item) => item && (item.type === "image_url" || item.image_url));
      if (hasImage) {
        return msg;
      }
      content = content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            return item.text || item.content || "";
          }
          return "";
        })
        .join("\n")
        .trim();
    } else if (content && typeof content === "object") {
      content = content.text || content.content || "";
    }
    return {
      role: msg.role,
      content: typeof content === "string" ? content : String(content || ""),
    };
  });
}

/**
 * Call Groq chat model synchronously.
 */
export async function converseGroq(modelId, systemPrompt, messages, options = {}) {
  const normalizedMessages = normalizeMessagesForGroq(messages);
  const response = await getClient().chat.completions.create({
    model: modelId || getChatModel(),
    messages: [
      { role: "system", content: systemPrompt },
      ...normalizedMessages
    ],
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.3,
  });
  return response.choices[0]?.message?.content?.trim() || "";
}

/**
 * Stream a Groq chat model response.
 */
export async function* converseGroqStream(modelId, systemPrompt, messages, options = {}) {
  const normalizedMessages = normalizeMessagesForGroq(messages);
  const stream = await getClient().chat.completions.create({
    model: modelId || getChatModel(),
    messages: [
      { role: "system", content: systemPrompt },
      ...normalizedMessages
    ],
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature ?? 0.4,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) yield content;
  }
}

/**
 * Transcribe audio using Groq Whisper.
 * Expects a buffer or a path to an audio file.
 */
export async function transcribeGroq(audioSource, options = {}) {
  const modelId = getWhisperModel();
  const file = audioSource instanceof Buffer
    ? await Groq.toFile(audioSource, "speech.mp3", { type: "audio/mpeg" })
    : audioSource;

  const transcription = await getClient().audio.transcriptions.create({
    file,
    model: modelId,
    response_format: options.responseFormat || "text",
  });
  return transcription;
}
export async function visionGroq(modelId, prompt, imageAsset, options = {}) {
  const model = modelId || "meta-llama/llama-4-scout-17b-16e-instruct";
  const data = imageAsset.bytes instanceof Buffer
    ? imageAsset.bytes.toString("base64")
    : String(imageAsset.bytes || "");
  const mimeType = imageAsset.format === "png" ? "image/png" : "image/jpeg";

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${data}` },
          },
        ],
      },
    ],
    max_tokens: options.maxTokens || 1024,
    temperature: options.temperature ?? 0.1,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
