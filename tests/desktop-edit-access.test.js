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

  test("keeps desktop dashboard configuration outside the edit lock", () => {
    const html = read("index.html");

    expect(html.indexOf("Dashboard Config (Desktop)")).toBeLessThan(
      html.indexOf('id="admin-protected-content"'),
    );
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
});
