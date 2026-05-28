import { converseWithModelFailover } from "../../modelInvoker.js";
import { cleanupJson } from "../shared.js";

const PEDAGOGUE_SYSTEM_PROMPT = `You are the Pedagogue Agent in a multi-agent cognitive architecture.
Your job is to decide HOW to teach the verified mathematical solution to the student.
You will receive:
1. The student model state (mastery graph, active misconceptions, student level like beginner/intermediate/advanced).
2. The mathematician's solved result (formulas, steps, answer).

Decide:
- What sequence of learning stages to run (e.g. orient, build, predict, check, reflect, challenge).
- The pedagogical goal, coach message, focus prompt, and insight for each stage.
- Which math steps from the mathematician's solution should be revealed at which stage (e.g., reveal formula in check-stage, reveal full solution in final stage).
- Misconception tags to monitor for this topic.

You must output ONLY valid JSON in this exact structure:
{
  "pedagogyPlanned": true,
  "concept": "primary mathematical concept, e.g. Skew Lines Shortest Distance",
  "primaryInsight": "core visual/spatial insight the student must realize",
  "misconceptionsToWatch": ["confuses_normal_projection", "vector_subtraction_order"],
  "learningStages": [
    {
      "id": "orient-stage",
      "learningStage": "orient",
      "title": "Welcome",
      "coachMessage": "Let's explore the spatial configuration of these equations.",
      "goal": "Observe the layout and identify the given objects.",
      "prompt": "Look at the scene. Can you see the two lines?",
      "insight": "Understanding how the lines are positioned in space.",
      "whyItMatters": "This gives us a visual framework to understand the math.",
      "revealMathStepIds": ["step-1"]
    }
  ]
}

Rules:
- Never write coordinates or raw numbers in your messages. Use symbolic labels (e.g., "point A", "line L1") instead.
- Adapt tone and complexity to the student's level:
  - Beginner: use friendly analogies, break down steps, offer extensive scaffolding.
  - Advanced: challenge directly, encourage deep mathematical thinking.
- Output JSON only. No extra text outside of the JSON structure.`;

/**
 * Agent 2: Pedagogue
 * Designs the learning flow based on student mastery and the mathematical solution.
 * @param {object} params
 * @param {object} params.studentModel - Persistent student model state
 * @param {object} params.mathSolution - Resolved math output from Mathematician agent
 * @returns {Promise<object>} Pedagogical lesson plan
 */
export async function runPedagogueAgent({ studentModel, mathSolution }) {
  const modelUserText = JSON.stringify({
    studentModel: {
      learnerLevel: studentModel.learnerLevel,
      misconceptions: studentModel.misconceptions,
      averageMastery: Object.entries(studentModel.graph).reduce((sum, [_, n]) => sum + n.probability, 0) / Object.keys(studentModel.graph).length
    },
    mathSolution: {
      finalAnswer: mathSolution.finalAnswer,
      formulaLatex: mathSolution.formulaLatex,
      explanation: mathSolution.explanation,
      steps: mathSolution.steps.map((s) => ({ id: s.id, title: s.title }))
    }
  });

  const messages = [
    {
      role: "user",
      content: [{ text: modelUserText }]
    }
  ];

  const modelIds = ["gemini-2.5-flash", "llama-3.3-70b-versatile"];
  const rawText = await converseWithModelFailover("text", PEDAGOGUE_SYSTEM_PROMPT, messages, {
    maxTokens: 2048,
    temperature: 0.25,
    modelIds
  });

  const parsed = JSON.parse(cleanupJson(rawText));
  
  if (!parsed.learningStages || !parsed.learningStages.length) {
    throw new Error("Pedagogue Agent failed to generate learning stages.");
  }

  return {
    pedagogyPlanned: true,
    concept: parsed.concept || "Mathematical Concept Walkthrough",
    primaryInsight: parsed.primaryInsight || "Visualizing the geometric relations.",
    misconceptionsToWatch: parsed.misconceptionsToWatch || [],
    learningStages: parsed.learningStages
  };
}
