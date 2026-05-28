/**
 * Answer Card — renders CAS or LLM-generated solution steps as rich KaTeX step cards.
 * Injects a premium, structured step-by-step panel into the lesson pane.
 */

import katex from "../../node_modules/katex/dist/katex.mjs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderKatex(formula = "", displayMode = false) {
  if (!formula || !formula.trim()) return "";
  try {
    return katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return `<code>${formula}</code>`;
  }
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ─── Card Renderers ───────────────────────────────────────────────────────────

function renderFormulaCard({ title = "", formula = "", explanation = "" }) {
  const katexHtml = formula ? renderKatex(formula, true) : "";
  return `
<div class="ac-formula-card" role="region" aria-label="Formula">
  <div class="ac-formula-header">
    <span class="ac-formula-icon">📐</span>
    <span class="ac-formula-title">${escapeHtml(title)}</span>
  </div>
  ${katexHtml ? `<div class="ac-formula-display">${katexHtml}</div>` : ""}
  ${explanation ? `<p class="ac-formula-explanation">${escapeHtml(explanation)}</p>` : ""}
</div>`;
}

function renderStep(step, index, total) {
  const formulaHtml = step.formula ? renderKatex(step.formula, true) : "";
  const isLast = index === total - 1;
  return `
<div class="ac-step ${isLast ? "ac-step--final" : ""}" data-step="${index + 1}">
  <div class="ac-step-header">
    <div class="ac-step-number">${index + 1}</div>
    <div class="ac-step-title">${escapeHtml(step.title || `Step ${index + 1}`)}</div>
  </div>
  ${formulaHtml ? `<div class="ac-step-formula">${formulaHtml}</div>` : ""}
  ${step.explanation ? `<p class="ac-step-explanation">${escapeHtml(step.explanation)}</p>` : ""}
  ${index < total - 1 ? `<div class="ac-step-connector" aria-hidden="true"></div>` : ""}
</div>`;
}

function renderFinalAnswerBadge({ answer = "", unit = "", type = "" }) {
  const displayAnswer = `${answer}${unit}`;
  const label =
    type === "trig" ? "Exact Value" :
    type === "differentiation" ? "Derivative" :
    type === "definite_integral" ? "Definite Integral" :
    type === "indefinite_integral" ? "Indefinite Integral" :
    type === "vector_angle" ? "Angle" :
    "Final Answer";

  return `
<div class="ac-answer-badge" role="region" aria-label="Final Answer">
  <div class="ac-answer-label">${escapeHtml(label)}</div>
  <div class="ac-answer-value">${renderKatex(displayAnswer, false)}</div>
</div>`;
}

function renderCasTag(casType = "") {
  return `
<div class="ac-cas-tag" title="Solved deterministically by the built-in CAS engine — no AI involved">
  <span class="ac-cas-icon">⚡</span>
  <span>Exact CAS Answer</span>
</div>`;
}

// ─── CSS injection ────────────────────────────────────────────────────────────

let cssInjected = false;
function injectStyles() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.id = "answer-card-styles";
  style.textContent = `
    .answer-card-container {
      font-family: 'Inter', 'Outfit', system-ui, sans-serif;
      margin: 16px 0;
      animation: ac-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes ac-slide-in {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Formula card */
    .ac-formula-card {
      background: linear-gradient(135deg, rgba(124, 247, 228, 0.08), rgba(72, 201, 255, 0.08));
      border: 1px solid rgba(124, 247, 228, 0.25);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .ac-formula-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .ac-formula-icon { font-size: 18px; }
    .ac-formula-title {
      font-size: 13px;
      font-weight: 600;
      color: #7cf7e4;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .ac-formula-display {
      padding: 10px 0;
      text-align: center;
      overflow-x: auto;
    }
    .ac-formula-display .katex { color: #e2fbf9; font-size: 1.2em; }
    .ac-formula-explanation {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
      margin: 8px 0 0;
    }

    /* Steps */
    .ac-steps-wrapper { display: flex; flex-direction: column; gap: 0; }

    .ac-step {
      position: relative;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 4px;
      transition: background 0.2s;
    }
    .ac-step:hover { background: rgba(255,255,255,0.055); }
    .ac-step--final {
      border-color: rgba(124, 247, 228, 0.3);
      background: rgba(124, 247, 228, 0.04);
    }

    .ac-step-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .ac-step-number {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7cf7e4, #48c9ff);
      color: #0a0f1e;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ac-step-title {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
    }
    .ac-step-formula {
      padding: 8px 0;
      overflow-x: auto;
      text-align: center;
    }
    .ac-step-formula .katex { color: #e2fbf9; font-size: 1.05em; }
    .ac-step-explanation {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      margin: 4px 0 0;
      line-height: 1.5;
    }
    .ac-step-connector {
      width: 2px;
      height: 8px;
      background: rgba(124, 247, 228, 0.2);
      margin: 4px auto 0;
    }

    /* Final answer badge */
    .ac-answer-badge {
      background: linear-gradient(135deg, rgba(124, 247, 228, 0.15), rgba(72, 201, 255, 0.10));
      border: 1.5px solid rgba(124, 247, 228, 0.4);
      border-radius: 12px;
      padding: 16px 20px;
      margin-top: 12px;
      text-align: center;
      box-shadow: 0 0 20px rgba(124, 247, 228, 0.1);
    }
    .ac-answer-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #7cf7e4;
      margin-bottom: 8px;
    }
    .ac-answer-value .katex { font-size: 1.6em; color: #fff; }

    /* CAS tag */
    .ac-cas-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(124, 247, 228, 0.08);
      border: 1px solid rgba(124, 247, 228, 0.2);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 11px;
      color: #7cf7e4;
      margin-bottom: 12px;
      cursor: default;
    }
    .ac-cas-icon { font-size: 12px; }

    /* Steps header */
    .ac-steps-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.4);
      margin: 0 0 10px;
    }
  `;
  document.head.appendChild(style);
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Render a full answer card from a plan's answerScaffold + analyticContext.
 *
 * @param {object} options
 * @param {Element} options.container - DOM element to render into
 * @param {object} options.answerScaffold - { finalAnswer, unit, formula, explanation }
 * @param {object} options.analyticContext - { formulaCard, solutionSteps, subtype }
 * @param {boolean} options.casSolved - whether the CAS engine solved this
 */
export function renderAnswerCard({ container, answerScaffold, analyticContext, casSolved = false }) {
  if (!container) return;
  injectStyles();

  const steps = analyticContext?.solutionSteps || [];
  const formulaCard = analyticContext?.formulaCard;
  const finalAnswer = answerScaffold?.finalAnswer;
  const unit = answerScaffold?.unit || "";
  const casType = analyticContext?.subtype || "";

  if (!finalAnswer && !steps.length && !formulaCard) return;

  const parts = [];

  if (casSolved) {
    parts.push(renderCasTag(casType));
  }

  if (formulaCard?.formula) {
    parts.push(renderFormulaCard({
      title: formulaCard.title || "Formula",
      formula: formulaCard.formula,
      explanation: formulaCard.explanation || "",
    }));
  }

  if (steps.length) {
    const stepHtml = steps.map((step, i) => renderStep(step, i, steps.length)).join("");
    parts.push(`
      <div class="ac-steps-title">Solution Steps</div>
      <div class="ac-steps-wrapper">${stepHtml}</div>
    `);
  }

  if (finalAnswer) {
    parts.push(renderFinalAnswerBadge({ answer: String(finalAnswer), unit, type: casType }));
  }

  const wrapper = document.createElement("div");
  wrapper.className = "answer-card-container";
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", "Solution Steps");
  wrapper.innerHTML = parts.join("");

  container.innerHTML = "";
  container.appendChild(wrapper);
}

/**
 * Check if a plan has answer card data worth rendering.
 */
export function planHasAnswerCard(plan = {}) {
  return Boolean(
    plan.answerScaffold?.finalAnswer ||
    plan.analyticContext?.solutionSteps?.length ||
    plan.analyticContext?.formulaCard?.formula
  );
}
