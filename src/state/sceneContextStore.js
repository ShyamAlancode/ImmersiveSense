// ═══════════════════════════════════════════════════════
// src/state/sceneContextStore.js
// Replaces window.__latestSceneContext with a clean module.
// Shared between sceneRuntime.js and tutorController.js
// ═══════════════════════════════════════════════════════

let _context = {
  currentSceneSpec: null,
  visibleObjects: [],
  sceneType: 'unknown',
  studentAction: null,
  timestamp: null,
};

/**
 * Update the current scene context.
 * Called by sceneRuntime.js whenever the scene changes.
 * @param {Object} ctx
 */
export function setContext(ctx) {
  _context = {
    ..._context,
    ...ctx,
    timestamp: Date.now(),
  };
  // Keep window global in sync for legacy code paths
  window.__latestSceneContext = _context;
}

/**
 * Get the current scene context snapshot.
 * @returns {Object}
 */
export function getContext() {
  return { ..._context };
}

/**
 * Update just the student action field (e.g. 'rotate', 'drag', 'click').
 * @param {string} action
 */
export function setStudentAction(action) {
  _context.studentAction = action;
  _context.timestamp = Date.now();
  if (window.__latestSceneContext) {
    window.__latestSceneContext.studentAction = action;
  }
}

/**
 * Reset context when a new question is submitted.
 */
export function resetContext() {
  _context = {
    currentSceneSpec: null,
    visibleObjects: [],
    sceneType: 'unknown',
    studentAction: null,
    timestamp: null,
  };
  window.__latestSceneContext = _context;
}

/**
 * Add a visible object to the context.
 * @param {string} name
 */
export function addVisibleObject(name) {
  if (!_context.visibleObjects.includes(name)) {
    _context.visibleObjects = [..._context.visibleObjects, name];
    if (window.__latestSceneContext) {
      window.__latestSceneContext.visibleObjects = _context.visibleObjects;
    }
  }
}

export default { setContext, getContext, setStudentAction, resetContext, addVisibleObject };
