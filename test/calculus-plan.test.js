import test from "node:test";
import assert from "node:assert/strict";

import { detectCalculusIntent, buildCalculusPlan } from "../server/services/plan/calculusPlan.js";

test("detectCalculusIntent: recognizes derivatives", () => {
  assert.equal(detectCalculusIntent("differentiate x^3"), "derivative");
  assert.equal(detectCalculusIntent("find the derivative of sin(x)"), "derivative");
  assert.equal(detectCalculusIntent("slope of x^2 at x=2"), "derivative");
  assert.equal(detectCalculusIntent("dy/dx of x^4"), "derivative");
});

test("detectCalculusIntent: recognizes integrals", () => {
  assert.equal(detectCalculusIntent("integrate x^2 from 0 to 2"), "integral");
  assert.equal(detectCalculusIntent("area under curve x^3"), "integral");
  assert.equal(detectCalculusIntent("riemann sum of sin(x)"), "integral");
});

test("detectCalculusIntent: recognizes limits", () => {
  assert.equal(detectCalculusIntent("limit of sin(x)/x as x approaches 0"), "limit");
  assert.equal(detectCalculusIntent("lim as x->1 of x^2"), "limit");
});

test("detectCalculusIntent: recognizes differential equations", () => {
  assert.equal(detectCalculusIntent("solve the differential equation dy/dx = y"), "differential_equation");
  assert.equal(detectCalculusIntent("dy/dx = x + y"), "differential_equation");
});

test("detectCalculusIntent: returns null for non-calculus", () => {
  assert.equal(detectCalculusIntent("find the volume of a sphere"), null);
  assert.equal(detectCalculusIntent("solve 2x + 5 = 11"), null);
});

test("buildCalculusPlan: structures fallback plan correctly when LLM fails or for testing", async () => {
  const plan = await buildCalculusPlan("differentiate x^2", {});
  assert.ok(plan);
  assert.equal(plan.problem.questionType, "spatial");
  assert.equal(plan.experienceMode, "analytic_auto");
  
  // Verify suggested simulation object
  const suggestion = plan.objectSuggestions.find((s) => s.id === "calculus-simulation");
  assert.ok(suggestion);
  assert.equal(suggestion.object.shape, "cube");
  assert.equal(suggestion.object.metadata.isCalculusSimulation, true);
  assert.equal(suggestion.object.metadata.simulationMode, "derivative");
  
  // Verify camera bookmark
  assert.ok(plan.cameraBookmarks.some((c) => c.id === "calculus-2d-grid"));
  
  // Verify thinking layers
  assert.ok(suggestion.object.metadata.thinkingLayers);
  assert.ok(suggestion.object.metadata.thinkingLayers.symmetry);
  assert.ok(suggestion.object.metadata.thinkingLayers.monotonicity);
});
