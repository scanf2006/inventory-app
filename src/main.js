// Initial product configuration
const INITIAL_PRODUCTS = {
    "Bulk Oil": ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
    "Case Oil": ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
    "Coolant": ["RED 50/50", "GREEN 50/50"],
    "Others": ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
};

// Global State
let state = {
    currentCategory: "", // Will be set to the first category on init
    products: JSON.parse(localStorage.getItem('lubricant_products')) || INITIAL_PRODUCTS,
    inventory: JSON.parse(localStorage.getItem('lubricant_inventory')) || {},
    categoryOrder: JSON.parse(localStorage.getItem('lubricant_category_order')) || Object.keys(INITIAL_PRODUCTS)
};

// Sync order if new categories were added in previous versions without order
const currentCats = Object.keys(state.products);
state.categoryOrder = state.categoryOrder.filter(c => currentCats.includes(c));
currentCats.forEach(c => {
    if (!state.categoryOrder.includes(c)) state.categoryOrder.push(c);
});

// Ensure there's a current category
if (state.categoryOrder.length > 0 && !state.products[state.currentCategory]) {
    state.currentCategory = state.categoryOrder[0];
}

// Save to LocalStorage
function saveToStorage() {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(state.inventory));
    localStorage.setItem('lubricant_category_order', JSON.stringify(state.categoryOrder));
}

// Safely evaluate mathematical expressions
function evaluateExpression(expr) {
    if (!expr || expr.trim() === '') return 0;
    try {
        // Only allow numbers, plus signs, dots, and spaces
        const safeExpr = expr.replace(/[^0-9+\. ]/g, '');
        return Number(eval(safeExpr)) || 0;
    } catch (e) { return 0; }
}

// Render dynamic tabs
function renderTabs() {
    const tabNav = document.getElementById('category-tabs');
    tabNav.innerHTML = '';

    state.categoryOrder.forEach(cat => {
        const button = document.createElement('button');
        button.className = `tab ${cat === state.currentCategory ? 'active' : ''}`;
        button.innerText = cat;
        button.onclick = () => {
            state.currentCategory = cat;
            renderTabs();
            renderInventory();
        };
        tabNav.appendChild(button);
    });
}

// Render Inventory List
function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    if (!state.currentCategory || !state.products[state.currentCategory]) {
        list.innerHTML = '<p style="text-align:center;color:#888;margin-top:20px;">No category selected</p>';
        return;
    }

    const categoryProducts = state.products[state.currentCategory];
    categoryProducts.forEach((name, index) => {
        const val = state.inventory[`${state.currentCategory}-${name}`] || '';
        const total = evaluateExpression(val);
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-info">
                <div class="item-name">${name}</div>
                <div class="item-result" id="result-${index}">${val ? 'Subtotal: ' + total : ''}</div>
            </div>
            <div class="input-group">
                <input type="text" class="item-input" placeholder="Val" value="${val}" 
                    oninput="updateValue('${name}', this.value, ${index})">
            </div>
        `;
        list.appendChild(card);
    });
}

// Update inventory value
window.updateValue = (name, value, index) => {
    state.inventory[`${state.currentCategory}-${name}`] = value;
    saveToStorage();
    const total = evaluateExpression(value);
    const resultEl = document.getElementById(`result-${index}`);
    if (resultEl) resultEl.innerText = value ? 'Subtotal: ' + total : '';
};

// Modal Logic
const modal = document.getElementById('modal-overlay');
document.getElementById('manage-btn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderManageUI();
});
document.querySelector('.close-modal').addEventListener('click', () => modal.classList.add('hidden'));

function renderManageUI() {
    // 1. Manage Categories
    const cList = document.getElementById('category-manage-list');
    cList.innerHTML = '';
    state.categoryOrder.forEach((cat, idx) => {
        const li = document.createElement('li');
        li.className = 'manage-item';
        li.innerHTML = `
            <span>${cat}</span>
            <div class="item-actions">
                <button class="btn-sort" onclick="moveCategory(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn-sort" onclick="moveCategory(${idx}, 1)" ${idx === state.categoryOrder.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn-edit" onclick="editCategory('${cat}')">Edit</button>
                <button class="btn-delete" onclick="removeCategory('${cat}')">Delete</button>
            </div>
        `;
        cList.appendChild(li);
    });

    // 2. Manage Products in current active category
    document.getElementById('current-manage-cat-name').innerText = state.currentCategory;
    const pList = document.getElementById('product-manage-list');
    pList.innerHTML = '';

    if (state.currentCategory) {
        state.products[state.currentCategory].forEach((name, index) => {
            const li = document.createElement('li');
            li.className = 'manage-item';
            li.innerHTML = `
                <span>${name}</span>
                <button class="btn-delete" onclick="removeProduct(${index})">Delete</button>
            `;
            pList.appendChild(li);
        });
    }
}

// Category Actions
document.getElementById('add-category-btn').onclick = () => {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (name && !state.products[name]) {
        state.products[name] = [];
        state.categoryOrder.push(name);
        if (!state.currentCategory) state.currentCategory = name;
        saveToStorage();
        input.value = '';
        renderTabs();
        renderManageUI();
    }
};

window.moveCategory = (index, direction) => {
    const newIdx = index + direction;
    if (newIdx >= 0 && newIdx < state.categoryOrder.length) {
        const [temp] = state.categoryOrder.splice(index, 1);
        state.categoryOrder.splice(newIdx, 0, temp);
        saveToStorage();
        renderTabs();
        renderManageUI();
    }
};

window.editCategory = (oldCat) => {
    const newCat = prompt(`Rename category "${oldCat}" to:`, oldCat);
    if (newCat && newCat.trim() !== "" && newCat !== oldCat) {
        if (state.products[newCat]) {
            alert("A category with this name already exists.");
            return;
        }

        // 1. Migrate Products & Order
        state.products[newCat] = state.products[oldCat];
        delete state.products[oldCat];
        const ordIdx = state.categoryOrder.indexOf(oldCat);
        if (ordIdx > -1) state.categoryOrder[ordIdx] = newCat;

        // 2. Migrate Inventory Data
        Object.keys(state.inventory).forEach(key => {
            if (key.startsWith(`${oldCat}-`)) {
                const productName = key.substring(oldCat.length + 1);
                state.inventory[`${newCat}-${productName}`] = state.inventory[key];
                delete state.inventory[key];
            }
        });

        // 3. Update Current Category if renamed
        if (state.currentCategory === oldCat) {
            state.currentCategory = newCat;
        }

        saveToStorage();
        renderTabs();
        renderInventory();
        renderManageUI();
    }
};

window.removeCategory = (cat) => {
    if (confirm(`Delete entire category "${cat}" and all its data?`)) {
        delete state.products[cat];
        state.categoryOrder = state.categoryOrder.filter(c => c !== cat);
        // Clean up inventory data for this category
        Object.keys(state.inventory).forEach(key => {
            if (key.startsWith(`${cat}-`)) delete state.inventory[key];
        });

        if (state.currentCategory === cat) {
            state.currentCategory = state.categoryOrder[0] || "";
        }
        saveToStorage();
        renderTabs();
        renderInventory();
        renderManageUI();
    }
};

// Product Actions
document.getElementById('add-product-btn').onclick = () => {
    const input = document.getElementById('new-product-name');
    const name = input.value.trim();
    if (name && state.currentCategory) {
        state.products[state.currentCategory].push(name);
        saveToStorage();
        input.value = '';
        renderInventory();
        renderManageUI();
    }
};

window.removeProduct = (index) => {
    state.products[state.currentCategory].splice(index, 1);
    saveToStorage();
    renderInventory();
    renderManageUI();
};

// PDF Export
document.getElementById('export-pdf-btn').onclick = () => {
    const pdfArea = document.getElementById('pdf-template');
    const pdfContent = document.getElementById('pdf-content');
    document.getElementById('pdf-date').innerText = `Report Date: ${new Date().toLocaleString('en-US')}`;
    pdfContent.innerHTML = '';

    let hasData = false;

    state.categoryOrder.forEach(cat => {
        // Filter products with data in this category
        const activeProducts = state.products[cat].filter(name => {
            return (state.inventory[`${cat}-${name}`] || '').trim() !== '';
        });

        if (activeProducts.length > 0) {
            hasData = true;

            // Create Category Block
            const block = document.createElement('div');
            block.className = 'pdf-category-block';
            block.innerHTML = `<div class="pdf-category-title">${cat}</div>`;

            const grid = document.createElement('div');
            grid.className = 'pdf-grid';

            activeProducts.forEach(name => {
                const expr = state.inventory[`${cat}-${name}`];
                const total = evaluateExpression(expr);

                const item = document.createElement('div');
                item.className = 'pdf-grid-item';
                item.innerHTML = `
                    <span class="p-name">${name}</span>
                    <span class="p-val">${total}</span>
                `;
                grid.appendChild(item);
            });

            // If odd number of items, add a spacer to keep borders consistent
            if (activeProducts.length % 2 !== 0) {
                const spacer = document.createElement('div');
                spacer.className = 'pdf-grid-item';
                spacer.innerHTML = '<span></span><span></span>';
                grid.appendChild(spacer);
            }

            block.appendChild(grid);
            pdfContent.appendChild(block);
        }
    });

    if (!hasData) return alert('No data to export!');

    pdfArea.classList.remove('hidden');
    html2pdf().set({
        margin: 10,
        filename: `Lube_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(pdfArea).save().then(() => pdfArea.classList.add('hidden'));
};

// Initialize Date
document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Init Render
renderTabs();
renderInventory();
