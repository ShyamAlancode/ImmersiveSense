import test from "node:test";
import assert from "node:assert/strict";

import { solveArithmetic } from "../server/services/cas/arithmetic.js";

test("solveArithmetic: basic addition", () => {
  const result = solveArithmetic("2 + 2");
  assert.ok(result, "Should return a result");
  assert.equal(result.finalAnswer, 4);
  assert.equal(result.type, "arithmetic");
  assert.ok(result.steps.length > 0);
});

test("solveArithmetic: multiplication with precedence", () => {
  const result = solveArithmetic("3 * 5 + 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 19);
});

test("solveArithmetic: division", () => {
  const result = solveArithmetic("10 / 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 2.5);
});

test("solveArithmetic: power via ^", () => {
  const result = solveArithmetic("2^3");
  assert.ok(result);
  assert.equal(result.finalAnswer, 8);
});

test("solveArithmetic: percentage of", () => {
  const result = solveArithmetic("20% of 50");
  assert.ok(result);
  assert.equal(result.finalAnswer, 10);
});

test("solveArithmetic: natural language prefix stripped", () => {
  const result = solveArithmetic("what is 4 + 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 8);
});

test("solveArithmetic: nested parens", () => {
  const result = solveArithmetic("(3 + 2) * (4 - 1)");
  assert.ok(result);
  assert.equal(result.finalAnswer, 15);
});

test("solveArithmetic: returns null for non-arithmetic", () => {
  const result = solveArithmetic("find the volume of a cylinder");
  assert.equal(result, null);
});

test("solveArithmetic: negative numbers", () => {
  const result = solveArithmetic("-5 + 3");
  assert.ok(result);
  assert.equal(result.finalAnswer, -2);
});

test("solveArithmetic: decimal numbers", () => {
  const result = solveArithmetic("1.5 * 4");
  assert.ok(result);
  assert.equal(result.finalAnswer, 6);
});
