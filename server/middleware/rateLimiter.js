const ipRequestStore = new Map();
const LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 15; // Max 15 requests per minute

export function rateLimiterMiddleware() {
  return async (c, next) => {
    // Only rate-limit API calls that make heavy LLM invocations
    const path = c.req.path;
    if (!path.startsWith("/api/plan") && !path.startsWith("/api/tutor") && !path.startsWith("/api/voice")) {
      return next();
    }

    // Try to retrieve client IP
    const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "local-client";
    const now = Date.now();

    if (!ipRequestStore.has(clientIp)) {
      ipRequestStore.set(clientIp, []);
    }

    const requestTimestamps = ipRequestStore.get(clientIp);

    // Filter out timestamps outside the sliding window
    const activeTimestamps = requestTimestamps.filter((timestamp) => now - timestamp < LIMIT_WINDOW_MS);
    activeTimestamps.push(now);
    ipRequestStore.set(clientIp, activeTimestamps);

    if (activeTimestamps.length > MAX_REQUESTS) {
      console.warn(`[RateLimiter] Blocked IP ${clientIp} — Exceeded ${MAX_REQUESTS} requests/minute limit.`);
      c.status(429);
      return c.json({
        error: "Too many requests. Please wait a minute before trying again to protect our free API keys!",
      });
    }

    await next();
  };
}
