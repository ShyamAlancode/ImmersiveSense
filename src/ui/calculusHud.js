export class CalculusHud {
  constructor(simulationManager, onWhyClick) {
    this.simManager = simulationManager;
    this.onWhyClick = onWhyClick;
    this.activeModality = "geometric";
    
    // DOM references
    this.hudEl = null;
    this.modalityTabs = [];
    this.riemannGroup = null;
    this.riemannSlider = null;
    this.riemannValue = null;
    this.derivativeGroup = null;
    this.playPauseBtn = null;
    this.tangentSlider = null;
    this.limitGroup = null;
    this.zoomBtn = null;
    this.whyBtn = null;
    this.layersToggle = null;
    this.layersBody = null;
  }

  init() {
    this.hudEl = document.getElementById("calculusHud");
    if (!this.hudEl) return;

    // Modality tabs
    this.modalityTabs = Array.from(this.hudEl.querySelectorAll(".modality-tab"));
    this.modalityTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.setModality(tab.dataset.modality);
      });
    });

    // Riemann sum controls
    this.riemannGroup = this.hudEl.querySelector(".riemann-controls");
    this.riemannSlider = document.getElementById("riemannSlider");
    this.riemannValue = document.getElementById("riemannValue");
    if (this.riemannSlider) {
      this.riemannSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.riemannValue) this.riemannValue.textContent = val;
        this.simManager.updateRiemannPartitions(val);
      });
    }

    // Derivative/Tangent controls
    this.derivativeGroup = this.hudEl.querySelector(".derivative-controls");
    this.playPauseBtn = document.getElementById("playPauseBtn");
    this.tangentSlider = document.getElementById("tangentSlider");
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener("click", () => {
        this.togglePlayPause();
      });
    }
    if (this.tangentSlider) {
      this.tangentSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.simManager.updateTangentPosition(val);
      });
    }

    // Limit controls
    this.limitGroup = this.hudEl.querySelector(".limit-controls");
    this.zoomBtn = document.getElementById("limitZoomBtn");
    if (this.zoomBtn) {
      this.zoomBtn.addEventListener("click", () => {
        this.triggerLimitZoom();
      });
    }

    // Socratic Ask
    this.whyBtn = document.getElementById("calculusWhyBtn");
    if (this.whyBtn) {
      this.whyBtn.addEventListener("click", () => {
        if (this.onWhyClick) {
          this.onWhyClick(this.activeModality);
        }
      });
    }

    // Thinking layers drawer
    this.layersToggle = this.hudEl.querySelector(".layers-header");
    this.layersBody = this.hudEl.querySelector(".layers-body");
    if (this.layersToggle && this.layersBody) {
      this.layersToggle.addEventListener("click", () => {
        const isCollapsed = this.layersBody.classList.contains("hidden");
        if (isCollapsed) {
          this.layersBody.classList.remove("hidden");
          this.layersToggle.querySelector(".arrow").innerHTML = "&#9662;";
        } else {
          this.layersBody.classList.add("hidden");
          this.layersToggle.querySelector(".arrow").innerHTML = "&#9656;";
        }
      });
    }
  }

  show(metadata) {
    if (!this.hudEl) this.init();
    if (!this.hudEl) return;

    this.hudEl.classList.remove("hidden");
    
    const mode = metadata.simulationMode || "derivative";
    
    // Show/hide correct control sections
    if (this.riemannGroup) {
      if (mode === "integral") this.riemannGroup.classList.remove("hidden");
      else this.riemannGroup.classList.add("hidden");
    }

    if (this.derivativeGroup) {
      if (mode === "derivative") this.derivativeGroup.classList.remove("hidden");
      else this.derivativeGroup.classList.add("hidden");
    }

    if (this.limitGroup) {
      if (mode === "limit") this.limitGroup.classList.remove("hidden");
      else this.limitGroup.classList.add("hidden");
    }

    // Populate partition slider value
    if (this.riemannSlider && this.riemannValue) {
      this.riemannSlider.value = metadata.riemannPartitions || 12;
      this.riemannValue.textContent = this.riemannSlider.value;
    }

    // Populate tangent slider value
    if (this.tangentSlider) {
      this.tangentSlider.value = metadata.tangentPointX ?? 1.0;
    }

    // Populate Thinking Layers
    const layers = metadata.thinkingLayers || {};
    const layersMapping = {
      "layerSymmetry": layers.symmetry || "No explicit symmetry.",
      "layerSubstitution": layers.substitution || "None.",
      "layerBehavior": layers.graphBehavior || "Continuous function.",
      "layerMonotonicity": layers.monotonicity || "Increases/decreases across intervals.",
      "layerExtrema": layers.extrema || "Find via f'(x) = 0.",
      "layerConstraints": layers.hiddenConstraints || "None.",
      "layerGeo": layers.geometricInterpretation || "Visual graph plotting."
    };

    for (const [id, value] of Object.entries(layersMapping)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
  }

  hide() {
    if (this.hudEl) {
      this.hudEl.classList.add("hidden");
    }
  }

  setModality(modality) {
    this.activeModality = modality;
    this.modalityTabs.forEach((tab) => {
      if (tab.dataset.modality === modality) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    // Notify user of explanation shift in a micro-interaction hint
    const statusEl = document.getElementById("questionStatus");
    if (statusEl) {
      statusEl.textContent = `Explanation style shifted to: ${modality.toUpperCase()}`;
      statusEl.classList.remove("hidden");
      setTimeout(() => {
        statusEl.classList.add("hidden");
      }, 2000);
    }
  }

  togglePlayPause() {
    this.simManager.isPaused = !this.simManager.isPaused;
    if (this.playPauseBtn) {
      this.playPauseBtn.textContent = this.simManager.isPaused ? "Play Animation" : "Pause Animation";
      this.playPauseBtn.className = this.simManager.isPaused ? "hud-action-btn is-paused" : "hud-action-btn";
    }
  }

  triggerLimitZoom() {
    const camera = this.simManager.world?.camera;
    const controls = this.simManager.world?.controls;
    if (!camera || !controls) return;

    // Zoom camera focused on the limit target point x0
    const targetX = this.simManager.limitTargetX;
    const targetY = evalFunction(this.simManager.functionExpression, targetX);

    // Smoothly animate controls target
    controls.target.set(targetX, targetY, 0);
    
    // Zoom in closer (e.g. move camera closer on Z axis)
    const zoomPosition = new THREE.Vector3(targetX, targetY + 2.5, 4.5);
    
    // Quick camera slide transition
    let progress = 0;
    const startPos = camera.position.clone();
    const animateZoom = () => {
      progress += 0.08;
      if (progress <= 1.0) {
        camera.position.lerpVectors(startPos, zoomPosition, progress);
        controls.update();
        requestAnimationFrame(animateZoom);
      }
    };
    animateZoom();
  }
}

// Utility to re-evaluate function inside HUD zoom
function evalFunction(expr, x) {
  try {
    const cleanExpr = expr.replace(/\^/g, "**");
    const fn = new Function("x", "Math", `with(Math) { return (${cleanExpr}); }`);
    const val = fn(x, Math);
    return Number.isFinite(val) ? val : 0;
  } catch (e) {
    return 0;
  }
}
