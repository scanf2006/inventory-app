const fs = require("fs");
const path = require("path");
const vm = require("vm");

const loadUtils = () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "app-utils.js"), "utf8");
  const context = {
    window: { App: {} },
    document: {
      createElement: () => {
        const el = { _text: "" };
        Object.defineProperty(el, "textContent", {
          set(v) { this._text = String(v); },
          get() { return this._text; },
        });
        Object.defineProperty(el, "innerHTML", {
          get() { return this._text; },
        });
        return el;
      },
    },
    localStorage: { getItem: () => null },
    console,
  };
  context.App = context.window.App;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.App.Utils;
};

describe("App.Utils.normalizeMathInput", () => {
  const Utils = loadUtils();

  test("maps dash to multiply when enabled", () => {
    expect(
      Utils.normalizeMathInput("10-2-3", {
        mapDashToMultiply: true,
        mapHashToMultiply: false,
      }),
    ).toBe("10*2*3");
  });

  test("maps hash to multiply when enabled", () => {
    expect(
      Utils.normalizeMathInput("10#2", {
        mapDashToMultiply: false,
        mapHashToMultiply: true,
      }),
    ).toBe("10*2");
  });

  test("does not mutate input when rules disabled", () => {
    expect(
      Utils.normalizeMathInput("10-2#3", {
        mapDashToMultiply: false,
        mapHashToMultiply: false,
      }),
    ).toBe("10-2#3");
  });
});

describe("App.Utils.evaluateExpression", () => {
  const Utils = loadUtils();

  test.each([
    ["10-2-3", 5],
    ["5*-2", -10],
    [".5", 0.5],
    ["2+.5", 2.5],
    ["+5", 5],
    ["-5", -5],
    ["5++3", 8],
    ["1,5", 1.5],
    ["1,500", 1500],
    ["1,000,000", 1000000],
    ["10+5*3", 25],
    ["(2+3)*4", 20],
  ])("%s equals %d", (expr, expected) => {
    expect(Utils.evaluateExpression(expr)).toEqual({ value: expected, valid: true });
  });

  test.each([["5*", 5], ["12/", 12], ["12+", 12], ["5-", 5], ["2*(3+", 6]])(
    "unfinished %s keeps the total so far",
    (expr, expected) => {
      expect(Utils.evaluateExpression(expr)).toEqual({ value: expected, valid: true });
    },
  );

  test.each(["5**3", "12 5", "1.2.3", "5/0", "5)", "12a"])("%s is flagged", (expr) => {
    expect(Utils.evaluateExpression(expr).valid).toBe(false);
  });
});
