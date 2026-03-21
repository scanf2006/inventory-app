// Safe Mathematical Expression Parser

function parseExpression(expression) {
    const operators = /[+\-*/]/;
    const tokens = expression.split(operators).map(token => token.trim());
    const ops = expression.split(/[^+\-*/]+/).map(op => op.trim()).filter(Boolean);

    if (tokens.length - 1 !== ops.length) {
        throw new Error('Invalid expression');
    }

    return tokens.reduce((acc, token, index) => {
        const num = parseFloat(token);
        if (isNaN(num)) {
            throw new Error('Invalid number: ' + token);
        }
        if (index === 0) {
            return num;
        }
        const operator = ops[index - 1];
        switch (operator) {
            case '+': return acc + num;
            case '-': return acc - num;
            case '*': return acc * num;
            case '/': 
                if (num === 0) throw new Error('Division by zero');
                return acc / num;
            default: throw new Error('Unknown operator: ' + operator);
        }
    }, 0);
}

// Example Usage:
// console.log(parseExpression('3 + 5 * 2 - 4 / 2')); // Should print 10
