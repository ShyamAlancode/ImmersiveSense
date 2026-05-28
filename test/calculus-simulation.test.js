import test from "node:test";
import assert from "node:assert/strict";

// Helper to re-evaluate the function expression (same as inside CalculusSimulationManager)
function evalFunction(expr, x, y = 0) {
  try {
    const cleanExpr = expr.replace(/\^/g, "**");
    const fn = new Function("x", "y", "Math", `with(Math) { return (${cleanExpr}); }`);
    const val = fn(x, y, Math);
    return Number.isFinite(val) ? val : 0;
  } catch (e) {
    return 0;
  }
}

// Helper to calculate tangent slope numerically
function getTangentSlope(expr, x) {
  const h = 0.0001;
  const yPlus = evalFunction(expr, x + h);
  const yMinus = evalFunction(expr, x - h);
  return (yPlus - yMinus) / (2 * h);
}

test("evalFunction: evaluates polynomials correctly", () => {
  assert.equal(evalFunction("x*x", 2), 4);
  assert.equal(evalFunction("x^3 - 3*x", 2), 2);
  assert.equal(evalFunction("3*x + 1", 5), 16);
});

test("evalFunction: evaluates trigonometric functions", () => {
  assert.equal(evalFunction("Math.sin(x)", 0), 0);
  assert.ok(Math.abs(evalFunction("Math.cos(x)", Math.PI) - (-1)) < 0.0001);
});

test("evalFunction: handles malformed expressions safely", () => {
  assert.equal(evalFunction("invalid_syntax", 2), 0);
  assert.equal(evalFunction("x / 0", 2), 0);
});

test("getTangentSlope: computes numerical derivatives accurately", () => {
  // f(x) = x^2, f'(x) = 2x. At x = 2, f'(2) = 4.
  const slope1 = getTangentSlope("x*x", 2);
  assert.ok(Math.abs(slope1 - 4) < 0.0001);

  // f(x) = x^3 - 3x, f'(x) = 3x^2 - 3. At x = 1, f'(1) = 0.
  const slope2 = getTangentSlope("x^3 - 3*x", 1);
  assert.ok(Math.abs(slope2 - 0) < 0.0001);

  // f(x) = Math.sin(x), f'(x) = Math.cos(x). At x = 0, f'(0) = 1.
  const slope3 = getTangentSlope("Math.sin(x)", 0);
  assert.ok(Math.abs(slope3 - 1) < 0.0001);
});
