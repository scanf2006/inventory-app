/**
 * App Utility Functions
 * Waycred Inventory v3.2 Modularization
 */
window.App = window.App || {};

App.Utils = {
  // Safe localStorage JSON getter
  safeGetJSON: function (key, defaultValue) {
    try {
      var item = localStorage.getItem(key);
      if (!item || item === "undefined" || item === "null") return defaultValue;
      return JSON.parse(item) || defaultValue;
    } catch (e) {
      return defaultValue;
    }
  },

  // Generic debounce for performance optimization
  debounce: function (func, wait) {
    var timeout;
    return function () {
      var context = this,
        args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        func.apply(context, args);
      }, wait);
    };
  },

  // Pure arithmetic parser: tokenize and compute without eval/Function
  safeEvaluate: function (expr) {
    if (!expr || typeof expr !== "string" || expr.trim() === "") return 0;
    var cleanExpr = expr.replace(/[^0-9+\-*/(). ]/g, "");
    if (!cleanExpr) return 0;
    try {
      var tokens = cleanExpr.match(/(?:\d+\.?\d*|[+\-*/()])/g);
      if (!tokens) return 0;
      var pos = 0;
      function parseExpr() {
        var result = parseTerm();
        while (
          pos < tokens.length &&
          (tokens[pos] === "+" || tokens[pos] === "-")
        ) {
          var op = tokens[pos++];
          var right = parseTerm();
          result = op === "+" ? result + right : result - right;
        }
        return result;
      }
      function parseTerm() {
        var result = parseFactor();
        while (
          pos < tokens.length &&
          (tokens[pos] === "*" || tokens[pos] === "/")
        ) {
          var op = tokens[pos++];
          var right = parseFactor();
          if (op === "/" && right === 0) return 0;
          result = op === "*" ? result * right : result / right;
        }
        return result;
      }
      function parseFactor() {
        if (tokens[pos] === "(") {
          pos++;
          var result = parseExpr();
          if (tokens[pos] === ")") pos++;
          return result;
        }
        var num = parseFloat(tokens[pos++]);
        return isNaN(num) ? 0 : num;
      }
      var result = parseExpr();
      return isNaN(result) ? 0 : Math.round(result * 100) / 100;
    } catch (e) {
      return 0;
    }
  },

  // Helper: Generate unique inventory key
  getProductKey: function (category, product) {
    return category + "-" + product;
  },

  // Helper: Get product list for current category safely
  getCurrentProducts: function () {
    if (!App.State.currentCategory || !App.State.products) return [];
    return App.State.products[App.State.currentCategory] || [];
  },

  // Helper: Escape illegal characters for inline HTML/JS injections
  escapeStr: function (str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  },

  // Security Feature: Escape HTML to prevent XSS
  escapeHTML: function (str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
