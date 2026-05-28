import test from "node:test";
import assert from "node:assert/strict";

import {
  getOrCreateSession,
  getQuestionState,
  recordAttempt,
  recordAskedForAnswer,
  setLearnerLevel,
  HINT_LEVELS,
  LEARNER_LEVELS,
} from "../server/services/pedagogy/learnerSession.js";

import { getHintPolicy, isDirectAnswerRequest } from "../server/services/pedagogy/hintPolicy.js";

const Q = "Find the volume of a cylinder with radius 3 and height 5.";

test("learnerSession: creates session on first access", () => {
  const session = getOrCreateSession("test-session-1");
  assert.ok(session);
  assert.equal(session.learnerLevel, LEARNER_LEVELS.INTERMEDIATE);
  assert.equal(session.questions.size, 0);
});

test("learnerSession: creates question state on first access", () => {
  const state = getQuestionState("test-session-2", Q);
  assert.ok(state);
  assert.equal(state.hintLevel, HINT_LEVELS.CONCEPTUAL);
  assert.equal(state.attempts, 0);
});

test("learnerSession: hint stays at CONCEPTUAL after 1 wrong attempt", () => {
  const state = getQuestionState("test-session-3", Q);
  recordAttempt("test-session-3", Q, { correct: false });
  assert.equal(state.attempts, 1);
  assert.equal(state.hintLevel, HINT_LEVELS.CONCEPTUAL);
});

test("learnerSession: hint escalates to FORMULA after 2 wrong attempts", () => {
  const state = getQuestionState("test-session-4", Q);
  recordAttempt("test-session-4", Q, { correct: false });
  recordAttempt("test-session-4", Q, { correct: false });
  assert.equal(state.hintLevel, HINT_LEVELS.FORMULA);
});

test("learnerSession: hint escalates to VISUAL after 4 wrong attempts", () => {
  const state = getQuestionState("test-session-5", Q);
  for (let i = 0; i < 4; i++) recordAttempt("test-session-5", Q, { correct: false });
  assert.equal(state.hintLevel, HINT_LEVELS.VISUAL);
});

test("learnerSession: hint escalates to WORKED_STEP after 6 wrong attempts", () => {
  const state = getQuestionState("test-session-6", Q);
  for (let i = 0; i < 6; i++) recordAttempt("test-session-6", Q, { correct: false });
  assert.equal(state.hintLevel, HINT_LEVELS.WORKED_STEP);
});

test("learnerSession: correct attempt marks solved", () => {
  const state = getQuestionState("test-session-7", Q);
  recordAttempt("test-session-7", Q, { correct: true });
  assert.ok(state.solvedAt);
  assert.equal(state.correctAttempts, 1);
});

test("learnerSession: misconceptions stored", () => {
  const state = getQuestionState("test-session-8", Q);
  recordAttempt("test-session-8", Q, { correct: false, misconception: "confused_radius_height" });
  assert.ok(state.misconceptions.includes("confused_radius_height"));
});

test("learnerSession: askedForAnswer slowly escalates hint", () => {
  const state = getQuestionState("test-session-9", Q);
  recordAskedForAnswer("test-session-9", Q);
  recordAskedForAnswer("test-session-9", Q);
  recordAskedForAnswer("test-session-9", Q);
  // After 3 asks, hint should have escalated
  assert.ok(state.hintLevel > HINT_LEVELS.CONCEPTUAL);
});

test("learnerSession: setLearnerLevel updates session", () => {
  const session = setLearnerLevel("test-session-10", LEARNER_LEVELS.ADVANCED);
  assert.equal(session.learnerLevel, LEARNER_LEVELS.ADVANCED);
});

// ─── Hint Policy ─────────────────────────────────────────────────────────────

test("hintPolicy: conceptual hint prefix contains strict limits", () => {
  const questionState = { hintLevel: HINT_LEVELS.CONCEPTUAL, attempts: 0, solvedAt: null, misconceptions: [] };
  const { prefix, hintLevel } = getHintPolicy(questionState, LEARNER_LEVELS.INTERMEDIATE, "moderate");
  assert.equal(hintLevel, HINT_LEVELS.CONCEPTUAL);
  assert.ok(prefix.includes("DO NOT reveal any formula"));
  assert.ok(prefix.includes("MANDATORY"));
});

test("hintPolicy: formula hint allows formula but not answer", () => {
  const questionState = { hintLevel: HINT_LEVELS.FORMULA, attempts: 2, solvedAt: null, misconceptions: [] };
  const { prefix } = getHintPolicy(questionState, LEARNER_LEVELS.INTERMEDIATE, "moderate");
  assert.ok(prefix.includes("formula"));
  assert.ok(prefix.includes("DO NOT compute"));
});

test("hintPolicy: solved question removes restrictions", () => {
  const questionState = { hintLevel: HINT_LEVELS.WORKED_STEP, attempts: 5, solvedAt: Date.now(), misconceptions: [] };
  const { prefix } = getHintPolicy(questionState, LEARNER_LEVELS.INTERMEDIATE, "easy");
  assert.ok(prefix.includes("already solved"));
  assert.ok(!prefix.includes("MANDATORY"));
});

test("hintPolicy: misconceptions mentioned in prefix", () => {
  const questionState = { hintLevel: HINT_LEVELS.CONCEPTUAL, attempts: 1, solvedAt: null, misconceptions: ["confused_radius_height"] };
  const { prefix } = getHintPolicy(questionState, LEARNER_LEVELS.BEGINNER, "easy");
  assert.ok(prefix.includes("confused_radius_height"));
});

test("isDirectAnswerRequest: detects 'just tell me'", () => {
  assert.ok(isDirectAnswerRequest("Just tell me the answer!"));
});

test("isDirectAnswerRequest: detects 'give me the answer'", () => {
  assert.ok(isDirectAnswerRequest("Can you give me the answer?"));
});

test("isDirectAnswerRequest: does not flag normal questions", () => {
  assert.equal(isDirectAnswerRequest("How does this formula work?"), false);
  assert.equal(isDirectAnswerRequest("Can you explain step 2?"), false);
});
