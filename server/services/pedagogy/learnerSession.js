/**
 * Learner Session Manager
 * Tracks per-session state: hint level, attempts, misconceptions, learner level.
 * All state is in-memory (resets on server restart — no external DB needed).
 */

const sessions = new Map();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const HINT_LEVELS = {
  CONCEPTUAL: 0,   // "Think about what formula connects these quantities."
  FORMULA: 1,      // "The formula is V = πr²h. Can you substitute the values?"
  VISUAL: 2,       // "Look at the labelled radius and height in the scene."
  WORKED_STEP: 3,  // "Here is the next calculation step: r² = 9, so πr²h = 28.27"
};

const LEARNER_LEVELS = {
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  ADVANCED: "advanced",
};

function makeSession(sessionId) {
  return {
    sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    learnerLevel: LEARNER_LEVELS.INTERMEDIATE,
    questions: new Map(), // questionKey → questionState
  };
}

function makeQuestionState(questionKey) {
  return {
    questionKey,
    hintLevel: HINT_LEVELS.CONCEPTUAL,
    attempts: 0,
    correctAttempts: 0,
    misconceptions: [],    // e.g. ["confuses_radius_height", "forgot_constant"]
    askedForAnswer: 0,     // count of times student directly asked for the answer
    solvedAt: null,
    startedAt: Date.now(),
  };
}

function normalizeKey(questionText = "") {
  return questionText
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?!.,]/g, "")
    .trim()
    .slice(0, 120); // cap key length
}

function gcSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getOrCreateSession(sessionId = "default") {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, makeSession(sessionId));
    // GC old sessions occasionally
    if (sessions.size % 50 === 0) gcSessions();
  }
  return sessions.get(sessionId);
}

export function getQuestionState(sessionId, questionText) {
  const session = getOrCreateSession(sessionId);
  const key = normalizeKey(questionText);
  if (!session.questions.has(key)) {
    session.questions.set(key, makeQuestionState(key));
  }
  return session.questions.get(key);
}

export function recordAttempt(sessionId, questionText, { correct = false, misconception = null } = {}) {
  const state = getQuestionState(sessionId, questionText);
  state.attempts += 1;
  state.updatedAt = Date.now();
  getOrCreateSession(sessionId).updatedAt = Date.now();

  if (correct) {
    state.correctAttempts += 1;
    state.solvedAt = Date.now();
  } else {
    // Escalate hint level after 2 wrong attempts
    if (state.attempts >= 2 && state.hintLevel < HINT_LEVELS.FORMULA) {
      state.hintLevel = HINT_LEVELS.FORMULA;
    }
    if (state.attempts >= 4 && state.hintLevel < HINT_LEVELS.VISUAL) {
      state.hintLevel = HINT_LEVELS.VISUAL;
    }
    if (state.attempts >= 6 && state.hintLevel < HINT_LEVELS.WORKED_STEP) {
      state.hintLevel = HINT_LEVELS.WORKED_STEP;
    }
  }

  if (misconception && !state.misconceptions.includes(misconception)) {
    state.misconceptions.push(misconception);
  }

  return state;
}

export function recordAskedForAnswer(sessionId, questionText) {
  const state = getQuestionState(sessionId, questionText);
  state.askedForAnswer += 1;
  // Escalate hint after repeated direct requests, but slowly
  if (state.askedForAnswer >= 3 && state.hintLevel < HINT_LEVELS.WORKED_STEP) {
    state.hintLevel = Math.min(state.hintLevel + 1, HINT_LEVELS.WORKED_STEP);
  }
  return state;
}

export function setLearnerLevel(sessionId, level) {
  const session = getOrCreateSession(sessionId);
  if (Object.values(LEARNER_LEVELS).includes(level)) {
    session.learnerLevel = level;
    session.updatedAt = Date.now();
  }
  return session;
}

export function getSessionStats(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    sessionId,
    learnerLevel: session.learnerLevel,
    questionCount: session.questions.size,
    createdAt: session.createdAt,
  };
}

export { HINT_LEVELS, LEARNER_LEVELS };
