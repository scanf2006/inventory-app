const fs = require("fs");
const path = require("path");
const vm = require("vm");
const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

// Load config, utils and main.js into a minimal fake browser with UI/Sync stubbed out
const loadApp = () => {
  const store = {};
  const context = {
    console: { log() {}, warn() {}, error() {} },
    navigator: { userAgent: "node" },
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
    },
    addEventListener() {},
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("src", "app-config.js"), context);
  vm.runInContext(read("src", "app-utils.js"), context);
  const noop = () => {};
  context.App.UI = new Proxy(
    { confirm: (_msg, onYes) => onYes(), isDesktop: () => false },
    { get: (t, k) => (k in t ? t[k] : noop) },
  );
  context.App.Sync = { pushWithRetry: () => Promise.resolve({ ok: true }) };
  vm.runInContext(read("src", "main.js"), context);

  const { State } = context.App;
  State.products = { Oil: ["A"], "Oil-Bulk": ["B"] };
  State.categoryOrder = ["Oil", "Oil-Bulk"];
  State.inventory = { "Oil-A": "1", "Oil-Bulk-B": "2" };
  State.currentCategory = "Oil";
  return context;
};

describe("category rename/delete keeps other categories intact", () => {
  test("deleting 'Oil' does not touch 'Oil-Bulk' inventory", () => {
    const window = loadApp();
    window.removeCategory("Oil");

    expect(window.App.State.inventory).toEqual({ "Oil-Bulk-B": "2" });
    expect(Object.keys(window.App.State.products)).toEqual(["Oil-Bulk"]);
  });

  test("renaming 'Oil' moves only its own products", () => {
    const window = loadApp();
    window.prompt = () => "  Engine Oil  ";
    window.editCategory("Oil");

    expect(window.App.State.inventory).toEqual({ "Engine Oil-A": "1", "Oil-Bulk-B": "2" });
    expect(window.App.State.categoryOrder).toEqual(["Engine Oil", "Oil-Bulk"]);
  });
});

describe("PWA wiring", () => {
  test("main.js registers the service worker", () => {
    expect(read("src", "main.js")).toContain('.register("./sw.js")');
  });

  test("sw.js only references constants it defines", () => {
    const sw = read("sw.js");
    expect(sw).not.toContain("OPTIONAL_CACHE_NAME");
    // Evaluating the script must not throw (catches undefined top-level references)
    const listeners = {};
    const context = { self: { addEventListener: (n, fn) => (listeners[n] = fn) }, console };
    vm.runInNewContext(sw, context);
    expect(Object.keys(listeners).sort()).toEqual(["activate", "fetch", "install"]);
  });

  test("activate removes every old cache without throwing", async () => {
    const deleted = [];
    const current = read("sw.js").match(/CACHE_NAME = '([^']+)'/)[1];
    const context = {
      self: { addEventListener: (n, fn) => (context[n] = fn), skipWaiting() {}, clients: { claim() {} } },
      caches: {
        keys: async () => ["inv-aiden-v3.8.50", "inv-aiden-opt-v1", current],
        delete: async (name) => deleted.push(name),
      },
      console: { log() {} },
    };
    vm.runInNewContext(read("sw.js"), context);
    let pending;
    context.activate({ waitUntil: (p) => (pending = p) });
    await pending;
    expect(deleted.sort()).toEqual(["inv-aiden-opt-v1", "inv-aiden-v3.8.50"]);
  });
});
