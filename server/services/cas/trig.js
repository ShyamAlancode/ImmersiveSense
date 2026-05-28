/**
 * CAS Trigonometry Engine
 * Handles: sin, cos, tan, arcsin, arccos, arctan — in degrees or radians.
 * Returns a structured step trace.
 */

const DEG_TO_RAD = Math.PI / 180;

function fmt(n) {
  const r = Math.round(n * 1e8) / 1e8;
  return Number.isInteger(r) ? String(r) : String(r);
}

// Common exact-value lookup (degrees)
const EXACT = {
  sin: {
    0: "0", 30: "1/2", 45: "\\frac{\\sqrt{2}}{2}", 60: "\\frac{\\sqrt{3}}{2}", 90: "1",
    120: "\\frac{\\sqrt{3}}{2}", 135: "\\frac{\\sqrt{2}}{2}", 150: "1/2", 180: "0",
    210: "-1/2", 225: "-\\frac{\\sqrt{2}}{2}", 240: "-\\frac{\\sqrt{3}}{2}", 270: "-1",
    300: "-\\frac{\\sqrt{3}}{2}", 315: "-\\frac{\\sqrt{2}}{2}", 330: "-1/2", 360: "0",
  },
  cos: {
    0: "1", 30: "\\frac{\\sqrt{3}}{2}", 45: "\\frac{\\sqrt{2}}{2}", 60: "1/2", 90: "0",
    120: "-1/2", 135: "-\\frac{\\sqrt{2}}{2}", 150: "-\\frac{\\sqrt{3}}{2}", 180: "-1",
    210: "-\\frac{\\sqrt{3}}{2}", 225: "-\\frac{\\sqrt{2}}{2}", 240: "-1/2", 270: "0",
    300: "1/2", 315: "\\frac{\\sqrt{2}}{2}", 330: "\\frac{\\sqrt{3}}{2}", 360: "1",
  },
  tan: {
    0: "0", 30: "\\frac{1}{\\sqrt{3}}", 45: "1", 60: "\\sqrt{3}", 90: "undefined",
    120: "-\\sqrt{3}", 135: "-1", 150: "-\\frac{1}{\\sqrt{3}}", 180: "0",
    210: "\\frac{1}{\\sqrt{3}}", 225: "1", 240: "\\sqrt{3}", 270: "undefined",
    300: "-\\sqrt{3}", 315: "-1", 330: "-\\frac{1}{\\sqrt{3}}", 360: "0",
  },
};

const TRIG_PATTERN = /\b(sin|cos|tan|arcsin|arccos|arctan|asin|acos|atan)\s*\(?([^)]+)\)?/i;

function parseAngle(raw = "") {
  const s = raw.trim().replace(/°/g, "").trim();
  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  return num;
}

function isRad(rawText = "") {
  return /\bpi\b|π|rad/i.test(rawText);
}

export function solveTrig(questionText = "") {
  const match = questionText.match(TRIG_PATTERN);
  if (!match) return null;

  let fn = match[1].toLowerCase();
  if (fn === "asin") fn = "arcsin";
  if (fn === "acos") fn = "arccos";
  if (fn === "atan") fn = "arctan";
  const argRaw = match[2].trim();
  const radMode = isRad(argRaw);

  // Parse numeric angle
  const argRawClean = argRaw.replace(/pi/gi, String(Math.PI)).replace(/π/g, String(Math.PI));
  const angle = parseAngle(argRawClean);
  if (angle === null) return null;

  let resultRad;
  let resultDeg;
  let displayFn;
  let result;
  let unit;
  let exactStr;

  const isInverse = fn.startsWith("arc");

  if (!isInverse) {
    // Forward trig
    const angleRad = radMode ? angle : angle * DEG_TO_RAD;
    const angleDeg = radMode ? Math.round((angle / Math.PI) * 180) : angle;

    displayFn = fn;
    const jsMap = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
    const rawResult = jsMap[fn] ? jsMap[fn](angleRad) : null;
    if (rawResult === null) return null;

    result = Math.round(rawResult * 1e8) / 1e8;
    unit = "";
    exactStr = EXACT[fn]?.[angleDeg] ?? null;
    resultRad = angleRad;
    resultDeg = angleDeg;
  } else {
    // Inverse trig
    if (angle < -1 || angle > 1) {
      if (fn !== "arctan" && Math.abs(angle) > 1) return null;
    }
    const jsMap = { arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan };
    const rawResult = jsMap[fn] ? jsMap[fn](angle) : null;
    if (rawResult === null) return null;

    result = Math.round((rawResult / DEG_TO_RAD) * 1e6) / 1e6;
    unit = "°";
    displayFn = fn;
    resultRad = rawResult;
    resultDeg = result;
    exactStr = null;
  }

  const steps = [
    {
      id: "step-1",
      title: "Identify the function and argument",
      formula: `${displayFn}(${argRaw})`,
      explanation: `We need to evaluate ${displayFn} of ${argRaw}.`,
    },
    {
      id: "step-2",
      title: !isInverse ? "Convert angle to radians if needed" : "Look up inverse value",
      formula: !isInverse
        ? `${fmt(resultDeg)}° = \\frac{${fmt(resultDeg)} \\cdot \\pi}{180} = ${fmt(resultRad)} \\text{ rad}`
        : `${displayFn}(${angle}) = ${fmt(resultDeg)}°`,
      explanation: !isInverse
        ? `Degrees to radians: ${resultDeg}° × π/180 = ${fmt(resultRad)} rad`
        : `Inverse trig returns angle in degrees: ${fmt(resultDeg)}°`,
    },
  ];

  if (exactStr) {
    steps.push({
      id: "step-3",
      title: "Exact value from unit circle",
      formula: `${displayFn}(${fmt(resultDeg)}°) = ${exactStr}`,
      explanation: `This is a standard exact value from the unit circle.`,
    });
    steps.push({
      id: "step-4",
      title: "Decimal approximation",
      formula: `\\approx ${fmt(result)}`,
      explanation: `Decimal value: ${fmt(result)}`,
    });
  } else {
    steps.push({
      id: "step-3",
      title: "Compute the value",
      formula: `${displayFn}(${argRaw}) \\approx ${fmt(result)}${unit}`,
      explanation: `Result: ${fmt(result)}${unit}`,
    });
  }

  return {
    type: "trig",
    input: questionText,
    finalAnswer: `${fmt(result)}${unit}`,
    unit,
    steps,
    explanation: `${displayFn}(${argRaw}) = ${fmt(result)}${unit}`,
    formulaLatex: `${displayFn}\\left(${argRaw}\\right) = ${exactStr ?? fmt(result)}`,
  };
}
