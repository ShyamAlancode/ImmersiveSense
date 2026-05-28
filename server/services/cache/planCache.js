/**
 * Plan Cache — LRU in-memory semantic cache for generated scene plans.
 * No Redis or external DB needed. Pure JS.
 *
 * - Max 200 entries (configurable)
 * - TTL: 24 hours
 * - Cache key: normalized question text (lowercased, articles stripped, whitespace collapsed)
 * - On hit: returns the cached plan in <1ms
 * - On miss: caller generates plan, then stores it
 */

const DEFAULT_MAX = 200;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class LRUPlanCache {
  constructor(maxSize = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    // Map preserves insertion order — we use it as an ordered LRU store
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  /** Normalize a question string into a stable cache key */
  static normalizeKey(questionText = "", imageAsset = null) {
    if (imageAsset) {
      // Don't cache image-based queries — too diverse
      return null;
    }
    const key = questionText
      .toLowerCase()
      .replace(/\b(the|a|an|find|what is|calculate|compute|evaluate|solve)\b/gi, "")
      .replace(/[?!.,;:'"]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return key.length >= 3 ? key : null;
  }

  get(key) {
    if (!key || !this._store.has(key)) {
      this._misses++;
      return null;
    }
    const entry = this._store.get(key);
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    // Refresh position (LRU: delete + re-insert = move to end)
    this._store.delete(key);
    this._store.set(key, entry);
    this._hits++;
    return entry.value;
  }

  set(key, value) {
    if (!key) return;
    if (this._store.has(key)) {
      this._store.delete(key);
    } else if (this._store.size >= this.maxSize) {
      // Evict the oldest (first) entry
      const firstKey = this._store.keys().next().value;
      this._store.delete(firstKey);
    }
    this._store.set(key, { value, createdAt: Date.now() });
  }

  invalidate(key) {
    if (key) this._store.delete(key);
  }

  clear() {
    this._store.clear();
    this._hits = 0;
    this._misses = 0;
  }

  get stats() {
    return {
      size: this._store.size,
      maxSize: this.maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? ((this._hits / (this._hits + this._misses)) * 100).toFixed(1) + "%"
        : "0%",
    };
  }
}

// Singleton instance
const planCache = new LRUPlanCache();

export { planCache, LRUPlanCache };
export default planCache;
