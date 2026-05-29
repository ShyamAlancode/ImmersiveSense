// ═══════════════════════════════════════════════════════
// src/scene/worldPatch.js
// EventTarget extension for world.js.
// IMPORTANT: Import this AFTER world.js initializes.
// Adds: sceneReady dispatch, objectHighlighted, highlightObject
//
// In your existing world.js, call:
//   import { applyWorldPatch } from './worldPatch.js';
//   // at end of init(): applyWorldPatch(world);
// ═══════════════════════════════════════════════════════

import { setContext, setStudentAction, addVisibleObject } from '../state/sceneContextStore.js';

/**
 * Extends a world object with EventTarget behavior
 * and ImmersiveSense-specific events.
 *
 * @param {Object} world - The world object returned by world.js
 * @returns {Object} world — mutated with EventTarget methods
 */
export function applyWorldPatch(world) {
  if (!world || world.__patched) return world;

  // Mix in EventTarget
  const et = new EventTarget();
  world.addEventListener    = et.addEventListener.bind(et);
  world.removeEventListener = et.removeEventListener.bind(et);
  world.dispatchEvent       = et.dispatchEvent.bind(et);
  world.__eventTarget       = et;
  world.__patched           = true;

  // ── sceneReady ───────────────────────────────────────
  /**
   * Call this after all scene objects are rendered.
   * @param {string[]} visibleObjects - names of rendered objects
   * @param {string} sceneType
   * @param {Object} sceneSpec
   */
  world.notifySceneReady = function(visibleObjects = [], sceneType = 'unknown', sceneSpec = null) {
    // Update context store
    setContext({ visibleObjects, sceneType, currentSceneSpec: sceneSpec });
    visibleObjects.forEach(name => addVisibleObject(name));

    // Update window global for legacy code
    window.__latestSceneContext = {
      visibleObjects,
      sceneType,
      currentSceneSpec: sceneSpec,
      studentAction: null,
    };

    // Dispatch to tutorController
    world.dispatchEvent(new CustomEvent('sceneReady', {
      detail: { visibleObjects, sceneType, sceneSpec },
    }));

    // Also dispatch on window for tutorController.js listener
    window.dispatchEvent(new CustomEvent('sceneReady', {
      detail: { visibleObjects, sceneType, sceneSpec },
    }));
  };

  // ── Orbit controls change tracking ──────────────────
  /**
   * Call this from your controls.addEventListener('change', ...) handler.
   */
  world.notifyOrbitChange = function() {
    setStudentAction('rotate');
    window.dispatchEvent(new CustomEvent('sceneOrbitChange'));
  };

  // ── highlightObject ──────────────────────────────────
  /**
   * Highlight a specific mesh in the scene.
   * @param {string} targetLabel - mesh label or special keys ('all_lines', 'all_solved')
   * @param {string} action - 'highlight_vector' | 'highlight_point' | 'highlight_plane' | 'pulse_connector' | 'show_label' | 'hide_label' | 'success'
   */
  world.highlightObject = function(targetLabel, action = 'highlight_vector') {
    if (!world.scene) {
      console.warn('[WorldPatch] highlightObject called before scene exists');
      return;
    }

    const durationMs = action === 'pulse_connector' ? 3000 : 1200;

    // Special case: all_lines or all_solved
    if (targetLabel === 'all_lines' || targetLabel === 'all_solved') {
      world.scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
          _pulseObject(obj, action, durationMs, world);
        }
      });
      return;
    }

    // Find by label/name
    let found = false;
    world.scene.traverse(obj => {
      const label = obj.userData?.label || obj.userData?.name || obj.name || '';
      if (!found && label.toLowerCase().includes(targetLabel.toLowerCase())) {
        _pulseObject(obj, action, durationMs, world);
        found = true;

        world.dispatchEvent(new CustomEvent('objectHighlighted', {
          detail: { label: targetLabel, action, object: obj },
        }));

        // Camera focus
        if (world.focusCameraOn) {
          world.focusCameraOn(obj);
        }
      }
    });

    if (!found) {
      console.warn(`[WorldPatch] highlightObject: no mesh found for "${targetLabel}"`);
    }
  };

  // ── Camera focus ─────────────────────────────────────
  /**
   * Smoothly tween OrbitControls target to center on an object.
   * @param {THREE.Object3D} obj
   */
  world.focusCameraOn = function(obj) {
    if (!world.controls || !obj) return;
    const target = world.controls.target;
    const pos = new (obj.position?.constructor || Object)();

    if (obj.geometry?.boundingSphere) {
      obj.geometry.computeBoundingSphere();
      obj.geometry.boundingSphere.center.clone().applyMatrix4(obj.matrixWorld).copy(pos);
    } else if (obj.position) {
      obj.position.clone().copy(pos);
    } else return;

    // Store original target to restore after 3s
    const origX = target.x, origY = target.y, origZ = target.z;
    const startTime = performance.now();
    const DURATION = 800;

    function tween(now) {
      const t = Math.min(1, (now - startTime) / DURATION);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out
      target.x = origX + (pos.x - origX) * ease;
      target.y = origY + (pos.y - origY) * ease;
      target.z = origZ + (pos.z - origZ) * ease;
      world.controls.update?.();
      if (t < 1) requestAnimationFrame(tween);
      else {
        // Restore after 3 seconds if user hasn't interacted
        setTimeout(() => {
          if (!world._userInteractedSinceFocus) {
            const backStart = performance.now();
            function tweenBack(now2) {
              const t2 = Math.min(1, (now2 - backStart) / DURATION);
              const e2 = t2 < 0.5 ? 2*t2*t2 : -1+(4-2*t2)*t2;
              target.x = pos.x + (origX - pos.x) * e2;
              target.y = pos.y + (origY - pos.y) * e2;
              target.z = pos.z + (origZ - pos.z) * e2;
              world.controls.update?.();
              if (t2 < 1) requestAnimationFrame(tweenBack);
            }
            requestAnimationFrame(tweenBack);
          }
        }, 3000);
      }
    }
    world._userInteractedSinceFocus = false;
    requestAnimationFrame(tween);

    if (world.controls) {
      world.controls.addEventListener('start', () => {
        world._userInteractedSinceFocus = true;
      }, { once: true });
    }
  };

  return world;
}

// ── Pulse animation ──────────────────────────────────────
function _pulseObject(obj, action, durationMs, world) {
  if (!obj.material) return;

  const origColor = obj.material.color?.clone();
  const origEmissive = obj.material.emissive?.clone();
  const origScale = obj.scale?.clone();

  const HIGHLIGHT_COLORS = {
    highlight_vector:  0x6366f1,  // indigo
    highlight_point:   0x14b8a6,  // teal
    highlight_plane:   0x6366f1,  // indigo
    pulse_connector:   0xf59e0b,  // gold
    success:           0x10b981,  // green
    show_label:        0x14b8a6,
  };

  const color = HIGHLIGHT_COLORS[action] || 0x6366f1;

  if (obj.material.emissive) {
    obj.material.emissive.setHex(color);
    obj.material.emissiveIntensity = 0.6;
  } else if (obj.material.color) {
    obj.material.color.setHex(color);
  }

  if (action !== 'highlight_plane' && obj.scale) {
    obj.scale.multiplyScalar(1.35);
  }

  setTimeout(() => {
    if (origColor && obj.material?.color) obj.material.color.copy(origColor);
    if (origEmissive && obj.material?.emissive) {
      obj.material.emissive.copy(origEmissive);
      obj.material.emissiveIntensity = 0;
    }
    if (origScale && obj.scale) obj.scale.copy(origScale);
  }, durationMs);
}
