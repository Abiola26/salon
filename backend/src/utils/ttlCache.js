'use strict';

const createTtlCache = (ttlMs) => {
  const entries = new Map();

  const isFresh = (entry) =>
    Boolean(entry && entry.expiresAt > Date.now());

  return {
    get(key) {
      const entry = entries.get(key);
      if (isFresh(entry)) return entry.value;
      if (entry) entries.delete(key);
      return null;
    },

    set(key, value) {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },

    async getOrSet(key, factory) {
      const cached = this.get(key);
      if (cached !== null) return cached;

      const value = await factory();
      return this.set(key, value);
    },

    delete(key) {
      entries.delete(key);
    },

    clear() {
      entries.clear();
    },
  };
};

module.exports = {
  createTtlCache,
};
