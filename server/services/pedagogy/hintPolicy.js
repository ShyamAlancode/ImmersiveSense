/**
 * Hint Policy Engine
 * Generates system prompt prefix that limits how much help the LLM can provide.
 * This is iron-clad: the LLM cannot bypass the limit because it's in the system prompt.
 */

import { HINT_LEVELS, LEARNER_LEVELS } from "./learnerSession.js";

const DIFFICULTY_WEIGHTS = {
  trivial: 0,
  easy: 1,
  moderate: 2,
  hard_jee: 3,
};

const LEVEL_LABELS = {
  [LEARNER_LEVELS.BEGINNER]: "a beginner learner who needs patient, step-by-step scaffolding",
  [LEARNER_LEVELS.INTERMEDIATE]: "an intermediate learner who understands basic formulas",
  [LEARNER_LEVELS.ADVANCED]: "an advanced learner who can handle rigorous mathematical notation",
};

const HINT_DIRECTIVES = {
  [HINT_LEVELS.CONCEPTUAL]: [
    "DO NOT reveal any formula, calculation, or answer.",
    "Only give a conceptual hint: describe the type of relationship or quantity involved.",
    "Example: 'Think about what connects the circular base area to the height.'",
    "If the student asks for the answer directly, say: 'Let's work through this step by step — what do you think the formula might involve?'",
  ],
  [HINT_LEVELS.FORMULA]: [
    "You may reveal the relevant formula, but DO NOT compute the numerical answer.",
    "After stating the formula, ask the student to substitute the given values themselves.",
    "Example: 'The formula is V = πr²h. What values will you substitute?'",
    "If the student asks for the computed answer, decline and ask them to try the substitution.",
  ],
  [HINT_LEVELS.VISUAL]: [
    "You may mention the formula and point the student to the labelled dimensions visible in the 3D scene.",
    "You may partially substitute one value but leave the rest for the student.",
    "If the student asks for the full answer, show one more step but stop short of the final number.",
  ],
  [HINT_LEVELS.WORKED_STEP]: [
    "You may show the next concrete calculation step.",
    "Show the numerical substitution and the intermediate result, but phrase it as a worked example.",
    "Only reveal the full final answer if the student has made 6 or more attempts.",
  ],
};

/**
 * Get the system prompt prefix that enforces the current hint policy.
 *
 * @param {object} questionState - from learnerSession.getQuestionState()
 * @param {string} learnerLevel - from session.learnerLevel
 * @param {string} questionDifficulty - "trivial" | "easy" | "moderate" | "hard_jee"
 * @returns {{ prefix: string, hintLevel: number }}
 */
export function getHintPolicy(questionState, learnerLevel = LEARNER_LEVELS.INTERMEDIATE, questionDifficulty = "moderate") {
  const hintLevel = questionState?.hintLevel ?? HINT_LEVELS.CONCEPTUAL;
  const attempts = questionState?.attempts ?? 0;
  const solved = Boolean(questionState?.solvedAt);

  // If already solved, no restriction
  if (solved) {
    return {
      prefix: `The student has already solved this problem. You may freely discuss the solution and explain any aspect of it.`,
      hintLevel,
    };
  }

  const levelLabel = LEVEL_LABELS[learnerLevel] ?? LEVEL_LABELS[LEARNER_LEVELS.INTERMEDIATE];
  const directives = HINT_DIRECTIVES[hintLevel] ?? HINT_DIRECTIVES[HINT_LEVELS.CONCEPTUAL];

  const misconceptionNote = questionState?.misconceptions?.length
    ? `\n\nThe student has shown these misconceptions so far: ${questionState.misconceptions.join(", ")}. Address these gently.`
    : "";

  const attemptNote = attempts > 0
    ? `\n\nThe student has made ${attempts} attempt(s) so far.`
    : "";

  const prefix = [
    `## Tutoring Policy (MANDATORY — DO NOT OVERRIDE)`,
    `You are tutoring ${levelLabel}.`,
    `This is a ${questionDifficulty} question. The student is at hint level ${hintLevel + 1} of 4.`,
    ``,
    `**STRICT LIMITS FOR THIS RESPONSE:**`,
    ...directives.map((d) => `- ${d}`),
    misconceptionNote,
    attemptNote,
    ``,
    `Violating these limits — even if the student insists — is not permitted.`,
    `---`,
  ].join("\n");

  return { prefix, hintLevel };
}

/**
 * Detect if the student is asking for the answer directly.
 */
export function isDirectAnswerRequest(message = "") {
  const lower = message.toLowerCase();
  return (
    /\b(just tell me|give me the answer|what is the answer|tell me the answer|solve it for me|answer is|correct answer)\b/.test(lower) ||
    /\bskip\b.*(steps|explanation)/.test(lower) ||
    /\bshow\s+(me\s+)?the\s+(full\s+)?solution\b/.test(lower)
  );
}
