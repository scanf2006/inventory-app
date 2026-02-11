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
    inventory: JSON.parse(localStorage.getItem('lubricant_inventory')) || {}
};

// Ensure there's a current category
const categories = Object.keys(state.products);
if (categories.length > 0) {
    state.currentCategory = categories[0];
}

// Save to LocalStorage
function saveToStorage() {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(state.inventory));
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

    Object.keys(state.products).forEach(cat => {
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
    Object.keys(state.products).forEach(cat => {
        const li = document.createElement('li');
        li.className = 'manage-item';
        li.innerHTML = `
            <span>${cat}</span>
            <div class="item-actions">
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
        if (!state.currentCategory) state.currentCategory = name;
        saveToStorage();
        input.value = '';
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

        // 1. Migrate Products
        state.products[newCat] = state.products[oldCat];
        delete state.products[oldCat];

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
        // Clean up inventory data for this category
        Object.keys(state.inventory).forEach(key => {
            if (key.startsWith(`${cat}-`)) delete state.inventory[key];
        });

        if (state.currentCategory === cat) {
            state.currentCategory = Object.keys(state.products)[0] || "";
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
    const tbody = document.getElementById('pdf-tbody');
    document.getElementById('pdf-date').innerText = `Report Date: ${new Date().toLocaleString('en-US')}`;
    tbody.innerHTML = '';

    Object.keys(state.products).forEach(cat => {
        state.products[cat].forEach(name => {
            const expr = state.inventory[`${cat}-${name}`] || '';
            if (expr) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${cat}</td><td>${name}</td><td>${expr}</td><td><b>${evaluateExpression(expr)}</b></td>`;
                tbody.appendChild(tr);
            }
        });
    });

    if (tbody.innerHTML === '') return alert('No data to export!');

    pdfArea.classList.remove('hidden');
    html2pdf().set({
        margin: 10,
        filename: `Lube_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(pdfArea).save().then(() => pdfArea.classList.add('hidden'));
};

// Initialize Date
document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Init Render
renderTabs();
renderInventory();
