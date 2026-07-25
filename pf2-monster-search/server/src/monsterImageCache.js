export class MonsterImageCache {
  constructor({ maxEntries = 1000 } = {}) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 1000);
    this.entries = new Map();
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
      this.entries.delete(monsterId);
    }

    this.entries.set(monsterId, entry);

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
  }

  has(monsterId) {
    return this.entries.has(monsterId);
  }

  clear() {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    let bytes = 0;
    for (const entry of this.entries.values()) {
      bytes += entry.byteLength || 0;
    }

    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      bytes
    };
  }
}
