import { normalizeScenePlan } from "../../../src/ai/planSchema.js";
import { PLAN_SYSTEM_PROMPT, EASY_PLAN_SYSTEM_PROMPT } from "./prompts.js";
import { cleanupJson } from "./shared.js";
import { converseWithModelFailover } from "../modelInvoker.js";
import { promoteNovaPlanToAnalyticAuto } from "./novaAnalyticAuto.js";
import { classifyQuestion } from "../cas/index.js";

const PLAN_MAX_TOKEN_ATTEMPTS = [4096, 7000, 11000];
const PLAN_TEMPERATURE = 0;

/**
 * 4-tier question classifier:
 *   trivial  → CAS only (0 LLM tokens)
 *   easy     → Llama 3.1 8B (short prompt)
 *   moderate → Llama 3.3 70B
 *   hard_jee → Gemini Flash (vision + complex reasoning)
 */
export function classifyTextDifficulty(questionText = "") {
  // Delegate to CAS classifier first (handles arithmetic, trig, calculus, algebra, 3D)
  const casTier = classifyQuestion(questionText);
  if (casTier === "trivial") return "trivial";
  if (casTier === "hard_jee") return "hard_jee";

  const text = questionText.toLowerCase();

  // JEE/Advanced indicators → Gemini Flash
  const hasJeeKeywords = /\b(jee|advanced|main|olympiad|iit|flux|magnetic|electric field|charge density|permittivity|epsilon|gauss|eigenvalue|laplacian)\b/.test(text);
  const hasComplexMath = /(\(a\).*\(b\).*\(c\))|(\(i\).*\(ii\).*\(iii\))|\b(intersection of|skew lines|shortest distance between|projection of)\b/i.test(text);

  if (hasJeeKeywords || hasComplexMath) return "hard_jee";

  // Easy: simple draw commands or very short questions → 8B
  const wordCount = questionText.split(/\s+/).filter(Boolean).length;
  const isSimpleDraw = /^\s*(draw|show|create|make|plot)\s+(a\s+)?(sphere|cube|cuboid|cylinder|cone|pyramid|point|line|plane)\b/i.test(text);
  if (wordCount <= 6 || isSimpleDraw || casTier === "easy") return "easy";

  // Moderate: algebra, coordinate geometry → 70B
  return "moderate";
}

function isRecoverablePlanParseError(error) {
  return error instanceof SyntaxError
    || /Unexpected token|Unterminated string|Expected/i.test(error?.message || "");
}

export async function planFromNova({ questionText, mode, sceneSnapshot, sourceSummary, exemplar = null }) {
  const messages = [
    {
      role: "user",
      content: JSON.stringify({
        question: questionText,
        mode,
        sourceSummary,
        sceneSnapshot: sceneSnapshot || null,
        retrievedExemplar: exemplar
          ? {
            title: exemplar.title,
            summary: exemplar.summary,
            recommendedCategory: exemplar.recommendedCategory,
            scriptBeat: exemplar.scriptBeat,
          }
          : null,
      }),
    },
  ];

  const difficulty = classifyTextDifficulty(questionText);

  // Cost-based model selection:
  //   easy     → 8B is sufficient, fast, cheap
  //   moderate → 70B for reliable algebra/geometry
  //   hard_jee → Gemini Flash for complex vision/olympiad
  let modelIds;
  if (difficulty === "easy") {
    modelIds = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gemini-2.5-flash"];
  } else if (difficulty === "moderate") {
    modelIds = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemini-2.5-flash"];
  } else {
    // hard_jee — premium model first
    modelIds = ["gemini-2.5-flash", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  }

  const systemPrompt = difficulty === "easy" ? EASY_PLAN_SYSTEM_PROMPT : PLAN_SYSTEM_PROMPT;

  let lastError = null;
  for (const maxTokens of PLAN_MAX_TOKEN_ATTEMPTS) {
    try {
      const text = await converseWithModelFailover("text", systemPrompt, messages, {
        maxTokens,
        temperature: PLAN_TEMPERATURE,
        modelIds,
      });
      const normalizedPlan = normalizeScenePlan(JSON.parse(cleanupJson(text)));
      return promoteNovaPlanToAnalyticAuto(normalizedPlan, {
        questionText,
        sourceSummary,
      });
    } catch (error) {
      lastError = error;
      if (!isRecoverablePlanParseError(error) || maxTokens === PLAN_MAX_TOKEN_ATTEMPTS[PLAN_MAX_TOKEN_ATTEMPTS.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Nova planning failed.");
}
