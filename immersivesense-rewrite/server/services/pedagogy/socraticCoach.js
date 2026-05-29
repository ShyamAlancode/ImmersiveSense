// ═══════════════════════════════════════════════════════
// server/services/pedagogy/socraticCoach.js
// REWRITTEN — Grounded Socratic questions with scene
// references. 3-question limit before forcing answer.
// ═══════════════════════════════════════════════════════

import { resolveModelId, converseWithModelFailover } from '../modelInvoker.js';

// Per-session question state
const _sessionState = new Map();

function _getSessionState(sessionId) {
  if (!_sessionState.has(sessionId)) {
    _sessionState.set(sessionId, {
      questionCount: 0,
      confusedStages: [],
      lastModality: null,
      forceAnswer: false,
    });
  }
  return _sessionState.get(sessionId);
}

export function recordConfusedStage(sessionId, stage) {
  const s = _getSessionState(sessionId);
  if (!s.confusedStages.includes(stage)) {
    s.confusedStages.push(stage);
  }
}

export function resetSession(sessionId) {
  _sessionState.delete(sessionId);
}

/**
 * Build a grounded Socratic question or force the full answer.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.question       - student's raw question
 * @param {Object} params.plan            - current lesson plan
 * @param {Object} params.sceneContext    - { visibleObjects, sceneType, studentAction, currentSceneSpec }
 * @param {Object} params.confusionMetrics - { questionCount, forceAnswer }
 * @param {Function} params.writeChunk    - (chunk: string) => void  for SSE streaming
 * @returns {Promise<{ forceAnswer: boolean, questionCount: number }>}
 */
export async function runSocraticCoach({
  sessionId,
  question,
  plan,
  sceneContext,
  confusionMetrics,
  writeChunk,
}) {
  const ss = _getSessionState(sessionId || 'default');
  ss.questionCount = (confusionMetrics?.questionCount ?? ss.questionCount) + 1;

  const visibleObjects = sceneContext?.visibleObjects || [];
  const sceneType      = sceneContext?.sceneType || 'unknown';
  const studentAction  = sceneContext?.studentAction || null;
  const specSummary    = _summarizeSpec(sceneContext?.currentSceneSpec);

  // ── Force answer after 3 questions ──────────────────
  const shouldForce = ss.questionCount >= 3
    || confusionMetrics?.forceAnswer === true
    || question === '__FORCE_ANSWER__';

  if (shouldForce) {
    ss.forceAnswer = true;
    writeChunk?.({ type: 'text', content: '\n\n**Let me walk you through the complete solution now.**\n\n' });
    return { forceAnswer: true, questionCount: ss.questionCount };
  }

  // ── Build prompt ─────────────────────────────────────
  const visiblesStr = visibleObjects.length > 0
    ? visibleObjects.map((v, i) => `${i+1}. "${v}"`).join(', ')
    : 'none (scene still loading)';

  const systemPrompt = `You are a Socratic math tutor guiding a JEE student through a 3D interactive scene.

CRITICAL RULES — FOLLOW THESE EXACTLY:
1. NEVER start your response with a generic statement about the concept. Start by referencing something SPECIFIC in the 3D scene.
2. Every question MUST name a specific visible object from the list below by its exact name.
3. NEVER ask abstract questions like "what do you notice?" without pointing at a specific scene object.
4. Your response must be 2-3 sentences maximum. One scene reference, one targeted insight, one question.
5. Questions must BUILD on each other — each should unlock the next insight.
6. If visibleObjects is empty, describe what the student should see forming and ask them to wait for it.
7. This is question ${ss.questionCount} of maximum 3. Make it count.

CURRENT 3D SCENE:
- Scene type: ${sceneType}
- Visible objects: ${visiblesStr}
- Student last action: ${studentAction || 'none'}
- Scene summary: ${specSummary}

GOOD RESPONSE EXAMPLE (skew lines):
"Look at the gold connector segment floating between the two lines — that vertical segment IS the shortest distance. Try rotating the scene with your mouse: notice how it stays perpendicular to both lines no matter which angle you view it from. Why must the shortest path between two skew lines always be perpendicular to both direction vectors?"

BAD RESPONSE EXAMPLE (never do this):
"Imagine two lines in space that don't touch. What do you notice about their relationship?"

CONFUSED STAGES HISTORY: ${ss.confusedStages.join(', ') || 'none'}
${ss.confusedStages.includes(ss.questionCount - 1) ? 'IMPORTANT: The previous explanation style did not work. Try a physical analogy (railway tracks, light beams, etc) this time.' : ''}`;

  const userPrompt = `The student is working on: "${question}"
Current scene shows: ${visiblesStr}
Ask a grounded Socratic question that references a specific visible object.`;

  // Route to fast model — Groq 8B for Socratic questions
  const modelIds = resolveModelId?.('chat') || ['llama-3.1-8b-instant'];

  try {
    const response = await converseWithModelFailover({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      modelIds,
      maxTokens: 180,
    });

    const text = response?.text || response?.content || response || '';

    // Stream the response
    writeChunk?.({ type: 'text', content: text });

    // Generate context-specific action buttons
    const actions = _generateContextActions(visibleObjects, sceneType, ss.questionCount);
    writeChunk?.({ type: 'actions', actions });

    return { forceAnswer: false, questionCount: ss.questionCount };

  } catch (err) {
    console.error('[SocraticCoach] error:', err);
    // Fallback to force answer on error
    writeChunk?.({ type: 'text', content: `Let me show you the solution directly.\n\n` });
    return { forceAnswer: true, questionCount: ss.questionCount };
  }
}

// ── Context-specific action generator ───────────────────
function _generateContextActions(visibleObjects, sceneType, questionCount) {
  const actions = [];

  // Scene-specific "show me" button
  const firstObj = visibleObjects[0];
  if (firstObj) {
    actions.push({
      label: `Highlight the ${firstObj}`,
      action: 'highlight_vector',
      target: firstObj,
      variant: 'scene',
    });
  } else {
    actions.push({
      label: 'Show me the lines',
      action: 'highlight_vector',
      target: 'all_lines',
      variant: 'scene',
    });
  }

  // Formula button
  actions.push({
    label: 'What is the formula',
    action: 'show_formula',
    target: 'formula',
    variant: '',
  });

  // Force calculate if on question 2+
  if (questionCount >= 2) {
    actions.push({
      label: 'Calculate step by step',
      action: 'trigger_stage_4',
      target: null,
      variant: 'primary',
    });
  }

  return actions;
}

// ── Spec summarizer ──────────────────────────────────────
function _summarizeSpec(spec) {
  if (!spec) return 'No scene spec available';
  try {
    const objects = spec.objectSuggestions || spec.objects || [];
    const labels = objects.map(o => o.label || o.type || o.name).filter(Boolean).slice(0, 6);
    return labels.length > 0 ? labels.join(', ') : 'Scene rendering';
  } catch {
    return 'Scene spec present';
  }
}
