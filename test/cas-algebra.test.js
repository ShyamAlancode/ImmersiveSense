import test from "node:test";
import assert from "node:assert/strict";

import { solveLinear, solveQuadratic, solveSystem2x2 } from "../server/services/cas/algebra.js";

// ─── Linear equations ───────────────────────────────────────────────────────

test("solveLinear: simple ax = c", () => {
  const result = solveLinear("2x = 8");
  assert.ok(result, "should return a result");
  assert.equal(result.type, "linear");
  assert.equal(result.finalAnswer, 4);
  assert.ok(result.steps.length >= 2);
});

test("solveLinear: ax + b = c", () => {
  const result = solveLinear("3x + 5 = 14");
  assert.ok(result);
  assert.equal(result.finalAnswer, 3);
});

test("solveLinear: negative coefficient", () => {
  const result = solveLinear("-2x + 10 = 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 3);
});

test("solveLinear: fractional result", () => {
  const result = solveLinear("2x + 1 = 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 1.5);
});

test("solveLinear: returns null for non-linear text", () => {
  const result = solveLinear("what is the volume of a cylinder");
  assert.equal(result, null);
});

// ─── Quadratic equations ─────────────────────────────────────────────────────

test("solveQuadratic: two real roots", () => {
  const result = solveQuadratic("x^2 - 5x + 6 = 0");
  assert.ok(result, "should return a result");
  assert.equal(result.type, "quadratic");
  // roots should be 2 and 3
  const answer = result.finalAnswer;
  assert.ok(answer.includes("2") && answer.includes("3"), `Expected roots 2,3 but got: ${answer}`);
  assert.ok(result.steps.length >= 3);
});

test("solveQuadratic: perfect square (single root)", () => {
  const result = solveQuadratic("x^2 - 4x + 4 = 0");
  assert.ok(result);
  // discriminant = 0, single root x=2
  const answer = result.finalAnswer;
  assert.ok(answer.includes("2"), `Expected root 2 but got: ${answer}`);
});

test("solveQuadratic: discriminant step included", () => {
  const result = solveQuadratic("x^2 - 5x + 6 = 0");
  assert.ok(result);
  const hasDiscriminantStep = result.steps.some((s) => /discriminant/i.test(s.title));
  assert.ok(hasDiscriminantStep, "Should include discriminant step");
});

// ─── 2x2 system ─────────────────────────────────────────────────────────────

test("solveSystem2x2: simple system", () => {
  const result = solveSystem2x2("2x + 3y = 12\nx + y = 5");
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "system_2x2");
  assert.ok(result.finalAnswer.includes("x ="), `Expected x= in answer, got: ${result.finalAnswer}`);
  assert.ok(result.finalAnswer.includes("y ="), `Expected y= in answer, got: ${result.finalAnswer}`);
  // x=3, y=2
  assert.ok(result.finalAnswer.includes("3"), `Expected x=3, got: ${result.finalAnswer}`);
  assert.ok(result.finalAnswer.includes("2"), `Expected y=2, got: ${result.finalAnswer}`);
});

test("solveSystem2x2: Cramer's rule steps included", () => {
  const result = solveSystem2x2("2x + 3y = 12\nx + y = 5");
  assert.ok(result);
  const hasCramerStep = result.steps.some((s) => /determinant|cramer/i.test(s.title));
  assert.ok(hasCramerStep, "Should include Cramer's rule step");
});

test("solveSystem2x2: no solution", () => {
  const result = solveSystem2x2("2x + 3y = 7\n2x + 3y = 10");
  assert.ok(result);
  assert.ok(/no solution|infinite/i.test(result.finalAnswer));
});
