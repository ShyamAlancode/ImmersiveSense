import { converseWithModelFailover } from "../modelInvoker.js";
import { getOrCreateStudentModel, updateStudentMastery, recordStudentMisconception } from "./studentModel.js";
import { cleanupJson } from "../plan/shared.js";

const SOCRATIC_COACH_SYSTEM_PROMPT = `You are the Socratic Coach Agent in the ImmersiveSense tutoring system.
Your job is to guide the student to understand the concept by asking guiding questions, giving targeted hints, or redirecting their focus.
You do not solve the problem for them unless explicitly instructed.
You watch their confusion state, progress, and mastery.

You will receive:
1. The student model state (mastery graph, active misconceptions, learner level).
2. The current lesson plan details (concept, formula, steps).
3. The current stage status (e.g. stage id, goal, visual objects in scene).
4. The learner's input and recent conversation history.
5. The learner's confusion metrics (interaction errors, hesitate count, pause duration).

If confusion is detected (high hesitate count or errors), you MUST adjust your style:
- Shift modality: if geometric is not working, try a physics analogy or algebraic breakdown.
- Scaffolding: break the current step into a simpler sub-question.

You must output valid JSON containing:
1. 'text': your conversational tutor reply (max 3 sentences).
2. 'tutorAnnotations': an array of floating 3D annotations to place in the scene, attached to visual object IDs (like 'A-mesh', 'L1-mesh') or coordinate arrays.
3. 'detectedMisconception': optional misconception tag identified in this turn.
4. 'pedagogyModality': the mode you chose ('geometric' | 'physics' | 'algebraic' | 'basic').

Structure your response ONLY in this exact JSON schema:
{
  "text": "Socratic guidance text here...",
  "detectedMisconception": "string or null",
  "pedagogyModality": "geometric",
  "tutorAnnotations": [
    {
      "id": "anno-1",
      "type": "tutor-callout",
      "text": "Check this slope!",
      "targetObjectId": "L1-mesh",
      "position": [1, 2, 0],
      "style": "hint"
    }
  ]
}

Rules:
- Be encouraging and concise. Do not overwhelm the student.
- Point annotations directly to relevant objects.
- Output JSON only. No text outside the JSON structure.`;

/**
 * Agent 4: Socratic Coach
 * Decides conversational response and spatial annotations.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.plan - The lesson plan
 * @param {string} params.userMessage - Learner message
 * @param {object} params.learningState - Conversation and stage state
 * @param {object} params.confusionMetrics - Interaction logs (pause, hesitation, errors)
 * @param {string} params.activeModality - Current active modality (geometric, physics, intuition, algebraic)
 * @returns {Promise<object>} Response text and spatial annotations
 */
export async function runSocraticCoach({ sessionId, plan, userMessage, learningState, confusionMetrics, activeModality = "geometric" }) {
  const studentModel = getOrCreateStudentModel(sessionId);
  const currentStageId = learningState?.currentStageId || plan?.lessonStages?.[0]?.id || "orient-stage";
  const stage = plan?.lessonStages?.find((s) => s.id === currentStageId) || plan?.lessonStages?.[0];

  // Update mastery of the general concept slightly just for attempting
  const topic = plan?.sceneFocus?.concept || "general_geometry";

  const contextData = JSON.stringify({
    studentModel: {
      learnerLevel: studentModel.learnerLevel,
      misconceptions: studentModel.misconceptions,
      mastery: studentModel.graph[topic] || { probability: 0.5 }
    },
    plan: {
      concept: plan?.sceneFocus?.concept,
      formula: plan?.answerScaffold?.formula,
      finalAnswer: plan?.answerScaffold?.finalAnswer,
      solutionSteps: plan?.analyticContext?.solutionSteps
    },
    stage: {
      id: currentStageId,
      goal: stage?.goal,
      intro: stage?.tutorIntro,
      visibleObjects: stage?.highlightTargets || []
    },
    userMessage,
    activeModality,
    modalityInstruction: `The student is currently using the "${activeModality}" explanation modality. You must explain the current step or concept specifically using this perspective:
    - geometric: focus on tangent slopes, Riemann slices, curves, zoom-ins, graphs.
    - physics: focus on motion, velocity, rate of change, physical flow, accumulation.
    - intuition: focus on analogies, metaphors, conceptual visualization.
    - algebraic: focus on formulas, algebraic steps, substitution, variables.`,
    history: (learningState?.history || []).slice(-6).map((m) => `${m.role}: ${m.content}`),
    confusionMetrics
  });

  const messages = [
    {
      role: "user",
      content: [{ text: contextData }]
    }
  ];

  const modelIds = ["llama-3.3-70b-versatile", "gemini-2.5-flash"];
  let result = null;

  try {
    const rawText = await converseWithModelFailover("text", SOCRATIC_COACH_SYSTEM_PROMPT, messages, {
      maxTokens: 1024,
      temperature: 0.3,
      modelIds
    });
    result = JSON.parse(cleanupJson(rawText));
  } catch (err) {
    console.error("[Socratic Coach] Failed calling LLM, using fallback:", err);
    result = {
      text: "Look closely at the staged scene. What do you think happens to the values here?",
      detectedMisconception: null,
      pedagogyModality: "geometric",
      tutorAnnotations: []
    };
  }

  // Update student model based on results and confusion
  if (confusionMetrics?.hesitateCount > 3 || confusionMetrics?.errors > 2) {
    updateStudentMastery(sessionId, topic, "hesitant");
  } else if (result.detectedMisconception) {
    recordStudentMisconception(sessionId, result.detectedMisconception);
    updateStudentMastery(sessionId, topic, "stuck");
  }

  return {
    text: result.text || "Let's work through this step together.",
    tutorAnnotations: result.tutorAnnotations || [],
    pedagogyModality: result.pedagogyModality || "geometric",
    conceptVerdict: result.detectedMisconception ? {
      verdict: "PARTIAL",
      gap: result.text,
      misconception_type: result.detectedMisconception
    } : null
  };
}
