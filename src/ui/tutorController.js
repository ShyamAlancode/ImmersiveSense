// ═══════════════════════════════════════════════════════
// src/ui/tutorController.js
// REWRITTEN — Clean event-driven Socratic orchestration.
// Handles: chat rendering, moment strip, progressive
// 6-stage accordion, confusion detection, scene sync.
// ═══════════════════════════════════════════════════════

import { getContext, setStudentAction, resetContext } from '../state/sceneContextStore.js';
import { socraticCoachEvents, dispatchCorrectAnswer, dispatchForceCalculation, dispatchConfusion } from '../core/socraticCoachEvents.js';

// ── State ──────────────────────────────────────────────
const state = {
  plan: null,
  sessionId: null,
  socraticQuestionCount: 0,
  momentComplete: { observe: false, explore: false, predict: false, verify: false },
  activeStages: {},         // stageNum → DOM card element
  thinkingTimer: null,
  hasExplored: false,
};

// ── DOM refs ───────────────────────────────────────────
const chat        = () => document.getElementById('tutor-chat');
const qaWrap      = () => document.getElementById('quickActionsWrap');
const thinkingBar = () => document.getElementById('thinkingBar');
const welcomeState = () => document.getElementById('welcomeState');
const problemPillText = () => document.getElementById('problem-pill-text');
const floatingFormulaContent = () => document.getElementById('floatingFormulaContent');
const toolbarStatus = () => document.getElementById('toolbarStatus');
const algebraSteps = () => document.getElementById('algebraSteps');
const algebraEmpty = () => document.getElementById('algebraEmpty');
const breadcrumb  = () => document.getElementById('breadcrumbText');

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
export function initTutorController() {
  _bindMomentStripEvents();
  _bindSocraticEvents();
  _bindSendButton();
  _bindTabSwitch();
  _fetchInitialStudentModel();
}

function _bindMomentStripEvents() {
  // observe → fires when world.js dispatches sceneReady
  window.addEventListener('sceneReady', () => {
    if (!state.momentComplete.observe) {
      advanceMoment('observe');
    }
  });

  // explore → fires on first OrbitControls change after scene loads
  window.addEventListener('sceneOrbitChange', () => {
    if (state.momentComplete.observe && !state.momentComplete.explore) {
      advanceMoment('explore');
    }
  });

  // predict → fires when student gives correct answer
  socraticCoachEvents.addEventListener('correctAnswer', () => {
    if (state.momentComplete.explore && !state.momentComplete.predict) {
      advanceMoment('predict');
    }
    // Highlight solved objects in world
    window.world?.highlightObject?.('all_solved', 'success');
  });

  // forceCalculation → fires after 3 Socratic questions
  socraticCoachEvents.addEventListener('forceCalculation', () => {
    _triggerForceAnswer();
  });

  // verify → fires when full answer is shown
  window.addEventListener('answerRevealed', () => {
    if (state.momentComplete.predict && !state.momentComplete.verify) {
      advanceMoment('verify');
    }
  });
}

function _bindSocraticEvents() {
  socraticCoachEvents.addEventListener('confusion', (e) => {
    const { state: confState } = e.detail;
    if (confState === 'CONFUSED' || confState === 'HESITANT') {
      _showConfusionAlert(confState);
    }
  });
}

function _bindSendButton() {
  const sendBtn = document.getElementById('sendBtn');
  const chatInput = document.getElementById('chatInput');
  if (!sendBtn || !chatInput) return;

  sendBtn.addEventListener('click', () => {
    const q = chatInput.value.trim();
    if (!q) return;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    _handleUserMessage(q);
  });
}

function _bindTabSwitch() {
  // handled inline in index.html but we also sync algebra tab
  document.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'algebra') _renderAlgebraTab();
    });
  });
}

async function _fetchInitialStudentModel() {
  try {
    const res = await fetch('/api/tutor/student-model');
    if (res.ok) {
      const data = await res.json();
      if (data?.studentModel) window.updateStudentModelUI?.(data.studentModel);
    }
  } catch { /* offline or cold start */ }
}

// ═══════════════════════════════════════════════════════
// PLAN HANDLING (called by existing planService pipeline)
// ═══════════════════════════════════════════════════════
export function setPlan(plan) {
  if (!plan) return;
  state.plan = plan;
  state.socraticQuestionCount = 0;
  state.activeStages = {};
  state.hasExplored = false;
  resetContext();
  resetMomentStrip();
  _clearQuickActions();
  _clearAlgebra();

  // Update problem pill
  const q = plan.problem?.questionText || plan.problem?.raw || '';
  if (q) {
    const pillEl = problemPillText();
    if (pillEl) pillEl.textContent = q.length > 90 ? q.slice(0,87) + '…' : q;
  }

  // Update breadcrumb
  const topicMap = {
    'skew_lines': '3D Geometry · Skew Lines',
    'line_plane': '3D Geometry · Line & Plane',
    'derivative': 'Calculus · Derivatives',
    'integral': 'Calculus · Integration',
    'calculus': 'Calculus',
    'vectors': 'Vectors',
    'electric_field': 'Physics · Electric Fields',
  };
  const sceneType = plan.sceneType || plan.planType || '';
  const bc = breadcrumb();
  if (bc) bc.textContent = topicMap[sceneType] || '3D Math Tutor';

  // Update floating formula card
  _updateFloatingFormula(plan);

  // Update toolbar status
  const ts = toolbarStatus();
  if (ts) ts.textContent = (sceneType || 'scene') + ' · 3D mode';

  // Hide welcome state
  const ws = welcomeState();
  if (ws) ws.style.display = 'none';

  // Append user question to chat
  if (q) _appendUserMessage(q);
}

function _updateFloatingFormula(plan) {
  const el = floatingFormulaContent();
  if (!el) return;
  // Try multiple locations for line/formula data
  const lines = plan.analyticContext?.lines
    || plan.objectSuggestions?.filter(o => o.type === 'line')
    || plan.problem?.entities?.lines;

  if (lines && lines.length >= 2) {
    const l1 = lines[0];
    const l2 = lines[1];
    const fmt = (l) => {
      if (l.point && l.direction) {
        const p = l.point;
        const d = l.direction;
        return `r = (${p[0]},${p[1]},${p[2]}) + t(${d[0]},${d[1]},${d[2]})`;
      }
      return l.label || l.name || JSON.stringify(l);
    };
    el.textContent = `L1: ${fmt(l1)} | L2: ${fmt(l2)}`;
  } else {
    const q = plan.problem?.questionText || '';
    const m = q.match(/f\(x\)\s*=\s*[^.\n]+/i);
    el.textContent = m ? m[0] : (q.slice(0, 55) || '—');
  }

  const ff = document.getElementById('floatingFormula');
  if (ff) ff.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════════════
function _appendUserMessage(text) {
  const c = chat();
  if (!c) return;

  const el = document.createElement('div');
  el.className = 'msg msg--user';
  el.innerHTML = `<div class="bubble bubble--user">${_escHtml(text)}</div>`;
  c.appendChild(el);
  _scrollToBottom();
}

export function appendAiMessage(text, variant = '') {
  const c = chat();
  if (!c) return null;

  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <div class="msg-avatar">✦</div>
    <div class="bubble ${variant ? 'bubble--' + variant : ''}">${_processText(text)}</div>
  `;
  c.appendChild(el);
  _scrollToBottom();
  return el.querySelector('.bubble');
}

export function appendStreamingMessage() {
  const c = chat();
  if (!c) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'msg';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '✦';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = '';

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  c.appendChild(wrapper);
  _scrollToBottom();
  return bubble;
}

// ═══════════════════════════════════════════════════════
// 6-STAGE PROGRESSIVE ACCORDION
// ═══════════════════════════════════════════════════════
export function handleProgressiveStageChunk(payload) {
  const { type, stage, content, sceneActions, isComplete } = payload;

  if (type === 'stage_error') {
    _renderStageError(stage, content);
    return;
  }

  // Get or create the accordion container
  let accordion = document.getElementById('progressive-accordion');
  if (!accordion) {
    const c = chat();
    if (!c) return;

    // Add avatar + accordion wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'msg';
    wrapper.innerHTML = `<div class="msg-avatar">✦</div><div style="flex:1;min-width:0"></div>`;

    accordion = document.createElement('div');
    accordion.id = 'progressive-accordion';
    accordion.className = 'progressive-accordion';

    wrapper.querySelector('div:last-child').appendChild(accordion);
    c.appendChild(wrapper);
  }

  // Render the specific stage card
  const stageLabels = {
    1: 'Problem deconstruction',
    2: 'Geometric intuition',
    3: 'Formula selection',
    4: 'Step-by-step calculation',
    5: 'Common pitfalls',
    6: 'Verified answer',
  };

  const label = stageLabels[stage] || type;

  let card = state.activeStages[stage];
  if (!card) {
    card = document.createElement('div');
    card.className = 'stage-card';
    card.dataset.stage = stage;
    card.innerHTML = `
      <div class="stage-card-header">
        <span class="stage-num">${stage}</span>
        <span class="stage-title">${label}</span>
        <span class="stage-chevron">›</span>
      </div>
      <div class="stage-card-body"></div>
    `;
    card.querySelector('.stage-card-header').addEventListener('click', () => {
      card.classList.toggle('open');
    });
    // Auto-open this card
    card.classList.add('open');
    // Close previous card
    if (state.activeStages[stage - 1]) {
      state.activeStages[stage - 1].classList.remove('open');
    }

    // Insert in correct numeric order
    const existing = [...accordion.querySelectorAll('.stage-card')];
    const insertBefore = existing.find(c => parseInt(c.dataset.stage) > stage);
    if (insertBefore) accordion.insertBefore(card, insertBefore);
    else accordion.appendChild(card);

    state.activeStages[stage] = card;
  }

  const body = card.querySelector('.stage-card-body');
  _renderStageContent(body, type, stage, content, sceneActions);

  if (isComplete && stage === 6) {
    window.dispatchEvent(new CustomEvent('answerRevealed'));
    _updateAlgebraTab(content);
  }

  // Wire scene actions
  if (sceneActions?.length) {
    _wireSceneActions(body, sceneActions);
  }

  _scrollToBottom();
}

function _renderStageContent(body, type, stage, content, sceneActions) {
  switch (type) {
    case 'deconstruct':
      body.innerHTML = _renderDeconstruct(content);
      break;
    case 'intuition':
      body.innerHTML = `<div style="color:var(--text-secondary);font-size:11.5px;line-height:1.65">${_processText(typeof content === 'string' ? content : content?.insight || '')}</div>`;
      break;
    case 'formula':
      body.innerHTML = _renderFormula(content);
      break;
    case 'steps':
      body.innerHTML = _renderSteps(content, sceneActions);
      break;
    case 'manipulation':
      body.innerHTML = _renderManipulation(content);
      break;
    case 'answer':
      body.innerHTML = _renderAnswer(content);
      card = body.closest('.stage-card');
      if (card) {
        card.style.borderColor = 'rgba(20,184,166,0.4)';
        card.querySelector('.stage-num').style.background = 'rgba(20,184,166,0.2)';
        card.querySelector('.stage-num').style.color = 'var(--accent-teal)';
      }
      // Increment question count tracking (answer revealed = max reached)
      state.socraticQuestionCount = 0;
      break;
    default:
      body.innerHTML = `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">${_processText(typeof content === 'string' ? content : JSON.stringify(content))}</div>`;
  }
}

function _renderDeconstruct(content) {
  if (!content || typeof content === 'string') {
    return `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">${_processText(content || '')}</div>`;
  }
  const { problemType, knowns, unknown, domain, commonMistake } = content;
  let rows = '';
  if (Array.isArray(knowns)) {
    knowns.forEach(k => {
      rows += `<tr><td>${_escHtml(k.name || '')}</td><td>${_escHtml(k.value || '')}</td></tr>`;
    });
  }
  return `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">
      <span style="color:var(--accent-indigo);font-weight:500">${_escHtml(problemType || '')}</span>
      ${domain ? `· ${_escHtml(domain)}` : ''}
    </div>
    ${rows ? `
    <table class="deconstruct-table">
      <thead><tr><th>Given</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : ''}
    ${unknown ? `<div style="margin-top:6px;font-size:11px;color:var(--text-secondary)">
      <span style="color:var(--text-muted)">Find:</span> <span style="font-family:var(--font-mono);color:var(--text-mono)">${_escHtml(unknown)}</span>
    </div>` : ''}
    ${commonMistake ? `<div style="margin-top:8px;background:rgba(245,158,11,0.08);border:0.5px solid rgba(245,158,11,0.2);border-radius:6px;padding:6px 8px;font-size:11px;color:#fde68a">
      ⚠ Common mistake: ${_escHtml(commonMistake)}
    </div>` : ''}
  `;
}

function _renderFormula(content) {
  if (!content) return '';
  const formula = typeof content === 'string' ? content : content.formula || '';
  const why = typeof content === 'object' ? (content.why || '') : '';
  let html = '';
  if (formula) {
    html += `<div style="margin:6px 0;padding:8px;background:rgba(20,184,166,0.06);border-radius:6px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-mono)">${_processText(formula)}</div>`;
  }
  if (why) {
    html += `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65;margin-top:6px">${_processText(why)}</div>`;
  }
  // Try KaTeX render
  try {
    if (formula && window.renderMathInElement) {
      setTimeout(() => {
        const container = document.querySelector(`[data-stage="3"] .stage-card-body`);
        if (container) window.renderMathInElement(container, { throwOnError: false });
      }, 100);
    }
  } catch {}
  return html;
}

function _renderSteps(content, sceneActions) {
  if (!Array.isArray(content)) {
    return `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">${_processText(typeof content === 'string' ? content : '')}</div>`;
  }

  const items = content.map((step, i) => {
    const hasScene = step.sceneAction && step.sceneTarget;
    return `
      <div class="step-item" data-target="${_escHtml(step.sceneTarget || '')}" data-action="${_escHtml(step.sceneAction || '')}">
        <div class="step-num">${step.stepNumber || i + 1}</div>
        <div class="step-content">
          <div class="step-action">${_escHtml(step.action || '')}</div>
          ${step.expression ? `<div class="step-expr">${_processText(step.expression)}</div>` : ''}
          ${step.result ? `<div class="step-result">= ${_processText(step.result)}</div>` : ''}
          ${step.explanation ? `<div class="step-explain">${_escHtml(step.explanation)}</div>` : ''}
          ${hasScene ? `<button class="show-in-3d-btn" data-target="${_escHtml(step.sceneTarget)}" data-action="${_escHtml(step.sceneAction)}">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 1L1 4v4l5 3 5-3V4z"/></svg>
            Show in 3D
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="step-list">${items}</div>`;
}

function _renderManipulation(content) {
  if (!content) return '';
  const text = typeof content === 'string' ? content : (content.guide || JSON.stringify(content));
  return `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.7">${_processText(text)}</div>`;
}

function _renderAnswer(content) {
  if (!content) return '';
  const answer  = typeof content === 'string' ? content : (content.answer || '');
  const verify  = typeof content === 'object' ? (content.verification || '') : '';
  const remember = typeof content === 'object' ? (content.remember || '') : '';

  return `
    <div style="font-size:13px;font-weight:500;color:var(--accent-teal);font-family:var(--font-mono);margin-bottom:6px">${_processText(answer)}</div>
    ${verify ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${_processText(verify)}</div>` : ''}
    ${remember ? `<div style="font-size:11px;background:rgba(99,102,241,0.08);border:0.5px solid rgba(99,102,241,0.2);border-radius:6px;padding:6px 8px;color:#a5b4fc">
      💡 ${_escHtml(remember)}
    </div>` : ''}
  `;
}

function _renderStageError(stage, message) {
  const label = `Stage ${stage}`;
  appendAiMessage(`${label} encountered an issue and was skipped.`, 'error');
}

// ═══════════════════════════════════════════════════════
// SCENE ACTION WIRING
// ═══════════════════════════════════════════════════════
function _wireSceneActions(container, sceneActions) {
  container.querySelectorAll('.show-in-3d-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.dataset.target || (sceneActions[0]?.target);
      const action = btn.dataset.action || (sceneActions[0]?.action) || 'highlight';
      if (target && window.world?.highlightObject) {
        window.world.highlightObject(target, action);
        btn.classList.add('highlight-pulse');
        setTimeout(() => btn.classList.remove('highlight-pulse'), 1200);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════
// QUICK ACTION BUTTONS
// ═══════════════════════════════════════════════════════
export function renderQuickActions(actions) {
  const wrap = qaWrap();
  if (!wrap) return;
  _clearQuickActions();

  if (!actions?.length) {
    // Generate context-specific fallbacks from scene
    const ctx = getContext();
    const firstObj = ctx.visibleObjects?.[0];
    actions = [
      firstObj
        ? { label: `Highlight the ${firstObj}`, action: 'highlight_vector', target: firstObj, variant: 'scene' }
        : { label: 'Show me the lines', action: 'highlight_vector', target: 'all_lines', variant: 'scene' },
      { label: 'What is the formula', action: 'show_formula', target: 'formula', variant: '' },
      { label: 'Calculate step by step', action: 'trigger_stage_4', target: null, variant: 'primary' },
    ];
  }

  // Filter out generic placeholders
  const filtered = actions.filter(a =>
    a.label !== 'What should I notice?' &&
    a.label !== 'How do I start?' &&
    !a.label.startsWith('Tell me more')
  );

  filtered.forEach(action => {
    const btn = document.createElement('button');
    const cls = action.variant === 'primary' ? 'qa-btn qa-btn--primary'
              : action.variant === 'scene'   ? 'qa-btn qa-btn--scene'
              : 'qa-btn';
    btn.className = cls;
    btn.textContent = action.label;
    btn.addEventListener('click', () => _handleAction(action));
    wrap.appendChild(btn);
  });
}

function _handleAction(action) {
  switch (action.action) {
    case 'highlight_vector':
    case 'highlight_point':
    case 'highlight_plane':
    case 'pulse_connector': {
      const target = action.target || 'all_lines';
      window.world?.highlightObject?.(target, action.action);
      break;
    }
    case 'show_formula': {
      // Switch to algebra tab and scroll into view
      document.querySelector('.ptab[data-tab="algebra"]')?.click();
      _renderAlgebraTab();
      break;
    }
    case 'trigger_stage_4': {
      _triggerForceAnswer();
      break;
    }
    default: {
      // Treat as a chat message
      if (action.label) _handleUserMessage(action.label);
    }
  }
  _clearQuickActions();
}

// ═══════════════════════════════════════════════════════
// FORCE ANSWER (after 3 questions)
// ═══════════════════════════════════════════════════════
function _triggerForceAnswer() {
  if (!state.plan) return;
  _showThinking(true);
  sendTutorMessage('__FORCE_ANSWER__', { forceAnswer: true });
}

// ═══════════════════════════════════════════════════════
// TUTOR MESSAGE SENDING (SSE streaming)
// ═══════════════════════════════════════════════════════
async function _handleUserMessage(text) {
  if (!text.trim()) return;

  state.socraticQuestionCount++;
  _clearQuickActions();
  _appendUserMessage(text);
  _showThinking(true);

  // Remove welcome state
  const ws = welcomeState();
  if (ws) ws.style.display = 'none';

  await sendTutorMessage(text);
}

export async function sendTutorMessage(message, extraPayload = {}) {
  _showThinking(true);

  const ctx = getContext();
  const payload = {
    message,
    sessionId: state.sessionId,
    plan: state.plan,
    sceneContext: {
      currentSceneSpec: ctx.currentSceneSpec,
      visibleObjects: ctx.visibleObjects,
      studentAction: ctx.studentAction,
      sceneType: ctx.sceneType,
    },
    confusionMetrics: {
      questionCount: state.socraticQuestionCount,
      forceAnswer: state.socraticQuestionCount >= 3 || extraPayload.forceAnswer,
    },
    ...extraPayload,
  };

  try {
    const res = await fetch('/api/tutor/freeform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let streamingBubble = null;
    let currentEventType = 'text';
    let buffer = '';

    const flush = (line) => {
      if (line.startsWith('event:')) {
        currentEventType = line.slice(6).trim();
        return;
      }
      if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') return;
        try {
          const parsed = JSON.parse(raw);

          if (currentEventType === 'tutorStage') {
            _showThinking(false);
            handleProgressiveStageChunk(parsed);
            return;
          }

          if (currentEventType === 'actions') {
            _showThinking(false);
            renderQuickActions(parsed.actions || []);
            return;
          }

          if (currentEventType === 'studentModel') {
            window.updateStudentModelUI?.(parsed);
            return;
          }

          if (currentEventType === 'confusion') {
            if (parsed.state) {
              dispatchConfusion(parsed.state);
            }
            return;
          }

          // Generic text chunk
          if (parsed.text || parsed.chunk || parsed.content) {
            _showThinking(false);
            const chunk = parsed.text ?? parsed.chunk ?? parsed.content ?? '';
            if (!streamingBubble) streamingBubble = appendStreamingMessage();
            if (streamingBubble) {
              streamingBubble.innerHTML += _processText(chunk);
              _scrollToBottom();
            }
          }

        } catch {
          // plain text chunk
          if (raw && !raw.startsWith('{')) {
            _showThinking(false);
            if (!streamingBubble) streamingBubble = appendStreamingMessage();
            if (streamingBubble) {
              streamingBubble.textContent += raw;
              _scrollToBottom();
            }
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(flush);
    }
    if (buffer) flush(buffer);

  } catch (err) {
    console.error('[TutorController] sendTutorMessage error:', err);
    appendAiMessage(`Something went wrong: ${err.message}. Please try again.`, 'error');
  } finally {
    _showThinking(false);
    // After 3 questions, auto-force if not already done
    if (state.socraticQuestionCount >= 3 && !extraPayload.forceAnswer) {
      setTimeout(() => dispatchForceCalculation(), 200);
    }
  }
}

// ═══════════════════════════════════════════════════════
// MOMENT STRIP
// ═══════════════════════════════════════════════════════
export function advanceMoment(name) {
  if (state.momentComplete[name]) return;
  state.momentComplete[name] = true;
  _updateMomentStripUI();
}

export function resetMomentStrip() {
  state.momentComplete = { observe: false, explore: false, predict: false, verify: false };
  _updateMomentStripUI();
}

function _updateMomentStripUI() {
  const order = ['observe', 'explore', 'predict', 'verify', 'reflect'];
  const moments = document.querySelectorAll('.moment[data-moment]');

  // Find last completed index
  let lastDoneIdx = -1;
  order.forEach((name, i) => {
    if (state.momentComplete[name]) lastDoneIdx = i;
  });
  const currentIdx = lastDoneIdx + 1;

  moments.forEach((el, i) => {
    el.classList.remove('is-done', 'is-current', 'is-upcoming');
    // Remove existing ring
    el.querySelector('.moment__ring')?.remove();

    if (i < currentIdx) {
      el.classList.add('is-done');
    } else if (i === currentIdx) {
      el.classList.add('is-current');
      const dw = el.querySelector('.moment-dot-wrap');
      if (dw && !el.querySelector('.moment__ring')) {
        const ring = document.createElement('span');
        ring.className = 'moment__ring';
        dw.insertBefore(ring, dw.firstChild);
      }
    } else {
      el.classList.add('is-upcoming');
    }
  });
}

// ═══════════════════════════════════════════════════════
// CONFUSION ALERT
// ═══════════════════════════════════════════════════════
function _showConfusionAlert(confState) {
  const c = chat();
  if (!c) return;
  // Remove existing alerts to avoid stacking
  c.querySelectorAll('.alert-confusion').forEach(a => a.remove());

  const messages = {
    CONFUSED:  'You seem stuck here. Want me to try a physics/motion analogy instead?',
    HESITANT:  'Taking a bit longer on this step — shall I break it into smaller pieces?',
    GUESSING:  'It looks like you might be guessing. Let\'s build up to the formula step by step.',
  };

  const alert = document.createElement('div');
  alert.className = 'alert-confusion';
  alert.innerHTML = `
    <span class="alert-confusion-icon">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
        <path d="M8 2.5L14.5 13.5h-13z"/><path d="M8 6.5v3.5"/><circle cx="8" cy="12" r=".5" fill="currentColor"/>
      </svg>
    </span>
    <span class="alert-confusion-text">${messages[confState] || messages.HESITANT}</span>
  `;
  c.appendChild(alert);
  _scrollToBottom();
}

// ═══════════════════════════════════════════════════════
// ALGEBRA TAB
// ═══════════════════════════════════════════════════════
function _renderAlgebraTab() {
  const stepsEl = algebraSteps();
  const emptyEl = algebraEmpty();
  if (!stepsEl) return;

  if (!state.activeStages[4] && !state.activeStages[3]) {
    if (emptyEl) emptyEl.style.display = 'flex';
    stepsEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  // Content rendered via _updateAlgebraTab
}

function _updateAlgebraTab(answerContent) {
  const stepsEl = algebraSteps();
  const emptyEl = algebraEmpty();
  if (!stepsEl) return;
  if (emptyEl) emptyEl.style.display = 'none';

  const existing = stepsEl.innerHTML;
  if (!existing) {
    stepsEl.innerHTML = `<div class="algebra-step">
      <div class="algebra-step-label">answer</div>
      ${_processText(typeof answerContent === 'string' ? answerContent : (answerContent?.answer || JSON.stringify(answerContent)))}
    </div>`;
  }
}

function _clearAlgebra() {
  const stepsEl = algebraSteps();
  const emptyEl = algebraEmpty();
  if (stepsEl) stepsEl.innerHTML = '';
  if (emptyEl) emptyEl.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════
// THINKING INDICATOR
// ═══════════════════════════════════════════════════════
function _showThinking(show) {
  const bar = thinkingBar();
  if (!bar) return;
  if (show) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function _clearQuickActions() {
  const w = qaWrap();
  if (w) w.innerHTML = '';
}

function _scrollToBottom() {
  const c = chat();
  if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

function _escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _processText(text) {
  if (typeof text !== 'string') return '';
  // Escape first
  let html = _escHtml(text);
  // Inline math: f'(x) = 0 style
  html = html.replace(/`([^`]+)`/g, '<span class="inline-math">$1</span>');
  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Basic LaTeX inline $...$
  html = html.replace(/\$([^$]+)\$/g, '<span class="inline-math">$1</span>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

// Export for legacy planService.js usage
export { setPlan as default };
export { sendTutorMessage as sendMessage };
