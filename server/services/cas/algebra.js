/**
 * CAS Algebra Engine
 * Handles:
 *   - Linear equations:   ax + b = c
 *   - Quadratic equations: ax^2 + bx + c = 0
 *   - Systems of 2 linear equations
 * Returns structured step traces.
 */

import { round } from "../plan/analyticMath.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n) {
  const r = round(n, 6);
  return Number.isInteger(r) ? String(r) : String(r);
}

function stripQuestion(raw = "") {
  return raw
    .trim()
    .replace(/^(solve|find|evaluate|calculate|what is|simplify)\b/i, "")
    .replace(/[?!]/g, "")
    .replace(/[−–]/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .trim();
}

// ─── Linear Equation ax + b = c ─────────────────────────────────────────────

const LINEAR_PATTERN =
  /^([+-]?\s*\d*\.?\d*)\s*([a-z])\s*([+-]\s*\d+\.?\d*)?\s*=\s*([+-]?\s*\d+\.?\d*)$/i;

export function solveLinear(questionText = "") {
  const cleaned = stripQuestion(questionText);
  const match = cleaned.match(LINEAR_PATTERN);
  if (!match) return null;

  const aStr = match[1].replace(/\s/g, "");
  const variable = match[2].toLowerCase();
  const bStr = (match[3] || "0").replace(/\s/g, "");
  const cStr = match[4].replace(/\s/g, "");

  const a = aStr === "" || aStr === "+" ? 1 : aStr === "-" ? -1 : Number(aStr);
  const b = Number(bStr);
  const c = Number(cStr);

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;

  const rhs = c - b;
  const result = rhs / a;

  const steps = [
    {
      id: "step-1",
      title: "Write the equation",
      formula: `${fmt(a)}${variable}${b >= 0 ? "+" : ""}${fmt(b)} = ${fmt(c)}`,
      explanation: `Start with the given equation.`,
    },
    {
      id: "step-2",
      title: "Isolate the variable term",
      formula: `${fmt(a)}${variable} = ${fmt(c)} - (${fmt(b)}) = ${fmt(rhs)}`,
      explanation: `Subtract ${fmt(b)} from both sides to move constants to the right.`,
    },
    {
      id: "step-3",
      title: "Solve for the variable",
      formula: `${variable} = \\frac{${fmt(rhs)}}{${fmt(a)}} = ${fmt(result)}`,
      explanation: `Divide both sides by ${fmt(a)}.`,
    },
  ];

  return {
    type: "linear",
    input: questionText,
    variable,
    finalAnswer: result,
    unit: "",
    steps,
    explanation: `${variable} = ${fmt(result)}`,
    formulaLatex: `${variable} = ${fmt(result)}`,
  };
}

// ─── Quadratic Equation ax^2 + bx + c = 0 ───────────────────────────────────

function extractQuadCoeffs(text) {
  // Normalize: x^2 → x2 representation, remove spaces
  const normalized = text
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/([a-z])\^2/gi, "$1^2"); // ensure standard form

  const varMatch = normalized.match(/([a-z])\^2/i);
  if (!varMatch) return null;
  const variable = varMatch[1].toLowerCase();

  // Match: [+-]?[coeff]x^2 [+-] [coeff]x [+-] [const] = 0
  const pattern = new RegExp(
    `^([+\\-]?\\d*\\.?\\d*)${variable}\\^2([+\\-]\\d*\\.?\\d*)${variable}([+\\-]\\d+\\.?\\d*)?=0$`,
    "i"
  );
  const m = normalized.match(pattern);
  if (!m) {
    // Try without constant: ax^2 + bx = 0
    const pattern2 = new RegExp(
      `^([+\\-]?\\d*\\.?\\d*)${variable}\\^2([+\\-]\\d*\\.?\\d*)${variable}=0$`,
      "i"
    );
    const m2 = normalized.match(pattern2);
    if (!m2) return null;
    const aRaw = m2[1].replace(/^\+$/, "1").replace(/^-$/, "-1") || "1";
    const bRaw = m2[2].replace(/^\+$/, "1").replace(/^-$/, "-1") || "0";
    const a = Number(aRaw) || (aRaw === "" ? 1 : null);
    const b = Number(bRaw) || (bRaw === "" ? 1 : 0);
    if (!Number.isFinite(a) || a === 0) return null;
    return { a, b, c: 0, variable };
  }

  const clean = (s) => {
    if (!s || s === "+") return 1;
    if (s === "-") return -1;
    return Number(s);
  };

  const a = clean(m[1]);
  const b = clean(m[2]);
  const c = m[3] ? Number(m[3]) : 0;

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  return { a, b, c, variable };
}

export function solveQuadratic(questionText = "") {
  const cleaned = stripQuestion(questionText).toLowerCase();

  const coeffs = extractQuadCoeffs(cleaned);
  if (!coeffs) return null;

  const { a, b, c, variable } = coeffs;
  const discriminant = b * b - 4 * a * c;

  const steps = [
    {
      id: "step-1",
      title: "Identify coefficients",
      formula: `a = ${fmt(a)},\\; b = ${fmt(b)},\\; c = ${fmt(c)}`,
      explanation: `From the quadratic ${fmt(a)}${variable}² + ${fmt(b)}${variable} + ${fmt(c)} = 0`,
    },
    {
      id: "step-2",
      title: "Compute the discriminant",
      formula: `\\Delta = b^2 - 4ac = ${fmt(b)}^2 - 4(${fmt(a)})(${fmt(c)}) = ${fmt(discriminant)}`,
      explanation: `Δ = ${fmt(discriminant)}. ${
        discriminant > 0
          ? "Two distinct real roots."
          : discriminant === 0
          ? "One repeated real root."
          : "No real roots (complex roots)."
      }`,
    },
  ];

  if (discriminant < 0) {
    const realPart = -b / (2 * a);
    const imagPart = Math.sqrt(-discriminant) / (2 * a);
    steps.push({
      id: "step-3",
      title: "Complex roots",
      formula: `${variable} = ${fmt(realPart)} \\pm ${fmt(imagPart)}i`,
      explanation: `Since Δ < 0, the roots are complex: ${fmt(realPart)} ± ${fmt(imagPart)}i`,
    });
    return {
      type: "quadratic",
      input: questionText,
      variable,
      finalAnswer: `${fmt(realPart)} ± ${fmt(imagPart)}i`,
      unit: "",
      steps,
      explanation: `Complex roots: ${variable} = ${fmt(realPart)} ± ${fmt(imagPart)}i`,
      formulaLatex: `${variable} = ${fmt(realPart)} \\pm ${fmt(imagPart)}i`,
    };
  }

  const sqrtD = Math.sqrt(discriminant);
  const x1 = (-b + sqrtD) / (2 * a);
  const x2 = (-b - sqrtD) / (2 * a);

  steps.push({
    id: "step-3",
    title: "Apply quadratic formula",
    formula: `${variable} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${fmt(-b)} \\pm ${fmt(sqrtD)}}{${fmt(2 * a)}}`,
    explanation: `Substituting into the quadratic formula.`,
  });
  steps.push({
    id: "step-4",
    title: "Compute both roots",
    formula: `${variable}_1 = ${fmt(x1)},\\; ${variable}_2 = ${fmt(x2)}`,
    explanation: `x₁ = (${fmt(-b)} + ${fmt(sqrtD)}) / ${fmt(2 * a)} = ${fmt(x1)}, x₂ = ${fmt(x2)}`,
  });

  const roots = discriminant === 0 ? [x1] : [x1, x2];
  return {
    type: "quadratic",
    input: questionText,
    variable,
    finalAnswer: roots.map(fmt).join(", "),
    unit: "",
    steps,
    explanation: `${variable} = ${roots.map(fmt).join(" or ")}`,
    formulaLatex:
      discriminant === 0
        ? `${variable} = ${fmt(x1)}`
        : `${variable}_1 = ${fmt(x1)},\\; ${variable}_2 = ${fmt(x2)}`,
  };
}

// ─── System of 2 Linear Equations ───────────────────────────────────────────

export function solveSystem2x2(questionText = "") {
  // Match patterns like: 2x + 3y = 7 and x - y = 1
  const LINE_EQ =
    /([+-]?\s*\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d*)\s*y\s*=\s*([+-]?\s*\d+\.?\d*)/gi;
  const matches = [...questionText.matchAll(LINE_EQ)];
  if (matches.length < 2) return null;

  const parse = (m) => ({
    a: Number((m[1].replace(/\s/g, "") || "1").replace(/^\+$/, "1").replace(/^-$/, "-1")),
    b: Number((m[2].replace(/\s/g, "") || "1").replace(/^\+$/, "1").replace(/^-$/, "-1")),
    c: Number(m[3].replace(/\s/g, "")),
  });

  const { a: a1, b: b1, c: c1 } = parse(matches[0]);
  const { a: a2, b: b2, c: c2 } = parse(matches[1]);

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-10) {
    return {
      type: "system_2x2",
      input: questionText,
      finalAnswer: Math.abs(a1 * c2 - a2 * c1) < 1e-10 ? "Infinite solutions" : "No solution",
      unit: "",
      steps: [
        { id: "step-1", title: "Compute determinant", formula: `D = ${fmt(det)}`, explanation: "Determinant is 0 — system is degenerate." },
      ],
      explanation: Math.abs(a1 * c2 - a2 * c1) < 1e-10 ? "Infinitely many solutions." : "No solution exists.",
      formulaLatex: "",
    };
  }

  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;

  const steps = [
    {
      id: "step-1",
      title: "Write the system",
      formula: `${fmt(a1)}x + ${fmt(b1)}y = ${fmt(c1)} \\\\[4pt] ${fmt(a2)}x + ${fmt(b2)}y = ${fmt(c2)}`,
      explanation: "The two linear equations.",
    },
    {
      id: "step-2",
      title: "Compute determinant (Cramer's Rule)",
      formula: `D = \\begin{vmatrix}${fmt(a1)} & ${fmt(b1)} \\\\ ${fmt(a2)} & ${fmt(b2)}\\end{vmatrix} = ${fmt(det)}`,
      explanation: `D = ${fmt(a1)}·${fmt(b2)} − ${fmt(a2)}·${fmt(b1)} = ${fmt(det)}`,
    },
    {
      id: "step-3",
      title: "Solve for x",
      formula: `x = \\frac{\\begin{vmatrix}${fmt(c1)} & ${fmt(b1)} \\\\ ${fmt(c2)} & ${fmt(b2)}\\end{vmatrix}}{D} = ${fmt(x)}`,
      explanation: `x = (${fmt(c1)}·${fmt(b2)} − ${fmt(c2)}·${fmt(b1)}) / ${fmt(det)} = ${fmt(x)}`,
    },
    {
      id: "step-4",
      title: "Solve for y",
      formula: `y = \\frac{\\begin{vmatrix}${fmt(a1)} & ${fmt(c1)} \\\\ ${fmt(a2)} & ${fmt(c2)}\\end{vmatrix}}{D} = ${fmt(y)}`,
      explanation: `y = (${fmt(a1)}·${fmt(c2)} − ${fmt(a2)}·${fmt(c1)}) / ${fmt(det)} = ${fmt(y)}`,
    },
  ];

  return {
    type: "system_2x2",
    input: questionText,
    finalAnswer: `x = ${fmt(x)}, y = ${fmt(y)}`,
    unit: "",
    steps,
    explanation: `x = ${fmt(x)}, y = ${fmt(y)}`,
    formulaLatex: `x = ${fmt(x)},\\; y = ${fmt(y)}`,
  };
}
