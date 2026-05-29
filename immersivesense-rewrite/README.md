# ImmersiveSense — UI Rewrite Integration Guide

## What This Package Contains

This package contains **drop-in replacements** for your existing files.
The CAS engine, lesson planners, API routes, and test files are **not touched**.

```
immersivesense-rewrite/

├── src/
│   ├── state/
│   │   └── sceneContextStore.js         ← analyse and review and the modify current and replace
│   ├── core/
│   │   └── socraticCoachEvents.js       ← analyse and review and the modify current and replace — EventTarget event bus
│   ├── ui/
│   │   └── tutorController.js           ←analyse and review and the modify current and replace tutorController.js
│   └── scene/
│       └── worldPatch.js                ← analyse and review and the modify current and replace apply after world.js init
└── server/
    ├── config.js                        ← analyse and review and the modify current and replace
     existing config.js
    └── services/
        ├── freeformTutor.js             ← analyse and review and the modify current and replace existing freeformTutor.js
        └── pedagogy/
            └── socraticCoach.js         ← analyse and review and the modify current and replace existing socraticCoach.js
```

---





1  — Wire worldPatch.js into your existing world.js

At the end of your world.js `init()` function, add:

```javascript
import { applyWorldPatch } from './worldPatch.js';

// At the end of your init/setup function:
applyWorldPatch(world);

// When all 3D objects are rendered, call:
world.notifySceneReady(
  ['L1 direction vector', 'L2 direction vector', 'shortest distance connector'],
  'skew_lines',
  currentSceneSpec
);

// In your controls.addEventListener('change', ...) handler:
world.notifyOrbitChange();
```

---

## Step 2 — Wire tutorController.js into your existing main.js

```javascript
import { initTutorController, setPlan } from './ui/tutorController.js';

// On app boot:
initTutorController();

// When a new lesson plan arrives from /api/plan:
setPlan(plan);

// Export world to window for tutorController access:
window.world = world;
```

---

## Step 3 — Update tutor.js route SSE streaming

Your existing `server/routes/tutor.js` must pass `writeChunk` to `generateFreeformTutorTurn`.
The `writeChunk` function must serialize and emit SSE events:

```javascript
// In your Hono SSE handler:
const writeChunk = ({ event, data }) => {
  const eventStr = event || 'text';
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  c.write(`event: ${eventStr}\ndata: ${dataStr}\n\n`);
};

await generateFreeformTutorTurn({
  message,
  sessionId,
  plan,
  sceneContext,
  confusionMetrics,
  writeChunk,
});
```

---

## Step 4 — Verify tests still pass

```bash
npm test
```

All 251 tests should still pass because:
- CAS engine untouched
- Lesson planners untouched
- API routes only need the writeChunk wiring above
- New files are additions, not destructive replacements

---

## What Changed vs Before

| Problem | Fix |
|---|---|
| Socratic questions looped forever | 3-question limit → forces full answer |
| Generic "What should I notice?" buttons | Context-specific buttons from visibleObjects |
| MutationObserver auto-advanced moment strip | Event-driven: sceneReady → observe, orbit → explore, correctAnswer → predict |
| AI didn't reference scene objects | System prompt forces every response to name a specific visible object |
| Two pipelines conflicting | USE_PROGRESSIVE_STAGES flag — one pipeline active at a time |
| Generic chatbot look | Full dark space observatory UI with glassmorphic panels |
| No thinking indicator | Shimmer bar shows while AI is processing |
| window.__latestSceneContext global | sceneContextStore.js module with setContext/getContext |

---


```

---

## Key IDs (unchanged for JS compatibility)

```
#tutor-chat           — scrollable chat container
#problem-pill-text    — problem pill text span
#moment-strip         — moment strip container
#mastery-derivatives  — mastery fill div
#mastery-limits
#mastery-integration
#mastery-chainrule
#session-concepts-explored
#session-critical-points
#session-chain-rule
#floatingFormula      — floating formula card
#three-canvas         — Three.js canvas
#scene-canvas         — canvas wrapper div
#worldMount           — CSS2DRenderer mount
```
