// Runs in plain Node because the installed jsdom cannot be loaded through Jest's module system.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "..", ...parts), "utf8");

const loadApp = () => {
  const { window } = new JSDOM('<!doctype html><div id="app"></div><div id="sync-status"><span>Synced</span></div>', {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  const timers = [];
  window.setTimeout = (fn) => timers.push(fn);
  window.clearTimeout = (id) => { if (id) timers[id - 1] = null; };
  window.eval(read("src", "app-utils.js"));
  const { App } = window;
  App.State = {
    currentCategory: "Bulk Oil",
    categoryOrder: ["Bulk Oil"],
    products: { "Bulk Oil": ["A", "B", "C"] },
    inventory: { "Bulk Oil-A": "1000", "Bulk Oil-B": "800", "Bulk Oil-C": "" },
    sortDirection: "asc",
  };
  App.Sync = { saveSnapshot: async () => true };
  App.UI = {
    isDesktop: () => false,
    renderTabs() {},
    showToast() {},
    confirm: (_message, onYes) => onYes(),
    renderInventory: () => App.CountMode.show(),
  };
  window.updateValue = (name, value) => {
    App.State.inventory[App.Utils.getProductKey(App.State.currentCategory, name)] = value;
  };
  window.flushPendingSave = () => {};
  const deleted = [];
  window.deleteProduct = (cat, name) => {
    deleted.push(`${cat}/${name}`);
    App.State.products[cat] = App.State.products[cat].filter((p) => p !== name);
    delete App.State.inventory[App.Utils.getProductKey(cat, name)];
    App.UI.renderInventory();
    return true;
  };
  window.eval(read("src", "app-count-mode.js"));
  App.CountMode.init();
  App.CountMode.show();

  const q = (name) => window.document.querySelector(`[data-cm="${name}"]`);
  const key = (k) => window.document.querySelector(`[data-k="${k}"]`).click();
  const keys = (text) => [...text].forEach(key);
  const removeCurrent = () => {
    q("itemMenuBtn").click();
    q("deleteBtn").click();
    q("deleteConfirm").click();
  };
  const runTimers = () => timers.splice(0).forEach((fn) => fn?.());
  return { window, App, q, key, keys, removeCurrent, runTimers, deleted };
};

const scenarios = {
  "keeps existing stock until a new count is typed": () => {
    const { App, q, keys } = loadApp();
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "1000");
    assert.strictEqual(q("now").textContent, "–");
    assert.strictEqual(q("last").textContent, "1,000 L");
    keys("9");
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "9");
    assert.strictEqual(q("last").textContent, "1,000 L");
  },
  "erasing a new count restores the previous stock": () => {
    const { App, keys, key } = loadApp();
    keys("95");
    key("back");
    key("back");
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "1000");
  },
  "stores the tape in the existing expression format": () => {
    const { App, keys, key } = loadApp();
    keys("12*40");
    key("+");
    keys("100");
    key("-");
    keys("20");
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "12*40+100-20");
  },
  "next moves to the next uncounted product in any order": () => {
    const { window, q, keys, key } = loadApp();
    window.document.querySelector('[data-key="Bulk Oil-C"]').click();
    assert.strictEqual(q("name").textContent, "C");
    keys("600");
    key("next");
    assert.strictEqual(q("name").textContent, "A");
  },
  "an unusual count asks for confirmation before moving": () => {
    const { q, keys, key } = loadApp();
    keys("90");
    key("next");
    assert.strictEqual(q("checkSheet").hidden, false);
    assert.strictEqual(q("name").textContent, "A");
    q("keepBtn").click();
    assert.strictEqual(q("name").textContent, "B");
  },
  "undoing a clear works after switching category": () => {
    const { window, App, q, keys } = loadApp();
    App.State.products.Coolant = ["R"];
    App.State.categoryOrder.push("Coolant");
    App.CountMode.show();
    keys("900");
    window.document.querySelector(".cm-clear").click();
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "1000");
    window.document.querySelectorAll(".cm-tab")[1].click();
    assert.strictEqual(App.State.currentCategory, "Coolant");
    q("toastAction").click();
    assert.strictEqual(App.State.currentCategory, "Bulk Oil");
    assert.strictEqual(App.State.inventory["Bulk Oil-A"], "900");
    assert.strictEqual(App.State.inventory["Coolant-R"], undefined);
    assert.strictEqual(q("name").textContent, "A");
  },
  "undo cancels a delete before it syncs": () => {
    const { q, removeCurrent, runTimers, deleted } = loadApp();
    removeCurrent();
    assert.strictEqual(q("name").textContent, "B");
    assert.deepStrictEqual(deleted, []);
    q("toastAction").click();
    assert.strictEqual(q("name").textContent, "A");
    runTimers();
    assert.deepStrictEqual(deleted, []);
  },
  "delete syncs when the undo window ends": () => {
    const { removeCurrent, runTimers, deleted } = loadApp();
    removeCurrent();
    runTimers();
    assert.deepStrictEqual(deleted, ["Bulk Oil/A"]);
  },
  "exit finishes a pending delete and locks editing": () => {
    const { window, q, removeCurrent, deleted } = loadApp();
    let locked = 0;
    window.lockEditing = () => { locked += 1; };
    removeCurrent();
    q("exitBtn").click();
    assert.deepStrictEqual(deleted, ["Bulk Oil/A"]);
    assert.strictEqual(locked, 1);
  },
  "leaving the page completes a pending delete": () => {
    const { window, removeCurrent, deleted } = loadApp();
    removeCurrent();
    window.dispatchEvent(new window.Event("pagehide"));
    assert.deepStrictEqual(deleted, ["Bulk Oil/A"]);
  },
};

if (require.main === module) {
  const results = {};
  Object.entries(scenarios).forEach(([name, run]) => {
    try {
      run();
      results[name] = "";
    } catch (e) {
      results[name] = e.stack || String(e);
    }
  });
  console.log(JSON.stringify(results));
}
