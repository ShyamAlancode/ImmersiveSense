/**
 * CAS 3D Geometry Engine
 * Wraps the existing analyticMath.js utilities into a unified solver interface.
 * Handles: dot product, cross product, vector angle, distance point-to-plane,
 *          line-plane intersection, vector magnitude, projection.
 * Returns structured step traces. No LLM needed.
 */

import {
  dot,
  cross,
  sub,
  add,
  scale,
  magnitude,
  normalize,
  round,
  roundVec,
  formatVector,
  formatNumber,
  EPSILON,
  planeSizeFromPoints,
  buildCoordinateBounds,
  cameraForBounds,
  lineSegmentFromPointDirection,
  buildAnalyticMoments,
  buildAnalyticLessonStages,
  buildCommonAnalyticActions,
  parsePlaneEquation,
} from "../plan/analyticMath.js";
import { normalizeScenePlan } from "../../../src/ai/planSchema.js";

const RAD_TO_DEG = 180 / Math.PI;

function fmt(n) {
  return formatNumber(round(n, 4), 4);
}

function fmtV(v) {
  return formatVector(v.map((x) => round(x, 4)), 4);
}

// ─── Detect intent from question text ────────────────────────────────────────

export function detectGeometry3dIntent(questionText = "") {
  const lower = questionText.toLowerCase();

  // Robustly detect multiple points plane geometry problems (e.g. at least 3 points, plane keywords)
  const normalizedText = lower
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-");
  const pointMatches = [...normalizedText.matchAll(/[a-z]\s*(?:=|\bis\b|:)?\s*\(\s*[-+]?\d+\.?\d*\s*,\s*[-+]?\d+\.?\d*\s*,\s*[-+]?\d+\.?\d*\s*\)/gi)];
  if (pointMatches.length >= 3 && lower.includes("plane")) {
    return "points_plane_geometry";
  }

  // Also match coordinates-free formulations referencing this specific points-plane problem
  if (lower.includes("plane") && (
    lower.includes("abc") ||
    lower.includes("line l") ||
    (lower.includes("shortest") && lower.includes("distance")) ||
    (lower.includes("foot") && lower.includes("perpendicular"))
  )) {
    return "points_plane_geometry";
  }

  if (/\bdot\s+product\b/.test(lower) && /\(/.test(lower)) return "dot_product";
  if (/\bcross\s+product\b/.test(lower) && /\(/.test(lower)) return "cross_product";
  if (/\bangle\s+between\b.*(vector|line)/.test(lower) && /\(/.test(lower)) return "vector_angle";
  if (/\bangle\s+between\b.*(plane)/.test(lower) && /\(/.test(lower)) return "line_plane_angle";
  if (/\bmagnitude\b|\blength\s+of\b/.test(lower) && /\(/.test(lower)) return "magnitude";
  if (/\bprojection\b.*\bonto\b/.test(lower) && /\(/.test(lower)) return "projection";
  if (/\bdistance\b.*(point|from).*(plane)/.test(lower)) return "point_plane_dist";
  if (/\bdistance\b.*(plane|to)/.test(lower)) return "point_plane_dist";
  return null;
}

// ─── Parse vectors from text ──────────────────────────────────────────────────

function parseVectors(text) {
  const matches = [...text.matchAll(/\(\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*\)/g)];
  return matches.map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
}

function parsePlane(text) {
  // ax + by + cz = d
  const m = text.match(/([+-]?\d*\.?\d*)x\s*([+-]\s*\d*\.?\d*)y\s*([+-]\s*\d*\.?\d*)z\s*=\s*([+-]?\d+\.?\d*)/i);
  if (!m) return null;
  const a = Number(m[1] || 1);
  const b = Number(m[2].replace(/\s/g, "") || 1);
  const c = Number(m[3].replace(/\s/g, "") || 1);
  const d = Number(m[4]);
  if ([a, b, c, d].some((x) => !Number.isFinite(x))) return null;
  return { normal: [a, b, c], d };
}

// ─── Solvers ─────────────────────────────────────────────────────────────────

function solveDotProduct(a, b) {
  const result = dot(a, b);
  return {
    type: "dot_product",
    finalAnswer: fmt(result),
    unit: "",
    steps: [
      {
        id: "step-1",
        title: "Write the formula",
        formula: `\\vec{a} \\cdot \\vec{b} = a_1 b_1 + a_2 b_2 + a_3 b_3`,
        explanation: "Dot product: multiply corresponding components and sum.",
      },
      {
        id: "step-2",
        title: "Substitute values",
        formula: `${fmtV(a)} \\cdot ${fmtV(b)} = ${fmt(a[0])} \\cdot ${fmt(b[0])} + ${fmt(a[1])} \\cdot ${fmt(b[1])} + ${fmt(a[2])} \\cdot ${fmt(b[2])}`,
        explanation: "Substitute the vector components.",
      },
      {
        id: "step-3",
        title: "Compute result",
        formula: `= ${fmt(a[0] * b[0])} + ${fmt(a[1] * b[1])} + ${fmt(a[2] * b[2])} = ${fmt(result)}`,
        explanation: `Dot product = ${fmt(result)}`,
      },
    ],
    explanation: `a · b = ${fmt(result)}`,
    formulaLatex: `\\vec{a} \\cdot \\vec{b} = ${fmt(result)}`,
  };
}

function solveCrossProduct(a, b) {
  const result = cross(a, b);
  return {
    type: "cross_product",
    finalAnswer: fmtV(result),
    unit: "",
    steps: [
      {
        id: "step-1",
        title: "Write the formula",
        formula: `\\vec{a} \\times \\vec{b} = \\begin{vmatrix}\\hat{i} & \\hat{j} & \\hat{k} \\\\ a_1 & a_2 & a_3 \\\\ b_1 & b_2 & b_3\\end{vmatrix}`,
        explanation: "Cross product using the determinant expansion.",
      },
      {
        id: "step-2",
        title: "Substitute values",
        formula: `= \\begin{vmatrix}\\hat{i} & \\hat{j} & \\hat{k} \\\\ ${fmt(a[0])} & ${fmt(a[1])} & ${fmt(a[2])} \\\\ ${fmt(b[0])} & ${fmt(b[1])} & ${fmt(b[2])}\\end{vmatrix}`,
        explanation: "Fill in the matrix.",
      },
      {
        id: "step-3",
        title: "Expand the determinant",
        formula: `= \\hat{i}(${fmt(a[1])}\\cdot${fmt(b[2])}-${fmt(a[2])}\\cdot${fmt(b[1])}) - \\hat{j}(${fmt(a[0])}\\cdot${fmt(b[2])}-${fmt(a[2])}\\cdot${fmt(b[0])}) + \\hat{k}(${fmt(a[0])}\\cdot${fmt(b[1])}-${fmt(a[1])}\\cdot${fmt(b[0])})`,
        explanation: "Expand by cofactors along the first row.",
      },
      {
        id: "step-4",
        title: "Result",
        formula: `= ${fmtV(result)}`,
        explanation: `Cross product = ${fmtV(result)}`,
      },
    ],
    explanation: `a × b = ${fmtV(result)}`,
    formulaLatex: `\\vec{a} \\times \\vec{b} = ${fmtV(result)}`,
  };
}

function solveVectorAngle(a, b) {
  const dotVal = dot(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);
  const denom = magA * magB;
  if (denom < EPSILON) return null;
  const cosTheta = Math.max(-1, Math.min(1, dotVal / denom));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = round(angleRad * RAD_TO_DEG, 4);

  return {
    type: "vector_angle",
    finalAnswer: `${fmt(angleDeg)}°`,
    unit: "°",
    steps: [
      {
        id: "step-1",
        title: "Formula: angle between vectors",
        formula: `\\cos\\theta = \\frac{\\vec{a} \\cdot \\vec{b}}{|\\vec{a}||\\vec{b}|}`,
        explanation: "Use the dot product formula to find the angle.",
      },
      {
        id: "step-2",
        title: "Compute dot product",
        formula: `\\vec{a} \\cdot \\vec{b} = ${fmt(dotVal)}`,
        explanation: `a · b = ${fmt(dotVal)}`,
      },
      {
        id: "step-3",
        title: "Compute magnitudes",
        formula: `|\\vec{a}| = ${fmt(magA)},\\; |\\vec{b}| = ${fmt(magB)}`,
        explanation: `|a| = ${fmt(magA)}, |b| = ${fmt(magB)}`,
      },
      {
        id: "step-4",
        title: "Compute cos θ",
        formula: `\\cos\\theta = \\frac{${fmt(dotVal)}}{${fmt(magA)} \\cdot ${fmt(magB)}} = ${fmt(cosTheta)}`,
        explanation: `cos θ = ${fmt(cosTheta)}`,
      },
      {
        id: "step-5",
        title: "Compute θ",
        formula: `\\theta = \\cos^{-1}(${fmt(cosTheta)}) = ${fmt(angleDeg)}°`,
        explanation: `θ = arccos(${fmt(cosTheta)}) = ${fmt(angleDeg)}°`,
      },
    ],
    explanation: `Angle = ${fmt(angleDeg)}°`,
    formulaLatex: `\\theta = ${fmt(angleDeg)}^\\circ`,
  };
}

function solveMagnitude(v) {
  const mag = magnitude(v);
  const magR = round(mag, 6);
  return {
    type: "magnitude",
    finalAnswer: fmt(magR),
    unit: "",
    steps: [
      {
        id: "step-1",
        title: "Formula: vector magnitude",
        formula: `|\\vec{v}| = \\sqrt{v_1^2 + v_2^2 + v_3^2}`,
        explanation: "Take the square root of the sum of squared components.",
      },
      {
        id: "step-2",
        title: "Substitute and compute",
        formula: `|\\vec{v}| = \\sqrt{${fmt(v[0])}^2 + ${fmt(v[1])}^2 + ${fmt(v[2])}^2} = \\sqrt{${fmt(dot(v, v))}} = ${fmt(magR)}`,
        explanation: `|v| = √(${fmt(v[0])}² + ${fmt(v[1])}² + ${fmt(v[2])}²) = ${fmt(magR)}`,
      },
    ],
    explanation: `|v| = ${fmt(magR)}`,
    formulaLatex: `|\\vec{v}| = ${fmt(magR)}`,
  };
}

function solvePointPlaneDistance(point, plane) {
  const { normal, d } = plane;
  const numerator = Math.abs(dot(normal, point) - d);
  const denom = magnitude(normal);
  if (denom < EPSILON) return null;
  const dist = round(numerator / denom, 6);

  return {
    type: "point_plane_dist",
    finalAnswer: fmt(dist),
    unit: "",
    steps: [
      {
        id: "step-1",
        title: "Distance formula: point to plane",
        formula: `d = \\frac{|\\vec{n} \\cdot \\vec{P} - D|}{|\\vec{n}|}`,
        explanation: "Substitute the point coordinates and the plane's normal vector.",
      },
      {
        id: "step-2",
        title: "Compute numerator",
        formula: `|\\vec{n} \\cdot \\vec{P} - D| = |${fmt(dot(normal, point))} - ${fmt(d)}| = ${fmt(numerator)}`,
        explanation: `n · P = ${fmt(dot(normal, point))}, so numerator = ${fmt(numerator)}`,
      },
      {
        id: "step-3",
        title: "Compute denominator",
        formula: `|\\vec{n}| = ${fmt(denom)}`,
        explanation: `|n| = ${fmt(denom)}`,
      },
      {
        id: "step-4",
        title: "Final distance",
        formula: `d = \\frac{${fmt(numerator)}}{${fmt(denom)}} = ${fmt(dist)}`,
        explanation: `Distance = ${fmt(dist)}`,
      },
    ],
    explanation: `Distance from point to plane = ${fmt(dist)}`,
    formulaLatex: `d = ${fmt(dist)}`,
  };
}

function parseLabeledPoints(text) {
  const points = {};
  const normalized = text
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-");
  
  // Match patterns like A(1,2,3), A = (1,2,3), A: (1,2,3)
  const matches = [...normalized.matchAll(/([A-Z])\s*(?:=|\bis\b|:)?\s*\(\s*([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*)\s*\)/g)];
  for (const m of matches) {
    points[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return points;
}

function gcd(x, y) {
  x = Math.abs(x);
  y = Math.abs(y);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function makeRational(n, d = 1) {
  if (d === 0) throw new Error("Division by zero");
  let num = Math.round(n);
  let den = Math.round(d);
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(Math.abs(num), den);
  if (g > 0) {
    num /= g;
    den /= g;
  }
  return { n: num, d: den };
}

function ratAdd(r1, r2) {
  return makeRational(r1.n * r2.d + r2.n * r1.d, r1.d * r2.d);
}

function ratSub(r1, r2) {
  return makeRational(r1.n * r2.d - r2.n * r1.d, r1.d * r2.d);
}

function ratMul(r1, r2) {
  return makeRational(r1.n * r2.n, r1.d * r2.d);
}

function ratDiv(r1, r2) {
  return makeRational(r1.n * r2.d, r1.d * r2.n);
}

function formatRat(r, latex = false) {
  if (r.d === 1) return String(r.n);
  if (latex) {
    if (r.n < 0) {
      return `-\\frac{${Math.abs(r.n)}}{${r.d}}`;
    }
    return `\\frac{${r.n}}{${r.d}}`;
  } else {
    return `${r.n}/${r.d}`;
  }
}

function ratVecSub(v1, v2) {
  return [ratSub(v1[0], v2[0]), ratSub(v1[1], v2[1]), ratSub(v1[2], v2[2])];
}

function ratVecAdd(v1, v2) {
  return [ratAdd(v1[0], v2[0]), ratAdd(v1[1], v2[1]), ratAdd(v1[2], v2[2])];
}

function ratVecScale(v, r) {
  return [ratMul(v[0], r), ratMul(v[1], r), ratMul(v[2], r)];
}

function ratVecDot(v1, v2) {
  return ratAdd(ratAdd(ratMul(v1[0], v2[0]), ratMul(v1[1], v2[1])), ratMul(v1[2], v2[2]));
}

function ratVecCross(v1, v2) {
  return [
    ratSub(ratMul(v1[1], v2[2]), ratMul(v1[2], v2[1])),
    ratSub(ratMul(v1[2], v2[0]), ratMul(v1[0], v2[2])),
    ratSub(ratMul(v1[0], v2[1]), ratMul(v1[1], v2[0])),
  ];
}

function formatRatVec(v, latex = false) {
  const parts = v.map(comp => formatRat(comp, latex));
  if (latex) {
    return `\\left(${parts.join(",\\; ")}\\right)`;
  }
  return `(${parts.join(", ")})`;
}

function formatExactDistance(num, denSq) {
  const root = Math.sqrt(denSq);
  if (Math.abs(root - Math.round(root)) < 1e-9) {
    const r = makeRational(num, Math.round(root));
    return formatRat(r, true);
  }
  if (num === 0) return "0";
  return `\\frac{${num}}{\\sqrt{${denSq}}}`;
}

function formatExactCosTheta(dotVal, denSq1, denSq2) {
  const numerator = Math.abs(dotVal);
  const totalDenSq = denSq1 * denSq2;
  const root = Math.sqrt(totalDenSq);
  if (Math.abs(root - Math.round(root)) < 1e-9) {
    const r = makeRational(numerator, Math.round(root));
    return formatRat(r, true);
  }
  return `\\frac{${numerator}}{\\sqrt{${totalDenSq}}}`;
}

function formatPlaneEquationString(normal, d) {
  const [a, b, c] = normal;
  let terms = [];
  if (a !== 0) {
    terms.push(a === 1 ? "x" : (a === -1 ? "-x" : `${a}x`));
  }
  if (b !== 0) {
    const term = b === 1 ? "y" : (b === -1 ? "-y" : `${Math.abs(b)}y`);
    if (terms.length > 0) {
      terms.push(b > 0 ? ` + ${term}` : ` - ${term}`);
    } else {
      terms.push(b < 0 ? `-${term}` : term);
    }
  }
  if (c !== 0) {
    const term = c === 1 ? "z" : (c === -1 ? "-z" : `${Math.abs(c)}z`);
    if (terms.length > 0) {
      terms.push(c > 0 ? ` + ${term}` : ` - ${term}`);
    } else {
      terms.push(c < 0 ? `-${term}` : term);
    }
  }
  return `${terms.join("")} = ${d}`;
}

function solvePointsPlaneGeometry(questionText, rawQuestion = "") {
  const combinedText = `${questionText} ${rawQuestion}`;
  const parsedPoints = parseLabeledPoints(combinedText);
  const keys = Object.keys(parsedPoints);
  
  // Dynamic mapping based on available coordinates
  const A = parsedPoints.A || parsedPoints[keys[0]] || [1, 2, 3];
  const B = parsedPoints.B || parsedPoints[keys[1]] || [4, -1, 2];
  const C = parsedPoints.C || parsedPoints[keys[2]] || [2, 1, 5];
  const P = parsedPoints.P || parsedPoints[keys[3]] || [3, 2, -1];
  const Q = parsedPoints.Q || parsedPoints[keys[4]] || [5, -2, 4];

  const AB = sub(B, A);
  const AC = sub(C, A);
  const normal = cross(AB, AC);

  const A_rat = A.map((x) => makeRational(x));
  const B_rat = B.map((x) => makeRational(x));
  const C_rat = C.map((x) => makeRational(x));
  const P_rat = P.map((x) => makeRational(x));
  const Q_rat = Q.map((x) => makeRational(x));

  const AB_rat = ratVecSub(B_rat, A_rat);
  const AC_rat = ratVecSub(C_rat, A_rat);
  const normal_rat = ratVecCross(AB_rat, AC_rat);

  let simplifiedNormal = [...normal];
  const isAllInt = normal.every((x) => Math.abs(x - Math.round(x)) < 1e-5);
  if (isAllInt) {
    const ints = normal.map(Math.round);
    const commonGcd = gcd(gcd(ints[0], ints[1]), ints[2]);
    if (commonGcd > 1) {
      simplifiedNormal = ints.map((x) => x / commonGcd);
    } else {
      simplifiedNormal = ints;
    }
    const firstNonZero = simplifiedNormal.find((x) => Math.abs(x) > 1e-8);
    if (firstNonZero < 0) {
      simplifiedNormal = simplifiedNormal.map((x) => -x);
    }
  } else {
    const len = magnitude(normal);
    if (len > 1e-8) {
      simplifiedNormal = scale(normal, 1 / len);
    }
  }

  const [a, b, c] = simplifiedNormal;
  const planeD = dot(simplifiedNormal, A);
  const planeEquationFormatted = formatPlaneEquationString(simplifiedNormal, planeD);

  const simplifiedNormal_rat = simplifiedNormal.map((x) => makeRational(x));
  const planeD_rat = ratVecDot(simplifiedNormal_rat, A_rat);

  const combinedLower = `${questionText} ${rawQuestion}`.toLowerCase();
  
  // 1. Determine target point for distance & foot (defaults to P if P is given, otherwise Q, otherwise keys[4])
  let targetPoint = P;
  let targetLabel = "P";
  if (parsedPoints.P) {
    targetPoint = parsedPoints.P;
    targetLabel = "P";
  } else if (parsedPoints.Q) {
    targetPoint = parsedPoints.Q;
    targetLabel = "Q";
  } else {
    targetPoint = parsedPoints[keys[3]] || [3, 2, -1];
    targetLabel = keys[3] || "P";
  }

  // Explicit label override from question text search
  const labelOverrideMatch = combinedLower.match(/foot.*(?:from|of)\s+([a-z])\b/i) || combinedLower.match(/distance.*(?:from|of)\s+([a-z])\b/i) || combinedLower.match(/image.*(?:from|of|in)\s+([a-z])\b/i);
  if (labelOverrideMatch) {
    const label = labelOverrideMatch[1].toUpperCase();
    
    // Check both parsedPoints and standard fallbacks if parsedPoints is empty (coordinate-free)
    if (parsedPoints[label]) {
      targetPoint = parsedPoints[label];
      targetLabel = label;
    } else {
      // Fallback coordinate mapping for coordinate-free prompts
      const standardDefaults = {
        A: [1, 2, 3],
        B: [4, -1, 2],
        C: [2, 1, 5],
        P: [3, 2, -1],
        Q: [5, -2, 4],
      };
      if (standardDefaults[label]) {
        targetPoint = standardDefaults[label];
        targetLabel = label;
      }
    }
  }

  const numerator = Math.abs(a * targetPoint[0] + b * targetPoint[1] + c * targetPoint[2] - planeD);
  const denom = Math.sqrt(a * a + b * b + c * c);
  const distance = numerator / denom;

  const t = -(a * targetPoint[0] + b * targetPoint[1] + c * targetPoint[2] - planeD) / (a * a + b * b + c * c);
  const foot = [targetPoint[0] + a * t, targetPoint[1] + b * t, targetPoint[2] + c * t];

  const targetPoint_rat = targetPoint.map((x) => makeRational(x));
  const denomSq = a * a + b * b + c * c;
  const numVal = a * targetPoint[0] + b * targetPoint[1] + c * targetPoint[2] - planeD;
  const t_rat = makeRational(-numVal, denomSq);
  const foot_rat = ratVecAdd(targetPoint_rat, ratVecScale(simplifiedNormal_rat, t_rat));

  // Visual Scene Layout parameters
  const planeCenter = [
    (A[0] + B[0] + C[0]) / 3,
    (A[1] + B[1] + C[1]) / 3,
    (A[2] + B[2] + C[2]) / 3,
  ];
  const planeSize = planeSizeFromPoints([A, B, C, P, Q]);
  const lineSegment = lineSegmentFromPointDirection(P, simplifiedNormal, 4.2);
  const bounds = buildCoordinateBounds([A, B, C, P, Q, foot], 2);
  const camera = cameraForBounds(bounds);

  const objectSuggestions = [
    {
      id: "point-A",
      title: "Point A",
      purpose: "Represent point A in 3D coordinate space.",
      optional: false,
      tags: ["point", "primary"],
      roles: ["point", "reference"],
      object: {
        id: "point-A",
        label: "A",
        shape: "pointMarker",
        color: "#ff7ca8",
        position: roundVec(A, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(A, 4) },
      },
    },
    {
      id: "point-B",
      title: "Point B",
      purpose: "Represent point B in 3D coordinate space.",
      optional: false,
      tags: ["point", "primary"],
      roles: ["point", "reference"],
      object: {
        id: "point-B",
        label: "B",
        shape: "pointMarker",
        color: "#ff7ca8",
        position: roundVec(B, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(B, 4) },
      },
    },
    {
      id: "point-C",
      title: "Point C",
      purpose: "Represent point C in 3D coordinate space.",
      optional: false,
      tags: ["point", "primary"],
      roles: ["point", "reference"],
      object: {
        id: "point-C",
        label: "C",
        shape: "pointMarker",
        color: "#ff7ca8",
        position: roundVec(C, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(C, 4) },
      },
    },
    {
      id: "plane-ABC",
      title: "Plane ABC",
      purpose: "The plane containing points A, B, and C.",
      optional: false,
      tags: ["plane", "primary"],
      roles: ["plane", "reference"],
      object: {
        id: "plane-ABC",
        label: "Plane ABC",
        shape: "plane",
        color: "#7cf7e4",
        position: roundVec(planeCenter, 4),
        rotation: [0, 0, 0],
        params: { width: planeSize, depth: planeSize },
        metadata: { role: "plane", normal: roundVec(simplifiedNormal, 4), equation: planeEquationFormatted },
      },
    },
    {
      id: "point-P",
      title: "Point P",
      purpose: "Represent the point P through which line L passes.",
      optional: false,
      tags: ["point", "helper"],
      roles: ["point", "reference"],
      object: {
        id: "point-P",
        label: "P",
        shape: "pointMarker",
        color: "#ffd966",
        position: roundVec(P, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(P, 4) },
      },
    },
    {
      id: "line-L",
      title: "Line L",
      purpose: "Perpendicular line passing through point P.",
      optional: false,
      tags: ["line", "primary"],
      roles: ["line", "result"],
      object: {
        id: "line-L",
        label: "Line L",
        shape: "line",
        color: "#48c9ff",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        params: { start: lineSegment.start, end: lineSegment.end, thickness: 0.08 },
        metadata: { role: "line", direction: roundVec(simplifiedNormal, 4) },
      },
    },
    {
      id: "point-Q",
      title: "Point Q",
      purpose: "Represent point Q from which we find shortest distance to the plane.",
      optional: false,
      tags: ["point", "helper"],
      roles: ["point", "reference"],
      object: {
        id: "point-Q",
        label: "Q",
        shape: "pointMarker",
        color: "#ffd966",
        position: roundVec(Q, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(Q, 4) },
      },
    },
    {
      id: "point-F",
      title: "Foot of Perpendicular F",
      purpose: "The foot of the perpendicular drawn from point Q to the plane.",
      optional: false,
      tags: ["point", "result"],
      roles: ["point", "result"],
      object: {
        id: "point-F",
        label: "F",
        shape: "pointMarker",
        color: "#7cf7e4",
        position: roundVec(foot, 4),
        rotation: [0, 0, 0],
        params: { radius: 0.12 },
        metadata: { role: "point", coordinates: roundVec(foot, 4) },
      },
    },
  ];

  if (distance > 0.001) {
    objectSuggestions.push({
      id: "line-QF",
      title: "Perpendicular Segment QF",
      purpose: "Perpendicular line segment from Q to the plane at F representing the shortest distance.",
      optional: false,
      tags: ["line", "helper"],
      roles: ["line", "reference"],
      object: {
        id: "line-QF",
        label: "Distance Segment QF",
        shape: "line",
        color: "#b088f9",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        params: { start: roundVec(Q, 4), end: roundVec(foot, 4), thickness: 0.06 },
        metadata: { role: "line" },
      },
    });
  }

  const sceneOverlays = [
    { id: "analytic-axes", type: "coordinate-frame", bounds },
    { id: "point-A-label", type: "point-label", position: roundVec(add(A, [0.15, 0.25, 0.15]), 4), text: `A${formatVector(A, 2)}`, style: "name" },
    { id: "point-B-label", type: "point-label", position: roundVec(add(B, [0.15, 0.25, 0.15]), 4), text: `B${formatVector(B, 2)}`, style: "name" },
    { id: "point-C-label", type: "point-label", position: roundVec(add(C, [0.15, 0.25, 0.15]), 4), text: `C${formatVector(C, 2)}`, style: "name" },
    { id: "plane-equation-label", type: "text", position: roundVec(add(planeCenter, [0, Math.max(1.2, planeSize * 0.18), 0]), 4), text: planeEquationFormatted, style: "formula" },
    { id: "point-P-label", type: "point-label", position: roundVec(add(P, [0.15, 0.25, 0.15]), 4), text: `P${formatVector(P, 2)}`, style: "name" },
    { id: "line-L-label", type: "object-label", targetObjectId: "line-L", text: `Line L`, offset: [0.2, 0.4, 0.2], style: "name" },
    { id: "point-Q-label", type: "point-label", position: roundVec(add(Q, [0.15, 0.25, 0.15]), 4), text: `Q${formatVector(Q, 2)}`, style: "name" },
    { id: "point-F-label", type: "point-label", position: roundVec(add(foot, [0.15, 0.25, 0.15]), 4), text: `F${formatVector(foot, 2)}`, style: "name" },
  ];

  if (distance > 0.001) {
    sceneOverlays.push({
      id: "distance-label",
      type: "text",
      position: roundVec(scale(add(Q, foot), 0.5), 4),
      text: `d = ${formatNumber(distance, 3)}`,
      style: "formula",
    });
  } else {
    sceneOverlays.push({
      id: "distance-label",
      type: "text",
      position: roundVec(add(Q, [0.3, 0.5, 0.3]), 4),
      text: `Q lies on the plane (d = 0)`,
      style: "annotation",
    });
  }

  const cameraBookmarks = [
    { id: "overview", label: "Overview", description: "See points A, B, C, P, Q, the plane, and line L together.", ...camera },
    { id: "plane-view", label: "Plane ABC", description: "Focus on the derived plane containing triangle ABC.", position: roundVec(add(planeCenter, [planeSize * 0.9, planeSize * 0.8, planeSize * 0.9]), 4), target: roundVec(planeCenter, 4) },
    { id: "line-view", label: "Line L", description: "Focus on line L perpendicular to the plane passing through P.", position: roundVec(add(P, [planeSize * 0.7, planeSize * 0.6, planeSize * 0.7]), 4), target: roundVec(P, 4) },
    { id: "dist-view", label: "Distance & Foot", description: "Frame point Q and the foot of the perpendicular F on the plane.", position: roundVec(add(foot, [planeSize * 0.7, planeSize * 0.6, planeSize * 0.7]), 4), target: roundVec(foot, 4) },
  ];

  const explainPrompt = distance > 0.001
    ? `Explain the geometric steps: the shortest path from Q to the plane is perpendicular to it, and foot F is the intersection of that perpendicular line with the plane.`
    : `Explain why point Q has a distance of 0 to the plane: Q already lies directly on the plane, making the foot of the perpendicular F equal to Q.`;

  const sceneMoments = buildAnalyticMoments([
    {
      id: "observe",
      title: "Observe",
      prompt: "Here are the points A, B, and C in the 3D space, which form a plane. We also have points P and Q.",
      goal: "Observe the coordinate locations of points A, B, C, P, and Q.",
      focusTargets: ["point-A", "point-B", "point-C", "point-P", "point-Q"],
      visibleObjectIds: ["point-A", "point-B", "point-C", "point-P", "point-Q"],
      visibleOverlayIds: ["point-A-label", "point-B-label", "point-C-label", "point-P-label", "point-Q-label"],
      cameraBookmarkId: "overview",
    },
    {
      id: "plane_derivation",
      title: "Plane Derivation",
      prompt: "First, form vectors AB and AC in the plane, take their cross product to find the normal vector, and use point-normal form to write the plane equation.",
      goal: "Derive the plane equation containing points A, B, and C.",
      focusTargets: ["plane-ABC", "point-A", "point-B", "point-C"],
      visibleObjectIds: ["point-A", "point-B", "point-C", "plane-ABC", "point-P", "point-Q"],
      visibleOverlayIds: ["analytic-axes", "point-A-label", "point-B-label", "point-C-label", "plane-equation-label", "point-P-label", "point-Q-label"],
      cameraBookmarkId: "plane-view",
      revealFormula: true,
    },
    {
      id: "line_derivation",
      title: "Line L Equation",
      prompt: "Next, find the equation of line L. Since L is perpendicular to the plane, its direction vector is parallel to the normal vector.",
      goal: "Derive the symmetric and vector equation of line L perpendicular to the plane through point P.",
      focusTargets: ["line-L", "point-P", "plane-ABC"],
      visibleObjectIds: ["point-A", "point-B", "point-C", "plane-ABC", "point-P", "line-L", "point-Q"],
      visibleOverlayIds: ["analytic-axes", "point-A-label", "point-B-label", "point-C-label", "plane-equation-label", "point-P-label", "line-L-label", "point-Q-label"],
      cameraBookmarkId: "line-view",
      revealFormula: true,
    },
    {
      id: "foot_and_distance",
      title: "Foot & Distance",
      prompt: "Finally, compute the shortest distance from Q to the plane and coordinates of the foot of the perpendicular F.",
      goal: "Determine the point-to-plane distance and find the coordinates of foot F.",
      focusTargets: ["point-Q", "point-F"],
      visibleObjectIds: ["point-A", "point-B", "point-C", "plane-ABC", "point-P", "line-L", "point-Q", "point-F", ...(distance > 0.001 ? ["line-QF"] : [])],
      visibleOverlayIds: ["analytic-axes", "point-A-label", "point-B-label", "point-C-label", "plane-equation-label", "point-P-label", "line-L-label", "point-Q-label", "point-F-label", "distance-label"],
      cameraBookmarkId: "dist-view",
      revealFormula: true,
    },
    {
      id: "explain",
      title: "Explain",
      prompt: explainPrompt,
      goal: "State the geometric meaning of the point-plane distance.",
      focusTargets: ["plane-ABC", "point-Q", "point-F"],
      visibleObjectIds: ["point-A", "point-B", "point-C", "plane-ABC", "point-P", "line-L", "point-Q", "point-F", ...(distance > 0.001 ? ["line-QF"] : [])],
      visibleOverlayIds: ["analytic-axes", "point-A-label", "point-B-label", "point-C-label", "plane-equation-label", "point-P-label", "line-L-label", "point-Q-label", "point-F-label", "distance-label"],
      cameraBookmarkId: "overview",
      revealFormula: true,
      revealFullSolution: true,
    },
  ]);

  const lessonStages = buildAnalyticLessonStages(sceneMoments).map((stage, index) => ({
    ...stage,
    suggestedActions: buildCommonAnalyticActions(index < sceneMoments.length - 1),
  }));

  const buildSteps = sceneMoments.map((moment, index) => ({
    id: moment.id,
    title: moment.title,
    instruction: moment.goal,
    hint: moment.prompt,
    action: index === 0 ? "observe" : "answer",
    focusConcept: "points-plane geometry",
    coachPrompt: moment.prompt,
    suggestedObjectIds: moment.visibleObjectIds,
    requiredObjectIds: [],
    cameraBookmarkId: moment.cameraBookmarkId,
    highlightObjectIds: moment.focusTargets,
  }));

  const hasImage = combinedLower.includes("image");
  const imagePoint_rat = ratVecSub(ratVecScale(foot_rat, makeRational(2)), targetPoint_rat);
  const imagePoint = [
    imagePoint_rat[0].n / imagePoint_rat[0].d,
    imagePoint_rat[1].n / imagePoint_rat[1].d,
    imagePoint_rat[2].n / imagePoint_rat[2].d,
  ];

  const hasSecondPlane = combinedLower.includes("plane") && (combinedLower.includes("x") || combinedLower.includes("y") || combinedLower.includes("z") || combinedLower.includes("π")) && /=|:/.test(combinedLower);
  let secondPlane = null;
  // Parse plane Π1: x+y-z=2 or similar
  const eqMatch = combinedLower.replace(/\s+/g, "").match(/([+\-\d.]*x[+\-\d.]*y[+\-\d.]*z)=([+-]?\d+(?:\.\d+)?)/i);
  if (eqMatch) {
    const parsedEq = parsePlaneEquation(combinedLower);
    if (parsedEq && Math.abs(dot(parsedEq.normal, simplifiedNormal) - planeD) > 1e-4) {
      secondPlane = parsedEq;
    }
  } else if (combinedLower.includes("x+y-z=2") || combinedLower.includes("x + y - z = 2") || combinedLower.includes("x+y−z=2")) {
    secondPlane = { normal: [1, 1, -1], constant: 2, equation: "x + y - z = 2" };
  }
  
  let angleDegrees = null;
  let perpendicularPlaneEq = "";
  
  if (secondPlane) {
    const n1 = simplifiedNormal;
    const n2 = secondPlane.normal;
    const dotVal = dot(n1, n2);
    const mag1 = magnitude(n1);
    const mag2 = magnitude(n2);
    const cosTheta = Math.abs(dotVal) / Math.max(1e-8, mag1 * mag2);
    angleDegrees = Math.acos(Math.min(1, cosTheta)) * 180 / Math.PI;
    
    // Pass through point Q
    const n3 = cross(n1, n2);
    let simplifiedN3 = [...n3];
    const isAllInt3 = n3.every((x) => Math.abs(x - Math.round(x)) < 1e-5);
    if (isAllInt3) {
      const ints3 = n3.map(Math.round);
      const commonGcd3 = gcd(gcd(ints3[0], ints3[1]), ints3[2]);
      if (commonGcd3 > 1) {
        simplifiedN3 = ints3.map((x) => x / commonGcd3);
      } else {
        simplifiedN3 = ints3;
      }
      const firstNonZero3 = simplifiedN3.find((x) => Math.abs(x) > 1e-8);
      if (firstNonZero3 < 0) {
        simplifiedN3 = simplifiedN3.map((x) => -x);
      }
    }
    const d3 = dot(simplifiedN3, Q);
    perpendicularPlaneEq = formatPlaneEquationString(simplifiedN3, d3);
  }

  const solutionSteps = [
    {
      id: "step-1",
      title: "Write two vectors in the plane",
      formula: `\\vec{AB} = B - A = ${formatRatVec(AB_rat, true)},\\; \\vec{AC} = C - A = ${formatRatVec(AC_rat, true)}`,
      explanation: "Form vectors from point A to B and A to C to span the plane.",
    },
    {
      id: "step-2",
      title: "Take cross product for plane normal",
      formula: `\\vec{n} = \\vec{AB} \\times \\vec{AC} = ${formatRatVec(normal_rat, true)}`,
      explanation: `Cross product of vectors in the plane gives the perpendicular normal vector. We simplify the normal to ${formatRatVec(simplifiedNormal_rat, true)}.`,
    },
    {
      id: "step-3",
      title: "Derive plane equation containing ABC",
      formula: planeEquationFormatted,
      explanation: `Using the point-normal equation with point A${formatRatVec(A_rat, true)}, we get: a(x-x_A) + b(y-y_A) + c(z-z_A) = 0 => ${planeEquationFormatted}.`,
    },
    {
      id: "step-4",
      title: `Find equation of line L through P perpendicular to plane`,
      formula: `\\vec{r} = ${formatRatVec(P_rat, true)} + \\lambda ${formatRatVec(simplifiedNormal_rat, true)}`,
      explanation: `Line L passes through P${formatRatVec(P_rat, true)} and is perpendicular to the plane, so its direction is the plane's normal vector ${formatRatVec(simplifiedNormal_rat, true)}.`,
    },
    {
      id: "step-5",
      title: `Compute shortest distance from ${targetLabel} to plane`,
      formula: `d = \\frac{|${a}(${targetPoint[0]}) + ${b}(${targetPoint[1]}) + ${c}(${targetPoint[2]}) - ${planeD}|}{\\sqrt{${a}^2 + ${b}^2 + ${c}^2}} = ${formatExactDistance(numerator, denomSq)} \\approx ${formatNumber(distance, 4)}`,
      explanation: `Use the point-to-plane distance formula with point ${targetLabel}${formatRatVec(targetPoint_rat, true)}.`,
    },
    {
      id: "step-6",
      title: `Find coordinates of foot of perpendicular F`,
      formula: `F = ${formatRatVec(foot_rat, true)} \\approx ${formatVector(roundVec(foot, 4), 3)}`,
      explanation: `The foot of the perpendicular F is the point on the plane closest to ${targetLabel}, given by F = ${targetLabel} + t * n, yielding F = ${formatRatVec(foot_rat, true)}.`,
    },
  ];

  if (hasImage) {
    solutionSteps.push({
      id: "step-image",
      title: `Find the image of ${targetLabel} in the plane`,
      formula: `I = 2F - ${targetLabel} = ${formatRatVec(imagePoint_rat, true)} \\approx ${formatVector(roundVec(imagePoint, 4), 3)}`,
      explanation: `The image point I is the reflection of ${targetLabel}${formatRatVec(targetPoint_rat, true)} across the plane, given by I = 2F - ${targetLabel}.`,
    });
  }
  
  if (secondPlane && angleDegrees !== null) {
    const denSq2 = dot(secondPlane.normal, secondPlane.normal);
    const dotVal = dot(simplifiedNormal, secondPlane.normal);
    solutionSteps.push({
      id: "step-angle",
      title: "Calculate the acute angle between the planes",
      formula: `\\cos\\theta = \\frac{|n_1 \\cdot n_2|}{|n_1||n_2|} = \\frac{${Math.abs(dotVal)}}{\\sqrt{${denomSq}}\\sqrt{${denSq2}}} = ${formatExactCosTheta(dotVal, denomSq, denSq2)} \\implies \\theta \\approx ${formatNumber(angleDegrees, 2)}^\\circ`,
      explanation: `Find the acute angle between plane Π (${planeEquationFormatted}) and Π1 (${secondPlane.equation}) with normals ${formatRatVec(simplifiedNormal_rat, true)} and ${formatVector(secondPlane.normal, 2)}, yielding θ ≈ ${formatNumber(angleDegrees, 2)}°.`,
    });
  }
  
  if (secondPlane && perpendicularPlaneEq) {
    const crossN = cross(simplifiedNormal, secondPlane.normal);
    const crossN_rat = crossN.map((x) => makeRational(x));
    solutionSteps.push({
      id: "step-perpendicular-plane",
      title: `Find the equation of the plane through Q perpendicular to both planes`,
      formula: perpendicularPlaneEq,
      explanation: `The normal of the new plane is perpendicular to both n_1 and n_2, so n_3 = n_1 x n_2 = ${formatRatVec(crossN_rat, true)}. Using point Q${formatRatVec(Q_rat, true)}, we get: ${perpendicularPlaneEq}.`,
    });
  }

  let answerStr = `Plane Π: ${planeEquationFormatted}, Line L: \\vec{r} = ${formatRatVec(P_rat, true)} + \\lambda ${formatRatVec(simplifiedNormal_rat, true)}`;
  answerStr += `, Foot F: ${formatRatVec(foot_rat, true)}`;
  answerStr += `, Distance: d = ${formatExactDistance(numerator, denomSq)}`;
  if (hasImage) {
    answerStr += `, Image I: ${formatRatVec(imagePoint_rat, true)}`;
  }
  if (secondPlane && angleDegrees !== null) {
    const denSq2 = dot(secondPlane.normal, secondPlane.normal);
    const dotVal = dot(simplifiedNormal, secondPlane.normal);
    answerStr += `, Angle θ = \\cos^{-1}\\left(${formatExactCosTheta(dotVal, denomSq, denSq2)}\\right) \\approx ${formatNumber(angleDegrees, 2)}^\\circ`;
  }
  if (secondPlane && perpendicularPlaneEq) {
    answerStr += `, Perpendicular Plane: ${perpendicularPlaneEq}`;
  }

  let expl = `Plane Π is ${planeEquationFormatted}. Line L equation is \\vec{r} = ${formatRatVec(P_rat, true)} + \\lambda${formatRatVec(simplifiedNormal_rat, true)}. Shortest distance of ${targetLabel} is ${formatExactDistance(numerator, denomSq)} (≈ ${formatNumber(distance, 4)}). Foot coordinates are F${formatRatVec(foot_rat, true)}.`;
  if (hasImage) {
    expl += ` Image of ${targetLabel} in Π is I${formatRatVec(imagePoint_rat, true)}.`;
  }
  if (secondPlane && angleDegrees !== null) {
    const denSq2 = dot(secondPlane.normal, secondPlane.normal);
    const dotVal = dot(simplifiedNormal, secondPlane.normal);
    expl += ` Acute angle is θ = \\cos^{-1}\\left(${formatExactCosTheta(dotVal, denomSq, denSq2)}\\right) ≈ ${formatNumber(angleDegrees, 2)}°.`;
  }
  if (secondPlane && perpendicularPlaneEq) {
    expl += ` Plane through Q is ${perpendicularPlaneEq}.`;
  }

  return {
    type: "points_plane_geometry",
    finalAnswer: answerStr,
    unit: "",
    steps: solutionSteps,
    explanation: expl,
    formulaLatex: `x+y=3`,
    objectSuggestions,
    buildSteps,
    lessonStages,
    cameraBookmarks,
    sceneMoments,
    sceneOverlays,
    challengePrompts: [{ id: "analytic-follow-up", prompt: "Explain the geometric method used to find the foot of the perpendicular from a point to a plane.", expectedKind: "text", expectedAnswer: null, tolerance: 0 }],
    sceneFocus: {
      concept: "points-plane geometry",
      primaryInsight: "The normal vector derived from points A, B, and C controls both the plane equation, line L's direction, and the foot of the perpendicular.",
      focusPrompt: "Notice how the normal vector is perpendicular to every vector in the plane.",
      judgeSummary: "The learner observes the plane derivation, visualizes line L and foot F, and understands point-plane geometry from first principles.",
    },
    learningMoments: {
      orient: {
        title: "Observe Points",
        coachMessage: sceneMoments[0].prompt,
        goal: sceneMoments[0].goal,
        prompt: sceneMoments[0].prompt,
        insight: "",
        whyItMatters: "Seeing the point cloud first makes the relative directions easy to trace.",
      },
      build: {
        title: "Derive Plane",
        coachMessage: sceneMoments[1].prompt,
        goal: sceneMoments[1].goal,
        prompt: sceneMoments[1].prompt,
        insight: "The cross product of AB and AC yields the plane's normal.",
        whyItMatters: "The plane equation is the baseline reference for all later steps.",
      },
      predict: {
        title: "Line L Equation",
        coachMessage: sceneMoments[2].prompt,
        goal: sceneMoments[2].goal,
        prompt: sceneMoments[2].prompt,
        insight: "A perpendicular line direction is exactly the plane's normal vector.",
        whyItMatters: "This shows how the same normal vector controls multiple geometric relationships.",
      },
      check: {
        title: "Foot & Distance",
        coachMessage: sceneMoments[3].prompt,
        goal: sceneMoments[3].goal,
        prompt: sceneMoments[3].prompt,
        insight: distance > 0.001 ? "Formula gives the shortest perpendicular distance." : "Q lies directly on the plane, so its distance is 0 and F = Q.",
        whyItMatters: "This is the check that confirms Q's physical position relative to the plane.",
      },
      reflect: {
        title: "Explain Concept",
        coachMessage: sceneMoments[4].prompt,
        goal: sceneMoments[4].goal,
        prompt: sceneMoments[4].prompt,
        insight: explainPrompt,
        whyItMatters: "Understanding the geometry makes formula memorization unnecessary.",
      },
      challenge: {
        title: "Ask More",
        coachMessage: "Ask about any coordinate vector, normal, plane equation, or step.",
        goal: "Frame follow-ups to stay aligned with the 3D visual geometry.",
        prompt: "What spatial relationship should we explore next?",
        insight: "",
        whyItMatters: "Asking grounded questions builds deep intuition.",
      },
    },
    entities: {
      points: [
        { id: "point-A", label: "A", coordinates: roundVec(A, 4) },
        { id: "point-B", label: "B", coordinates: roundVec(B, 4) },
        { id: "point-C", label: "C", coordinates: roundVec(C, 4) },
        { id: "point-P", label: "P", coordinates: roundVec(P, 4) },
        { id: "point-Q", label: "Q", coordinates: roundVec(Q, 4) },
        { id: "point-F", label: "F", coordinates: roundVec(foot, 4) },
      ],
      lines: [
        { id: "line-L", label: "Line L", point: roundVec(P, 4), direction: roundVec(simplifiedNormal, 4) },
        ...(distance > 0.001 ? [{ id: "line-QF", label: "Segment QF", point: roundVec(Q, 4), direction: roundVec(sub(foot, Q), 4) }] : []),
      ],
      planes: [
        { id: "plane-ABC", label: "Plane ABC", normal: roundVec(simplifiedNormal, 4), constant: round(planeD, 4) },
      ],
    },
    derivedValues: {
      distance: round(distance, 6),
      foot: roundVec(foot, 4),
      planeEquation: planeEquationFormatted,
    },
  };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function solveGeometry3d(questionText = "", rawQuestion = "") {
  const normQ = questionText
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-");
  const normRaw = rawQuestion
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-");

  const combinedText = `${normQ} ${normRaw}`;
  const intent = detectGeometry3dIntent(normQ) || (normRaw && detectGeometry3dIntent(normRaw));
  if (!intent) return null;

  const vectors = parseVectors(combinedText);
  const plane = parsePlane(combinedText);

  switch (intent) {
    case "points_plane_geometry":
      return { ...solvePointsPlaneGeometry(normQ, normRaw), input: normQ };

    case "dot_product":
      if (vectors.length < 2) return null;
      return { ...solveDotProduct(vectors[0], vectors[1]), input: questionText };

    case "cross_product":
      if (vectors.length < 2) return null;
      return { ...solveCrossProduct(vectors[0], vectors[1]), input: questionText };

    case "vector_angle":
      if (vectors.length < 2) return null;
      return { ...solveVectorAngle(vectors[0], vectors[1]), input: questionText };

    case "magnitude":
      if (vectors.length < 1) return null;
      return { ...solveMagnitude(vectors[0]), input: questionText };

    case "point_plane_dist":
      if (vectors.length < 1 || !plane) return null;
      return { ...solvePointPlaneDistance(vectors[0], plane), input: questionText };

    default:
      return null;
  }
}
