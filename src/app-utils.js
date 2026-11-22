/**
 * App Utility Functions
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Utils = {
  // Safe localStorage JSON getter
  safeGetJSON: (key, defaultValue) => {
    try {
      const item = localStorage.getItem(key);
      if (!item || item === "undefined" || item === "null") return defaultValue;
      return JSON.parse(item) || defaultValue;
    } catch (e) {
      console.warn(`Storage read error for key "${key}":`, e);
      return defaultValue;
    }
  },

  // Generic debounce for performance optimization
  debounce: (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  // Pure arithmetic parser: tokenize and compute without eval/Function
  safeEvaluate: (expr) => App.Utils.evaluateExpression(expr).value,

  // Returns the total plus whether the text is a usable expression.
  // An unfinished entry such as "5*" is valid and shows the total so far.
  evaluateExpression: (expr) => {
    if (!expr || typeof expr !== "string" || expr.trim() === "") {
      return { value: 0, valid: true };
    }

    // "1,500" is a thousands separator; any other comma is a decimal point
    const text = expr.replace(/(\d),(?=\d{3}(?!\d))/g, "$1").replace(/,/g, ".");
    const cleanExpr = text.replace(/[^0-9+\-*/(). ]/g, "");
    let valid = cleanExpr === text;

    try {
      const tokens = cleanExpr.match(/\d+\.?\d*|\.\d+|[+\-*/()]/g);
      if (!tokens) return { value: 0, valid };
      let pos = 0;

      // Parsers return null when there is no operand to read
      const parseExpr = () => {
        let result = parseTerm();
        while (result !== null && (tokens[pos] === "+" || tokens[pos] === "-")) {
          const op = tokens[pos++];
          const right = parseTerm();
          if (right === null) break;
          result = op === "+" ? result + right : result - right;
        }
        return result;
      };

      const parseTerm = () => {
        let result = parseFactor();
        while (result !== null && (tokens[pos] === "*" || tokens[pos] === "/")) {
          const op = tokens[pos++];
          const right = parseFactor();
          if (right === null) break;
          if (op === "/" && right === 0) {
            valid = false;
            result = 0;
          } else {
            result = op === "*" ? result * right : result / right;
          }
        }
        return result;
      };

      const parseFactor = () => {
        const token = tokens[pos];
        if (token === undefined) return null;
        if (token === "+" || token === "-") {
          pos++;
          const operand = parseFactor();
          if (operand === null) return null;
          return token === "-" ? -operand : operand;
        }
        if (token === "(") {
          pos++;
          const inner = parseExpr();
          if (tokens[pos] === ")") pos++;
          return inner;
        }
        if (token === "*" || token === "/" || token === ")") {
          valid = false;
          return null;
        }
        pos++;
        return parseFloat(token);
      };

      const result = parseExpr();
      if (pos < tokens.length) valid = false;
      const value = result === null ? 0 : Math.round(result * 100) / 100;
      return { value: value || 0, valid };
    } catch (e) {
      return { value: 0, valid: false };
    }
  },

  // Normalize keypad input for math-friendly entry on mobile keyboards
  normalizeMathInput: (value, rules = {}) => {
    if (typeof value !== "string") return value || "";
    let normalized = value;

    if (rules.mapDashToMultiply) normalized = normalized.replace(/-/g, "*");
    if (rules.mapHashToMultiply) normalized = normalized.replace(/#/g, "*");

    return normalized;
  },

  // Prefer explicit inventory operation history for display timestamps.
  // Falls back to lastInventoryUpdate when history is empty/unavailable.
  getLastInventoryDisplayTs: () => {
    const h0 = App.State?.history?.[0];
    if (h0 && typeof h0.timestamp === "number" && h0.timestamp > 0) {
      return h0.timestamp;
    }
    const ts = App.State?.lastInventoryUpdate || 0;
    return typeof ts === "number" ? ts : 0;
  },

  // Helper: Generate unique inventory key
  getProductKey: (category, product) => `${category}-${product}`,

  // Helper: Get product list for current category safely
  getCurrentProducts: () => {
    const { currentCategory, products } = App.State;
    if (!currentCategory || !products) return [];
    return products[currentCategory] || [];
  },

  // Helper: Every product currently listed under a Bulk Oil category
  getBulkOilProducts: () => {
    const products = App.State.products || {};
    const bulk = new Set();
    Object.keys(products).forEach((cat) => {
      if (cat.toLowerCase().includes("bulk oil")) {
        (products[cat] || []).forEach((p) => bulk.add(p));
      }
    });
    return bulk;
  },

  // Helper: Escape illegal characters for inline HTML/JS injections
  escapeStr: (str) => {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  },

  // Security Feature: Escape HTML to prevent XSS
  escapeHTML: (str) => {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
