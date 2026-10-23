// Fixed-window in-memory limiter. Single process only (fine for the one VPS node).
export function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return {
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      if (buckets.size > 10000) {
        for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
      }
      if (b.count >= limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
      b.count += 1;
      return { ok: true, remaining: limit - b.count };
    }
  };
}
