let latestContext = {
  currentSceneSpec: null,
  visibleObjects: [],
  studentAction: "click"
};

export function setContext(context = {}) {
  latestContext = {
    currentSceneSpec: context.currentSceneSpec || null,
    visibleObjects: Array.isArray(context.visibleObjects) ? context.visibleObjects : [],
    studentAction: context.studentAction || "click"
  };
}

export function getContext() {
  return { ...latestContext };
}
