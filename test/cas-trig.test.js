import test from "node:test";
import assert from "node:assert/strict";

import { solveTrig } from "../server/services/cas/trig.js";

const EPSILON = 1e-4;
function near(a, b) {
  const numA = Number(String(a).replace(/[°\s]/g, ""));
  const numB = Number(String(b).replace(/[°\s]/g, ""));
  return Math.abs(numA - numB) < EPSILON;
}

test("solveTrig: sin(30)", () => {
  const result = solveTrig("sin(30)");
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "trig");
  assert.ok(near(result.finalAnswer, 0.5), `Expected ~0.5 but got ${result.finalAnswer}`);
  assert.ok(result.steps.length >= 2);
});

test("solveTrig: cos(60)", () => {
  const result = solveTrig("cos(60)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 0.5), `Expected ~0.5 but got ${result.finalAnswer}`);
});

test("solveTrig: tan(45)", () => {
  const result = solveTrig("tan(45)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 1), `Expected ~1 but got ${result.finalAnswer}`);
});

test("solveTrig: sin(90) = 1", () => {
  const result = solveTrig("sin(90)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 1), `Expected 1 but got ${result.finalAnswer}`);
});

test("solveTrig: cos(0) = 1", () => {
  const result = solveTrig("cos(0)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 1), `Expected 1 but got ${result.finalAnswer}`);
});

test("solveTrig: exact value step present for known angles", () => {
  const result = solveTrig("sin(30)");
  assert.ok(result);
  const hasExactStep = result.steps.some((s) => /exact value|unit circle/i.test(s.title));
  assert.ok(hasExactStep, "Should include exact value step for 30°");
});

test("solveTrig: arcsin(1) = 90 degrees", () => {
  const result = solveTrig("arcsin(1)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 90), `Expected 90 but got ${result.finalAnswer}`);
  assert.equal(result.unit, "°");
});

test("solveTrig: arccos(0) = 90 degrees", () => {
  const result = solveTrig("arccos(0)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 90), `Expected 90 but got ${result.finalAnswer}`);
});

test("solveTrig: arctan(1) = 45 degrees", () => {
  const result = solveTrig("arctan(1)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 45), `Expected 45 but got ${result.finalAnswer}`);
});

test("solveTrig: returns null for non-trig text", () => {
  const result = solveTrig("find the volume of a sphere");
  assert.equal(result, null);
});

test("solveTrig: formulaLatex contains exact value for 45°", () => {
  const result = solveTrig("sin(45)");
  assert.ok(result);
  assert.ok(result.formulaLatex, "Should have formulaLatex");
});
