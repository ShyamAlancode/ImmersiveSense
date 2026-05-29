// ═══════════════════════════════════════════════════════
// server/services/freeformTutor.js
// UPDATED — Clean 6-stage progressive pipeline with
// USE_PROGRESSIVE_STAGES flag. Falls back to original
// Socratic loop if flag is false.
// ═══════════════════════════════════════════════════════

import { USE_PROGRESSIVE_STAGES, STAGE_MODELS } from '../config.js';
import { converseWithModelFailover, resolveModelId } from './modelInvoker.js';
import { runSocraticCoach, recordConfusedStage } from './pedagogy/socraticCoach.js';
import { classifyConfusion } from './pedagogy/confusionClassifier.js';

// ── Stage labels ─────────────────────────────────────────
const STAGE_META = {
  1: { type: 'deconstruct',   label: 'Problem deconstruction' },
  2: { type: 'intuition',     label: 'Geometric intuition' },
  3: { type: 'formula',       label: 'Formula selection' },
  4: { type: 'steps',         label: 'Step-by-step calculation' },
  5: { type: 'manipulation',  label: 'Common pitfalls' },
  6: { type: 'answer',        label: 'Verified answer' },
};

/**
 * Main entry point — routes to progressive pipeline or legacy Socratic loop.
 */
export async function generateFreeformTutorTurn({
  message,
  userMessage,
  sessionId,
  plan,
  sceneContext,
  sceneSnapshot,
  confusionMetrics,
  writeChunk,
}) {
  const effMessage = message || userMessage || '';
  const effPlan = plan || null;

  // 1. Run heuristic showcase command first if it matches
  const snapshot = sceneSnapshot || sceneContext?.currentSceneSpec || { objects: [], selectedObjectId: null };
  const heuristicTurn = heuristicSceneCommand(effMessage, snapshot, sceneContext || {});
  if (heuristicTurn) {
    const meta = {
      mode: "freeform",
      actions: [
        {
          id: "freeform-showcase",
          label: "Show me something cool",
          kind: "freeform-prompt",
          payload: { prompt: "Show me something cool in math." },
        },
        {
          id: "freeform-capabilities",
          label: "What can you do?",
          kind: "freeform-prompt",
          payload: { prompt: "What can you do with the scene right now?" },
        }
      ],
      focusTargets: [],
      systemContextMessage: "Freeform scene chat ready.",
      sceneCommand: heuristicTurn.sceneCommand,
      checkpoint: null,
      stageStatus: null,
      sceneDirective: null,
    };
    if (writeChunk) {
      try {
        await writeChunk({
          event: "tutorStage",
          data: {
            type: "answer",
            stage: 6,
            content: heuristicTurn.text,
            sceneActions: [],
            isComplete: true
          }
        });
      } catch {
        await writeChunk({
          type: "answer",
          stage: 6,
          content: heuristicTurn.text,
          sceneActions: [],
          isComplete: true
        });
      }
    }
    return { text: heuristicTurn.text, meta };
  }

  // 2. If no plan, fall back to modelFreeformTurn
  if (!effPlan) {
    const meta = {
      mode: "freeform",
      actions: [
        {
          id: "freeform-showcase",
          label: "Show me something cool",
          kind: "freeform-prompt",
          payload: { prompt: "Show me something cool in math." },
        },
        {
          id: "freeform-capabilities",
          label: "What can you do?",
          kind: "freeform-prompt",
          payload: { prompt: "What can you do with the scene right now?" },
        }
      ],
      focusTargets: [],
      systemContextMessage: "Freeform scene chat ready.",
      sceneCommand: null,
      checkpoint: null,
      stageStatus: null,
      sceneDirective: null,
    };

    const tutorResult = await modelFreeformTurn({
      message: effMessage,
      sessionId,
      plan: effPlan,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
    return {
      text: tutorResult?.text || "",
      meta,
    };
  }

  // 3. Otherwise, use progressive pipeline (if configured) or model freeform turn
  if (USE_PROGRESSIVE_STAGES) {
    return runProgressiveStagePipeline({
      message: effMessage,
      sessionId,
      plan: effPlan,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
  } else {
    return modelFreeformTurn({
      message: effMessage,
      sessionId,
      plan: effPlan,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
  }
}

export function buildFallbackFreeformTurn({
  sceneSnapshot,
  sceneContext = null,
  userMessage = "",
  sceneCommand = null,
}) {
  const objects = sceneSnapshot?.objects || [];
  const selection = sceneContext?.selectedObjectId
    ? objects.find(o => o.id === sceneContext.selectedObjectId)
    : null;
  const objectCount = objects.length;

  let text = "I'm having trouble reaching my AI backend right now. Try again in a moment, or ask me to build a scene — I can handle that offline!";
  if (!objectCount) {
    text = "The scene is blank right now. Ask me to build something, explain a concept, or say 'show me something cool.'";
  } else if (selection) {
    const label = selection.label || 'the object';
    text = `You're looking at ${label}. I can explain it, change it, or build something around it.`;
  } else {
    text = `There are ${objectCount} objects in the scene. Ask me to explain them, remix them, or build a fresh math visual.`;
  }

  return {
    text,
    meta: {
      mode: "freeform",
      actions: [
        {
          id: "freeform-showcase",
          label: "Show me something cool",
          kind: "freeform-prompt",
          payload: { prompt: "Show me something cool in math." },
        },
        {
          id: "freeform-capabilities",
          label: "What can you do?",
          kind: "freeform-prompt",
          payload: { prompt: "What can you do with the scene right now?" },
        }
      ],
      focusTargets: [],
      systemContextMessage: objectCount
        ? `Freeform scene chat with ${objectCount} object${objectCount === 1 ? "" : "s"} ready.`
        : "Freeform scene chat ready.",
      sceneCommand,
      checkpoint: null,
      stageStatus: null,
      sceneDirective: null,
    }
  };
}

function looksLikeShowcaseRequest(userMessage = "") {
  const lower = String(userMessage || "").toLowerCase();
  return (
    /\bshow me\b.*\bcool\b/.test(lower)
    || /\bsomething cool\b/.test(lower)
    || /\bsurprise me\b/.test(lower)
    || /\bmind[- ]?blowing\b/.test(lower)
    || /\brandom\b/.test(lower) && /\b(math|scene|visual|idea)\b/.test(lower)
  );
}

function heuristicSceneCommand(userMessage = "", sceneSnapshot = {}, sceneContext = {}) {
  const lower = String(userMessage || "").toLowerCase();

  if (looksLikeShowcaseRequest(userMessage)) {
    return {
      text: "I loaded a skew-lines scene: the short connector is the common perpendicular, so its length is the hidden shortest distance. Orbit around it and notice how every other connector sneaks some motion along one line or the other.",
      sceneCommand: {
        summary: "Load showcase: Skew Lines Hidden Bridge",
        operations: [
          {
            kind: "replace_scene",
            objects: [
              {
                id: "line-1",
                shape: "line",
                label: "Line 1",
                params: { start: [1, 2, 0], end: [3, 1, 3] }
              }
            ],
            selectedObjectId: "line-1"
          }
        ]
      }
    };
  }

  if (lower.includes("electric") || lower.includes("charge")) {
    return {
      text: "I loaded a live electric-field scene. Drag the charged objects and watch the field react.",
      sceneCommand: {
        summary: "Load electric-field showcase",
        operations: [
          {
            kind: "replace_scene",
            objects: [
              {
                id: "charge-pos",
                shape: "sphere",
                label: "Positive Charge",
                params: { radius: 0.2 },
                metadata: {
                  physics: {
                    kind: "charge",
                    value: 1
                  }
                }
              },
              {
                id: "charge-neg",
                shape: "sphere",
                label: "Negative Charge",
                params: { radius: 0.2 },
                metadata: {
                  physics: {
                    kind: "charge",
                    value: -1
                  }
                }
              }
            ],
            selectedObjectId: "charge-pos"
          }
        ]
      }
    };
  }

  if (/\bclear\b.*\bscene\b/.test(lower) || /\bstart over\b/.test(lower)) {
    return {
      text: "Scene cleared. Ask me to build something new, or say 'show me something cool.'",
      sceneCommand: { summary: "Clear the scene", operations: [{ kind: "clear_scene" }] },
    };
  }

  if (/\breset\b.*\bview\b/.test(lower) || /\bcenter\b.*\bview\b/.test(lower)) {
    return {
      text: "I reset the camera so the whole scene is easier to inspect.",
      sceneCommand: { summary: "Reset the camera view", operations: [{ kind: "reset_view" }] },
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// 6-STAGE PROGRESSIVE PIPELINE
// ═══════════════════════════════════════════════════════
async function runProgressiveStagePipeline({
  message,
  sessionId,
  plan,
  sceneContext,
  confusionMetrics,
  writeChunk,
}) {
  const sessionKey = sessionId || 'default';
  const forceAnswer = confusionMetrics?.forceAnswer || confusionMetrics?.questionCount >= 3 || message === '__FORCE_ANSWER__';

  // ── Classify confusion before pipeline ──────────────
  let confusionState = 'CONFIDENT';
  try {
    confusionState = await classifyConfusion({
      hesitationMs: confusionMetrics?.hesitationMs || 0,
      errorCount: confusionMetrics?.errorCount || 0,
      questionCount: confusionMetrics?.questionCount || 0,
      repeatedQuestion: confusionMetrics?.repeatedQuestion || false,
    });
    // Emit confusion state to client
    writeChunk({ event: 'confusion', data: { state: confusionState } });
    if (confusionState !== 'CONFIDENT') {
      recordConfusedStage(sessionKey, confusionMetrics?.questionCount || 0);
    }
  } catch { /* non-fatal */ }

  // ── If not forcing answer, run Socratic coach first ──
  if (!forceAnswer) {
    const coachResult = await runSocraticCoach({
      sessionId: sessionKey,
      question: message,
      plan,
      sceneContext,
      confusionMetrics,
      writeChunk: (chunk) => {
        if (chunk.type === 'actions') {
          writeChunk({ event: 'actions', data: chunk });
        } else {
          writeChunk({ event: 'text', data: { text: chunk.content } });
        }
      },
    });

    // Emit student model update
    _emitStudentModel(sessionKey, writeChunk);
    return coachResult;
  }

  // ── Force answer: run all 6 stages ──────────────────
  // Dynamic stage order based on confusion
  const stageOrder = confusionState === 'CONFUSED'
    ? [1, 2, 4, 3, 5, 6]   // Show concrete steps before abstract formula
    : [1, 2, 3, 4, 5, 6];  // Standard order

  const questionText = plan?.problem?.questionText || message;
  const visibleObjects = sceneContext?.visibleObjects || [];
  const sceneType = sceneContext?.sceneType || 'unknown';

  for (const stageNum of stageOrder) {
    const meta = STAGE_META[stageNum];
    if (!meta) continue;

    try {
      const result = await _runStage({
        stageNum,
        stageType: meta.type,
        questionText,
        plan,
        sceneContext,
        visibleObjects,
        sceneType,
        confusionState,
      });

      writeChunk({
        event: 'tutorStage',
        data: {
          type: meta.type,
          stage: stageNum,
          content: result.content,
          sceneActions: result.sceneActions || [],
          isComplete: stageNum === 6,
        },
      });

    } catch (err) {
      console.error(`[FreeformTutor] Stage ${stageNum} failed:`, err);
      writeChunk({
        event: 'tutorStage',
        data: {
          type: 'stage_error',
          stage: -1,
          content: `Stage ${stageNum} (${meta.label}) failed: ${err.message}`,
          sceneActions: [],
          isComplete: false,
        },
      });
      // Continue to next stage — never abort
    }
  }

  // Emit updated student model
  _emitStudentModel(sessionKey, writeChunk);
  return { forceAnswer: true };
}

// ── Individual stage runner ──────────────────────────────
async function _runStage({
  stageNum, stageType, questionText, plan,
  sceneContext, visibleObjects, sceneType, confusionState,
}) {
  const visiblesStr = visibleObjects.length > 0
    ? visibleObjects.join(', ')
    : 'scene objects';

  const specJson = sceneContext?.currentSceneSpec
    ? JSON.stringify(sceneContext.currentSceneSpec).slice(0, 800)
    : 'null';

  const prompts = _buildStagePrompts(stageNum, stageType, questionText, visiblesStr, specJson, sceneType, confusionState, plan);
  const modelIds = _getStageModels(stageNum);

  // Retry up to 2 times
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await converseWithModelFailover({
        messages: [{ role: 'user', content: prompts.user }],
        systemPrompt: prompts.system,
        modelIds,
        maxTokens: stageNum === 4 ? 600 : stageNum === 6 ? 300 : 250,
        responseFormat: prompts.jsonMode ? 'json' : 'text',
      });

      const raw = response?.text || response?.content || response || '';
      const content = _parseStageResponse(stageType, raw);
      const sceneActions = _extractSceneActions(stageType, content, visibleObjects);
      return { content, sceneActions };
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

// ── Stage prompts ────────────────────────────────────────
function _buildStagePrompts(stageNum, stageType, question, visibles, specJson, sceneType, confusion, plan) {
  const base = `You are a precise math tutor. The student is working on: "${question}"
Current 3D scene: ${sceneType}. Visible objects: ${visibles}.
Scene spec (truncated): ${specJson}`;

  switch (stageType) {
    case 'deconstruct':
      return {
        system: `${base}\n\nOutput ONLY valid JSON with this exact schema, no markdown, no preamble:\n{"problemType":"string","knowns":[{"name":"string","value":"string"}],"unknown":"string","domain":"string","commonMistake":"string"}`,
        user: `Deconstruct this problem into its components. Identify all given values, the unknown, and the most common student mistake for this problem type.`,
        jsonMode: true,
      };

    case 'intuition':
      return {
        system: `${base}\n\nRULE: Start by naming a SPECIFIC visible object (e.g. "the teal line", "the gold connector segment"). Explain what it represents geometrically. 2-3 sentences max. No formulas yet.`,
        user: `Explain the geometric intuition for this problem. Reference the specific objects visible in the 3D scene.`,
        jsonMode: false,
      };

    case 'formula':
      return {
        system: `${base}\n\nOutput the formula in LaTeX between $$ delimiters. Then explain in one sentence WHY this formula works geometrically. Include: {formula: "$$...$$", why: "...", variables: [{symbol, meaning}]}. Output ONLY valid JSON.`,
        user: `State the correct formula for this problem with geometric justification.`,
        jsonMode: true,
      };

    case 'steps':
      return {
        system: `${base}\n\nOutput ONLY a JSON array of step objects. Each step: {"stepNumber":N,"action":"string","expression":"string","result":"string","sceneAction":"highlight_vector|highlight_point|highlight_plane|pulse_connector|show_label","sceneTarget":"string","explanation":"string"}. sceneTarget must be an object name from: ${visibles || 'the scene'}.`,
        user: `Show the complete step-by-step calculation. ${confusion === 'CONFUSED' ? 'Use extra intermediate steps and be very explicit.' : 'Be thorough but efficient.'}`,
        jsonMode: true,
      };

    case 'manipulation':
      return {
        system: `${base}\n\nIdentify the hardest computational step. Show the WRONG approach students use vs the CORRECT approach. 3-4 sentences. Focus on the specific difficulty in this problem.`,
        user: `Identify the most common computational mistake for this specific problem and show how to avoid it.`,
        jsonMode: false,
      };

    case 'answer':
      return {
        system: `${base}\n\nOutput ONLY valid JSON: {"answer":"string in JEE notation","verification":"string (verify using second method if possible)","remember":"one sentence under 15 words"}`,
        user: `State the final verified answer in JEE exam notation.`,
        jsonMode: true,
      };

    default:
      return {
        system: base,
        user: question,
        jsonMode: false,
      };
  }
}

// ── Parse stage response ─────────────────────────────────
function _parseStageResponse(stageType, raw) {
  const jsonStages = ['deconstruct', 'formula', 'steps', 'answer'];
  if (!jsonStages.includes(stageType)) return raw;

  // Strip markdown code fences
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Return raw text as fallback
    return raw;
  }
}

// ── Scene actions extractor ──────────────────────────────
function _extractSceneActions(stageType, content, visibleObjects) {
  const actions = [];
  if (stageType === 'steps' && Array.isArray(content)) {
    content.forEach(step => {
      if (step.sceneAction && step.sceneTarget) {
        actions.push({ action: step.sceneAction, target: step.sceneTarget });
      }
    });
  }
  if (stageType === 'answer' && visibleObjects.length > 0) {
    actions.push({ action: 'highlight_vector', target: 'shortest_segment' });
  }
  return actions;
}

// ── Model routing ────────────────────────────────────────
function _getStageModels(stageNum) {
  // Stage 1, 3, 6 → Groq (fast, factual)
  // Stage 2, 4, 5 → Gemini (spatial reasoning, structured output)
  if ([1, 3, 6].includes(stageNum)) {
    return STAGE_MODELS?.fast || ['llama-3.1-8b-instant'];
  }
  return STAGE_MODELS?.reasoning || ['gemini-2.5-flash', 'llama-3.3-70b-versatile'];
}

// ── Student model emitter ────────────────────────────────
async function _emitStudentModel(sessionId, writeChunk) {
  try {
    const { getStudentModel } = await import('./pedagogy/studentModel.js');
    const sm = getStudentModel?.(sessionId);
    if (sm) writeChunk({ event: 'studentModel', data: sm });
  } catch { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════
// LEGACY FALLBACK — simple single-turn (when USE_PROGRESSIVE_STAGES=false)
// ═══════════════════════════════════════════════════════
async function modelFreeformTurn({
  message,
  plan,
  sceneContext,
  writeChunk,
}) {
  const visibles = (sceneContext?.visibleObjects || []).join(', ') || 'the 3D scene';
  const systemPrompt = `You are a concise Socratic math tutor. The student sees these objects in their 3D scene: ${visibles}.
RULE: Always reference a specific visible object. Never start with a generic concept statement. Max 3 sentences.`;

  const modelIds = resolveModelId?.('chat') || ['llama-3.1-8b-instant'];
  try {
    const response = await converseWithModelFailover({
      messages: [{ role: 'user', content: message }],
      systemPrompt,
      modelIds,
      maxTokens: 200,
    });
    const text = response?.text || response?.content || response || '';
    if (writeChunk) {
      writeChunk({ event: 'text', data: { text } });
    }
    return { text };
  } catch (err) {
    const text = `I encountered an error: ${err.message}. Please try again.`;
    if (writeChunk) {
      writeChunk({ event: 'text', data: { text } });
    }
    return { text };
  }
}
