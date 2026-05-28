# 🌟 ImmersiveSense — Interactive 3D Socratic Math & Physics Tutor

[![Node.js Version](https://img.shields.io/badge/node.js-20+-green.svg)](https://nodejs.org)
[![Three.js](https://img.shields.io/badge/three.js-r128-blue.svg)](https://threejs.org)
[![MediaPipe](https://img.shields.io/badge/mediapipe-hand--tracking-cyan.svg)](https://google.github.io/mediapipe/)
[![Hono](https://img.shields.io/badge/hono-API%20framework-orange.svg)](https://hono.dev)
[![API Providers](https://img.shields.io/badge/hybrid--models-Gemini%20%2B%20Groq-purple.svg)](#architecture)
[![Live Demo](https://img.shields.io/badge/live%20demo-online-brightgreen?style=for-the-badge&logo=render)](https://immersivesense.onrender.com/)

**ImmersiveSense** is a state-of-the-art, interactive 3D Socratic math and physics tutor. It transforms abstract mathematical formulas, complex coordinate geometry, and physics vector fields into real-time, interactive 3D visual environments. 

Rather than relying on generic, error-prone LLM wrapper designs, ImmersiveSense couples a **6-layer hybrid cognitive architecture** with a **deterministic Computer Algebra System (CAS)**, **real-time webcam hand tracking**, and a **zero-latency background AudioWorklet voice coach**.

---

## 🚀 Key Features

### 1. 🧮 Deterministic Computer Algebra System (CAS)
- **Zero-Hallucination Solving**: An interceptor engine solves equations, calculates vector lines and planes, and maps 3D coordinate geometry *analytically* from first principles before coordinates ever reach a 3D canvas (eliminates 100% of LLM coordinate hallucinations).
- **Core math modules include**:
  - **3D Geometry**: Dot/cross products, perpendicular projection vectors, intersections, and skew lines distance.
  - **Calculus**: Power-rule symbolic differentiation and definite/indefinite integration step-derivation.
  - **Algebra**: 2x2 linear equations (Cramer's Rule) and quadratic discriminant calculations.

### 2. 🌀 Interactive Calculus Simulation Playground
- **Draggable Tangents**: Grab marker spheres resting directly on continuous function curves to see visual tangent slope ($f'(x)$) vectors adjust instantly.
- **Riemann Integral Visualizer**: Dynamically scale partition bars using client HUD sliders to observe left, right, and midpoint Riemann approximations.
- **Limit & Slope Fields**: Approximates limits dynamically ($x \rightarrow a$) and flows particle tracers across differential vector fields ($dy/dx = f(x, y)$).

### 3. 🖐️ Gesture-Based Hand & webcam Tracking
- **MediaPipe Hand Landmarkers**: Rotates, zooms, and scales 3D vector fields or geometry matrices using natural, real-time hand coordinates captured from your webcam.
- **Tactile Hotkeys**: Toggle camera auto-rotations, show/hide LaTeX overlays, and reset viewport angles seamlessly with custom keyboard layout triggers.

### 4. 🎙️ Zero-Latency AudioWorklet Voice Coach
- **Thread-Isolated Web Audio**: Upgraded Web Audio pipeline to modern browser `AudioWorkletNode` blocks running on a separate thread (eliminating main thread UI stutter).
- **Free local STT Fallback**: Auto-detects empty AWS Polly/Bedrock credentials and initiates a cost-free fallback: records LPCM microphone streams, transcribes via **Groq Whisper Large**, reasons using **Gemini 2.5 Flash**, and speaks answers back with browser Web Speech synthesis.

### 5. 🧠 6-Layer Socratic Cognitive Architecture
- **Multi-Agent Pipeline**: Coordinates specialized **Mathematician**, **Pedagogue**, **Scene Architect**, and **Socratic Coach** agents.
- **Bayesian Student Model**: A persistent knowledge graph tracking student mastery of math topics based on correct answers, errors, and hesitation.
- **Comprehension Telemetry**: Tracks mouse micro-hesitations, drags, slide-skipping, and error rate, feeding metric vectors straight to the LLM to classify student confusion.

---

## 📐 System Architecture

ImmersiveSense is built on a highly modular hybrid pipeline that separates visual rendering, local sensory inputs, semantic caching, Socratic agent behaviors, and deterministic mathematical verification.

```mermaid
graph TD
    %% Styling Configuration
    classDef client fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e1b4b;
    classDef server fill:#fdf2f8,stroke:#ec4899,stroke-width:2px,color:#500724;
    classDef cognitive fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,color:#052e16;
    classDef external fill:#faf5ff,stroke:#a855f7,stroke-width:2px,color:#3b0764;

    %% Nodes Definitions
    subgraph Client ["Client Layer (Minimalist Viewport HUD)"]
        UI["Minimalist Light UI<br/>(Outfit & Inter Typography)"]:::client
        WebGL["Three.js WebGL Viewport<br/>(3D Axes, Planes, Vectors, Riemann Partitions)"]:::client
        CV["MediaPipe Hand Landmarker<br/>(Real-Time Gestures & Raycasting via Webcam)"]:::client
        WebAudio["AudioWorklet Audio Pipeline<br/>(Isolated Thread Capture)"]:::client
    end

    subgraph Backend ["Hono Server Tier & Middlewares"]
        API["Hono API Router"]:::server
        Cache["Semantic Cache<br/>(Normalized LRU In-Memory Cache)"]:::server
        Logger["Telemetry Analytics Logger<br/>(Micro-Interaction Hesitation Tracker)"]:::server
    end

    subgraph Cognitive ["6-Layer Cognitive Tutoring Engine"]
        Orchestrator["Multi-Agent Pipeline<br/>(Mathematician, Pedagogue, Scene Architect, Socratic Coach)"]:::cognitive
        Bayesian["Bayesian Student Model<br/>(Persistent Mastery Knowledge Graph)"]:::cognitive
        CAS["Deterministic CAS Solver<br/>(Symbolic Derivative, Cramer Algebra, 3D Geometry Solver)"]:::cognitive
        Classifier["Confusion Classifier<br/>(CONFIDENT | HESITANT | CONFUSED)"]:::cognitive
    end

    subgraph LLM ["Cloud Inference & STT APIs"]
        Gemini["Google Gemini 2.5 Flash<br/>(Visual Intent, Lesson Planning, Multimodal)"]:::external
        Llama["Groq Llama 3.3 70B<br/>(High-Speed Socratic Coaching Dialogue)"]:::external
        Whisper["Groq Whisper Large v3<br/>(recorded Fallback Audio Transcription)"]:::external
    end

    %% Connections
    UI -->|JSON / Websocket / SSE| API
    CV -->|Coordinate Scaling| WebGL
    WebAudio -->|Base64 Streams| API

    API --> Cache
    API --> Logger
    API --> CAS
    API --> Classifier
    
    Classifier --> Orchestrator
    CAS -->|Deterministic Plan Overrides| WebGL
    Orchestrator --> Bayesian
    Orchestrator --> Llama
    Orchestrator --> Gemini

    API --> Whisper
    API --> Gemini
    API --> Llama
```

---

## 🛠️ Local Setup

### Requirements
- **Node.js 20+**
- **npm**
- A standard **Webcam** (for gesture/hand tracking)
- A **Microphone** (for voice tutor mode)

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_google_ai_studio_api_key
   GROQ_API_KEY=your_groq_api_key
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 🧪 Testing

The codebase includes an extensive unit and integration test suite asserting mathematical solvers, SSE stream handling, student model state progressions, and failover fallbacks.

Run the test suite:
```bash
npm test
```

*Result summary:*
```text
ℹ tests 251
ℹ suites 0
ℹ pass 251
ℹ fail 0
```
