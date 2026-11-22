const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

describe("desktop editing access", () => {
  test("keeps the shared password entry visible in Settings", () => {
    const html = read("index.html");
    const section = html.match(/<section class="([^"]*)" id="admin-login-section">/);

    expect(section).not.toBeNull();
    expect(section[1]).not.toContain("mobile-only");
  });

  test("no longer offers a desktop dashboard oil selection in Settings", () => {
    const html = read("index.html");

    expect(html).not.toContain("Dashboard Config (Desktop)");
    expect(html).not.toContain("common-oils-checkbox-list");
  });

  test("requires the existing admin unlock before desktop editing", () => {
    const main = read("src", "main.js");
    const ui = read("src", "app-ui.js");

    expect(main).toContain("const isUnlocked = App.State.mobileAdminUnlocked;");
    expect(main).toContain("window.lockEditing = () => {");
    expect(main).toContain('document.body.classList.toggle("desktop-edit-mode", isUnlocked && App.UI.isDesktop());');
    expect(ui).toContain("const isPreview = viewMode === \"preview\" || (App.UI.isDesktop() && !mobileAdminUnlocked);");
    expect(ui).toContain('exitEditBtn.className = "btn-edit exit-edit-btn";');
    expect(ui).toContain('exitEditBtn.textContent = "Exit Edit Mode";');
  });

  test("locking closes the settings dialog so the preview is visible", () => {
    const main = read("src", "main.js");
    const lockEditing = main.slice(main.indexOf("window.lockEditing = () => {"), main.indexOf("const adminLockBtn"));

    expect(lockEditing).toContain('getElementById("modal-overlay")?.classList.add("hidden")');
  });

  test("the hidden count screen cannot stay on top of the preview", () => {
    expect(read("src", "styles", "05-count-mode.css")).toMatch(/\.count-mode\[hidden\][^{]*\{\s*display:\s*none\s*!important/);
  });

  test("uses a dedicated table for unlocked desktop editing", () => {
    const ui = read("src", "app-ui.js");

    expect(ui).toContain('list.classList.add("desktop-edit-layout");');
    expect(ui).toContain("App.UI.renderDesktopEditTable(list, displayProducts, inventory);");
    expect(ui).toContain('table.className = "desktop-edit-table";');
    expect(ui).toContain('addInput.id = "desktop-quick-add-name";');
  });

  test("protects desktop table input from incoming sync renders", () => {
    const sync = read("src", "app-sync.js");
    const main = read("src", "main.js");

    expect(sync).toContain('document.activeElement?.matches(".item-input, .desktop-edit-input")');
    expect(sync).toContain("App.Sync.pendingPullAfterEdit = true;");
    expect(main).toContain('event.target.matches(".item-input, .desktop-edit-input")');
  });
});
