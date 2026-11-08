const fs = require("fs");
const path = require("path");
const vm = require("vm");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const clone = (v) => JSON.parse(JSON.stringify(v));

// In-memory stand-in for the Supabase "app_sync" table (only what the app uses)
const makeDb = () => {
  const rows = {};
  const hooks = { beforeUpdate: null };
  const client = {
    from: () => {
      const q = { op: null, filters: {}, payload: null };
      const run = async () => {
        const id = q.filters.sync_id ?? q.payload?.sync_id;
        if (q.op === "select") {
          return { data: rows[id] ? clone(rows[id]) : null, error: null };
        }
        if (q.op === "insert") {
          if (rows[id]) return { data: null, error: { code: "23505" } };
          rows[id] = { data: clone(q.payload.data), updated_at: q.payload.updated_at };
          return { data: [{ updated_at: q.payload.updated_at }], error: null };
        }
        if (q.op === "update") {
          if (hooks.beforeUpdate) {
            const hook = hooks.beforeUpdate;
            hooks.beforeUpdate = null;
            await hook();
          }
          const row = rows[id];
          if (!row || row.updated_at !== q.filters.updated_at) return { data: [], error: null };
          rows[id] = { data: clone(q.payload.data), updated_at: q.payload.updated_at };
          return { data: [{ updated_at: q.payload.updated_at }], error: null };
        }
        throw new Error(`unsupported op ${q.op}`);
      };
      const builder = {
        select() {
          if (!q.op) q.op = "select";
          return builder;
        },
        eq(k, v) {
          q.filters[k] = v;
          return builder;
        },
        insert(p) {
          q.op = "insert";
          q.payload = p;
          return builder;
        },
        update(p) {
          q.op = "update";
          q.payload = p;
          return builder;
        },
        maybeSingle: () => run(),
        then: (res, rej) => run().then(res, rej),
      };
      return builder;
    },
  };
  return { rows, hooks, client };
};

// One simulated device running the real config/utils/merge/sync/main code
const makeDevice = (db, products = { Oil: ["A", "B"] }) => {
  const store = {};
  const context = {
    console: { log() {}, warn() {}, error() {} },
    navigator: { userAgent: "node" },
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: (k) => delete store[k],
    },
    addEventListener() {},
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.createContext(context);
  ["app-config.js", "app-utils.js", "app-sync-merge.js", "app-sync.js"].forEach((f) =>
    vm.runInContext(read("src", f), context),
  );
  const noop = () => {};
  context.App.UI = new Proxy(
    { isDesktop: () => false, confirm: (_msg, onYes) => onYes() },
    { get: (t, k) => (k in t ? t[k] : noop) },
  );
  vm.runInContext(read("src", "main.js"), context);
  // Push manually in tests instead of on a debounce timer
  context.saveToStorage = () => context.saveToStorageImmediate();

  const { App } = context;
  App.Services.supabase = db.client;
  Object.assign(App.State, {
    syncId: "shop",
    products: clone(products),
    categoryOrder: Object.keys(products),
    inventory: {},
    history: [],
    liveMessages: [],
    currentCategory: Object.keys(products)[0],
  });
  return {
    App,
    set: (name, value) => context.updateValue(name, value, 0),
    inv: () => clone(App.State.inventory),
    reset: () => context.resetInventory(),
    push: () => App.Sync.push(),
    pull: () => App.Sync.pull(true),
  };
};

// Two devices that both start from the same cloud state
const twoDevices = async () => {
  const db = makeDb();
  const a = makeDevice(db);
  const b = makeDevice(db);
  await a.push();
  await b.pull();
  return { db, a, b };
};

describe("cloud sync between two devices", () => {
  test("edits to different items on two devices are both kept", async () => {
    const { db, a, b } = await twoDevices();
    a.set("A", "5");
    b.set("B", "7");
    await a.push();
    await b.push(); // b's copy is stale, but must not erase a's edit

    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "5", "Oil-B": "7" });
    expect(b.inv()).toEqual({ "Oil-A": "5", "Oil-B": "7" });
    await a.pull();
    expect(a.inv()).toEqual({ "Oil-A": "5", "Oil-B": "7" });
  });

  test("a write that lands between read and write is merged, not overwritten", async () => {
    const { db, a, b } = await twoDevices();
    a.set("A", "5");
    b.set("B", "7");
    db.hooks.beforeUpdate = () => b.push(); // b writes right after a has read the row
    const result = await a.push();

    expect(result.ok).toBe(true);
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "5", "Oil-B": "7" });
  });

  test("pulling keeps local edits that were not pushed yet", async () => {
    const { db, a, b } = await twoDevices();
    a.set("A", "5"); // e.g. offline, not pushed
    b.set("B", "7");
    await b.push();
    await a.pull();

    expect(a.inv()).toEqual({ "Oil-A": "5", "Oil-B": "7" });
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "5", "Oil-B": "7" });
  });

  test("the same item edited on both devices takes the last push", async () => {
    const { db, a, b } = await twoDevices();
    a.set("A", "5");
    b.set("A", "9");
    await a.push();
    await b.push();
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "9" });
  });

  test("edits made while a push is in flight are not lost", async () => {
    const { db, a } = await twoDevices();
    a.set("A", "5");
    db.hooks.beforeUpdate = () => a.set("B", "3");
    await a.push();

    expect(a.inv()).toEqual({ "Oil-A": "5", "Oil-B": "3" });
    await a.push();
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "5", "Oil-B": "3" });
  });

  test("products added on two devices are both kept", async () => {
    const { db, a, b } = await twoDevices();
    a.App.State.products.Oil.push("C");
    b.App.State.products.Oil.push("D");
    await a.push();
    await b.push();
    expect(db.rows.shop.data.products.Oil).toEqual(["A", "B", "C", "D"]);
  });

  test("reset on one device reaches the other device", async () => {
    const { a, b } = await twoDevices();
    a.set("A", "5");
    a.set("B", "6");
    await a.push();
    await b.pull();
    expect(b.inv()).toEqual({ "Oil-A": "5", "Oil-B": "6" });

    a.reset();
    await a.push();
    await b.pull();
    expect(b.inv()).toEqual({ "Oil-A": "", "Oil-B": "" });
  });

  test("reset also clears a value this device has not received yet", async () => {
    const { db, a, b } = await twoDevices();
    a.set("A", "8");
    await a.push(); // b has not pulled this yet
    b.reset();
    await b.push();
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "", "Oil-B": "" });
  });

  test("an empty cloud row never wipes local data", async () => {
    const db = makeDb();
    db.rows.shop = { data: { products: {}, inventory: {} }, updated_at: "2026-01-01T00:00:00.000Z" };
    const a = makeDevice(db);
    a.App.State.inventory = { "Oil-A": "4" };
    await a.pull();

    expect(a.inv()).toEqual({ "Oil-A": "4" });
    expect(db.rows.shop.data.inventory).toEqual({ "Oil-A": "4" });
  });

  test("first sync on a device with no data takes the cloud copy", async () => {
    const db = makeDb();
    const a = makeDevice(db);
    a.set("A", "5");
    await a.push();
    const fresh = makeDevice(db, { Oil: ["A", "B"], Spare: [] });
    await fresh.pull();

    expect(fresh.inv()).toEqual({ "Oil-A": "5" });
    expect(Object.keys(fresh.App.State.products)).toEqual(["Oil"]);
  });
});

describe("merge helpers", () => {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("src", "app-sync-merge.js"), ctx);
  const M = ctx.App.SyncMerge;

  test("a local rename keeps the item's position", () => {
    expect(M.mergeList(["A", "B", "C", "D"], ["A", "X", "C"], ["A", "B", "C"])).toEqual(["A", "X", "C", "D"]);
  });

  test("a local reorder wins and keeps items added elsewhere", () => {
    expect(M.mergeList(["A", "B", "C", "D"], ["C", "A", "B"], ["A", "B", "C"])).toEqual(["C", "A", "B", "D"]);
  });

  test("history merges both sides and collapses repeated edits of one product", () => {
    const h = (product, timestamp) => ({ product, category: "Oil", value: "1", timestamp });
    const merged = M.mergeHistory([h("A", 1), h("B", 3)], [h("C", 6), h("B", 5)]);
    expect(merged.map((x) => `${x.product}${x.timestamp}`)).toEqual(["C6", "B5", "A1"]);
  });

  test("a category deleted elsewhere stays deleted unless changed locally", () => {
    const base = { Oil: ["A"], Tank: ["T"] };
    expect(Object.keys(M.mergeProducts({ Oil: ["A"] }, base, base))).toEqual(["Oil"]);
    expect(M.mergeProducts({ Oil: ["A"] }, { Oil: ["A"], Tank: ["T", "U"] }, base).Tank).toEqual(["T", "U"]);
  });
});
