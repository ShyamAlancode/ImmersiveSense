// ═══════════════════════════════════════════════════════
// server/config.js
// Feature flags and model routing configuration.
// ═══════════════════════════════════════════════════════

// ── Feature Flags ────────────────────────────────────────

/**
 * When true: use the 6-stage progressive Socratic pipeline.
 * When false: use the simple single-turn fallback.
 * Set to false only for debugging the basic chat flow.
 */
export const USE_PROGRESSIVE_STAGES = true;

/**
 * Maximum Socratic questions before forcing the full answer.
 * Matches the tutorController.js limit.
 */
export const MAX_SOCRATIC_QUESTIONS = 3;

/**
 * Model routing for the 6 pipeline stages.
 * fast    → Stage 1 (deconstruct), 3 (formula), 6 (answer)
 * reasoning → Stage 2 (intuition), 4 (steps), 5 (manipulation)
 */
export const STAGE_MODELS = {
  fast: [
    'llama-3.1-8b-instant',      // Groq — 1000+ t/s, free
    'llama-3.3-70b-versatile',   // Groq fallback
  ],
  reasoning: [
    'gemini-2.5-flash',          // Google — best structured JSON
    'llama-3.3-70b-versatile',   // Groq fallback
    'llama-3.1-8b-instant',      // Last resort
  ],
};

/**
 * Model routing by task type (used by resolveModelId).
 */
export const MODEL_ROUTES = {
  chat:        ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
  plan_easy:   ['llama-3.1-8b-instant'],
  plan_medium: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  plan_hard:   ['gemini-2.5-flash', 'llama-3.3-70b-versatile'],
  vision:      ['gemini-2.5-flash', 'gemini-2.0-flash'],
  transcription: ['whisper-large-v3-turbo'],
  embedding:   ['text-embedding-3-small'],
};

/**
 * API timeout in milliseconds per stage.
 */
export const STAGE_TIMEOUTS = {
  1: 8000,   // deconstruct — Groq fast
  2: 15000,  // intuition — Gemini
  3: 8000,   // formula — Groq fast
  4: 15000,  // steps — Gemini
  5: 15000,  // manipulation — Gemini
  6: 8000,   // answer — Groq fast
};

/**
 * Semantic cache size (number of plans to cache in memory).
 */
export const CACHE_SIZE = 200;

/**
 * Enable/disable verbose server-side logging.
 */
export const VERBOSE_LOGGING = process.env.NODE_ENV !== 'production';
