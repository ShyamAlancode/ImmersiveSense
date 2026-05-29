// ═══════════════════════════════════════════════════════
// server/services/freeformTutor.js
// UPDATED — Clean 6-stage progressive pipeline with
// USE_PROGRESSIVE_STAGES flag. Falls back to original
// Socratic loop if flag is false.
// ═══════════════════════════════════════════════════════

import { USE_PROGRESSIVE_STAGES, STAGE_MODELS } from '../config.js';
import { converseWithModelFailover } from './modelInvoker.js';
import { runSocraticCoach, recordConfusedStage } from './pedagogy/socraticCoach.js';
import { classifyConfusion } from './pedagogy/confusionClassifier.js';
import { normalizeSceneObject, normalizeSceneSnapshot } from "../../src/scene/schema.js";
import { buildElectricFieldPlan } from "./plan/electricField.js";
import { buildSceneSnapshotFromSuggestions } from "../../src/ai/planSchema.js";
import { buildAnalyticPlan } from "./plan/analytic.js";
import { computeGeometry } from "../../src/core/geometry.js";

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
  sessionId = "default",
  plan,
  learningState,
  sceneSnapshot,
  sceneContext,
  confusionMetrics = {},
  writeChunk,
}) {
  const msg = message || userMessage || '';
  const effPlan = plan || learningState?.plan || null;
  const snapshot = sceneSnapshot || sceneContext?.currentSceneSpec || { objects: [], selectedObjectId: null };

  // 1. Run heuristic showcase command first if it matches
  const normalizedSnapshot = normalizeSceneSnapshot(snapshot);
  const heuristicTurn = heuristicSceneCommand(msg, normalizedSnapshot, sceneContext || {}, learningState || {});
  if (heuristicTurn) {
    const meta = buildFreeformResponseMeta(normalizedSnapshot, heuristicTurn.sceneCommand);
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

  // 2. If no plan is active, fall back to modelFreeformTurn
  if (!effPlan) {
    return modelFreeformTurn({
      message: msg,
      sessionId,
      plan: null,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
  }

  // 3. Plan is active: run stages
  if (USE_PROGRESSIVE_STAGES) {
    return runProgressiveStagePipeline({
      message: msg,
      sessionId,
      plan: effPlan,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
  } else {
    return modelFreeformTurn({
      message: msg,
      sessionId,
      plan: effPlan,
      sceneContext,
      confusionMetrics,
      writeChunk,
    });
  }
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
  sessionId,
  plan,
  sceneContext,
  confusionMetrics,
  writeChunk,
}) {
  const visibles = (sceneContext?.visibleObjects || []).join(', ') || 'the 3D scene';
  const systemPrompt = `You are a concise Socratic math tutor. The student sees these objects in their 3D scene: ${visibles}.
RULE: Always reference a specific visible object. Never start with a generic concept statement. Max 3 sentences.`;

  const modelIds = resolveModelId?.('chat') || ['llama-3.1-8b-instant'];
  let text = '';
  try {
    const response = await converseWithModelFailover({
      messages: [{ role: 'user', content: message }],
      systemPrompt,
      modelIds,
      maxTokens: 200,
    });
    text = response?.text || response?.content || response || '';
    if (writeChunk) {
      try {
        await writeChunk({ event: 'text', data: { text } });
      } catch {
        await writeChunk(text);
      }
    }
  } catch (err) {
    text = `I encountered an error: ${err.message}. Please try again.`;
    if (writeChunk) {
      try {
        await writeChunk({ event: 'text', data: { text } });
      } catch {
        await writeChunk(text);
      }
    }
  }
  const snapshot = sceneContext?.currentSceneSpec || { objects: [] };
  return {
    text,
    meta: buildFreeformResponseMeta(snapshot, null),
  };
}

export function buildFallbackFreeformTurn({
  sceneSnapshot,
  sceneContext = null,
  userMessage = "",
  sceneCommand = null,
}) {
  const normalizedSnapshot = normalizeSceneSnapshot(sceneSnapshot);
  return {
    text: freeformFallbackReply(normalizedSnapshot, sceneContext || {}, userMessage, sceneCommand),
    meta: buildFreeformResponseMeta(normalizedSnapshot, sceneCommand),
  };
}

// ── Showcase/Heuristics Helpers from original freeformTutor.js ──
const SHOWCASE_CONFIGS = [
  {
    id: "skew-lines-bridge",
    title: "Skew Lines Hidden Bridge",
    prompt: "Two lines in space are given by r1 = (1,2,0) + t(2,-1,3), r2 = (4,-1,2) + s(1,2,-1). Find the shortest distance between the two skew lines.",
    momentId: "solve",
    reply: "I loaded a skew-lines scene: the short connector is the common perpendicular, so its length is the hidden shortest distance. Orbit around it and notice how every other connector sneaks some motion along one line or the other.",
  },
  {
    id: "line-plane-intersection",
    title: "Line-Plane Collision Point",
    prompt: "A line passes through the point P(1, -2, 3) with direction d = (2, 1, -1). The plane Pi has equation 2x - y + z = 7. Find the coordinates of the point where the line intersects the plane.",
    momentId: "solve",
    reply: "I swapped in a line-plane scene where the highlighted point is the instant algebra turns into geometry. Rotate it and notice how that point belongs to the line and the plane at the same time.",
  },
  {
    id: "line-plane-angle",
    title: "Angle Through the Normal",
    prompt: "A line has direction vector (3, -2, 1) and a plane has equation 2x + y - 2z = 6. Find the angle between the line and the plane.",
    momentId: "solve",
    reply: "Here is a line-plane angle scene: the trick is that the plane's normal quietly controls the whole angle story. Spin the view and watch how the line's tilt relative to that normal sets the angle to the plane.",
  },
];

let cachedShowcases = null;

function formatNumber(value, digits = 3) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "0";
  return next.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function uniqueStrings(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function stableHash(input = "") {
  let hash = 0;
  for (const char of String(input || "")) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildShowcases() {
  if (cachedShowcases) return cachedShowcases;

  cachedShowcases = SHOWCASE_CONFIGS.map((config) => {
    const plan = buildAnalyticPlan(config.prompt, {
      cleanedQuestion: config.prompt,
      inputMode: "text",
    });
    const sceneMoments = plan?.sceneMoments || [];
    const sceneMoment = sceneMoments.find((moment) => moment.id === config.momentId)
      || sceneMoments[sceneMoments.length - 1]
      || null;
    const snapshot = plan
      ? buildSceneSnapshotFromSuggestions(plan, sceneMoment?.visibleObjectIds || [])
      : { objects: [], selectedObjectId: null };
    return {
      ...config,
      snapshot,
      focusTargets: sceneMoment?.focusTargets || [],
    };
  }).filter((showcase) => showcase.snapshot?.objects?.length);

  return cachedShowcases;
}

function selectedObjectSummary(sceneSnapshot = {}, sceneContext = {}) {
  const selectedId = sceneContext?.selection?.id || sceneSnapshot?.selectedObjectId || null;
  if (!selectedId) return null;

  const fromSnapshot = (sceneSnapshot.objects || []).find((objectSpec) => objectSpec.id === selectedId) || null;
  const selection = sceneContext?.selection || fromSnapshot;
  if (!selection) return null;

  const metrics = selection.metrics || computeGeometry(selection.shape, selection.params || {});
  return {
    id: selection.id || selectedId,
    label: selection.label || selection.shape || selectedId,
    shape: selection.shape || fromSnapshot?.shape || "object",
    params: selection.params || fromSnapshot?.params || {},
    metrics,
  };
}

function summarizeScene(sceneSnapshot = {}, sceneContext = {}) {
  const objects = sceneSnapshot.objects || [];
  if (!objects.length) {
    return "Scene objects: none.";
  }

  const lines = objects.slice(0, 8).map((objectSpec) => {
    const metrics = computeGeometry(objectSpec.shape, objectSpec.params || {});
    const dims = Object.entries(objectSpec.params || {})
      .map(([key, value]) => `${key}=${Array.isArray(value) ? `(${value.join(", ")})` : value}`)
      .join(", ");
    const facts = [];
    if (Number.isFinite(metrics.volume) && metrics.volume > 0) facts.push(`V=${formatNumber(metrics.volume)}`);
    if (Number.isFinite(metrics.surfaceArea) && metrics.surfaceArea > 0) facts.push(`SA=${formatNumber(metrics.surfaceArea)}`);
    return `- ${objectSpec.label || objectSpec.id || objectSpec.shape}: ${objectSpec.shape}${dims ? ` [${dims}]` : ""}${facts.length ? ` (${facts.join(", ")})` : ""}`;
  });

  const selected = selectedObjectSummary(sceneSnapshot, sceneContext);
  if (selected) {
    lines.push(`Selected object: ${selected.label} (${selected.shape}) with params ${JSON.stringify(selected.params)}.`);
  } else {
    lines.push("Selected object: none.");
  }

  return lines.join("\n");
}

function applyObjectsIntoSnapshot(snapshot, objects = []) {
  const nextObjects = [...(snapshot.objects || [])];
  const byId = new Map(nextObjects.map((objectSpec) => [objectSpec.id, objectSpec]));
  for (const objectSpec of objects) {
    byId.set(objectSpec.id, objectSpec);
  }
  return {
    ...snapshot,
    objects: [...byId.values()],
  };
}

function projectSceneSnapshot(sceneSnapshot = {}, sceneCommand = null) {
  let nextSnapshot = normalizeSceneSnapshot(sceneSnapshot);
  const operations = sceneCommand?.operations || [];

  for (const operation of operations) {
    switch (operation.kind) {
      case "replace_scene":
        nextSnapshot = normalizeSceneSnapshot({
          objects: operation.objects || [],
          selectedObjectId: operation.selectedObjectId || null,
        });
        break;
      case "merge_objects":
        nextSnapshot = applyObjectsIntoSnapshot(nextSnapshot, operation.objects || []);
        break;
      case "remove_objects":
        nextSnapshot = {
          ...nextSnapshot,
          objects: nextSnapshot.objects.filter((objectSpec) => !(operation.objectIds || []).includes(objectSpec.id)),
          selectedObjectId: (operation.objectIds || []).includes(nextSnapshot.selectedObjectId)
            ? null
            : nextSnapshot.selectedObjectId,
        };
        break;
      case "select_object":
        nextSnapshot = {
          ...nextSnapshot,
          selectedObjectId: operation.objectId || null,
        };
        break;
      case "clear_scene":
        nextSnapshot = {
          objects: [],
          selectedObjectId: null,
        };
        break;
      default:
        break;
    }
  }

  return nextSnapshot;
}

function buildFreeformActions(sceneSnapshot = {}) {
  const hasObjects = Boolean(sceneSnapshot.objects?.length);
  if (!hasObjects) {
    return [
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
      },
      {
        id: "freeform-build",
        label: "Build a scene",
        kind: "freeform-prompt",
        payload: { prompt: "Build a striking math scene and explain why it matters." },
      },
    ];
  }

  return [
    {
      id: "freeform-explain",
      label: "Explain this scene",
      kind: "freeform-prompt",
      payload: { prompt: "Explain what is interesting about the current scene." },
    },
    {
      id: "freeform-showcase",
      label: "Show me something cool",
      kind: "freeform-prompt",
      payload: { prompt: "Show me something cool in math." },
    },
    {
      id: "freeform-clear",
      label: "Clear scene",
      kind: "clear-scene",
      payload: {},
    },
  ];
}

function focusTargetsFromSceneCommand(sceneCommand = null, projectedSnapshot = {}) {
  if (!sceneCommand?.operations?.length) return [];

  const explicitFocus = sceneCommand.operations
    .filter((operation) => operation.kind === "focus_objects")
    .flatMap((operation) => operation.targetIds || []);
  if (explicitFocus.length) return uniqueStrings(explicitFocus);

  const explicitSelection = sceneCommand.operations
    .filter((operation) => operation.kind === "select_object")
    .map((operation) => operation.objectId)
    .filter(Boolean);
  if (explicitSelection.length) return uniqueStrings(explicitSelection);

  if (projectedSnapshot.selectedObjectId) {
    return [projectedSnapshot.selectedObjectId];
  }

  return [];
}

function buildFreeformResponseMeta(sceneSnapshot = {}, sceneCommand = null) {
  const projectedSnapshot = projectSceneSnapshot(sceneSnapshot, sceneCommand);
  return {
    mode: "freeform",
    actions: buildFreeformActions(projectedSnapshot),
    focusTargets: focusTargetsFromSceneCommand(sceneCommand, projectedSnapshot),
    systemContextMessage: projectedSnapshot.objects.length
      ? `Freeform scene chat with ${projectedSnapshot.objects.length} object${projectedSnapshot.objects.length === 1 ? "" : "s"} ready.`
      : "Freeform scene chat ready.",
    sceneCommand,
    checkpoint: null,
    stageStatus: null,
    sceneDirective: null,
  };
}

function ensureCommandObjectIds(objects = [], prefix = "assistant-object") {
  const usedIds = new Set();
  return objects.map((objectSpec, index) => {
    const normalized = normalizeSceneObject({
      ...objectSpec,
      metadata: {
        ...(objectSpec?.metadata || {}),
        source: objectSpec?.metadata?.source || "assistant-generated",
      },
    });

    let nextId = String(normalized.id || `${prefix}-${index + 1}`).trim();
    while (usedIds.has(nextId)) {
      nextId = `${nextId}-${usedIds.size + 1}`;
    }
    usedIds.add(nextId);

    return {
      ...normalized,
      id: nextId,
    };
  });
}

function normalizeSceneCommand(rawSceneCommand = null) {
  if (!rawSceneCommand || typeof rawSceneCommand !== "object") return null;

  const operations = (Array.isArray(rawSceneCommand.operations) ? rawSceneCommand.operations : [])
    .map((operation, index) => normalizeSceneOperation(operation, index))
    .filter(Boolean);

  if (!operations.length) return null;

  return {
    summary: String(rawSceneCommand.summary || "").trim(),
    operations,
  };
}

function normalizeSceneOperation(operation = {}, index = 0) {
  const kind = String(operation.kind || "").trim();
  switch (kind) {
    case "replace_scene":
      return {
        kind,
        objects: ensureCommandObjectIds(operation.objects || [], `assistant-replace-${index + 1}`),
        selectedObjectId: operation.selectedObjectId ? String(operation.selectedObjectId) : null,
      };
    case "merge_objects":
      return {
        kind,
        objects: ensureCommandObjectIds(operation.objects || [], `assistant-merge-${index + 1}`),
      };
    case "remove_objects":
      return {
        kind,
        objectIds: uniqueStrings(operation.objectIds || []),
      };
    case "select_object":
      return operation.objectId
        ? {
          kind,
          objectId: String(operation.objectId),
        }
        : null;
    case "focus_objects":
      return {
        kind,
        targetIds: uniqueStrings(operation.targetIds || []),
      };
    case "clear_scene":
    case "clear_focus":
    case "reset_view":
      return { kind };
    default:
      return null;
  }
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

function heuristicSceneCommand(userMessage = "", sceneSnapshot = {}, sceneContext = {}, learningState = {}) {
  const lower = String(userMessage || "").toLowerCase();
  const selection = selectedObjectSummary(sceneSnapshot, sceneContext);
  const electricFieldPlan = buildElectricFieldPlan(userMessage, {
    cleanedQuestion: userMessage,
    inputMode: "text",
  });

  if (electricFieldPlan) {
    const electricSnapshot = buildSceneSnapshotFromSuggestions(electricFieldPlan);
    const focusTargets = electricFieldPlan.objectSuggestions
      .map((suggestion) => suggestion.object.id)
      .filter(Boolean);
    return {
      text: electricFieldPlan.sceneFocus?.primaryInsight || "I loaded a live electric-field scene. Drag the charged objects and watch the field react.",
      sceneCommand: {
        summary: `Load ${electricFieldPlan.problem?.id || "electric-field"} showcase`,
        operations: [
          {
            kind: "replace_scene",
            objects: ensureCommandObjectIds(electricSnapshot.objects || [], electricFieldPlan.problem?.id || "electric-field"),
            selectedObjectId: focusTargets[0] || null,
          },
          {
            kind: "focus_objects",
            targetIds: focusTargets,
          },
          {
            kind: "reset_view",
          },
        ],
      },
    };
  }

  if (looksLikeShowcaseRequest(userMessage)) {
    const showcases = buildShowcases();
    if (!showcases.length) return null;
    const offset = stableHash(`${userMessage}:${learningState?.history?.length || 0}:${sceneSnapshot.objects?.length || 0}`);
    const showcase = showcases[offset % showcases.length];
    return {
      text: showcase.reply,
      sceneCommand: {
        summary: `Load showcase: ${showcase.title}`,
        operations: [
          {
            kind: "replace_scene",
            objects: ensureCommandObjectIds(showcase.snapshot.objects || [], showcase.id),
            selectedObjectId: showcase.focusTargets[0] || null,
          },
          {
            kind: "focus_objects",
            targetIds: showcase.focusTargets,
          },
          {
            kind: "reset_view",
          },
        ],
      },
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

  if ((/\bremove\b/.test(lower) || /\bdelete\b/.test(lower)) && /\bselected\b/.test(lower) && selection?.id) {
    return {
      text: `I removed ${selection.label}. If you want, I can replace it with something more interesting.`,
      sceneCommand: {
        summary: `Remove ${selection.label}`,
        operations: [{ kind: "remove_objects", objectIds: [selection.id] }],
      },
    };
  }

  if ((/\bfocus\b/.test(lower) || /\bhighlight\b/.test(lower)) && selection?.id) {
    return {
      text: `I'm focusing on ${selection.label} so we can inspect it more closely.`,
      sceneCommand: {
        summary: `Focus ${selection.label}`,
        operations: [{ kind: "focus_objects", targetIds: [selection.id] }],
      },
    };
  }

  return null;
}

function shouldAskModelForSceneCommand(userMessage = "") {
  const lower = String(userMessage || "").toLowerCase();
  return /\b(add|build|create|generate|make|show|draw|put|place|remove|delete|clear|focus|highlight|select|replace|change|move|resize|rotate)\b/.test(lower);
}

function freeformFallbackReply(sceneSnapshot = {}, sceneContext = {}, userMessage = "", sceneCommand = null) {
  const lower = String(userMessage || "").toLowerCase();
  const selection = selectedObjectSummary(sceneSnapshot, sceneContext);
  const objectCount = sceneSnapshot.objects?.length || 0;

  if (sceneCommand?.operations?.some((operation) => operation.kind === "replace_scene")) {
    return "I loaded a fresh scene. Rotate around it and tell me which object or relationship you want to inspect first.";
  }
  if (sceneCommand?.operations?.some((operation) => operation.kind === "merge_objects")) {
    return "I added to the scene. Take a look from a couple of angles and tell me what stands out.";
  }
  if (sceneCommand?.operations?.some((operation) => operation.kind === "clear_scene")) {
    return "The scene is blank again. Ask me to build something, explain an idea, or surprise you.";
  }
  if (selection && /\b(explain|what is|what's happening|why)\b/.test(lower)) {
    return `${selection.label} is a ${selection.shape} with volume ${formatNumber(selection.metrics?.volume)} and surface area ${formatNumber(selection.metrics?.surfaceArea)}. What relationship do you want to inspect around it?`;
  }

  // For conversational or educational questions, give a helpful reply instead of scene-centric defaults
  const isQuestion = /\b(what|how|why|where|when|who|can you|could you|tell me|explain|describe|is it|are there|do you)\b/.test(lower);
  if (isQuestion && !shouldAskModelForSceneCommand(userMessage)) {
    return "I'm having trouble reaching my AI backend right now. Try again in a moment, or ask me to build a scene — I can handle that offline!";
  }

  if (!objectCount) {
    return "The scene is blank right now. Ask me to build something, explain a concept, or say 'show me something cool.'";
  }
  if (selection) {
    return `You're looking at ${selection.label}. I can explain it, change it, or build something around it.`;
  }
  return `There are ${objectCount} objects in the scene. Ask me to explain them, remix them, or build a fresh math visual.`;
}

