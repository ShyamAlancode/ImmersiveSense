import { converseWithModelFailover } from "../../modelInvoker.js";
import { cleanupJson } from "../shared.js";

const SCENE_ARCHITECT_SYSTEM_PROMPT = `You are the Scene Architect Agent in a multi-agent cognitive architecture.
Your job is to translate a pedagogical lesson plan and a verified mathematical solution into a high-level visual intent specification.
You will receive:
1. The mathematical variables and verified coordinates/relations from the Mathematician Agent.
2. The pedagogical structure (learning stages) from the Pedagogue Agent.

Output a high-level intent specification. This is NOT a low-level Three.js JSON with raw coordinate calculations.
Instead, output intent commands like SHOW, HIGHLIGHT, ANIMATE, and REVEAL_WHEN.

You must output ONLY valid JSON in this exact structure:
{
  "sceneArchitected": true,
  "intent": {
    "objects": [
      {
        "id": "A",
        "shape": "pointMarker",
        "label": "A",
        "position": [0, 0, 0],
        "color": "#e06666"
      },
      {
        "id": "L1",
        "shape": "line",
        "label": "Line L1",
        "params": {
          "start": "A",
          "direction": [1, 2, 0],
          "length": 5
        },
        "color": "#7cf7e4"
      }
    ],
    "highlights": ["A"],
    "animations": [
      {
        "target": "A",
        "type": "slide",
        "path": "L1",
        "speed": 1
      }
    ],
    "reveals": [
      {
        "stageId": "orient-stage",
        "visibleObjectIds": ["A"]
      },
      {
        "stageId": "build-stage",
        "visibleObjectIds": ["A", "L1"]
      }
    ],
    "cameraBookmarks": [
      {
        "id": "overview",
        "label": "Overview",
        "target": [0, 0, 0],
        "position": [5, 5, 8]
      }
    ]
  }
}

Rules:
- Make sure coordinates of base elements (anchors) match the mathematician's coordinates.
- Connect start/end parameters of lines to points by referencing the point IDs (e.g. "A").
- Ensure the objects listed are within the constraints of the renderer vocabulary: "cube", "cuboid", "sphere", "cylinder", "cone", "pyramid", "plane", "line", "pointMarker".
- Output JSON only. No markdown formatting or extra text outside of the JSON structure.`;

/**
 * Agent 3: Scene Architect
 * Generates high-level visual intents for rendering.
 * @param {object} params
 * @param {object} params.mathSolution - Solution from Mathematician agent
 * @param {object} params.pedagogy - Pedagogical stages from Pedagogue agent
 * @returns {Promise<object>} Visual intent specification
 */
export async function runSceneArchitectAgent({ mathSolution, pedagogy }) {
  const modelUserText = JSON.stringify({
    mathSolution: {
      finalAnswer: mathSolution.finalAnswer,
      geometry3d: mathSolution.geometry3d,
      variables: mathSolution.variables
    },
    pedagogy: {
      concept: pedagogy.concept,
      primaryInsight: pedagogy.primaryInsight,
      stages: pedagogy.learningStages.map((s) => ({ id: s.id, learningStage: s.learningStage, goal: s.goal }))
    }
  });

  const messages = [
    {
      role: "user",
      content: [{ text: modelUserText }]
    }
  ];

  const modelIds = ["gemini-2.5-flash", "llama-3.3-70b-versatile"];
  const rawText = await converseWithModelFailover("text", SCENE_ARCHITECT_SYSTEM_PROMPT, messages, {
    maxTokens: 2048,
    temperature: 0.15,
    modelIds
  });

  const parsed = JSON.parse(cleanupJson(rawText));
  
  if (!parsed.intent || !parsed.intent.objects) {
    throw new Error("Scene Architect Agent failed to generate a visual intent specification.");
  }

  return {
    sceneArchitected: true,
    intent: parsed.intent
  };
}
