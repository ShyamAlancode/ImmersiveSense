import test from "node:test";
import assert from "node:assert/strict";

import { solveGeometry3d, detectGeometry3dIntent } from "../server/services/cas/geometry3d.js";

const EPSILON = 1e-3;
function near(a, b) {
  const numA = Number(String(a).replace(/[°\s]/g, ""));
  const numB = Number(String(b).replace(/[°\s]/g, ""));
  return Math.abs(numA - numB) < EPSILON;
}

// ─── Dot product ─────────────────────────────────────────────────────────────

test("solveGeometry3d: dot product of (1,0,0) and (0,1,0)", () => {
  const result = solveGeometry3d("find the dot product of (1, 0, 0) and (0, 1, 0)");
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "dot_product");
  assert.equal(Number(result.finalAnswer), 0);
  assert.ok(result.steps.length >= 2);
});

test("solveGeometry3d: dot product of (1,2,3) and (4,5,6)", () => {
  const result = solveGeometry3d("dot product of (1, 2, 3) and (4, 5, 6)");
  assert.ok(result);
  // 1*4 + 2*5 + 3*6 = 4+10+18 = 32
  assert.equal(Number(result.finalAnswer), 32);
});

// ─── Cross product ────────────────────────────────────────────────────────────

test("solveGeometry3d: cross product of (1,0,0) and (0,1,0)", () => {
  const result = solveGeometry3d("find the cross product of (1, 0, 0) and (0, 1, 0)");
  assert.ok(result);
  assert.equal(result.type, "cross_product");
  // Should be (0,0,1)
  assert.ok(result.finalAnswer.includes("0") && result.finalAnswer.includes("1"),
    `Expected (0,0,1), got: ${result.finalAnswer}`);
});

// ─── Angle between vectors ────────────────────────────────────────────────────

test("solveGeometry3d: angle between perpendicular vectors = 90°", () => {
  const result = solveGeometry3d("find the angle between vectors (1, 0, 0) and (0, 1, 0)");
  assert.ok(result);
  assert.equal(result.type, "vector_angle");
  assert.ok(near(result.finalAnswer, 90), `Expected 90° but got ${result.finalAnswer}`);
  assert.equal(result.unit, "°");
});

test("solveGeometry3d: angle between parallel vectors = 0°", () => {
  const result = solveGeometry3d("angle between vectors (1, 0, 0) and (2, 0, 0)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 0), `Expected 0° but got ${result.finalAnswer}`);
});

test("solveGeometry3d: angle between (1,1,0) and (1,0,0) = 45°", () => {
  const result = solveGeometry3d("angle between vectors (1, 1, 0) and (1, 0, 0)");
  assert.ok(result);
  assert.ok(near(result.finalAnswer, 45), `Expected 45° but got ${result.finalAnswer}`);
});

// ─── Magnitude ───────────────────────────────────────────────────────────────

test("solveGeometry3d: magnitude of (3, 4, 0) = 5", () => {
  const result = solveGeometry3d("find the magnitude of (3, 4, 0)");
  assert.ok(result);
  assert.equal(result.type, "magnitude");
  assert.ok(near(result.finalAnswer, 5), `Expected 5, got: ${result.finalAnswer}`);
  assert.ok(result.steps.length >= 1);
});

// ─── Intent detection ────────────────────────────────────────────────────────

test("detectGeometry3dIntent: correctly detects dot_product", () => {
  assert.equal(detectGeometry3dIntent("find the dot product of (1,0,0) and (0,1,0)"), "dot_product");
});

test("detectGeometry3dIntent: correctly detects cross_product", () => {
  assert.equal(detectGeometry3dIntent("cross product of (1,0,0) and (0,1,0)"), "cross_product");
});

test("detectGeometry3dIntent: correctly detects vector_angle", () => {
  assert.equal(detectGeometry3dIntent("angle between vectors (1,0,0) and (0,1,0)"), "vector_angle");
});

test("detectGeometry3dIntent: returns null for unrelated text", () => {
  assert.equal(detectGeometry3dIntent("what is the capital of france"), null);
});

test("detectGeometry3dIntent: correctly detects points_plane_geometry", () => {
  const question = "In a three-dimensional coordinate system, points A(1,2,3), B(4,-1,2), and C(2,1,5) form a plane. A line L passes through the point P(3,2,-1) and is perpendicular to the plane containing triangle ABC. Find the equation of the line L. Also determine the shortest distance between the point Q(5,-2,4) and the plane ABC. Further, find the coordinates of the foot of the perpendicular drawn from Q to the plane.";
  assert.equal(detectGeometry3dIntent(question), "points_plane_geometry");
});

test("solveGeometry3d: solves points plane geometry JEE question perfectly from first principles", () => {
  const question = "In a three-dimensional coordinate system, points A(1,2,3), B(4,-1,2), and C(2,1,5) form a plane. A line L passes through the point P(3,2,-1) and is perpendicular to the plane containing triangle ABC. Find the equation of the line L. Also determine the shortest distance between the point Q(5,-2,4) and the plane ABC. Further, find the coordinates of the foot of the perpendicular drawn from Q to the plane.";
  const result = solveGeometry3d(question);
  
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "points_plane_geometry");
  
  // Verify derived values
  assert.ok(result.derivedValues, "Should contain derivedValues");
  assert.equal(result.derivedValues.planeEquation, "x + y = 3");
  assert.equal(result.derivedValues.distance, 0);
  assert.deepEqual(result.derivedValues.foot, [5, -2, 4]);

  // Verify elements of the 3D scene
  assert.ok(result.objectSuggestions.length >= 8);
  assert.equal(result.sceneMoments.length, 5);
  assert.ok(result.sceneOverlays.length >= 9);

  // Verify steps and solution content
  assert.ok(result.steps.length >= 6);
  assert.ok(result.steps[0].formula.includes("AB"));
  assert.ok(result.steps[1].explanation.includes("1") && result.steps[1].explanation.includes("0"));
  assert.ok(result.steps[2].formula.includes("x + y = 3"));
});

test("detectGeometry3dIntent: detects points_plane_geometry for coordinate-free JEE question follow-up", () => {
  const question = "Find the equation of line L perpendicular to plane ABC, the shortest distance from Q to plane ABC, and the foot of the perpendicular from Q to the plane.";
  assert.equal(detectGeometry3dIntent(question), "points_plane_geometry");
});

test("solveGeometry3d: solves coordinate-free points plane geometry follow-up using default JEE coordinates", () => {
  const question = "Find the equation of line L perpendicular to plane ABC, the shortest distance from Q to plane ABC, and the foot of the perpendicular from Q to the plane.";
  const result = solveGeometry3d(question);
  
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "points_plane_geometry");
  
  // Verify standard coordinates are assumed as fallback
  assert.ok(result.derivedValues, "Should contain derivedValues");
  assert.equal(result.derivedValues.planeEquation, "x + y = 3");
  assert.equal(result.derivedValues.distance, 0);
  assert.deepEqual(result.derivedValues.foot, [5, -2, 4]);
});

test("solveGeometry3d: solves the multi-part JEE Advanced 3D points-plane problem with reflection, angles, and perpendicular planes", () => {
  const question = "In a three-dimensional coordinate system, the points A(1,−2,3), B(4,1,−1), and C(2,3,5) determine a plane Π. A point P(5,−1,2) lies outside the plane, and a line L passes through P such that L is perpendicular to the plane Π. Another point Q(3,2,−4) is given in space. Find the vector and Cartesian equation of the plane Π, the vector equation of the line L, and the coordinates of the foot of the perpendicular drawn from P to the plane. Hence find the shortest distance of P from Π and the image of P in the plane. Further, if another plane is given by Π1 : x+y−z=2, determine the acute angle between Π and Π1. Finally, find the equation of the plane passing through the point Q and perpendicular to both planes Π and Π1.";
  const result = solveGeometry3d(question);
  
  assert.ok(result, "Should return a result");
  assert.equal(result.type, "points_plane_geometry");
  
  // Verify derived values
  assert.ok(result.derivedValues, "Should contain derivedValues");
  assert.equal(result.derivedValues.planeEquation, "13x - 5y + 6z = 41");
  assert.ok(Math.abs(result.derivedValues.distance - 2.70346) < EPSILON);
  
  // Verify coordinates of the foot F
  const foot = result.derivedValues.foot;
  assert.ok(Math.abs(foot[0] - 2.6826) < EPSILON);
  assert.ok(Math.abs(foot[1] - -0.1087) < EPSILON);
  assert.ok(Math.abs(foot[2] - 0.9304) < EPSILON);
  
  // Check the presence of reflection, angle, and perpendicular plane steps
  const steps = result.steps;
  assert.ok(steps.some(s => s.id === "step-image"));
  assert.ok(steps.some(s => s.id === "step-angle"));
  assert.ok(steps.some(s => s.id === "step-perpendicular-plane"));
  
  // Verify the angle and the perpendicular plane equation
  const angleStep = steps.find(s => s.id === "step-angle");
  assert.ok(angleStep.formula.includes("85.63"));
  
  const perpPlaneStep = steps.find(s => s.id === "step-perpendicular-plane");
  assert.ok(perpPlaneStep.formula.includes("x - 19y - 18z = 37"));
});
