const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('src/main.js', 'utf8');

const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: 'dangerously',
    beforeParse(window) {
        window.innerWidth = 1200; // Force desktop mode
        window.localStorage = {
            getItem: (key) => window.localStorage[key] || null,
            setItem: (key, value) => { window.localStorage[key] = value; },
            removeItem: (key) => { delete window.localStorage[key]; }
        };
        // Mock matchMedia
        window.matchMedia = () => ({ matches: false });
        // Mock Chart.js
        window.Chart = function () {
            this.destroy = () => { };
        };
        // Catch all errors
        window.onerror = function (msg, source, lineno, colno, error) {
            console.error('Window Error:', msg, lineno, colno, error);
        };
    }
});

let window = dom.window;

try {
    // Inject the script
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = script;
    window.document.body.appendChild(scriptEl);

    // Run initApp
    console.log("Running initApp()...");
    if (typeof window.initApp === 'function') {
        window.initApp();
    } else {
        console.error("initApp is not defined!");
    }

    // Attempt to click settings
    var btn = window.document.getElementById('manage-btn');
    if (btn) {
        console.log("Clicking Settings button...");
        btn.click();
    } else {
        console.error("Settings button not found!");
    }
    console.log("Done.");
} catch (e) {
    console.error("Caught error during execution:", e);
}
