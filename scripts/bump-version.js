const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const level = (process.argv[2] || "patch").toLowerCase();

const files = {
  packageJson: path.join(root, "package.json"),
  appConfig: path.join(root, "src", "app-config.js"),
  indexHtml: path.join(root, "index.html"),
  sw: path.join(root, "sw.js"),
};

const read = (p) => fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
const write = (p, content) => fs.writeFileSync(p, content, "utf8");

const pkg = JSON.parse(read(files.packageJson));
const [major, minor, patch] = pkg.version.split(".").map((n) => parseInt(n, 10));

if ([major, minor, patch].some((n) => Number.isNaN(n))) {
  throw new Error(`Invalid package version: ${pkg.version}`);
}

let next = [major, minor, patch];
if (level === "major") next = [major + 1, 0, 0];
else if (level === "minor") next = [major, minor + 1, 0];
else next = [major, minor, patch + 1];

const nextVersion = next.join(".");
pkg.version = nextVersion;
write(files.packageJson, `${JSON.stringify(pkg, null, 2)}\n`);

let appConfig = read(files.appConfig);
appConfig = appConfig.replace(/VERSION:\s*"v\d+\.\d+\.\d+"/, `VERSION: "v${nextVersion}"`);
write(files.appConfig, appConfig);

let indexHtml = read(files.indexHtml);
indexHtml = indexHtml.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${nextVersion}`);
indexHtml = indexHtml.replace(/window\.__APP_VERSION__\s*=\s*"\d+\.\d+\.\d+"/, `window.__APP_VERSION__ = "${nextVersion}"`);
write(files.indexHtml, indexHtml);

let sw = read(files.sw);
sw = sw.replace(/inv-aiden-v\d+\.\d+\.\d+/, `inv-aiden-v${nextVersion}`);
write(files.sw, sw);

console.log(`Version bumped to ${nextVersion}`);
