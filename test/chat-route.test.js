import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import router from "../server/routes/chat.js";

test("POST /api/chat rejects requests without messages", async () => {
  const app = new Hono();
  app.route("/api/chat", router);

  const response = await app.request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [],
      context: { text: "Some scene coordinates" }
    })
  });

  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error, "Messages array is required.");
});

test("POST /api/chat accepts messages and streams a successful chat response with context-awareness", async () => {
  const app = new Hono();
  app.route("/api/chat", router);

  const response = await app.request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Explain the coordinate geometry vectors here." }],
      context: {
        problem: { question: "Points plane problem" },
        derivedValues: { planeEquation: "13x - 5y + 6z = 41" }
      }
    })
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  
  const text = await response.text();
  assert.ok(text.length > 0, "Response stream should contain generated text");
});
