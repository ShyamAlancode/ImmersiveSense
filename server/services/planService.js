import { heuristicPlan, heuristicSourceSummary } from "./plan/heuristics.js";
import { interpretQuestionSource } from "./plan/sourceInterpreter.js";
import { planFromNova } from "./plan/novaPlan.js";
import { mergeGeneratedPlan } from "./plan/mergePlan.js";
import { buildSourceEvidence } from "./plan/sourceEvidence.js";
import { buildDemoPreset } from "./plan/demoPreset.js";
import { getLastUsedTextModel, getLessonExemplarById, retrieveLessonExemplar } from "./plan/retrieval.js";
import { buildAnalyticPlan } from "./plan/analytic.js";
import { buildElectricFieldPlan } from "./plan/electricField.js";
import { buildCalculusPlan } from "./plan/calculusPlan.js";
import { casDispatch, casResultToPlanFields } from "./cas/index.js";
import planCache, { LRUPlanCache } from "./cache/planCache.js";
import { runMathematicianAgent } from "./plan/agents/mathematicianAgent.js";
import { runPedagogueAgent } from "./plan/agents/pedagogueAgent.js";
import { runSceneArchitectAgent } from "./plan/agents/sceneArchitectAgent.js";
import { compileIntent } from "./plan/intentCompiler.js";
import { getOrCreateStudentModel } from "./pedagogy/studentModel.js";


export function buildAnalyticPlannerInput({ questionText = "", sourceSummary = {} }) {
  const rawQuestion = String(questionText || sourceSummary.rawQuestion || "").trim();
  const cleanedQuestion = String(sourceSummary.cleanedQuestion || "").trim();
  const givens = Array.isArray(sourceSummary.givens)
    ? sourceSummary.givens.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const relationships = Array.isArray(sourceSummary.relationships)
    ? sourceSummary.relationships.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const diagramSummary = String(sourceSummary.diagramSummary || "").trim();
  const analyticQuestion = rawQuestion || [
    cleanedQuestion,
    ...givens,
    diagramSummary,
    ...relationships,
  ].filter(Boolean).join(". ");

  if (!analyticQuestion) {
    return {
      questionText: "",
      sourceSummary,
    };
  }

  if (!rawQuestion) {
    return {
      questionText: analyticQuestion,
      sourceSummary,
    };
  }

  return {
    questionText: rawQuestion,
    sourceSummary: {
      ...sourceSummary,
      rawQuestion,
      cleanedQuestion: rawQuestion,
    },
  };
}

function buildAgentTrace({ sourceSummary, retrieval, usedNovaPlan, usedAnalyticPlan, usedElectricFieldPlan }) {
  return [
    {
      id: "source-interpreter",
      label: "Source Interpreter",
      status: sourceSummary?.inputMode === "image" || sourceSummary?.inputMode === "multimodal" ? "multimodal" : "ready",
      summary: sourceSummary?.diagramSummary
        ? `Parsed worksheet evidence: ${sourceSummary.diagramSummary}`
        : "Parsed the question text into givens and relationships.",
    },
    {
      id: "lesson-planner",
      label: usedElectricFieldPlan ? "Physics Planner" : usedAnalyticPlan ? "Analytic Solver" : "Lesson Planner",
      status: usedElectricFieldPlan ? "physics" : usedAnalyticPlan ? "deterministic" : usedNovaPlan ? "nova" : "fallback",
      summary: usedElectricFieldPlan
        ? "Used the focused electromagnetism planner for charged objects, live field flow, and flux intuition."
        : usedAnalyticPlan
        ? "Used the deterministic analytic geometry planner for reliable formulas, helpers, and scene beats."
        : usedNovaPlan
          ? "Used Nova planning with retrieval-informed lesson scaffolding."
          : "Used heuristic planning fallback to keep the lesson reliable.",
    },
    {
      id: "build-evaluator",
      label: "Build Evaluator",
      status: "ready",
      summary: "Will compare placed scene objects against required suggestions and guide the next step.",
    },
    {
      id: "tutor-coach",
      label: "Tutor Coach",
      status: "ready",
      summary: retrieval?.matchedTitle
        ? `Primed with the ${retrieval.matchedTitle.toLowerCase()} pattern for tutoring tone and demo framing.`
        : "Ready to coach the learner from the live scene state.",
    },
  ];
}

export async function generateScenePlan({ questionText = "", imageAsset = null, mode = "guided", sceneSnapshot = null, sessionId = "default" }, emit = async () => {}) {
  // ── Cache read (text questions only) ────────────────────────────────────────
  const cacheKey = LRUPlanCache.normalizeKey(questionText, imageAsset);
  if (cacheKey) {
    const cached = planCache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] HIT for: "${questionText.slice(0, 60)}…" — ${planCache.stats.hitRate} hit rate`);
      await emit("plan", cached);
      return cached;
    }
  }

  let sourceWarning = null;
  let sourceSummary;
  try {
    sourceSummary = await interpretQuestionSource({ questionText, imageAsset });
  } catch (err) {
    sourceWarning = `Source interpretation limited: ${err.message}`;
    sourceSummary = heuristicSourceSummary({ questionText, imageAsset });
  }

  const workingQuestion = (sourceSummary.cleanedQuestion || questionText || "").trim();
  const retrieval = await retrieveLessonExemplar({ questionText: workingQuestion, sourceSummary });
  const matchedExemplar = getLessonExemplarById(retrieval.exemplarId);

  await emit("multimodal_evidence", {
    input_modality: imageAsset
      ? (questionText ? "multimodal" : "image")
      : "text",
    extracted: {
      givens: sourceSummary.givens,
      labels: sourceSummary.labels,
      relationships: sourceSummary.relationships,
      diagram_summary: sourceSummary.diagramSummary,
    },
    retrieval: {
      matched_exemplar: retrieval.exemplarId,
      matched_title: retrieval.matchedTitle,
      similarity_score: retrieval.score,
      why: retrieval.why,
    },
    nova_model_used: getLastUsedTextModel(),
    input_had_image: imageAsset != null,
    systemWarning: sourceWarning,
  });
  let usedNovaPlan = false;
  
  // ── Calculus interception ──────────────────────────────────────────────────
  const calculusPlan = await buildCalculusPlan(workingQuestion, sourceSummary);
  if (calculusPlan) {
    console.log(`[Calculus Planner] Using interactive calculus plan.`);
    const sourceEvidence = buildSourceEvidence(sourceSummary);
    const agentTrace = buildAgentTrace({ sourceSummary, retrieval, usedNovaPlan: false, usedAnalyticPlan: false, usedElectricFieldPlan: false });
    const demoPreset = buildDemoPreset({ plan: calculusPlan, sourceSummary, exemplar: matchedExemplar });
    const result = { scenePlan: { ...calculusPlan, sourceEvidence, agentTrace, demoPreset }, sourceEvidence, agentTrace, demoPreset, retrieval, casSolved: false };
    
    const cacheKey = LRUPlanCache.normalizeKey(questionText, imageAsset);
    if (cacheKey) {
      planCache.set(cacheKey, result);
    }
    await emit("plan", result);
    return result;
  }

  const analyticInput = buildAnalyticPlannerInput({ questionText, sourceSummary });
  const electricFieldPlan = buildElectricFieldPlan(workingQuestion, sourceSummary);
  const analyticPlan = buildAnalyticPlan(analyticInput.questionText, analyticInput.sourceSummary);
  const usedElectricFieldPlan = Boolean(electricFieldPlan);
  const usedAnalyticPlan = Boolean(analyticPlan);
  const baselinePlan = electricFieldPlan || analyticPlan || heuristicPlan(workingQuestion, mode, sourceSummary);
  let mergedPlan = baselinePlan;

  // ── CAS shortcut ─────────────────────────────────────────────────────────
  // Before touching the LLM, try the deterministic CAS engine.
  // If it succeeds, inject results into the baseline plan and skip nova entirely.
  if (!usedAnalyticPlan && !usedElectricFieldPlan) {
    const casResult = casDispatch(workingQuestion, questionText);
    if (casResult) {
      const casFields = casResultToPlanFields(casResult);
      if (casFields) {
        mergedPlan = { ...baselinePlan, ...casFields };
        console.log(`[CAS] Solved deterministically: ${casResult.type} — skipping LLM.`);
        // Store in cache so repeated questions are instant
        const cacheKey = LRUPlanCache.normalizeKey(questionText, imageAsset);
        if (cacheKey) {
          const resultToCache = { scenePlan: { ...mergedPlan }, sourceEvidence: buildSourceEvidence(sourceSummary), agentTrace: buildAgentTrace({ sourceSummary, retrieval, usedNovaPlan: false, usedAnalyticPlan: false, usedElectricFieldPlan: false }), demoPreset: buildDemoPreset({ plan: mergedPlan, sourceSummary, exemplar: matchedExemplar }), retrieval, casSolved: true };
          planCache.set(cacheKey, resultToCache);
        }
        const sourceEvidence = buildSourceEvidence(sourceSummary);
        const agentTrace = buildAgentTrace({ sourceSummary, retrieval, usedNovaPlan: false, usedAnalyticPlan: false, usedElectricFieldPlan: false });
        const demoPreset = buildDemoPreset({ plan: mergedPlan, sourceSummary, exemplar: matchedExemplar });
        const result = { scenePlan: { ...mergedPlan, sourceEvidence, agentTrace, demoPreset }, sourceEvidence, agentTrace, demoPreset, retrieval, casSolved: true };
        await emit("plan", result);
        return result;
      }
    }
  }

  if (!usedAnalyticPlan && !usedElectricFieldPlan) {
    try {
      console.log(`[Cognitive Architecture] Launching 4-agent reasoning pipeline for: "${workingQuestion}"`);
      
      // 1. Mathematician Agent (Agent 1)
      const mathSolution = await runMathematicianAgent({ questionText: workingQuestion });
      await emit("math_solved", mathSolution);

      // 2. Student Model (Layer 2)
      const studentModel = getOrCreateStudentModel(sessionId);

      // 3. Pedagogue Agent (Agent 2)
      const pedagogy = await runPedagogueAgent({ studentModel, mathSolution });
      await emit("pedagogy_planned", pedagogy);

      // 4. Scene Architect Agent (Agent 3)
      const intentSpec = await runSceneArchitectAgent({ mathSolution, pedagogy });
      await emit("scene_architected", intentSpec);

      // 5. Intent Compiler (Layer 4)
      const compiledPlan = compileIntent({ intentSpec, mathSolution, pedagogy });
      
      usedNovaPlan = true;
      mergedPlan = compiledPlan;
    } catch (error) {
      console.warn("Falling back to heuristic scene plan:", error?.message || error);
    }
  }

  const effectiveSourceSummary = mergedPlan.sourceSummary || sourceSummary;
  const sourceEvidence = buildSourceEvidence(effectiveSourceSummary);
  const demoPreset = buildDemoPreset({
    plan: mergedPlan,
    sourceSummary: effectiveSourceSummary,
    exemplar: matchedExemplar,
  });
  const agentTrace = buildAgentTrace({
    sourceSummary: effectiveSourceSummary,
    retrieval,
    usedNovaPlan,
    usedAnalyticPlan,
    usedElectricFieldPlan,
  });

  const scenePlan = {
    ...mergedPlan,
    sourceEvidence,
    agentTrace,
    demoPreset,
  };

  const result = {
    scenePlan,
    sourceEvidence,
    agentTrace,
    demoPreset,
    retrieval,
  };
  await emit("plan", result);
  return result;
}
