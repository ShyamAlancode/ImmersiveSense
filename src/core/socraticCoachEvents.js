// ═══════════════════════════════════════════════════════
// src/core/socraticCoachEvents.js
// EventTarget bus for Socratic coach events.
// Allows socraticCoach.js (server-side) results to
// communicate with tutorController.js (client-side)
// without coupling them directly.
// ═══════════════════════════════════════════════════════

export const socraticCoachEvents = new EventTarget();

/**
 * Dispatch a correctAnswer event.
 * Called when the student demonstrates understanding.
 */
export function dispatchCorrectAnswer() {
  socraticCoachEvents.dispatchEvent(new CustomEvent('correctAnswer'));
}

/**
 * Dispatch a forceCalculation event.
 * Called when question count >= 3 and AI must show full solution.
 */
export function dispatchForceCalculation() {
  socraticCoachEvents.dispatchEvent(new CustomEvent('forceCalculation'));
}

/**
 * Dispatch a confusion event with state.
 * @param {'HESITANT'|'CONFUSED'|'GUESSING'} state
 */
export function dispatchConfusion(state) {
  socraticCoachEvents.dispatchEvent(new CustomEvent('confusion', { detail: { state } }));
}

export default socraticCoachEvents;
