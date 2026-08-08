const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const localAssets = [
  "html2pdf-0.10.1.bundle.min.js",
  "supabase-2.45.1.js",
  "chart-4.4.7.umd.min.js",
  "chartjs-plugin-datalabels-2.2.0.min.js",
];

describe("local runtime dependencies", () => {
  test("references only versioned local runtime scripts", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

    localAssets.forEach((asset) => {
      expect(html).toContain(`assets/vendor/${asset}`);
    });
    expect(html).not.toContain("unpkg.com/@supabase");
    expect(html).not.toContain("cdn.jsdelivr.net/npm/chart.js");
  });

  test("records the current SHA-384 hash for each local asset", () => {
    const versions = fs.readFileSync(path.join(root, "assets", "vendor", "VERSIONS.md"), "utf8");

    localAssets.forEach((asset) => {
      const data = fs.readFileSync(path.join(root, "assets", "vendor", asset));
      const hash = crypto.createHash("sha384").update(data).digest("base64");

      expect(versions).toContain(`\`${asset}\``);
      expect(versions).toContain(`sha384-${hash}`);
    });
  });
});
