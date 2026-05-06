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
