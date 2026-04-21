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
  safeEvaluate: (expr) => {
    if (!expr || typeof expr !== "string" || expr.trim() === "") return 0;
    const cleanExpr = expr.replace(/[^0-9+\-*/(). ]/g, "");
    if (!cleanExpr) return 0;

    try {
      const tokens = cleanExpr.match(/(?:\d+\.?\d*|[+\-*/()])/g);
      if (!tokens) return 0;
      let pos = 0;

      const parseExpr = () => {
        let result = parseTerm();
        while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
          const op = tokens[pos++];
          const right = parseTerm();
          result = op === "+" ? result + right : result - right;
        }
        return result;
      };

      const parseTerm = () => {
        let result = parseFactor();
        while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
          const op = tokens[pos++];
          const right = parseFactor();
          if (op === "/" && right === 0) return 0;
          result = op === "*" ? result * right : result / right;
        }
        return result;
      };

      const parseFactor = () => {
        if (tokens[pos] === "(") {
          pos++;
          const result = parseExpr();
          if (tokens[pos] === ")") pos++;
          return result;
        }
        const num = parseFloat(tokens[pos++]);
        return isNaN(num) ? 0 : num;
      };

      const result = parseExpr();
      return isNaN(result) ? 0 : Math.round(result * 100) / 100;
    } catch (e) {
      return 0;
    }
  },

  // Helper: Generate unique inventory key
  getProductKey: (category, product) => `${category}-${product}`,

  // Helper: Get product list for current category safely
  getCurrentProducts: () => {
    const { currentCategory, products } = App.State;
    if (!currentCategory || !products) return [];
    return products[currentCategory] || [];
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
