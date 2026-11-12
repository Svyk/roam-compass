const SKIPPED = Symbol("skipped");

export function createFeatures() {
  const items = [];

  function call(feature, hook, args) {
    try {
      const fn = feature[hook];
      if (typeof fn !== "function") return SKIPPED;
      return feature[hook](...args);
    } catch (error) {
      console.error("[compass] feature", feature.name, hook, error);
      return undefined;
    }
  }

  return {
    add(feature) {
      if (feature == null) return null;
      if (typeof feature !== "object" || typeof feature.name !== "string" || !feature.name) {
        throw new TypeError("A feature must have a string name");
      }
      items.push(feature);
      return feature;
    },

    get(name) {
      return items.find((feature) => feature.name === name) ?? null;
    },

    list() {
      return [...items];
    },

    each(hook, ...args) {
      for (const feature of items) call(feature, hook, args);
    },

    any(hook, ...args) {
      for (const feature of items) {
        if (call(feature, hook, args) === true) return true;
      }
      return false;
    },

    first(hook, ...args) {
      for (const feature of items) {
        const result = call(feature, hook, args);
        if (result !== SKIPPED && result != null) return result;
      }
      return null;
    },

    pipe(hook, value, ...args) {
      let current = value;
      for (const feature of items) {
        const result = call(feature, hook, [current, ...args]);
        if (result !== SKIPPED && result != null) current = result;
      }
      return current;
    },

    collect(hook, ...args) {
      const out = [];
      for (const feature of items) {
        const result = call(feature, hook, args);
        if (Array.isArray(result)) out.push(...result);
      }
      return out;
    },
  };
}
