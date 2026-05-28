/**
 * CAS Arithmetic Engine
 * Handles: basic arithmetic, operator precedence, percentages, fractions, scientific notation, nested parens.
 * Returns a structured step trace — no LLM needed.
 */

const SAFE_EXPR = /^[0-9.\s+\-*/%()\^eE]+$/;

function stripQuestion(raw = "") {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(what is|calculate|evaluate|compute|find the value of|simplify)\b/i, "")
    .replace(/[?!]/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\bmod\b/gi, "%")
    .replace(/(\d)\s*\^\s*(\d)/g, "$1**$2")
    .trim();
}

function tokenize(expr) {
  // Identify individual arithmetic sub-operations for step tracing.
  // We return the final result alongside a step list.
  const steps = [];

  // Replace % percent: e.g. 20% of 50 → 0.20 * 50
  let cleaned = expr.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi, (_, a, b) => {
    const partial = (Number(a) / 100) * Number(b);
    steps.push({
      id: `pct-${steps.length + 1}`,
      title: `Percentage: ${a}% of ${b}`,
      formula: `\\frac{${a}}{100} \\times ${b}`,
      explanation: `${a}% of ${b} = ${partial}`,
    });
    return String(partial);
  });

  // Simple fraction: e.g. 3/4
  cleaned = cleaned.replace(/\((\d+)\s*\/\s*(\d+)\)/g, (_, n, d) => {
    const val = Number(n) / Number(d);
    steps.push({
      id: `frac-${steps.length + 1}`,
      title: `Fraction: ${n}/${d}`,
      formula: `\\frac{${n}}{${d}}`,
      explanation: `${n} ÷ ${d} = ${val}`,
    });
    return String(val);
  });

  return { cleaned, steps };
}

export function solveArithmetic(questionText = "") {
  const raw = stripQuestion(questionText);
  if (!raw) return null;

  // Pre-process percentage: "20% of 50" → "10" before safety check
  const preSteps = [];
  let preprocessed = raw.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi, (_, a, b) => {
    const partial = (Number(a) / 100) * Number(b);
    preSteps.push({
      id: `pct-${preSteps.length + 1}`,
      title: `Percentage: ${a}% of ${b}`,
      formula: `\\frac{${a}}{100} \\times ${b}`,
      explanation: `${a}% of ${b} = ${partial}`,
    });
    return String(partial);
  });

  // Replace simple fractions (n/d) with decimal
  preprocessed = preprocessed.replace(/\((\d+)\s*\/\s*(\d+)\)/g, (_, n, d) => {
    const val = Number(n) / Number(d);
    preSteps.push({
      id: `frac-${preSteps.length + 1}`,
      title: `Fraction: ${n}/${d}`,
      formula: `\\frac{${n}}{${d}}`,
      explanation: `${n} ÷ ${d} = ${val}`,
    });
    return String(val);
  });

  if (!SAFE_EXPR.test(preprocessed.replace(/\*\*/g, ""))) return null;

  const jsExpr = preprocessed.replace(/\^/g, "**");
  if (!SAFE_EXPR.test(jsExpr.replace(/\*\*/g, ""))) return null;

  let result;
  try {
    // eslint-disable-next-line no-new-func
    result = new Function(`return (${jsExpr});`)();
  } catch {
    return null;
  }

  if (typeof result !== "number" || !Number.isFinite(result)) return null;

  const rounded = Math.round(result * 1e10) / 1e10;

  const steps = [
    ...preSteps,
    {
      id: `eval-${preSteps.length + 1}`,
      title: "Evaluate the expression",
      formula: `${raw.replace(/\*\*/g, "^")} = ${rounded}`,
      explanation: `Computing: ${preprocessed} = ${rounded}`,
    },
  ];

  return {
    type: "arithmetic",
    input: questionText,
    finalAnswer: rounded,
    unit: "",
    steps,
    explanation: `The result of the expression is **${rounded}**.`,
    formulaLatex: `${raw.replace(/\*\*/g, "^")} = ${rounded}`,
  };
}
