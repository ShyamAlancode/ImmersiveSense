import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("server/data");
const MODEL_FILE = path.join(DATA_DIR, "student_model.json");

// Core mathematical/spatial reasoning topics tracked in the student knowledge graph
const TOPICS = [
  "slope",
  "3d_coordinates",
  "line_plane_intersection",
  "skew_lines",
  "differentiation",
  "integration",
  "trig_identities",
  "arithmetic",
  "general_geometry"
];

let studentModels = {};

// Load existing student models from local JSON DB on startup
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(MODEL_FILE)) {
    const raw = fs.readFileSync(MODEL_FILE, "utf-8");
    studentModels = JSON.parse(raw);
  }
} catch (err) {
  console.warn("Failed to load student models from file, starting fresh:", err.message);
}

function saveModels() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MODEL_FILE, JSON.stringify(studentModels, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save student models:", err);
  }
}

/**
 * Get or initialize the persistent student knowledge graph model.
 * @param {string} sessionId
 */
export function getOrCreateStudentModel(sessionId = "default") {
  const cleanId = String(sessionId || "default").trim();
  if (!studentModels[cleanId]) {
    const graph = {};
    for (const topic of TOPICS) {
      graph[topic] = {
        probability: 0.5, // 0.5 is neutral/unobserved probability
        attempts: 0,
        correct: 0,
        lastUpdated: Date.now()
      };
    }
    studentModels[cleanId] = {
      sessionId: cleanId,
      learnerLevel: "intermediate",
      graph,
      misconceptions: [], // Array of active misconceptions
      confusedStages: [], // Array of confused stages
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    saveModels();
  }
  return studentModels[cleanId];
}

/**
 * Probabilistic Bayesian-style update of student mastery of a given topic.
 * @param {string} sessionId 
 * @param {string} topic 
 * @param {'correct'|'incorrect'|'hesitant'|'stuck'} status 
 * @param {number|null} deltaOverride 
 */
export function updateStudentMastery(sessionId, topic, status, deltaOverride = null) {
  const model = getOrCreateStudentModel(sessionId);
  const cleanTopic = String(topic || "").trim().toLowerCase();
  
  // Map or fallback topic to nearest tracked topic
  let matchedTopic = TOPICS.find((t) => cleanTopic.includes(t) || t.includes(cleanTopic)) || "general_geometry";

  if (!model.graph[matchedTopic]) {
    model.graph[matchedTopic] = {
      probability: 0.5,
      attempts: 0,
      correct: 0,
      lastUpdated: Date.now()
    };
  }

  const node = model.graph[matchedTopic];
  node.attempts += 1;
  node.lastUpdated = Date.now();
  model.updatedAt = Date.now();

  let delta = 0;
  if (deltaOverride !== null) {
    delta = deltaOverride;
  } else {
    switch (status) {
      case "correct":
        node.correct += 1;
        delta = 0.20; // major boost on correct answers
        break;
      case "incorrect":
        delta = -0.15; // penalty on wrong steps
        break;
      case "hesitant":
        delta = -0.06; // mild indicator of uncertainty
        break;
      case "stuck":
        delta = -0.10; // penalty for getting stuck
        break;
      default:
        delta = 0;
    }
  }

  node.probability = Math.max(0.01, Math.min(0.99, node.probability + delta));

  // Dynamically calibrate general learner level based on average graph masteries
  const totalProb = Object.values(model.graph).reduce((sum, n) => sum + n.probability, 0);
  const avgProb = totalProb / Object.keys(model.graph).length;
  if (avgProb < 0.40) {
    model.learnerLevel = "beginner";
  } else if (avgProb > 0.75) {
    model.learnerLevel = "advanced";
  } else {
    model.learnerLevel = "intermediate";
  }

  saveModels();
  return model;
}

/**
 * Record a misconception.
 * @param {string} sessionId
 * @param {string} misconceptionTag
 */
export function recordStudentMisconception(sessionId, misconceptionTag) {
  if (!misconceptionTag) return null;
  const model = getOrCreateStudentModel(sessionId);
  if (!model.misconceptions.includes(misconceptionTag)) {
    model.misconceptions.push(misconceptionTag);
    model.updatedAt = Date.now();
    saveModels();
  }
  return model;
}

/**
 * Clear an resolved student misconception.
 * @param {string} sessionId
 * @param {string} misconceptionTag
 */
export function clearStudentMisconception(sessionId, misconceptionTag) {
  const model = getOrCreateStudentModel(sessionId);
  const index = model.misconceptions.indexOf(misconceptionTag);
  if (index >= 0) {
    model.misconceptions.splice(index, 1);
    model.updatedAt = Date.now();
    saveModels();
  }
  return model;
}

/**
 * Record a confused stage.
 * @param {string} sessionId
 * @param {string} stage
 */
export function recordConfusedStage(sessionId, stage) {
  if (!stage) return null;
  const model = getOrCreateStudentModel(sessionId);
  if (!model.confusedStages) {
    model.confusedStages = [];
  }
  if (!model.confusedStages.includes(stage)) {
    model.confusedStages.push(stage);
    model.updatedAt = Date.now();
    saveModels();
  }
  return model;
}
