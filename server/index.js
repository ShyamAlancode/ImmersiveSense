import "./env.js"; // MUST be first: loads .env.local before any other module reads process.env
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import net from "node:net";


// Import routes
import planRoute from "./routes/plan.js";
import tutorRoute from "./routes/tutor.js";
import voiceRoute from "./routes/voice.js";
import challengesRoute from "./routes/challenges.js";
import buildRoute from "./routes/build.js";
import capabilitiesRoute from "./routes/capabilities.js";
import chatRoute from "./routes/chat.js";
import { warmLessonExemplars } from "./services/plan/retrieval.js";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());
app.use("*", rateLimiterMiddleware());

// API routes
app.route("/api/plan", planRoute);
app.route("/api/tutor", tutorRoute);
app.route("/api/voice", voiceRoute);
app.route("/api/challenges", challengesRoute);
app.route("/api/build", buildRoute);
app.route("/api/capabilities", capabilitiesRoute);
app.route("/api/chat", chatRoute);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Serve static files from project root (relative to CWD)
app.use("/*", serveStatic({ root: "./" }));

const DEFAULT_PORT = parseInt(process.env.PORT || "3000", 10);

function probePort(port) {
  return new Promise((resolveProbe) => {
    const tester = net.createServer();
    tester.unref();
    tester.once("error", () => resolveProbe(false));
    tester.once("listening", () => {
      tester.close(() => resolveProbe(true));
    });
    tester.listen(port);
  });
}

async function findAvailablePort(startPort, attempts = 10) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = startPort + offset;
    if (await probePort(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No open port found between ${startPort} and ${startPort + attempts - 1}`);
}

const PORT = await findAvailablePort(DEFAULT_PORT);
void warmLessonExemplars();

if (PORT !== DEFAULT_PORT) {
  console.warn(`Port ${DEFAULT_PORT} is busy, starting ImmersiveSense on ${PORT} instead.`);
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`ImmersiveSense server running at http://localhost:${info.port}`);
  console.log(`  API: http://localhost:${info.port}/api/health`);
  console.log(`  App: http://localhost:${info.port}/index.html`);
});
