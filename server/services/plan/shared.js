function stripCodeFences(text = "") {
  let cleaned = String(text || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

function extractJsonSubstring(text = "") {
  const trimmed = String(text || "").trim();
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  
  // Find the first occurrence of either { or [
  let firstStart = -1;
  if (objectStart >= 0 && arrayStart >= 0) {
    firstStart = Math.min(objectStart, arrayStart);
  } else if (objectStart >= 0) {
    firstStart = objectStart;
  } else if (arrayStart >= 0) {
    firstStart = arrayStart;
  }

  if (firstStart === -1) {
    return trimmed;
  }

  const opening = trimmed[firstStart];
  const closing = opening === "[" ? "]" : "}";
  const lastEnd = trimmed.lastIndexOf(closing);
  
  if (lastEnd < firstStart) {
    return trimmed.slice(firstStart);
  }
  
  return trimmed.slice(firstStart, lastEnd + 1);
}

function sanitizeJsonStringContent(text = "") {
  let result = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      result += char;
      if (char === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaping) {
      if (!/["\\/bfnrtu]/.test(char)) {
        result += "\\";
      }
      result += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaping = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = false;
      continue;
    }

    if (char === "\n") {
      result += "\\n";
      continue;
    }
    if (char === "\r") {
      result += "\\r";
      continue;
    }
    if (char === "\t") {
      result += "\\t";
      continue;
    }

    result += char;
  }

  if (escaping) {
    result += "\\";
  }

  return result;
}

export const PLACEHOLDER_SCENE_SPEC = {
  id: "placeholder_grid",
  type: "coordinate_grid",
  origin: [0, 0, 0],
  scale: [10, 10, 10],
  metadata: {
    description: "System Grid (Vision Fallback)",
    status: "error_placeholder",
  },
  objects: [
    {
      id: "ground_plane",
      type: "plane",
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [20, 20, 1],
      material: { color: "#333333", transparent: true, opacity: 0.2 },
    },
  ],
};

export function cleanupJson(text) {
  const withoutFences = stripCodeFences(text);
  const jsonLike = extractJsonSubstring(withoutFences);
  return sanitizeJsonStringContent(jsonLike);
}
