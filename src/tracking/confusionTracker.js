/**
 * Client-Side Confusion Tracker (Layer 5)
 * Tracks user micro-interactions: hesitation, pause, errors, and skips.
 */

export class ConfusionTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.stageStartTime = Date.now();
    this.firstInteractTime = null;
    this.hesitateCount = 0;
    this.errors = 0;
    this.skipCount = 0;
    this.lastPos = null;
    this.lastDir = null;
  }

  recordInteraction() {
    if (!this.firstInteractTime) {
      this.firstInteractTime = Date.now();
    }
  }

  /**
   * Tracks dragging vector direction shifts to detect hesitation back-and-forth.
   * @param {object} currentPos - { x, y, z }
   */
  recordDrag(currentPos) {
    this.recordInteraction();
    if (!currentPos) return;

    if (!this.lastPos) {
      this.lastPos = { ...currentPos };
      return;
    }

    const dx = currentPos.x - this.lastPos.x;
    const dy = currentPos.y - this.lastPos.y;
    const dz = currentPos.z - this.lastPos.z;

    // Filter tiny tremors
    const currentDir = {
      x: dx > 0.02 ? 1 : dx < -0.02 ? -1 : 0,
      y: dy > 0.02 ? 1 : dy < -0.02 ? -1 : 0,
      z: dz > 0.02 ? 1 : dz < -0.02 ? -1 : 0
    };

    if (this.lastDir) {
      const reversed = 
        (currentDir.x !== 0 && this.lastDir.x !== 0 && currentDir.x !== this.lastDir.x) ||
        (currentDir.y !== 0 && this.lastDir.y !== 0 && currentDir.y !== this.lastDir.y) ||
        (currentDir.z !== 0 && this.lastDir.z !== 0 && currentDir.z !== this.lastDir.z);

      if (reversed) {
        this.hesitateCount += 1;
      }
    }

    if (currentDir.x !== 0 || currentDir.y !== 0 || currentDir.z !== 0) {
      this.lastDir = { ...currentDir };
    }
    this.lastPos = { ...currentPos };
  }

  recordError() {
    this.errors += 1;
  }

  recordSkip() {
    this.skipCount += 1;
  }

  /**
   * Returns current interaction metrics.
   */
  getMetrics() {
    const now = Date.now();
    const pauseDuration = this.firstInteractTime 
      ? this.firstInteractTime - this.stageStartTime 
      : now - this.stageStartTime;

    return {
      pauseDuration,
      hesitateCount: this.hesitateCount,
      errors: this.errors,
      skipCount: this.skipCount
    };
  }
}

export const confusionTracker = new ConfusionTracker();
