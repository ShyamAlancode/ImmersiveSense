import * as THREE from "three";

function evalFunction(expr, x, y = 0) {
  try {
    const cleanExpr = expr.replace(/\^/g, "**");
    // Bind common Math functions
    const MathFuncs = {
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
      log: Math.log, exp: Math.exp, sqrt: Math.sqrt,
      pow: Math.pow, abs: Math.abs, PI: Math.PI, E: Math.E,
      sin: Math.sin, cos: Math.cos, tan: Math.tan
    };
    const fn = new Function("x", "y", "Math", `with(Math) { return (${cleanExpr}); }`);
    const val = fn(x, y, Math);
    return Number.isFinite(val) ? val : 0;
  } catch (e) {
    return 0;
  }
}

export class CalculusSimulationManager {
  constructor(world, sceneApi) {
    this.world = world;
    this.sceneApi = sceneApi;
    this.group = new THREE.Group();
    this.group.name = "calculus-simulation-manager";
    this.world.scene.add(this.group);

    // Active state
    this.isActive = false;
    this.functionExpression = "x*x";
    this.simulationMode = "derivative";
    this.tangentPointX = 1.0;
    this.riemannPartitions = 12;
    this.integrationBounds = [0, 2];
    this.limitTargetX = 0.0;
    this.thinkingLayers = {};

    // Animation & Drag state
    this.isPaused = false;
    this.animationTime = 0;
    this.lastTime = performance.now();
    this.deltaLimitApproximation = 1.5; // for limit zoom animation
    this.isDragging = false;

    // Visual elements groups
    this.curveGroup = new THREE.Group();
    this.tangentGroup = new THREE.Group();
    this.riemannGroup = new THREE.Group();
    this.limitGroup = new THREE.Group();
    this.diffeqGroup = new THREE.Group();

    this.group.add(this.curveGroup);
    this.group.add(this.tangentGroup);
    this.group.add(this.riemannGroup);
    this.group.add(this.limitGroup);
    this.group.add(this.diffeqGroup);

    // Draggable point mesh reference
    this.tangentMarker = null;
    
    // Differential equation flow tracers
    this.tracerParticles = [];
  }

  clearGroup(g) {
    while (g.children.length > 0) {
      const child = g.children[0];
      g.remove(child);
      if (child.geometry?.dispose) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    }
  }

  clearAllVisuals() {
    this.clearGroup(this.curveGroup);
    this.clearGroup(this.tangentGroup);
    this.clearGroup(this.riemannGroup);
    this.clearGroup(this.limitGroup);
    this.clearGroup(this.diffeqGroup);
    this.tangentMarker = null;
    this.tracerParticles = [];
  }

  collectSimulationConfig() {
    const snapshot = this.sceneApi?.snapshot?.() || { objects: [] };
    const simObject = snapshot.objects?.find(
      (obj) => obj.metadata?.isCalculusSimulation || obj.id === "calculus-simulation"
    );

    if (!simObject) {
      if (this.isActive) {
        this.isActive = false;
        this.clearAllVisuals();
        this.group.visible = false;
      }
      return null;
    }

    this.isActive = true;
    this.group.visible = true;

    const meta = simObject.metadata || {};
    
    // We only trigger rebuild if these core properties changed
    const signature = `${meta.functionExpression}|${meta.simulationMode}`;
    const oldSignature = `${this.functionExpression}|${this.simulationMode}`;

    this.functionExpression = meta.functionExpression || "x*x";
    this.simulationMode = meta.simulationMode || "derivative";
    this.thinkingLayers = meta.thinkingLayers || {};

    if (signature !== oldSignature) {
      // Re-initialize default inputs
      this.tangentPointX = meta.tangentPointX ?? 1.0;
      this.riemannPartitions = meta.riemannPartitions ?? 12;
      this.integrationBounds = meta.integrationBounds || [0, 2];
      this.limitTargetX = meta.limitTargetX ?? 0.0;
      this.deltaLimitApproximation = 1.5;
      
      this.clearAllVisuals();
      this.buildCurve();
      this.buildModeVisuals();
    }

    return simObject;
  }

  buildCurve() {
    this.clearGroup(this.curveGroup);
    
    const expr = this.functionExpression;
    const startX = -5;
    const endX = 5;
    const segments = 100;
    const dx = (endX - startX) / segments;

    const points = [];
    for (let i = 0; i <= segments; i++) {
      const x = startX + i * dx;
      const y = evalFunction(expr, x);
      // Keep inside a reasonable vertical bounding box
      if (Number.isFinite(y) && Math.abs(y) < 10) {
        points.push(new THREE.Vector3(x, y, 0));
      }
    }

    // Render smooth curve using cylinders chain for visual presence
    const thickness = 0.06;
    const color = "#108a73";

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (this.world?.buildLineMesh) {
        const segmentMesh = this.world.buildLineMesh(start, end, thickness, color);
        this.curveGroup.add(segmentMesh);
      } else {
        // Fallback standard line
        const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
        this.curveGroup.add(new THREE.Line(geom, mat));
      }
    }
  }

  buildModeVisuals() {
    if (this.simulationMode === "derivative") {
      this.buildDerivativeVisuals();
    } else if (this.simulationMode === "integral") {
      this.buildIntegralVisuals();
    } else if (this.simulationMode === "limit") {
      this.buildLimitVisuals();
    } else if (this.simulationMode === "differential_equation") {
      this.buildDiffEqVisuals();
    }
  }

  buildDerivativeVisuals() {
    this.clearGroup(this.tangentGroup);

    // 1. Draggable marker point on the curve
    const x = this.tangentPointX;
    const y = evalFunction(this.functionExpression, x);

    const markerGeo = new THREE.SphereGeometry(0.16, 24, 20);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xd19304,
      depthTest: false,
      depthWrite: false
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, y, 0);
    marker.renderOrder = 15;
    marker.userData = { isCalculusDraggable: true };
    this.tangentGroup.add(marker);
    this.tangentMarker = marker;

    // 2. Tangent line segment
    const h = 0.0001;
    const yPlus = evalFunction(this.functionExpression, x + h);
    const yMinus = evalFunction(this.functionExpression, x - h);
    const slope = (yPlus - yMinus) / (2 * h);

    const dir = new THREE.Vector3(1, slope, 0).normalize();
    const start = marker.position.clone().addScaledVector(dir, -1.8);
    const end = marker.position.clone().addScaledVector(dir, 1.8);

    if (this.world?.buildLineMesh) {
      const tangentLine = this.world.buildLineMesh(start, end, 0.08, "#d19304");
      this.tangentGroup.add(tangentLine);
    } else {
      const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffde72 });
      this.tangentGroup.add(new THREE.Line(geom, mat));
    }
  }

  buildIntegralVisuals() {
    this.clearGroup(this.riemannGroup);

    const [a, b] = this.integrationBounds;
    const N = this.riemannPartitions;
    const dx = (b - a) / N;
    const expr = this.functionExpression;

    const barColor = new THREE.Color("#1075a3");

    for (let i = 0; i < N; i++) {
      const xStart = a + i * dx;
      const xMid = xStart + dx / 2;
      const h = evalFunction(expr, xMid);

      const height = Math.abs(h);
      if (height < 0.01) continue;

      const barGeo = new THREE.BoxGeometry(dx * 0.94, height, 0.15);
      const barMat = new THREE.MeshStandardMaterial({
        color: barColor,
        transparent: true,
        opacity: 0.44,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const bar = new THREE.Mesh(barGeo, barMat);
      // Center of box must sit at height/2, either positive or negative
      const posY = h >= 0 ? height / 2 : -height / 2;
      bar.position.set(xMid, posY, 0);
      this.riemannGroup.add(bar);

      // Add a small top edge line for visual clarity
      const edgeGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xStart, h, 0.08),
        new THREE.Vector3(xStart + dx, h, 0.08)
      ]);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x108a73, transparent: true, opacity: 0.8 });
      this.riemannGroup.add(new THREE.Line(edgeGeom, edgeMat));
    }
  }

  buildLimitVisuals() {
    this.clearGroup(this.limitGroup);

    const a = this.limitTargetX;
    const fa = evalFunction(this.functionExpression, a);
    
    // 1. Target limit point marker
    const targetGeo = new THREE.SphereGeometry(0.18, 24, 20);
    const targetMat = new THREE.MeshBasicMaterial({
      color: 0xc22b5e,
      depthTest: false,
      depthWrite: false
    });
    const targetMarker = new THREE.Mesh(targetGeo, targetMat);
    targetMarker.position.set(a, fa, 0);
    targetMarker.renderOrder = 15;
    this.limitGroup.add(targetMarker);

    // 2. Left and Right approximation points approaching 'a'
    const delta = this.deltaLimitApproximation;
    const xL = a - delta;
    const yL = evalFunction(this.functionExpression, xL);
    const xR = a + delta;
    const yR = evalFunction(this.functionExpression, xR);

    const approxGeo = new THREE.SphereGeometry(0.12, 16, 12);
    const leftMarker = new THREE.Mesh(approxGeo, new THREE.MeshBasicMaterial({ color: 0x1075a3 }));
    leftMarker.position.set(xL, yL, 0);
    const rightMarker = new THREE.Mesh(approxGeo, new THREE.MeshBasicMaterial({ color: 0x108a73 }));
    rightMarker.position.set(xR, yR, 0);
    this.limitGroup.add(leftMarker, rightMarker);

    // 3. Draw dashed vertical projection lines to axes
    if (this.world?.buildLineMesh) {
      const leftProject = this.world.buildLineMesh(new THREE.Vector3(xL, 0, 0), new THREE.Vector3(xL, yL, 0), 0.02, "#1075a3");
      const rightProject = this.world.buildLineMesh(new THREE.Vector3(xR, 0, 0), new THREE.Vector3(xR, yR, 0), 0.02, "#108a73");
      this.limitGroup.add(leftProject, rightProject);
    }
  }

  buildDiffEqVisuals() {
    this.clearGroup(this.diffeqGroup);
    this.tracerParticles = [];

    // dy/dx = f(x,y). We draw a grid of direction vector arrows.
    const stepsX = 9;
    const stepsY = 7;
    const minX = -4, maxX = 4;
    const minY = -1, maxY = 5;

    const dx = (maxX - minX) / (stepsX - 1);
    const dy = (maxY - minY) / (stepsY - 1);

    const arrowColor = new THREE.Color("#2b4d79");

    for (let i = 0; i < stepsX; i++) {
      for (let j = 0; j < stepsY; j++) {
        const x = minX + i * dx;
        const y = minY + j * dy;

        // Vector slope
        const slope = evalFunction(this.functionExpression, x, y);
        const dir = new THREE.Vector3(1, slope, 0).normalize();
        const start = new THREE.Vector3(x, y, 0).addScaledVector(dir, -0.22);
        const end = new THREE.Vector3(x, y, 0).addScaledVector(dir, 0.22);

        if (this.world?.buildLineMesh) {
          const arrowLine = this.world.buildLineMesh(start, end, 0.02, "#344e75");
          this.diffeqGroup.add(arrowLine);
        }
      }
    }

    // Setup animated flow tracers
    const particleCount = 18;
    for (let k = 0; k < particleCount; k++) {
      this.tracerParticles.push({
        position: new THREE.Vector3(
          THREE.MathUtils.lerp(minX, maxX, Math.random()),
          THREE.MathUtils.lerp(minY, maxY, Math.random()),
          0
        ),
        life: Math.random() * 4 + 1
      });
    }

    // Geometry container for point tracers
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let k = 0; k < particleCount; k++) {
      const p = this.tracerParticles[k];
      positions[k * 3 + 0] = p.position.x;
      positions[k * 3 + 1] = p.position.y;
      positions[k * 3 + 2] = p.position.z;
      
      colors[k * 3 + 0] = 0.56; // Light cyan tint
      colors[k * 3 + 1] = 0.97;
      colors[k * 3 + 2] = 0.89;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.16,
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      depthWrite: false,
      sizeAttenuation: true
    });

    const pointsMesh = new THREE.Points(geom, mat);
    pointsMesh.name = "diff-eq-tracers";
    this.diffeqGroup.add(pointsMesh);
  }

  updateTracers(dt) {
    const pointsMesh = this.diffeqGroup.getObjectByName("diff-eq-tracers");
    if (!pointsMesh || !this.tracerParticles.length) return;

    const positions = pointsMesh.geometry.attributes.position.array;
    const minX = -4, maxX = 4;
    const minY = -1, maxY = 5;

    this.tracerParticles.forEach((p, idx) => {
      p.life -= dt;
      const slope = evalFunction(this.functionExpression, p.position.x, p.position.y);
      const dir = new THREE.Vector3(1, slope, 0).normalize();
      
      // Euler step
      p.position.addScaledVector(dir, dt * 1.5);

      const outOfBounds = (
        p.position.x < minX || p.position.x > maxX ||
        p.position.y < minY || p.position.y > maxY
      );

      if (p.life <= 0 || outOfBounds) {
        // Respawn
        p.position.set(
          THREE.MathUtils.lerp(minX, maxX - 1, Math.random()),
          THREE.MathUtils.lerp(minY, maxY, Math.random()),
          0
        );
        p.life = Math.random() * 4 + 1.5;
      }

      positions[idx * 3 + 0] = p.position.x;
      positions[idx * 3 + 1] = p.position.y;
      positions[idx * 3 + 2] = p.position.z;
    });

    pointsMesh.geometry.attributes.position.needsUpdate = true;
  }

  updateTangentPosition(newX) {
    this.tangentPointX = THREE.MathUtils.clamp(newX, -4.5, 4.5);
    this.buildDerivativeVisuals();
  }

  updateRiemannPartitions(count) {
    this.riemannPartitions = Math.max(2, Math.min(60, count));
    this.buildIntegralVisuals();
  }

  update(now = performance.now()) {
    const simObject = this.collectSimulationConfig();
    if (!simObject) return;

    const dt = Math.min(0.05, Math.max(0.008, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.isPaused) {
      this.animationTime += dt;

      if (this.simulationMode === "derivative" && !this.isDragging) {
        // Slide tangent point smoothly along the curve
        const animateX = Math.sin(this.animationTime * 0.8) * 3.5;
        this.updateTangentPosition(animateX);
      }

      if (this.simulationMode === "limit") {
        // Smoothly approach limit delta towards 0
        this.deltaLimitApproximation = 0.05 + (Math.abs(Math.sin(this.animationTime * 0.4)) * 2.2);
        this.buildLimitVisuals();
      }

      if (this.simulationMode === "differential_equation") {
        this.updateTracers(dt);
      }
    }
  }

  handlePointerDown(raycaster) {
    if (!this.isActive || this.simulationMode !== "derivative" || !this.tangentMarker) return false;

    const intersections = raycaster.intersectObject(this.tangentMarker);
    if (intersections.length > 0) {
      this.isDragging = true;
      this.world?.setControlsEnabled?.(false);
      return true;
    }
    return false;
  }

  handlePointerMove(raycaster) {
    if (!this.isActive || !this.isDragging) return false;

    // Intersect plane Z=0 to find projection point
    const xyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(xyPlane, hitPoint)) {
      this.updateTangentPosition(hitPoint.x);
      return true;
    }
    return false;
  }

  handlePointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.world?.setControlsEnabled?.(true);
      return true;
    }
    return false;
  }
}
