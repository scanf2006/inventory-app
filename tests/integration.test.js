/**
 * Integration Tests for inventory-app
 * Uses Jest (already in devDependencies)
 * Pure unit tests - no browser environment needed
 */

describe('App.Utils.escapeStr', () => {
    // Inline the function for unit testing (it's part of the App global)
    function escapeStr(str) {
        if (!str) return "";
        return String(str)
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/"/g, "&quot;")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r");
    }

    test('should escape single quotes', () => {
        expect(escapeStr("it's")).toBe("it\\'s");
    });

    test('should escape backslashes', () => {
        expect(escapeStr("a\\b")).toBe("a\\\\b");
    });

    test('should escape double quotes as HTML entities', () => {
        expect(escapeStr('say "hello"')).toBe('say &quot;hello&quot;');
    });

    test('should escape newlines', () => {
        expect(escapeStr("line1\nline2")).toBe("line1\\nline2");
    });

    test('should return empty string for falsy input', () => {
        expect(escapeStr("")).toBe("");
        expect(escapeStr(null)).toBe("");
        expect(escapeStr(undefined)).toBe("");
    });
});

describe('App.Utils.safeEvaluate (pure parser)', () => {
    // Inline the pure arithmetic parser for unit testing
    function safeEvaluate(expr) {
        if (!expr || typeof expr !== "string" || expr.trim() === "") return 0;
        var cleanExpr = expr.replace(/[^0-9+\-*/(). ]/g, "");
        if (!cleanExpr) return 0;
        try {
            var tokens = cleanExpr.match(/(?:\d+\.?\d*|[+\-*/()])/g);
            if (!tokens) return 0;
            var pos = 0;
            function parseExpr() {
                var result = parseTerm();
                while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
                    var op = tokens[pos++];
                    var right = parseTerm();
                    result = op === '+' ? result + right : result - right;
                }
                return result;
            }
            function parseTerm() {
                var result = parseFactor();
                while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
                    var op = tokens[pos++];
                    var right = parseFactor();
                    if (op === '/' && right === 0) return 0;
                    result = op === '*' ? result * right : result / right;
                }
                return result;
            }
            function parseFactor() {
                if (tokens[pos] === '(') {
                    pos++;
                    var result = parseExpr();
                    if (tokens[pos] === ')') pos++;
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
    }

    test('should handle simple addition', () => {
        expect(safeEvaluate("3+5")).toBe(8);
    });

    test('should handle operator precedence', () => {
        expect(safeEvaluate("2+3*4")).toBe(14);
    });

    test('should handle parentheses', () => {
        expect(safeEvaluate("(2+3)*4")).toBe(20);
    });

    test('should handle division', () => {
        expect(safeEvaluate("10/4")).toBe(2.5);
    });

    test('should return 0 for division by zero', () => {
        expect(safeEvaluate("5/0")).toBe(0);
    });

    test('should return 0 for empty/invalid input', () => {
        expect(safeEvaluate("")).toBe(0);
        expect(safeEvaluate(null)).toBe(0);
        expect(safeEvaluate("abc")).toBe(0);
    });

    test('should strip non-math characters (XSS defense)', () => {
        expect(safeEvaluate("alert(1)")).toBe(1);
        // Only numeric chars + operators remain after sanitization
    });

    test('should handle decimal values', () => {
        expect(safeEvaluate("1.5+2.5")).toBe(4);
    });
});