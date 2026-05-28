import { casDispatch, casResultToPlanFields } from "../../cas/index.js";
import { converseWithModelFailover } from "../../modelInvoker.js";
import { cleanupJson } from "../shared.js";

const MATHEMATICIAN_SYSTEM_PROMPT = `You are the Mathematician Agent in a multi-agent cognitive architecture.
Your sole job is to solve the given math problem and output a verified mathematical structure.
You do not plan lessons, write pedagogy, or generate 3D scenes.
You only do math.

Analyze the question and provide:
1. The mathematical variables/parameters (with their values/coordinates).
2. The equations/relationships between the parameters.
3. The formulas used.
4. Step-by-step mathematical calculations.
5. The final numeric/symbolic answer.

You must output ONLY valid JSON in this exact structure:
{
  "solved": true,
  "finalAnswer": "string",
  "formulaLatex": "string",
  "explanation": "concise mathematical justification",
  "variables": [
    { "name": "r", "value": 3, "unit": "cm", "description": "radius of cylinder" }
  ],
  "steps": [
    { "id": "step-1", "title": "Identify formula", "formula": "V = \\\\pi r^2 h", "instruction": "We identify the volume of a cylinder formula." },
    { "id": "step-2", "title": "Substitute values", "formula": "V = \\\\pi (3)^2 (5)", "instruction": "Substitute r=3 and h=5." }
  ],
  "geometry3d": {
    "points": [
      { "id": "P1", "label": "A", "position": [0, 0, 0] }
    ],
    "lines": [
      { "id": "L1", "label": "L1", "start": [0, 0, 0], "end": [3, 4, 0], "direction": [3, 4, 0] }
    ],
    "planes": [
      { "id": "PL1", "label": "P", "normal": [0, 1, 0], "constant": 0 }
    ]
  }
}

Rules:
- Be 100% accurate. Coordinate systems should map cleanly, typically staying within a [-5, 5] range on X, Y, Z.
- For 3D geometry questions, output points, lines, and planes under 'geometry3d'.
- Output JSON only. No markdown formatting or extra text outside of the JSON structure.`;

/**
 * Agent 1: Mathematician
 * Solves the math deterministically (using CAS) or falls back to LLM validation.
 * @param {object} params
 * @param {string} params.questionText
 * @returns {Promise<object>} Verified mathematical solution
 */
export async function runMathematicianAgent({ questionText }) {
  const query = (questionText || "").trim();
  if (!query) {
    throw new Error("Mathematician Agent received empty question.");
  }

  // 1. Try deterministic CAS solver first
  try {
    const casResult = casDispatch(query);
    if (casResult) {
      const planFields = casResultToPlanFields(casResult);
      if (planFields) {
        console.log(`[Mathematician Agent] Solved deterministically with CAS.`);
        
        // Convert to agent output schema
        return {
          solved: true,
          finalAnswer: String(casResult.finalAnswer),
          formulaLatex: casResult.formulaLatex || "",
          explanation: casResult.explanation || "",
          variables: [],
          steps: (casResult.steps || []).map((step, idx) => ({
            id: step.id || `step-${idx + 1}`,
            title: step.title || `Step ${idx + 1}`,
            formula: step.formula || "",
            instruction: step.explanation || step.instruction || ""
          })),
          geometry3d: casResult.geometry3d || { points: [], lines: [], planes: [] },
          casSolved: true,
          casType: casResult.type
        };
      }
    }
  } catch (err) {
    console.warn(`[Mathematician Agent] CAS solver failed/threw:`, err.message);
  }

  // 2. LLM fallback with mathematical proof structure
  console.log(`[Mathematician Agent] Falling back to LLM math solver.`);
  const messages = [
    {
      role: "user",
      content: [{ text: `Solve this math problem: "${query}"` }]
    }
  ];

  const modelIds = ["gemini-2.5-flash", "llama-3.3-70b-versatile"];
  const rawText = await converseWithModelFailover("text", MATHEMATICIAN_SYSTEM_PROMPT, messages, {
    maxTokens: 2048,
    temperature: 0,
    modelIds
  });

  const parsed = JSON.parse(cleanupJson(rawText));
  
  // Validation checks (e.g. basic structure sanity checks)
  if (!parsed.finalAnswer) {
    throw new Error("Mathematician Agent failed to compute a final answer.");
  }

  return {
    solved: true,
    finalAnswer: String(parsed.finalAnswer),
    formulaLatex: parsed.formulaLatex || "",
    explanation: parsed.explanation || "",
    variables: parsed.variables || [],
    steps: parsed.steps || [],
    geometry3d: parsed.geometry3d || { points: [], lines: [], planes: [] },
    casSolved: false
  };
}
