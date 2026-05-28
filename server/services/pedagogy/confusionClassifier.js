/**
 * Server-Side Confusion Classifier (Layer 5)
 * Analyzes frontend micro-interactions to diagnose learner comprehension states.
 */

/**
 * Classifies confusion based on interaction metrics.
 * @param {object} metrics
 * @param {number} metrics.pauseDuration - time in ms spent before interacting
 * @param {number} metrics.hesitateCount - frequency of point drag direction changes
 * @param {number} metrics.errors - consecutive wrong placements or evaluations
 * @param {number} metrics.skipCount - skipped stages without interaction
 * @returns {object} Classified state and confidence score
 */
export function classifyConfusion(metrics = {}) {
  const pauseDuration = Number(metrics.pauseDuration) || 0;
  const hesitateCount = Number(metrics.hesitateCount) || 0;
  const errors = Number(metrics.errors) || 0;
  const skipCount = Number(metrics.skipCount) || 0;

  let state = "CONFIDENT";
  let confidence = 0.9;
  let reason = "Smooth, continuous progress.";

  if (errors >= 3 || hesitateCount >= 4) {
    state = "CONFUSED";
    confidence = 0.88;
    reason = "Repeated wrong answers or heavy hesitation dragging.";
  } else if (hesitateCount >= 2 || errors >= 1 || pauseDuration > 18000) {
    state = "HESITANT";
    confidence = 0.6;
    reason = "Slow pause time or slight back-and-forth adjustments.";
  } else if (skipCount >= 1 && errors === 0) {
    state = "GUESSING";
    confidence = 0.75;
    reason = "User skipped forward without interacting or checking work.";
  }

  return {
    state,
    confidence,
    reason
  };
}
