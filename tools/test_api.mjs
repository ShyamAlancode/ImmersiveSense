import "dotenv/config";
import { readFileSync } from "fs";

const envContent = readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

async function test() {
  console.log("1. Testing /api/plan (Text-only)...");
  const p = await fetch("http://localhost:3000/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionText: "Draw a sphere of radius 3." }),
  });
  console.log("   Plan status:", p.status);
  const readerP = p.body.getReader();
  const dec = new TextDecoder();
  let gotPlan = false;
  let fullP = "";
  // Wait up to 10 seconds (50 reads * 200ms approx)
  for (let i = 0; i < 100; i++) {
    const { done, value } = await readerP.read();
    if (done) break;
    fullP += dec.decode(value);
    if (fullP.includes('event: plan')) { gotPlan = true; break; }
  }
  await readerP.cancel();
  console.log("   Plan generated:", gotPlan ? "YES" : "NO");

  console.log("2. Testing /api/tutor...");
  const t = await fetch("http://localhost:3000/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: null,
      sceneSnapshot: { objects: [], selectedObjectId: null },
      learningState: { history: [] },
      userMessage: "What is a cube?",
      input_source: "text",
    }),
  });
  const readerT = t.body.getReader();
  let chunks = 0; console.log("   Tutor status:", t.status);
  for (let i = 0; i < 50; i++) {
    const { done, value } = await readerT.read();
    if (done) break;
    if (dec.decode(value).includes('"type":"text"')) chunks++;
  }
  await readerT.cancel();
  console.log("   Tutor response chunks:", chunks);

  console.log("\n=== TEST COMPLETE ===");
}

test().catch((e) => { console.error("TEST FAILED:", e.message); process.exit(1); });
