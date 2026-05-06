const fs = require("fs");
const path = require("path");
const vm = require("vm");

const loadUI = () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "app-ui.js"), "utf8");
  const statusEl = {
    _classes: new Set(),
    title: "",
    querySelector: () => ({ innerText: "" }),
    classList: {
      toggle(cls, on) {
        if (on) statusEl._classes.add(cls);
        else statusEl._classes.delete(cls);
      },
    },
    removeAttribute(name) {
      if (name === "title") this.title = "";
    },
  };

  const context = {
    window: { App: {}, innerWidth: 1200 },
    App: {},
    document: {
      getElementById: (id) => (id === "sync-status" ? statusEl : null),
    },
    console,
  };
  context.App = context.window.App;
  context.App.State = { currentCategory: "" };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { UI: context.App.UI, State: context.App.State, statusEl };
};

describe("App.UI state helpers", () => {
  test("isBulkOilCategory detects bulk oil category", () => {
    const { UI, State } = loadUI();
    State.currentCategory = "Bulk Oil";
    expect(UI.isBulkOilCategory()).toBe(true);
    State.currentCategory = "Case Oil";
    expect(UI.isBulkOilCategory()).toBe(false);
  });

  test("updateSyncStatus sets tri-state classes", () => {
    const { UI, statusEl } = loadUI();

    UI.updateSyncStatus("Saving...", false);
    expect(statusEl._classes.has("syncing")).toBe(true);

    UI.updateSyncStatus("Cloud Synced", true);
    expect(statusEl._classes.has("online")).toBe(true);

    UI.updateSyncStatus("Saved (Local)", false);
    expect(statusEl._classes.has("local-only")).toBe(true);
    expect(statusEl.title).toContain("saved locally");
  });
});
