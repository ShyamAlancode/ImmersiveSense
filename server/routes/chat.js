import { Hono } from "hono";
import { streamChatResponse } from "../services/chatService.js";

const router = new Hono();

router.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { messages, context } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: "Messages array is required." }, 400);
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const task = async () => {
      try {
        const generator = await streamChatResponse(messages, context);
        for await (const chunk of generator) {
          await writer.write(new TextEncoder().encode(chunk));
        }
      } catch (err) {
        console.error("Chat streaming error:", err);
        await writer.write(new TextEncoder().encode("\n[Error: Connection interrupted. Please try again.]"));
      } finally {
        writer.close();
      }
    };

    let hasCtx = false;
    try {
      if (c.executionCtx) {
        hasCtx = true;
        c.executionCtx.waitUntil(task());
      }
    } catch (e) {
      // Ignore: "This context has no ExecutionContext" error
    }

    if (!hasCtx) {
      void task();
    }

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (error) {
    console.error("Chat API format error:", error);
    return c.json({ error: "Invalid JSON format." }, 400);
  }
});

export default router;
