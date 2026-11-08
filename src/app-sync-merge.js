/**
 * Three-way merge for cloud sync.
 *
 * "base" is the cloud state this device last synced with. Anything where local
 * differs from base is a local change and is applied on top of the latest cloud
 * state; everything else comes from the cloud. This lets two devices edit
 * different items at the same time without overwriting each other.
 */
window.App = window.App || {};

App.SyncMerge = {
  // JSON with sorted object keys, so equal data compares equal regardless of key order
  stableStringify: (value) => {
    if (Array.isArray(value)) return `[${value.map(App.SyncMerge.stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${App.SyncMerge.stableStringify(value[k])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  },

  same: (a, b) => App.SyncMerge.stableStringify(a) === App.SyncMerge.stableStringify(b),

  clone: (value) => JSON.parse(JSON.stringify(value)),

  // Fill in missing fields so merge code can rely on the shape
  normalize: (data) => ({
    products: data?.products && typeof data.products === "object" ? data.products : {},
    inventory: data?.inventory && typeof data.inventory === "object" ? data.inventory : {},
    category_order: Array.isArray(data?.category_order) ? data.category_order : [],
    recent_history: Array.isArray(data?.recent_history) ? data.recent_history : [],
    live_messages: Array.isArray(data?.live_messages) ? data.live_messages : [],
  }),

  // Merge an ordered list of names (products in a category, or category order)
  mergeList: (cloud = [], local = [], base = []) => {
    const { same } = App.SyncMerge;
    if (same(local, base)) return [...cloud];
    if (same(cloud, base)) return [...local];

    const removed = new Set(base.filter((x) => !local.includes(x)));
    const added = local.filter((x) => !base.includes(x));
    const reordered = removed.size === 0 && added.length === 0;

    // A pure local reorder keeps the local order; otherwise keep the cloud order
    const result = reordered
      ? [...local.filter((x) => cloud.includes(x)), ...cloud.filter((x) => !local.includes(x))]
      : cloud.filter((x) => !removed.has(x));

    // Items added at the end locally stay at the end; others go right after the
    // item they follow locally, so a rename keeps its position
    const lastKept = local.reduce((last, x, i) => (base.includes(x) ? i : last), -1);
    added.forEach((x) => {
      if (result.includes(x)) return;
      const idx = local.indexOf(x);
      const pred = idx > 0 ? local[idx - 1] : undefined;
      const predPos = pred === undefined ? -1 : result.indexOf(pred);
      if (idx > lastKept) result.push(x);
      else if (idx === 0) result.unshift(x);
      else if (predPos >= 0) result.splice(predPos + 1, 0, x);
      else result.push(x);
    });
    return result;
  },

  mergeInventory: (cloud = {}, local = {}, base = {}) => {
    const result = { ...cloud };
    new Set([...Object.keys(local), ...Object.keys(base)]).forEach((k) => {
      if (local[k] === base[k]) return;
      if (local[k] === undefined) delete result[k];
      else result[k] = local[k];
    });
    return result;
  },

  mergeProducts: (cloud = {}, local = {}, base = {}) => {
    const { same, mergeList } = App.SyncMerge;
    const result = {};
    const cats = new Set([...Object.keys(cloud), ...Object.keys(local), ...Object.keys(base)]);
    cats.forEach((c) => {
      const inCloud = c in cloud;
      const inLocal = c in local;
      const inBase = c in base;
      if (!inLocal && inBase) return; // deleted on this device
      if (!inLocal) {
        result[c] = [...cloud[c]]; // added elsewhere
        return;
      }
      if (!inCloud && inBase) {
        // deleted elsewhere; keep it only if this device changed it meanwhile
        if (!same(local[c], base[c])) result[c] = [...local[c]];
        return;
      }
      result[c] = mergeList(cloud[c] || [], local[c], base[c] || []);
    });
    return result;
  },

  // Union of both histories, newest first; repeated edits of one product collapse
  mergeHistory: (cloud = [], local = [], limit = 6) => {
    const seen = new Set();
    const all = [...local, ...cloud]
      .filter((h) => h && typeof h === "object")
      .filter((h) => {
        const key = `${h.category}|${h.product}|${h.timestamp}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const result = [];
    all.forEach((h) => {
      const prev = result[result.length - 1];
      if (prev && prev.product === h.product && prev.category === h.category) return;
      result.push(h);
    });
    return result.slice(0, limit);
  },

  mergeMessages: (cloud = [], local = [], limit = 10) => {
    const seen = new Set();
    return [...local, ...cloud]
      .filter((m) => {
        const key = JSON.stringify(m);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => ((b && b.ts) || 0) - ((a && a.ts) || 0))
      .slice(0, limit);
  },

  // base = null means "no known common state": every local difference wins
  mergePayload: (cloudIn, localIn, baseIn) => {
    const M = App.SyncMerge;
    const cloud = M.normalize(cloudIn);
    const local = M.normalize(localIn);
    const base = baseIn ? M.normalize(baseIn) : cloud;
    return {
      products: M.mergeProducts(cloud.products, local.products, base.products),
      inventory: M.mergeInventory(cloud.inventory, local.inventory, base.inventory),
      category_order: M.mergeList(cloud.category_order, local.category_order, base.category_order),
      recent_history: M.mergeHistory(cloud.recent_history, local.recent_history),
      live_messages: M.mergeMessages(cloud.live_messages, local.live_messages),
    };
  },

  // Does local hold changes the cloud (base) does not have yet?
  hasLocalChanges: (localIn, baseIn) => {
    if (!baseIn) return true;
    const M = App.SyncMerge;
    const local = M.normalize(localIn);
    const base = M.normalize(baseIn);
    return ["products", "inventory", "category_order", "live_messages"].some(
      (f) => !M.same(local[f], base[f]),
    );
  },
};
