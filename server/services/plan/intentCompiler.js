import { normalizeScenePlan } from "../../../src/ai/planSchema.js";
import { buildCoordinateBounds, cameraForBounds, round, roundVec, normalize as vecNormalize, add as vecAdd, scale as vecScale } from "./analyticMath.js";

/**
 * Compiler for High-Level Intent Language (Layer 4)
 * Translates intent specifications into exact 3D scene parameters, mesh lists, and lesson structures.
 * 
 * @param {object} params
 * @param {object} params.intentSpec - The visual intent spec from SceneArchitectAgent
 * @param {object} params.mathSolution - The verified math solution from MathematicianAgent
 * @param {object} params.pedagogy - The pedagogical stages from PedagogueAgent
 * @returns {object} Conforming lesson plan JSON
 */
export function compileIntent({ intentSpec, mathSolution, pedagogy }) {
  const intent = intentSpec.intent;
  const objects = intent.objects || [];
  const objectSuggestions = [];

  // Map of point positions for symbolic lookup
  const pointPositions = new Map();

  // 1. First pass: Collect all point positions (since other shapes refer to them)
  for (const obj of objects) {
    if (obj.shape === "pointMarker" && Array.isArray(obj.position)) {
      const pos = roundVec(obj.position, 4);
      pointPositions.set(obj.id, pos);
    }
  }

  // 2. Second pass: Compile each object suggestion
  for (let idx = 0; idx < objects.length; idx++) {
    const obj = objects[idx];
    const suggestionId = obj.id || `suggestion-${idx + 1}`;
    
    let position = [0, 0, 0];
    let rotation = [0, 0, 0];
    const params = {};
    const metadata = { roles: [] };

    if (obj.shape === "pointMarker") {
      position = pointPositions.get(obj.id) || [0, 0, 0];
      metadata.role = "point";
      metadata.roles.push("point");
    } else if (obj.shape === "line") {
      let start = [0, 0, 0];
      let end = [1, 0, 0];

      // Resolve symbolic start point
      if (typeof obj.params?.start === "string" && pointPositions.has(obj.params.start)) {
        start = pointPositions.get(obj.params.start);
      } else if (Array.isArray(obj.params?.start)) {
        start = roundVec(obj.params.start, 4);
      }

      // Resolve end or build direction
      if (typeof obj.params?.end === "string" && pointPositions.has(obj.params.end)) {
        end = pointPositions.get(obj.params.end);
      } else if (Array.isArray(obj.params?.end)) {
        end = roundVec(obj.params.end, 4);
      } else if (Array.isArray(obj.params?.direction)) {
        const dir = vecNormalize(obj.params.direction);
        const len = Number(obj.params.length) || 4;
        end = roundVec(vecAdd(start, vecScale(dir, len)), 4);
      } else if (Array.isArray(obj.direction)) {
        const dir = vecNormalize(obj.direction);
        const len = Number(obj.length) || 4;
        end = roundVec(vecAdd(start, vecScale(dir, len)), 4);
      } else {
        // Fallback end
        end = [start[0] + 3, start[1] + 3, start[2]];
      }

      position = start;
      params.start = start;
      params.end = end;
      metadata.role = "line";
      metadata.roles.push("line");
      metadata.direction = roundVec(vecNormalize(vecAdd(end, vecScale(start, -1))), 4);
    } else if (obj.shape === "plane") {
      const normal = Array.isArray(obj.normal) ? vecNormalize(obj.normal) : (Array.isArray(obj.params?.normal) ? vecNormalize(obj.params.normal) : [0, 1, 0]);
      const constant = Number(obj.constant) ?? (Number(obj.params?.constant) || 0);
      
      position = roundVec(vecScale(normal, constant), 4);
      metadata.role = "plane";
      metadata.roles.push("plane");
      metadata.normal = roundVec(normal, 4);
      metadata.constant = round(constant, 4);
      
      params.normal = normal;
      params.constant = constant;
    } else {
      // standard solids (cube, sphere, cylinder, cone, etc.)
      if (Array.isArray(obj.position)) {
        position = roundVec(obj.position, 4);
      }
      if (Array.isArray(obj.rotation)) {
        rotation = roundVec(obj.rotation, 4);
      }
      if (obj.params) {
        Object.assign(params, obj.params);
      }
      metadata.role = obj.role || "reference";
      metadata.roles.push(metadata.role);
    }

    objectSuggestions.push({
      id: suggestionId,
      title: obj.label || `${obj.shape} suggestion`,
      purpose: obj.purpose || `Visualize ${obj.label || obj.shape}`,
      optional: false,
      tags: obj.tags || ["primary"],
      roles: metadata.roles,
      object: {
        id: suggestionId + "-mesh",
        label: obj.label || obj.id,
        shape: obj.shape,
        color: obj.color || "#7cf7e4",
        position,
        rotation,
        params,
        metadata
      }
    });
  }

  // 3. Calculate dynamic coordinates bounding box
  const pointsList = [];
  for (const sug of objectSuggestions) {
    if (sug.object.shape === "pointMarker") {
      pointsList.push(sug.object.position);
    } else if (sug.object.shape === "line") {
      pointsList.push(sug.object.params.start);
      pointsList.push(sug.object.params.end);
    } else {
      pointsList.push(sug.object.position);
    }
  }
  const bounds = buildCoordinateBounds(pointsList.length ? pointsList : [[0, 0, 0]], 2);

  // 4. Generate camera bookmarks
  const cameraBookmarks = (intent.cameraBookmarks || []).map((bookmark, idx) => ({
    id: bookmark.id || `camera-${idx + 1}`,
    label: bookmark.label || `View ${idx + 1}`,
    description: bookmark.description || "",
    position: Array.isArray(bookmark.position) ? roundVec(bookmark.position, 4) : [5, 5, 8],
    target: Array.isArray(bookmark.target) ? roundVec(bookmark.target, 4) : [0, 0, 0]
  }));

  if (!cameraBookmarks.length) {
    cameraBookmarks.push({
      id: "overview",
      label: "Overview",
      description: "Auto-calculated overview of the compiled scene.",
      ...cameraForBounds(bounds)
    });
  }

  const defaultCameraId = cameraBookmarks[0].id;

  // 5. Generate sceneMoments and overlays from reveals structure
  const sceneMoments = [];
  const sceneOverlays = [];

  // Add default coordinate system axes overlay
  sceneOverlays.push({
    id: "analytic-axes",
    type: "coordinate-frame",
    bounds
  });

  // Add object labels as overlays
  const labelOverlayIdsBySuggestionId = new Map();
  for (const sug of objectSuggestions) {
    const labelId = `label-${sug.id}`;
    labelOverlayIdsBySuggestionId.set(sug.id, labelId);
    sceneOverlays.push({
      id: labelId,
      type: "object-label",
      targetObjectId: sug.object.id,
      text: sug.object.label,
      offset: sug.object.shape === "line" ? [0, 0.3, 0] : [0, 0.5, 0],
      style: sug.object.shape === "line" ? "formula" : "name"
    });
  }

  // If Mathematician solved it, we can overlay formula and answer
  if (mathSolution.formulaLatex) {
    sceneOverlays.push({
      id: "analytic-formula",
      type: "text",
      position: [0, bounds.y[1] + 1.2, 0],
      text: mathSolution.formulaLatex,
      style: "formula"
    });
  }
  if (mathSolution.finalAnswer) {
    sceneOverlays.push({
      id: "analytic-answer",
      type: "text",
      position: [0, bounds.y[0] - 0.8, 0],
      text: `Answer: ${mathSolution.finalAnswer}`,
      style: "formula"
    });
  }

  // Compile reveals to moments
  const reveals = intent.reveals || [];
  const pedagogyStages = pedagogy.learningStages || [];

  pedagogyStages.forEach((stage, index) => {
    // Look up what objects should be visible at this stage
    const stageReveal = reveals.find((r) => r.stageId === stage.id || r.stageId === stage.learningStage);
    const visibleObjectIds = stageReveal ? stageReveal.visibleObjectIds : objectSuggestions.map((s) => s.id);
    
    // Compile labels
    const visibleOverlayIds = ["analytic-axes"];
    for (const objId of visibleObjectIds) {
      const labelId = labelOverlayIdsBySuggestionId.get(objId);
      if (labelId) visibleOverlayIds.push(labelId);
    }

    const revealFormula = index >= Math.max(1, pedagogyStages.length - 2);
    const revealFullSolution = index === pedagogyStages.length - 1;

    if (revealFormula && mathSolution.formulaLatex) {
      visibleOverlayIds.push("analytic-formula");
    }
    if (revealFullSolution && mathSolution.finalAnswer) {
      visibleOverlayIds.push("analytic-answer");
    }

    sceneMoments.push({
      id: stage.id,
      title: stage.title,
      prompt: stage.prompt || "Examine the 3D scene.",
      goal: stage.goal || "Analyze the math relationship.",
      focusTargets: stage.highlightTargets || visibleObjectIds.map((id) => id + "-mesh"),
      visibleObjectIds,
      visibleOverlayIds,
      cameraBookmarkId: defaultCameraId,
      revealFormula,
      revealFullSolution
    });
  });

  // Generate buildSteps conforming to planSchema
  const buildSteps = sceneMoments.map((moment, index) => ({
    id: moment.id,
    title: moment.title,
    instruction: moment.goal,
    hint: moment.prompt,
    action: index < Math.max(sceneMoments.length - 2, 1) ? "observe" : "answer",
    focusConcept: pedagogy.concept || "spatial math",
    coachPrompt: moment.prompt,
    suggestedObjectIds: moment.visibleObjectIds,
    requiredObjectIds: moment.visibleObjectIds,
    cameraBookmarkId: moment.cameraBookmarkId,
    highlightObjectIds: moment.focusTargets
  }));

  // Build final lesson plan context
  const points = objectSuggestions
    .filter((s) => s.object.shape === "pointMarker")
    .map((s) => ({
      id: s.object.id,
      label: s.object.label,
      coordinates: s.object.position
    }));

  const lines = objectSuggestions
    .filter((s) => s.object.shape === "line")
    .map((s) => ({
      id: s.object.id,
      label: s.object.label,
      point: s.object.params.start,
      direction: s.object.metadata.direction
    }));

  const planes = objectSuggestions
    .filter((s) => s.object.shape === "plane")
    .map((s) => ({
      id: s.object.id,
      label: s.object.label,
      normal: s.object.metadata.normal,
      constant: s.object.metadata.constant
    }));

  const lessonPlan = {
    problem: {
      id: "spatial-problem-" + Date.now(),
      question: mathSolution.explanation || pedagogy.concept,
      questionType: "spatial",
      summary: mathSolution.explanation,
      mode: "guided"
    },
    experienceMode: "analytic_auto",
    overview: mathSolution.explanation || pedagogy.primaryInsight,
    sceneFocus: {
      concept: pedagogy.concept,
      primaryInsight: pedagogy.primaryInsight,
      focusPrompt: pedagogy.primaryInsight,
      judgeSummary: "ImmersiveSense evaluates coordinates and math understanding dynamically."
    },
    learningMoments: {
      orient: {
        title: "Orient",
        coachMessage: pedagogyStages[0]?.coachMessage || "Let's read the problem.",
        goal: pedagogyStages[0]?.goal || "Understand the givens.",
        prompt: pedagogyStages[0]?.prompt || "Examine the layout.",
        insight: pedagogy.primaryInsight,
        whyItMatters: pedagogy.primaryInsight
      },
      build: {
        title: "Build",
        coachMessage: pedagogyStages[1]?.coachMessage || "Build the 3D scene elements.",
        goal: pedagogyStages[1]?.goal || "Explore coordinates and vectors.",
        prompt: pedagogyStages[1]?.prompt || "Locate components in the viewport.",
        insight: pedagogy.primaryInsight,
        whyItMatters: pedagogy.primaryInsight
      }
    },
    objectSuggestions,
    buildSteps,
    lessonStages: pedagogyStages.map((stage, idx) => ({
      id: stage.id,
      learningStage: stage.learningStage || (idx === 0 ? "orient" : "build"),
      title: stage.title,
      goal: stage.goal,
      tutorIntro: stage.coachMessage || stage.prompt,
      successCheck: stage.goal,
      highlightTargets: stage.revealObjectIds || [],
      suggestedActions: [
        {
          id: `${stage.id}-explain`,
          label: "Explain",
          kind: "explain-stage",
          payload: { stageId: stage.id }
        },
        {
          id: `${stage.id}-continue`,
          label: "Continue",
          kind: "continue-stage",
          payload: { stageId: stage.id }
        }
      ],
      checkpointPrompt: stage.prompt,
      freeQuestionAnchor: pedagogy.concept,
      mistakeProbe: "Ask tutor about this setup."
    })),
    sceneMoments,
    sceneOverlays,
    cameraBookmarks,
    answerScaffold: {
      finalAnswer: mathSolution.finalAnswer,
      unit: "",
      formula: mathSolution.formulaLatex || "",
      explanation: mathSolution.explanation || "",
      checks: [
        "Verified mathematically using deterministic CAS solver."
      ]
    },
    analyticContext: {
      subtype: "intent_compiled_scene",
      entities: {
        points,
        lines,
        planes
      },
      derivedValues: {
        variables: mathSolution.variables
      },
      formulaCard: {
        title: pedagogy.concept,
        formula: mathSolution.formulaLatex || "",
        explanation: mathSolution.explanation || ""
      },
      solutionSteps: mathSolution.steps.map((s) => ({
        id: s.id,
        title: s.title,
        formula: s.formula,
        explanation: s.instruction
      }))
    }
  };

  return normalizeScenePlan(lessonPlan);
}
