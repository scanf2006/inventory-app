// Initial product configuration
const INITIAL_PRODUCTS = {
    "Bulk Oil": ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
    "Case Oil": ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
    "Coolant": ["RED 50/50", "GREEN 50/50"],
    "Others": ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
};

// Helper to safely parse JSON from LocalStorage
function safeGetJSON(key, defaultValue) {
    try {
        const item = localStorage.getItem(key);
        if (!item || item === "undefined") return defaultValue;
        return JSON.parse(item) || defaultValue;
    } catch (e) {
        console.error(`Error parsing ${key}:`, e);
        return defaultValue;
    }
}

// Global State
let state = {
    currentCategory: "",
    products: safeGetJSON('lubricant_products', INITIAL_PRODUCTS),
    inventory: safeGetJSON('lubricant_inventory', {}),
    categoryOrder: safeGetJSON('lubricant_category_order', Object.keys(INITIAL_PRODUCTS)),
    syncId: localStorage.getItem('lubricant_sync_id') || ""
};

// Supabase Configuration
const SUPABASE_URL = "https://kutwhtcvhtbhbhhyqiop.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4";
let supabase = null;
const lib = window.supabase || window.supabasejs;
if (lib) {
    supabase = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Category Repair & Initialization
function initializeCategory() {
    const currentCats = Object.keys(state.products);
    state.categoryOrder = (state.categoryOrder || []).filter(c => currentCats.includes(c));
    currentCats.forEach(c => {
        if (!state.categoryOrder.includes(c)) state.categoryOrder.push(c);
    });
    if (state.categoryOrder.length > 0 && (!state.currentCategory || !state.products[state.currentCategory])) {
        state.currentCategory = state.categoryOrder[0];
    }
}
initializeCategory();

// Sync Status Utility
function updateSyncStatus(status, isOnline = false) {
    const el = document.getElementById('sync-status');
    if (el) {
        const span = el.querySelector('span');
        if (span) {
            span.innerText = status;
            // Target the wrapper div .sync-status itself for color toggling
            el.classList.toggle('online', isOnline);
        }
    }
}

// Push to Cloud
async function pushToCloud() {
    if (!supabase || !state.syncId) return;
    try {
        const { error } = await supabase
            .from('app_sync')
            .upsert({
                sync_id: state.syncId,
                data: {
                    products: state.products,
                    inventory: state.inventory,
                    categoryOrder: state.categoryOrder
                },
                updated_at: new Date().toISOString()
            });
        if (error) throw error;
        updateSyncStatus("Online (Synced)", true);
    } catch (e) {
        console.error("Push error:", e);
        updateSyncStatus("Sync Error", false);
    }
}

// Pull from Cloud
async function pullFromCloud() {
    if (!supabase || !state.syncId) return;
    try {
        updateSyncStatus("Pulling...", false);
        const { data, error } = await supabase
            .from('app_sync')
            .select('data')
            .eq('sync_id', state.syncId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                await pushToCloud();
                return;
            }
            throw error;
        }

        if (data && data.data) {
            const incoming = data.data;
            state.products = incoming.products || state.products;
            state.inventory = incoming.inventory || state.inventory;
            state.categoryOrder = incoming.categoryOrder || state.categoryOrder;

            // Re-initialize category state from downloaded data
            initializeCategory();

            saveToStorage(false);
            renderTabs();
            renderInventory();
            updateSyncStatus("Online (Synced)", true);
        }
    } catch (e) {
        console.error("Pull error:", e);
        updateSyncStatus("Sync Error", false);
    }
}

function saveToStorage(autoPush = true) {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(state.inventory));
    localStorage.setItem('lubricant_category_order', JSON.stringify(state.categoryOrder));
    localStorage.setItem('lubricant_sync_id', state.syncId);

    if (autoPush && state.syncId) {
        pushToCloud();
    }
}

// Safely evaluate simple mathematical expressions without eval()
function evaluateExpression(expr) {
    if (!expr || typeof expr !== 'string' || expr.trim() === '') return 0;
    try {
        // Only allow numbers, plus signs, and dots
        const cleanExpr = expr.replace(/[^0-9+\. ]/g, '');
        // Split by '+' and sum the parts
        return cleanExpr.split('+')
            .map(part => parseFloat(part.trim()))
            .filter(val => !isNaN(val))
            .reduce((sum, val) => sum + val, 0);
    } catch (e) {
        console.error("Eval error:", e);
        return 0;
    }
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
    document.getElementById('sync-id-input').value = state.syncId;
    if (supabase && state.syncId) pullFromCloud();
    renderManageUI();
});

// Connect Sync Button
document.getElementById('connect-sync-btn').onclick = () => {
    const input = document.getElementById('sync-id-input');
    const id = input.value.trim();
    if (id) {
        state.syncId = id;
        saveToStorage(false);
        pullFromCloud();
    } else {
        alert("Please enter a Sync ID.");
    }
};

document.querySelector('.close-modal').addEventListener('click', () => modal.classList.add('hidden'));

// Management UI Actions
window.resetLocalData = () => {
    if (confirm("DANGER: Clear all local data and reload from defaults? (This will NOT affect cloud data unless you sync)")) {
        localStorage.clear();
        location.reload();
    }
};

function renderManageUI() {
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

    document.getElementById('current-manage-cat-name').innerText = state.currentCategory || "None";
    const pList = document.getElementById('product-manage-list');
    pList.innerHTML = '';

    if (state.currentCategory && state.products[state.currentCategory]) {
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
        state.products[newCat] = state.products[oldCat];
        delete state.products[oldCat];
        const ordIdx = state.categoryOrder.indexOf(oldCat);
        if (ordIdx > -1) state.categoryOrder[ordIdx] = newCat;
        Object.keys(state.inventory).forEach(key => {
            if (key.startsWith(`${oldCat}-`)) {
                const productName = key.substring(oldCat.length + 1);
                state.inventory[`${newCat}-${productName}`] = state.inventory[key];
                delete state.inventory[key];
            }
        });
        if (state.currentCategory === oldCat) state.currentCategory = newCat;
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
        Object.keys(state.inventory).forEach(key => {
            if (key.startsWith(`${cat}-`)) delete state.inventory[key];
        });
        if (state.currentCategory === cat) state.currentCategory = state.categoryOrder[0] || "";
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
        const activeProducts = state.products[cat].filter(name => (state.inventory[`${cat}-${name}`] || '').trim() !== '');
        if (activeProducts.length > 0) {
            hasData = true;
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
                item.innerHTML = `<span class="p-name">${name}</span><span class="p-val">${total}</span>`;
                grid.appendChild(item);
            });
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
if (supabase && state.syncId) pullFromCloud();
