/**
 * CAS Central Dispatcher
 * Routes a question to the correct solver:
 *   1. Geometry 3D (vectors, planes)
 *   2. Trigonometry (sin, cos, tan, arcsin…)
 *   3. Calculus (differentiate, integrate)
 *   4. Quadratic equations (ax² + bx + c = 0)
 *   5. System of 2 linear equations
 *   6. Linear equations (ax + b = c)
 *   7. Arithmetic (2+2, 3*5+4, 20% of 50)
 *
 * Returns null if no solver can handle it → route to LLM.
 */

import { solveArithmetic } from "./arithmetic.js";
import { solveLinear, solveQuadratic, solveSystem2x2 } from "./algebra.js";
import { solveTrig } from "./trig.js";
import { differentiate, integrate } from "./calculus.js";
import { solveGeometry3d, detectGeometry3dIntent } from "./geometry3d.js";

/**
 * Classify the difficulty/type of a question for routing.
 * Returns: "trivial" | "easy" | "moderate" | "hard_jee" | "vision"
 */
export function classifyQuestion(questionText = "") {
  const lower = questionText.toLowerCase().trim();

  // Vision / multimodal — never CAS
  if (!questionText.trim()) return "vision";

  // Hard JEE: multi-part, complex, olympiad
  if (
    /\(a\)/.test(lower) && /\(b\)/.test(lower) && /\(c\)/.test(lower)
  ) return "hard_jee";

  if (
    /\b(jee|advanced|olympiad|iit|aime|putnam)\b/.test(lower) ||
    /\b(flux|permittivity|permeability|gauss|laplacian|eigenvalue)\b/.test(lower)
  ) return "hard_jee";

  // Trivial — pure arithmetic or trig of a number → CAS only
  if (/^[\s\d.+\-*/%()\^eE]+$/.test(lower.replace(/×|÷|−/g, ""))) return "trivial";
  if (/\b(sin|cos|tan|arcsin|arccos|arctan|asin|acos|atan)\s*\(?\s*[\d.]+/.test(lower)) return "trivial";
  if (/\bdifferentiate\b|\bderivative\b|\bd\/dx\b/.test(lower)) return "trivial";
  if (/\bintegrate\b|\bintegral\b/.test(lower)) return "trivial";
  if (detectGeometry3dIntent(lower)) return "trivial";
  if (/[a-z]\^2|[a-z]\s*\*\*\s*2/.test(lower) && /=\s*0/.test(lower)) return "trivial";
  if (/\d*\.?\d*\s*[a-z]\s*[+-]?\s*\d*\.?\d*\s*=\s*[+-]?\d/.test(lower)) return "easy";

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 10) return "easy";
  if (wordCount <= 25) return "moderate";
  return "hard_jee";
}

/**
 * Main CAS solve entry point.
 * Returns a CAS result object, or null if no solver matched.
 */
export function casDispatch(questionText = "", rawQuestion = "") {
  if (!questionText || !questionText.trim()) {
    if (!rawQuestion || !rawQuestion.trim()) return null;
  }

  // Try solvers in priority order (most specific → most general)
  return (
    solveGeometry3d(questionText, rawQuestion) ||
    solveTrig(questionText) ||
    differentiate(questionText) ||
    integrate(questionText) ||
    solveQuadratic(questionText) ||
    solveSystem2x2(questionText) ||
    solveLinear(questionText) ||
    solveArithmetic(questionText) ||
    null
  );
}

/**
 * Convert a CAS result into the `answerScaffold` + `analyticContext.solutionSteps`
 * shape expected by the existing plan schema.
 */
export function casResultToPlanFields(casResult) {
  if (!casResult) return null;

  return {
    answerScaffold: {
      finalAnswer: casResult.finalAnswer,
      unit: casResult.unit || "",
      formula: casResult.formulaLatex || "",
      explanation: casResult.explanation || "",
      checks: [
        "Verify each algebraic step by substituting back into the original expression.",
        "Check units and sign conventions.",
      ],
    },
    analyticContext: {
      subtype: casResult.type,
      entities: casResult.entities || { points: [], lines: [], planes: [] },
      derivedValues: casResult.derivedValues || { result: casResult.finalAnswer },
      formulaCard: {
        title: casResult.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        formula: casResult.formulaLatex || "",
        explanation: casResult.explanation || "",
      },
      solutionSteps: casResult.steps || [],
    },
    ...(casResult.objectSuggestions ? {
      objectSuggestions: casResult.objectSuggestions,
      buildSteps: casResult.buildSteps,
      lessonStages: casResult.lessonStages,
      cameraBookmarks: casResult.cameraBookmarks,
      sceneMoments: casResult.sceneMoments,
      sceneOverlays: casResult.sceneOverlays,
      challengePrompts: casResult.challengePrompts,
      sceneFocus: casResult.sceneFocus,
      learningMoments: casResult.learningMoments,
    } : {}),
    casSolved: true,
    casType: casResult.type,
  };
}
