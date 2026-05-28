import test from "node:test";
import assert from "node:assert/strict";

import { LRUPlanCache } from "../server/services/cache/planCache.js";

function makePlan(label) {
  return { scenePlan: { problem: { question: label } }, retrieval: {} };
}

test("LRUPlanCache: miss on empty cache", () => {
  const cache = new LRUPlanCache(10, 60000);
  assert.equal(cache.get("some-key"), null);
  assert.equal(cache.stats.misses, 1);
});

test("LRUPlanCache: set and get", () => {
  const cache = new LRUPlanCache(10, 60000);
  const plan = makePlan("test-question");
  cache.set("test-key", plan);
  const retrieved = cache.get("test-key");
  assert.deepEqual(retrieved, plan);
  assert.equal(cache.stats.hits, 1);
});

test("LRUPlanCache: LRU eviction at maxSize", () => {
  const cache = new LRUPlanCache(3, 60000);
  cache.set("key1", makePlan("p1"));
  cache.set("key2", makePlan("p2"));
  cache.set("key3", makePlan("p3"));
  // Access key1 to make it recently used
  cache.get("key1");
  // Adding key4 should evict key2 (oldest not accessed)
  cache.set("key4", makePlan("p4"));
  assert.equal(cache.stats.size, 3, "Cache should have 3 entries");
  assert.equal(cache.get("key2"), null, "key2 should be evicted");
  assert.ok(cache.get("key1"), "key1 should still be present");
});

test("LRUPlanCache: normalizeKey removes articles and punctuation", () => {
  const key1 = LRUPlanCache.normalizeKey("Find the volume of a cylinder");
  const key2 = LRUPlanCache.normalizeKey("find volume of cylinder");
  assert.equal(key1, key2, "Normalized keys should match");
});

test("LRUPlanCache: normalizeKey returns null for image queries", () => {
  const key = LRUPlanCache.normalizeKey("some text", { bytes: "data" });
  assert.equal(key, null, "Image queries should not be cached");
});

test("LRUPlanCache: normalizeKey returns null for very short keys", () => {
  const key = LRUPlanCache.normalizeKey("hi");
  assert.equal(key, null, "Very short keys should not be cached");
});

test("LRUPlanCache: hit rate calculation", () => {
  const cache = new LRUPlanCache(10, 60000);
  cache.set("k1", makePlan("p1"));
  cache.get("k1"); // hit
  cache.get("k1"); // hit
  cache.get("missing"); // miss
  const stats = cache.stats;
  assert.equal(stats.hits, 2);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRate, "66.7%");
});

test("LRUPlanCache: expired entries are not returned", async () => {
  // TTL of 50ms
  const cache = new LRUPlanCache(10, 50);
  cache.set("expiring-key", makePlan("p1"));
  // Wait 60ms
  await new Promise((resolve) => setTimeout(resolve, 60));
  const result = cache.get("expiring-key");
  assert.equal(result, null, "Expired entry should return null");
});

test("LRUPlanCache: clear resets all stats", () => {
  const cache = new LRUPlanCache(10, 60000);
  cache.set("k1", makePlan("p1"));
  cache.get("k1");
  cache.clear();
  assert.equal(cache.stats.size, 0);
  assert.equal(cache.stats.hits, 0);
  assert.equal(cache.stats.misses, 0);
});
