export class MonsterImageCache {
  constructor({ maxEntries = 1000, maxBytes = 128 * 1024 * 1024 } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 1000);
    this.maxBytes = Math.max(1024 * 1024, Number(maxBytes) || 128 * 1024 * 1024);
    this.entries = new Map();
    this.totalBytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  get(monsterId) {
    const entry = this.entries.get(monsterId);
    if (!entry) {
      this.misses += 1;
      return null;
    }

    this.entries.delete(monsterId);
    this.entries.set(monsterId, entry);
    this.hits += 1;
    return entry;
  }

  set(monsterId, entry) {
    if (this.entries.has(monsterId)) {
      const existing = this.entries.get(monsterId);
      this.totalBytes -= existing.byteLength || 0;
      this.entries.delete(monsterId);
    }

    this.entries.set(monsterId, entry);
    this.totalBytes += entry.byteLength || 0;

    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.totalBytes -= oldest?.byteLength || 0;
      this.entries.delete(oldestKey);
    }
  }

  has(monsterId) {
    return this.entries.has(monsterId);
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
      bytes: this.totalBytes
    };
  }
}
