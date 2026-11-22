const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const helper = path.join(__dirname, "helpers", "count-mode-scenarios.js");

const loadUtils = () => {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "app-utils.js"), "utf8"), context);
  return context.App.Utils;
};

describe("expression entries", () => {
  const Utils = loadUtils();

  test("splits a count into signed entries", () => {
    expect(JSON.parse(JSON.stringify(Utils.splitExpression("12*40+100-20")))).toEqual([
      { s: "+", e: "12*40" },
      { s: "+", e: "100" },
      { s: "-", e: "20" },
    ]);
  });

  test.each(["(2+3)*4", "10/2", "-5+3", "5*-2", "+5", "5++3", "1,500", "12 5", "5-"])(
    "keeps %s exactly as stored",
    (raw) => expect(Utils.joinExpression(Utils.splitExpression(raw))).toBe(raw),
  );
});

describe("phone count mode", () => {
  const results = JSON.parse(execFileSync(process.execPath, [helper], { encoding: "utf8" }));

  test.each(Object.keys(results))("%s", (name) => {
    expect(results[name]).toBe("");
  });
});
