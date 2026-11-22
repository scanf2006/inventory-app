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

describe("desktop chart oil selection", () => {
  const loadChartApp = () => {
    const window = loadApp();
    const { App } = window;
    vm.runInContext(read("src", "app-ui-desktop.js"), window);
    App.UI.isDesktop = () => true;
    App.UI.isBulkOilCategory = () => true;
    App.State.products = { "Bulk Oil": ["R-P520S-B", "5W30S"] };
    App.State.categoryOrder = ["Bulk Oil"];
    App.State.currentCategory = "Bulk Oil";
    App.State.inventory = { "Bulk Oil-R-P520S-B": "700", "Bulk Oil-5W30S": "300" };
    window.matchMedia = () => ({ matches: false });
    window.document.getElementById = (id) => (id === "inventoryChart" ? { getContext: () => ({}) } : null);
    window.Chart = function Chart(_ctx, config) {
      this.config = config;
      this.destroy = () => {};
    };
    return window;
  };

  test("the chart shows every current Bulk Oil product", () => {
    const window = loadChartApp();
    window.App.UI.renderDesktopChart();

    const { labels, datasets } = window.App.State.chartInstance.config.data;
    expect(Array.from(labels)).toEqual(["R-P520S-B", "5W30S"]);
    expect(Array.from(datasets[0].data)).toEqual([700, 300]);
  });

  test("the chart total ignores the same product in other categories", () => {
    const window = loadChartApp();
    const { State } = window.App;
    State.products["Case Oil"] = ["5W30S"];
    State.inventory["Case Oil-5W30S"] = "50";
    window.App.UI.renderDesktopChart();

    expect(Array.from(State.chartInstance.config.data.datasets[0].data)).toEqual([700, 300]);
  });

  test("a renamed oil appears in the chart under its new name only", () => {
    const window = loadChartApp();
    window.prompt = () => "R-P530S-B";
    window.renameProductInline("5W30S");
    window.App.UI.renderDesktopChart();

    const { labels, datasets } = window.App.State.chartInstance.config.data;
    expect(Array.from(labels)).toEqual(["R-P520S-B", "R-P530S-B"]);
    expect(Array.from(datasets[0].data)).toEqual([700, 300]);
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
