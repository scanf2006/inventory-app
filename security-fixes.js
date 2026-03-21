// security-fixes.js

// Fix for XSS vulnerability
function sanitizeInput(input) {
    const temp = document.createElement('div');
    temp.textContent = input;
    return temp.innerHTML;
}

// Fix for code execution vulnerability
function safeExecute(fn) {
    if (typeof fn === 'function') {
        try {
            return fn();
        } catch (e) {
            console.error('Execution error:', e);
        }
    } else {
        console.warn('Provided input is not a function.');
    }
}

// Example usage:
const userInput = '<script>alert(1)</script>';
const safeInput = sanitizeInput(userInput);
console.log(safeInput); // Outputs: &lt;script&gt;alert(1)&lt;/script&gt;

safeExecute(() => console.log('Executing safe function...'));