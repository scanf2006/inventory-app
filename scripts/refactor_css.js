const fs = require('fs');
const path = require('path');

const cssPath = 'd:\\AI\\inventory-app\\src\\app-v30.css';
let css = fs.readFileSync(cssPath, 'utf8');

const pieces = [
`@media (prefers-color-scheme: dark) {
    .segmented-control {
        background: rgba(255, 255, 255, 0.1);
    }
}`,
`@media (prefers-color-scheme: dark) {
    .item-input {
        background: rgba(0, 0, 0, 0.4);
    }
}`,
`@media (prefers-color-scheme: dark) {
    .quick-add-actions button.cancel {
        background: rgba(255, 255, 255, 0.15);
    }
}`,
`@media (prefers-color-scheme: dark) {
    .checkbox-item {
        background: rgba(255, 255, 255, 0.08);
    }

    .checkbox-item.active {
        background: rgba(255, 214, 10, 0.2);
        color: var(--accent-gold);
        border-color: var(--accent-gold);
    }
}`,
`@media (prefers-color-scheme: dark) {
    .modal {
        background: #1C1C1E;
    }
}`,
`@media (prefers-color-scheme: dark) {
    .segmented-control {
        background: rgba(118, 118, 128, 0.24);
    }
}`
];

pieces.forEach(p => {
    const pN = p.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    if (css.includes(pN)) {
        css = css.replace(pN + '\r\n', '');
        css = css.replace(pN, '');
    } else if (css.includes(p)) {
        css = css.replace(p + '\n', '');
        css = css.replace(p, '');
    }
});

css = css.replace(/\r\n\r\n\r\n+/g, '\r\n\r\n');
css = css.replace(/\n\n\n+/g, '\n\n');

const combinedRules = `
    /* Combined Dark Mode Elements from Refactor (v3.1.13) */
    .segmented-control {
        background: rgba(118, 118, 128, 0.24) !important;
    }
    .item-input {
        background: rgba(0, 0, 0, 0.4);
    }
    .quick-add-actions button.cancel {
        background: rgba(255, 255, 255, 0.15);
    }
    .checkbox-item {
        background: rgba(255, 255, 255, 0.08);
    }
    .checkbox-item.active {
        background: rgba(255, 214, 10, 0.2);
        color: var(--accent-gold);
        border-color: var(--accent-gold);
    }
    .modal {
        background: #1C1C1E;
    }
`;

const targetStr = '.item-card.preview-mode {\r\n        background: rgba(255, 255, 255, 0.08) !important;\r\n    }';
const targetStrLf = '.item-card.preview-mode {\n        background: rgba(255, 255, 255, 0.08) !important;\n    }';

if (css.includes(targetStr)) {
    css = css.replace(targetStr, targetStr + combinedRules);
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log("Success (CRLF)");
} else if (css.includes(targetStrLf)) {
    css = css.replace(targetStrLf, targetStrLf + combinedRules);
    fs.writeFileSync(cssPath, css, 'utf8');
    console.log("Success (LF)");
} else {
    console.log("Could not find the target string.");
}
