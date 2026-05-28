import { normalizeScenePlan } from "../../../src/ai/planSchema.js";
import { converseWithModelFailover } from "../modelInvoker.js";
import { cleanupJson } from "./shared.js";
import { buildTextLessonBoard } from "./textBoard.js";

const CALCULUS_PLANNER_SYSTEM_PROMPT = `You are a specialized Calculus Tutor Agent in a mathematical reasoning environment.
Your job is to deconstruct a student's calculus question and generate an interactive simulation scene plan.

Analyze the question and determine:
1. The mathematical function expression f(x) or differential equation dy/dx = f(x, y) written in clean JS math notation (e.g., "Math.sin(x)", "x*x - 3*x", "y").
2. The simulation type: "derivative" | "integral" | "limit" | "differential_equation".
3. Key numerical settings:
   - For "derivative": default tangent point x0 (e.g. 1.0).
   - For "integral": integration bounds [lower, upper] (e.g. [0, 2]).
   - For "limit": limit target x -> a (e.g. 0).
   - For "differential_equation": range bounds or tracer start position.
4. Mathematical solution steps with KaTeX formulas.
5. Socratic "thinking layers" that externalize expert-level intuition. You must identify:
   - Symmetry: (e.g. "odd function since f(-x) = -f(x)", "periodic with period 2pi").
   - Substitution hints: (e.g. "substitute u = x^2 to simplify", "none").
   - Graph behavior: (e.g. "parabola opening upwards", "asymptote at x = 0").
   - Monotonicity: (e.g. "increasing on (0, infinity), decreasing on (-infinity, 0)").
   - Extrema: (e.g. "local minimum at (0, 0)").
   - Hidden constraints: (e.g. "x must be positive for log(x) to be defined").
   - Geometric interpretations: (e.g. "the derivative represents the slope of the tangent line at any point").

Output MUST be a JSON object with this structure:
{
  "functionExpression": "string",
  "simulationMode": "derivative" | "integral" | "limit" | "differential_equation",
  "tangentPointX": number,
  "riemannPartitions": number,
  "integrationBounds": [number, number],
  "limitTargetX": number,
  "finalAnswer": "string",
  "formulaLatex": "string",
  "explanation": "string",
  "thinkingLayers": {
    "symmetry": "string",
    "substitution": "string",
    "graphBehavior": "string",
    "monotonicity": "string",
    "extrema": "string",
    "hiddenConstraints": "string",
    "geometricInterpretation": "string"
  },
  "steps": [
    {
      "id": "step-1",
      "title": "string",
      "formula": "string",
      "instruction": "string"
    }
  ]
}

Rules:
- Be mathematically rigorous. Coordinate values must be neat and centerable around the viewport origin (typically between -5 and 5).
- Output JSON only. No markdown formatting or extra text outside of the JSON structure.`;

export function detectCalculusIntent(questionText = "") {
  const lower = String(questionText || "").toLowerCase();
  
  const hasDiffEq = /\b(differential equation|initial value problem)\b/.test(lower) || /dy\/dx\s*=/.test(lower);
  const hasLimit = /\b(limit|approaches|lim\b)\b/.test(lower);
  const hasIntegral = /\b(integrate|integral|area under|riemann|accumulation|integration)\b/.test(lower);
  const hasDerivative = /\b(differentiate|derivative|slope|tangent|extrema|maxima|minima|monotonicity|concavity|dy\/dx|differentiation)\b/.test(lower);

  if (hasDiffEq) return "differential_equation";
  if (hasLimit) return "limit";
  if (hasIntegral) return "integral";
  if (hasDerivative) return "derivative";
  
  return null;
}

export async function buildCalculusPlan(questionText = "", sourceSummary = {}) {
  const query = (questionText || sourceSummary.cleanedQuestion || "").trim();
  if (!query) return null;

  const mode = detectCalculusIntent(query);
  if (!mode) return null;

  console.log(`[Calculus Planner] Generating calculus deconstruction for: "${query}" (detected mode: ${mode})`);

  let parsed;
  try {
    const messages = [
      {
        role: "user",
        content: [{ text: `Generate a calculus plan for this question: "${query}"` }]
      }
    ];

    const modelIds = ["gemini-2.5-flash", "llama-3.3-70b-versatile"];
    const rawText = await converseWithModelFailover("text", CALCULUS_PLANNER_SYSTEM_PROMPT, messages, {
      maxTokens: 2048,
      temperature: 0.1,
      modelIds
    });

    parsed = JSON.parse(cleanupJson(rawText));
  } catch (err) {
    console.warn(`[Calculus Planner] LLM call failed or JSON parse error. Constructing fallback calculus plan:`, err.message);
    
    // Fallback parsing for simple queries
    let fallbackFunc = "x*x";
    if (query.includes("x^3") || query.includes("x*x*x")) fallbackFunc = "x*x*x";
    else if (query.includes("sin")) fallbackFunc = "Math.sin(x)";
    else if (query.includes("cos")) fallbackFunc = "Math.cos(x)";
    else if (query.includes("ln") || query.includes("log")) fallbackFunc = "Math.log(Math.abs(x))";

    parsed = {
      functionExpression: fallbackFunc,
      simulationMode: mode,
      tangentPointX: 1.0,
      riemannPartitions: 12,
      integrationBounds: [0.0, 2.0],
      limitTargetX: 0.0,
      finalAnswer: "Solved in simulation",
      formulaLatex: "\\frac{d}{dx}[x^2] = 2x",
      explanation: "Fallback calculus explanation",
      thinkingLayers: {
        symmetry: "Depends on f(x)",
        substitution: "none",
        graphBehavior: "Standard function curve",
        monotonicity: "Inspect curve slopes to find intervals of increase/decrease",
        extrema: "Critical points occur where f'(x) = 0",
        hiddenConstraints: "Domain boundaries of input terms",
        geometricInterpretation: "Slope of the tangent or accumulated area under the curve"
      },
      steps: [
        {
          id: "step-1",
          title: "Identify the function",
          formula: "f(x) = " + fallbackFunc,
          instruction: "Read the expression and prepare to plot it on the 2D coordinate grid."
        }
      ]
    };
  }

  const normalizedMode = parsed.simulationMode || mode;

  const board = buildTextLessonBoard({
    id: "analysis-board",
    label: "Lesson board",
    title: "Lesson board",
    purpose: "Keep the math steps and equations visible.",
    width: 10,
    height: 7,
    color: "#1d3557"
  });

  // Build the suggested object matching our custom calculus format
  const objectSuggestions = [
    board,
    {
      id: "calculus-simulation",
      title: `Calculus Simulation (${normalizedMode})`,
      purpose: "Interact with the function curve, tangent line, limits, or Riemann sum representation.",
      optional: false,
      tags: ["calculus", normalizedMode],
      roles: ["calculus-simulation"],
      object: {
        id: "calculus-simulation-object",
        label: `y = f(x)`,
        shape: "cube", // Dummy shape to satisfy planSchema validation
        color: "#7cf7e4",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        params: { size: 0.01 }, // Minimize visual footprint of the dummy shape
        metadata: {
          isCalculusSimulation: true,
          functionExpression: parsed.functionExpression || "x*x",
          simulationMode: normalizedMode,
          tangentPointX: parsed.tangentPointX ?? 1.0,
          riemannPartitions: parsed.riemannPartitions ?? 12,
          integrationBounds: parsed.integrationBounds || [0, 2],
          limitTargetX: parsed.limitTargetX ?? 0.0,
          thinkingLayers: parsed.thinkingLayers || {}
        }
      }
    }
  ];

  // Camera book mark focused on the grid plane (2D view of XY)
  const cameraBookmarks = [
    {
      id: "calculus-2d-grid",
      label: "2D Grid View",
      description: "Orthogonal-like perspective centered on the 2D function plotter.",
      position: [0, 6, 12],
      target: [0, 1.5, 0]
    }
  ];

  // Lesson stages corresponding to learningMoments and steps
  const lessonStages = parsed.steps.map((step, idx) => ({
    id: step.id,
    learningStage: idx === 0 ? "orient" : "build",
    title: step.title,
    goal: step.instruction,
    tutorIntro: `Step ${idx + 1}: ${step.title}. We use the relation: $${step.formula}$. ${step.instruction}`,
    successCheck: `Ensure the student grasps the step: ${step.title}`,
    checkpointPrompt: "Does the geometry in the simulation make this clear?",
    mistakeProbe: "Ask why the slope or area behaves this way."
  }));

  const sceneMoments = parsed.steps.map((step, idx) => ({
    id: step.id,
    title: step.title,
    prompt: step.instruction,
    goal: step.title,
    focusTargets: ["calculus-simulation-object"],
    visibleObjectIds: ["calculus-simulation"],
    visibleOverlayIds: ["analytic-axes", "analytic-formula"],
    cameraBookmarkId: "calculus-2d-grid",
    revealFormula: true,
    revealFullSolution: idx === parsed.steps.length - 1
  }));

  const sceneOverlays = [
    {
      id: "analytic-axes",
      type: "coordinate-frame",
      bounds: {
        x: [-5, 5],
        y: [-2, 5],
        z: [-1, 1],
        tickStep: 1
      }
    },
    {
      id: "analytic-formula",
      type: "text",
      position: [0, 4.5, 0],
      text: parsed.formulaLatex || "",
      style: "formula"
    }
  ];

  const plan = {
    problem: {
      id: `calculus-problem-${Date.now()}`,
      question: query,
      questionType: "spatial",
      summary: parsed.explanation || "Calculus visualization lesson.",
      mode: "guided"
    },
    experienceMode: "analytic_auto",
    overview: parsed.explanation || "Interactive calculus reasoning scene.",
    sourceSummary: sourceSummary.cleanedQuestion ? sourceSummary : {
      inputMode: "text",
      rawQuestion: query,
      cleanedQuestion: query,
      givens: [],
      labels: [],
      relationships: ["calculus"]
    },
    sceneFocus: {
      concept: `${normalizedMode} of function`,
      primaryInsight: parsed.thinkingLayers?.geometricInterpretation || "Visualizing the calculus concept on a 2D grid.",
      focusPrompt: "Manipulate the simulation parameters and watch the values change.",
      judgeSummary: "Tutor evaluates student understanding of calculus reasoning steps."
    },
    learningMoments: {
      orient: {
        stage: "orient",
        title: "Orient",
        coachMessage: "Look at the plotted curve. Let's understand its parameters.",
        goal: "Understand the visual layout.",
        prompt: "",
        insight: "",
        whyItMatters: "Grasping the geometry of curves is the foundation of calculus."
      },
      build: {
        stage: "build",
        title: "Explore",
        coachMessage: "Use the sliders to adjust variables and observe the tangent line or Riemann rectangles.",
        goal: "Explore motion and accumulation.",
        prompt: "",
        insight: "",
        whyItMatters: "Dynamic movement reveals the underlying rate changes."
      }
    },
    objectSuggestions,
    buildSteps: sceneMoments.map((moment) => ({
      id: moment.id,
      title: moment.title,
      instruction: moment.goal,
      hint: moment.prompt,
      action: "observe",
      focusConcept: normalizedMode,
      coachPrompt: moment.prompt,
      suggestedObjectIds: ["calculus-simulation"],
      requiredObjectIds: ["calculus-simulation"],
      cameraBookmarkId: "calculus-2d-grid"
    })),
    cameraBookmarks,
    lessonStages,
    sceneMoments,
    sceneOverlays,
    answerScaffold: {
      finalAnswer: parsed.finalAnswer || "See simulation",
      unit: "",
      formula: parsed.formulaLatex || "",
      explanation: parsed.explanation || "",
      checks: ["Substitute test values.", "Verify boundary behaviors."]
    },
    analyticContext: {
      subtype: `calculus_${normalizedMode}`,
      entities: {
        points: [],
        lines: [],
        planes: []
      },
      derivedValues: {
        function: parsed.functionExpression,
        thinkingLayers: parsed.thinkingLayers
      },
      formulaCard: {
        title: `${normalizedMode.toUpperCase()} Concept`,
        formula: parsed.formulaLatex || "",
        explanation: parsed.explanation || ""
      },
      solutionSteps: parsed.steps.map((s) => ({
        id: s.id,
        title: s.title,
        formula: s.formula,
        explanation: s.instruction
      }))
    }
  };

  return normalizeScenePlan(plan);
}
