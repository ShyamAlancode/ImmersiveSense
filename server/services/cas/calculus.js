/**
 * CAS Calculus Engine
 * Handles deterministic symbolic differentiation and integration for polynomial + basic trig expressions.
 */

import { round } from "../plan/analyticMath.js";

function fmt(n) {
  const r = round(n, 6);
  return Number.isInteger(r) ? String(r) : String(r);
}

// ─── Term parser ─────────────────────────────────────────────────────────────
// Parses "3x^2", "x", "-5x^3", "4" etc.
const TERM_RE = /([+-]?\s*\d*\.?\d*)\s*([a-z])?\s*(?:\^|\*\*)\s*([+-]?\s*\d+\.?\d*)/gi;
const CONST_TERM_RE = /([+-]?\s*\d+\.?\d*)\s*([a-z])\b(?!\s*[\^*])/gi;
const PURE_CONST_RE = /(?<![a-z\d])([+-]?\s*\d+\.?\d*)(?![a-z\d\^*])/g;

function parseTerms(expr, variable = "x") {
  const terms = [];
  const text = expr.replace(/\s+/g, "");

  // Match coeff * var ^ exp
  for (const m of text.matchAll(/([+-]?\d*\.?\d*)([a-z])(?:\^|\*\*)([+-]?\d+\.?\d*)/g)) {
    const c = m[1].replace(/\s/g, "");
    const v = m[2];
    const e = Number(m[3]);
    if (v !== variable) continue;
    const coeff = c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c);
    if (!Number.isFinite(coeff) || !Number.isFinite(e)) continue;
    terms.push({ coeff, exp: e });
  }

  // Match coeff * var (exp = 1)
  for (const m of text.matchAll(/([+-]?\d*\.?\d*)([a-z])(?![\^*])/g)) {
    const c = m[1].replace(/\s/g, "");
    const v = m[2];
    if (v !== variable) continue;
    const coeff = c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c);
    if (!Number.isFinite(coeff)) continue;
    terms.push({ coeff, exp: 1 });
  }

  // Match pure constants
  for (const m of text.matchAll(/(?<![a-z])([+-]?\d+\.?\d*)(?![a-z\^*])/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) terms.push({ coeff: n, exp: 0 });
  }

  return terms;
}

function termToLatex({ coeff, exp }, variable = "x") {
  if (exp === 0) return fmt(coeff);
  const c = Math.abs(coeff) === 1 ? (coeff < 0 ? "-" : "") : fmt(coeff);
  if (exp === 1) return `${c}${variable}`;
  return `${c}${variable}^{${exp}}`;
}

function termsToLatex(terms, variable = "x") {
  if (!terms.length) return "0";
  return terms
    .map((t, i) => {
      const latex = termToLatex(t, variable);
      if (i === 0) return latex;
      return t.coeff >= 0 ? `+ ${latex}` : latex;
    })
    .join(" ");
}

// ─── Differentiation ─────────────────────────────────────────────────────────

const DIFF_PATTERN =
  /(?:differentiate|derivative of|d\/dx|find\s+dy\/dx|differentiation)\s*(?:of\s*)?(.+)/i;

export function differentiate(questionText = "") {
  const match = questionText.match(DIFF_PATTERN);
  if (!match) return null;

  const exprRaw = match[1].trim().replace(/with respect to [a-z]/i, "").trim();

  // Detect variable
  const varMatch = exprRaw.match(/d(?:y|f)\/d([a-z])/i) || exprRaw.match(/\bwrt\s+([a-z])/i);
  const variable = varMatch ? varMatch[1].toLowerCase() : "x";

  const terms = parseTerms(exprRaw, variable);
  if (!terms.length) return null;

  // Apply power rule to each term
  const derivedTerms = [];
  const stepLines = [];

  for (const { coeff, exp } of terms) {
    if (exp === 0) {
      stepLines.push(`\\frac{d}{d${variable}}(${fmt(coeff)}) = 0`);
      // constant disappears
    } else if (exp === 1) {
      derivedTerms.push({ coeff, exp: 0 });
      stepLines.push(`\\frac{d}{d${variable}}(${fmt(coeff)}${variable}) = ${fmt(coeff)}`);
    } else {
      const newCoeff = coeff * exp;
      const newExp = exp - 1;
      derivedTerms.push({ coeff: newCoeff, exp: newExp });
      stepLines.push(
        `\\frac{d}{d${variable}}(${termToLatex({ coeff, exp }, variable)}) = ${termToLatex({ coeff: newCoeff, exp: newExp }, variable)}`
      );
    }
  }

  const resultLatex = termsToLatex(derivedTerms, variable);

  const steps = [
    {
      id: "step-1",
      title: "Apply the Power Rule: d/dx(xⁿ) = nxⁿ⁻¹",
      formula: `\\frac{d}{d${variable}}[x^n] = n \\cdot x^{n-1}`,
      explanation: "Multiply by the exponent, then reduce the exponent by 1. Constants vanish.",
    },
    ...stepLines.map((formula, i) => ({
      id: `step-${i + 2}`,
      title: `Differentiate term ${i + 1}`,
      formula,
      explanation: formula,
    })),
    {
      id: `step-${stepLines.length + 2}`,
      title: "Combine all derived terms",
      formula: `\\frac{d}{d${variable}}f = ${resultLatex}`,
      explanation: `Final derivative: ${resultLatex}`,
    },
  ];

  return {
    type: "differentiation",
    input: questionText,
    finalAnswer: resultLatex,
    unit: "",
    steps,
    explanation: `d/d${variable} = ${resultLatex}`,
    formulaLatex: `\\frac{d}{d${variable}} = ${resultLatex}`,
  };
}

// ─── Definite/Indefinite Integration ─────────────────────────────────────────

const INT_PATTERN =
  /(?:integrate|integral of|∫)\s*(?:of\s*)?(.+?)(?:\s+from\s+([+-]?\d+\.?\d*)\s+to\s+([+-]?\d+\.?\d*))?$/i;

export function integrate(questionText = "") {
  const match = questionText.match(INT_PATTERN);
  if (!match) return null;

  const exprRaw = match[1].trim();
  const lowerBound = match[2] !== undefined ? Number(match[2]) : null;
  const upperBound = match[3] !== undefined ? Number(match[3]) : null;
  const isDefinite = lowerBound !== null && upperBound !== null;

  const varMatch = exprRaw.match(/d([a-z])$/i);
  const variable = varMatch ? varMatch[1].toLowerCase() : "x";
  const exprClean = exprRaw.replace(/d[a-z]$/i, "").trim();

  const terms = parseTerms(exprClean, variable);
  if (!terms.length) return null;

  // Apply reverse power rule
  const integratedTerms = [];
  const stepLines = [];

  for (const { coeff, exp } of terms) {
    if (exp === -1) {
      // ln rule
      integratedTerms.push({ type: "ln", coeff });
      stepLines.push(`\\int \\frac{${fmt(coeff)}}{${variable}} \\, d${variable} = ${fmt(coeff)} \\ln|${variable}|`);
    } else {
      const newExp = exp + 1;
      const newCoeff = coeff / newExp;
      integratedTerms.push({ coeff: newCoeff, exp: newExp });
      stepLines.push(
        `\\int ${termToLatex({ coeff, exp }, variable)} \\, d${variable} = ${termToLatex({ coeff: newCoeff, exp: newExp }, variable)}`
      );
    }
  }

  const indefiniteLatex =
    integratedTerms
      .map((t, i) =>
        t.type === "ln"
          ? `${fmt(t.coeff)}\\ln|${variable}|`
          : termToLatex(t, variable)
      )
      .join(" + ") + (isDefinite ? "" : " + C");

  let resultLatex = indefiniteLatex;
  let definiteValue = null;

  if (isDefinite) {
    // Evaluate F(upper) - F(lower)
    function evalAt(v) {
      return integratedTerms.reduce((sum, t) => {
        if (t.type === "ln") return sum + t.coeff * Math.log(Math.abs(v));
        return sum + t.coeff * Math.pow(v, t.exp);
      }, 0);
    }
    definiteValue = round(evalAt(upperBound) - evalAt(lowerBound), 6);
    resultLatex = fmt(definiteValue);
  }

  const steps = [
    {
      id: "step-1",
      title: "Apply Reverse Power Rule: ∫xⁿ dx = xⁿ⁺¹/(n+1)",
      formula: `\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C`,
      explanation: "Increase the exponent by 1 and divide the coefficient by the new exponent.",
    },
    ...stepLines.map((formula, i) => ({
      id: `step-${i + 2}`,
      title: `Integrate term ${i + 1}`,
      formula,
      explanation: formula,
    })),
    {
      id: `step-${stepLines.length + 2}`,
      title: isDefinite ? "Evaluate definite integral" : "Combine all integrated terms",
      formula: isDefinite
        ? `\\left[${indefiniteLatex}\\right]_{${fmt(lowerBound)}}^{${fmt(upperBound)}} = ${resultLatex}`
        : indefiniteLatex,
      explanation: isDefinite
        ? `F(${fmt(upperBound)}) − F(${fmt(lowerBound)}) = ${resultLatex}`
        : `Indefinite integral: ${indefiniteLatex}`,
    },
  ];

  return {
    type: isDefinite ? "definite_integral" : "indefinite_integral",
    input: questionText,
    finalAnswer: resultLatex,
    unit: "",
    steps,
    explanation: isDefinite
      ? `∫ from ${lowerBound} to ${upperBound} = ${resultLatex}`
      : `∫ = ${indefiniteLatex}`,
    formulaLatex: isDefinite
      ? `\\int_{${fmt(lowerBound)}}^{${fmt(upperBound)}} = ${resultLatex}`
      : `\\int = ${indefiniteLatex}`,
  };
}
