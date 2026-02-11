// Initial product configuration
const INITIAL_PRODUCTS = {
    "Bulk Oil": ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
    "Case Oil": ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
    "Coolant": ["RED 50/50", "GREEN 50/50"],
    "Others": ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
};

// Global Catch for Mobile Debugging
window.onerror = function (msg, url, line) {
    alert("System Error: " + msg + "\nAt: " + line);
    return false;
};

// Helper: safe JSON
function safeGetJSON(key, defaultValue) {
    try {
        var item = localStorage.getItem(key);
        if (!item || item === "undefined") return defaultValue;
        return JSON.parse(item) || defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// Global State
var state = {
    currentCategory: "",
    products: safeGetJSON('lubricant_products', INITIAL_PRODUCTS),
    inventory: safeGetJSON('lubricant_inventory', {}),
    categoryOrder: safeGetJSON('lubricant_category_order', Object.keys(INITIAL_PRODUCTS)),
    syncId: localStorage.getItem('lubricant_sync_id') || ""
};

// Supabase Configuration
var SUPABASE_URL = "https://kutwhtcvhtbhbhhyqiop.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4";
var supabase = null;
var lib = window.supabase || window.supabasejs;
if (lib) {
    supabase = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Category Repair & Initialization
function initializeCategory() {
    var currentCats = Object.keys(state.products);
    var order = state.categoryOrder || [];
    state.categoryOrder = order.filter(function (c) { return currentCats.indexOf(c) !== -1; });
    currentCats.forEach(function (c) {
        if (state.categoryOrder.indexOf(c) === -1) state.categoryOrder.push(c);
    });
    if (state.categoryOrder.length > 0 && (!state.currentCategory || !state.products[state.currentCategory])) {
        state.currentCategory = state.categoryOrder[0];
    }
}
initializeCategory();

// Sync Status Utility
function updateSyncStatus(status, isOnline) {
    var el = document.getElementById('sync-status');
    if (el) {
        var span = el.querySelector('span');
        if (span) {
            span.innerText = status;
            if (isOnline) el.classList.add('online');
            else el.classList.remove('online');
        }
    }
}

// Push to Cloud (Promise version for compatibility)
function pushToCloud() {
    if (!supabase || !state.syncId) return;
    supabase
        .from('app_sync')
        .upsert({
            sync_id: state.syncId,
            data: {
                products: state.products,
                inventory: state.inventory,
                categoryOrder: state.categoryOrder
            },
            updated_at: new Date().toISOString()
        })
        .then(function (res) {
            if (res.error) throw res.error;
            updateSyncStatus("Online (Synced)", true);
        })
        .catch(function (e) {
            console.error("Push error:", e);
            updateSyncStatus("Sync Error", false);
        });
}

// Pull from Cloud (Promise version for compatibility)
function pullFromCloud() {
    if (!supabase || !state.syncId) return;
    updateSyncStatus("Pulling...", false);
    supabase
        .from('app_sync')
        .select('data')
        .eq('sync_id', state.syncId)
        .single()
        .then(function (res) {
            if (res.error) {
                if (res.error.code === 'PGRST116') return pushToCloud();
                throw res.error;
            }
            if (res.data && res.data.data) {
                var incoming = res.data.data;
                state.products = incoming.products || state.products;
                state.inventory = incoming.inventory || state.inventory;
                state.categoryOrder = incoming.categoryOrder || state.categoryOrder;
                initializeCategory();
                saveToStorage(false);
                renderTabs();
                renderInventory();
                updateSyncStatus("Online (Synced)", true);
            }
        })
        .catch(function (e) {
            console.error("Pull error:", e);
            updateSyncStatus("Sync Error", false);
        });
}

function saveToStorage(autoPush) {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(state.inventory));
    localStorage.setItem('lubricant_category_order', JSON.stringify(state.categoryOrder));
    localStorage.setItem('lubricant_sync_id', state.syncId);
    if (autoPush !== false && state.syncId) {
        pushToCloud();
    }
}

// Math Utility
function evaluateExpression(expr) {
    if (!expr || typeof expr !== 'string' || expr.trim() === '') return 0;
    var cleanExpr = expr.replace(/[^0-9+\. ]/g, '');
    var parts = cleanExpr.split('+');
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
        var num = parseFloat(parts[i].trim());
        if (!isNaN(num)) total += num;
    }
    return total;
}

// Render dynamic tabs
function renderTabs() {
    var tabNav = document.getElementById('category-tabs');
    if (!tabNav) return;
    tabNav.innerHTML = '';
    state.categoryOrder.forEach(function (cat) {
        var button = document.createElement('button');
        button.className = 'tab' + (cat === state.currentCategory ? ' active' : '');
        button.innerText = cat;
        button.onclick = function () {
            state.currentCategory = cat;
            renderTabs();
            renderInventory();
        };
        tabNav.appendChild(button);
    });
}

// Render Inventory List
function renderInventory() {
    var list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';
    if (!state.currentCategory || !state.products[state.currentCategory]) {
        list.innerHTML = '<p style="text-align:center;color:#888;margin-top:20px;">No products found</p>';
        return;
    }
    var categoryProducts = state.products[state.currentCategory];
    categoryProducts.forEach(function (name, index) {
        var val = state.inventory[state.currentCategory + '-' + name] || '';
        var total = evaluateExpression(val);
        var card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML =
            '<div class="item-info">' +
            '<div class="item-name">' + name + '</div>' +
            '<div class="item-result" id="result-' + index + '">' + (val ? 'Subtotal: ' + total : '') + '</div>' +
            '</div>' +
            '<div class="input-group">' +
            '<input type="text" class="item-input" placeholder="Val" value="' + val + '" ' +
            'oninput="updateValue(\'' + name.replace(/'/g, "\\'") + '\', this.value, ' + index + ')">' +
            '</div>';
        list.appendChild(card);
    });
}

window.updateValue = function (name, value, index) {
    state.inventory[state.currentCategory + '-' + name] = value;
    saveToStorage();
    var total = evaluateExpression(value);
    var resultEl = document.getElementById('result-' + index);
    if (resultEl) resultEl.innerText = value ? 'Subtotal: ' + total : '';
};

// Modal Logic
var modal = document.getElementById('modal-overlay');
if (document.getElementById('manage-btn')) {
    document.getElementById('manage-btn').onclick = function () {
        modal.classList.remove('hidden');
        document.getElementById('sync-id-input').value = state.syncId;
        if (supabase && state.syncId) pullFromCloud();
        renderManageUI();
    };
}

if (document.querySelector('.close-modal')) {
    document.querySelector('.close-modal').onclick = function () {
        modal.classList.add('hidden');
    };
}

// Connect Sync Button
if (document.getElementById('connect-sync-btn')) {
    document.getElementById('connect-sync-btn').onclick = function () {
        var input = document.getElementById('sync-id-input');
        var id = input.value.trim();
        if (id) {
            state.syncId = id;
            saveToStorage(false);
            pullFromCloud();
        } else {
            alert("Please enter a Sync ID.");
        }
    };
}

window.resetLocalData = function () {
    if (confirm("DANGER: Clear all local data?")) {
        localStorage.clear();
        location.reload();
    }
};

function renderManageUI() {
    var cList = document.getElementById('category-manage-list');
    if (!cList) return;
    cList.innerHTML = '';
    state.categoryOrder.forEach(function (cat, idx) {
        var li = document.createElement('li');
        li.className = 'manage-item';
        li.innerHTML =
            '<span>' + cat + '</span>' +
            '<div class="item-actions">' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', 1)" ' + (idx === state.categoryOrder.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button class="btn-edit" onclick="editCategory(\'' + cat.replace(/'/g, "\\'") + '\')">Edit</button>' +
            '<button class="btn-delete" onclick="removeCategory(\'' + cat.replace(/'/g, "\\'") + '\')">Delete</button>' +
            '</div>';
        cList.appendChild(li);
    });

    var manageCatSpan = document.getElementById('current-manage-cat-name');
    if (manageCatSpan) manageCatSpan.innerText = state.currentCategory || "None";

    var pList = document.getElementById('product-manage-list');
    if (pList) {
        pList.innerHTML = '';
        if (state.currentCategory && state.products[state.currentCategory]) {
            state.products[state.currentCategory].forEach(function (name, index) {
                var li = document.createElement('li');
                li.className = 'manage-item';
                li.innerHTML =
                    '<span>' + name + '</span>' +
                    '<button class="btn-delete" onclick="removeProduct(' + index + ')">Delete</button>';
                pList.appendChild(li);
            });
        }
    }
}

// Actions
if (document.getElementById('add-category-btn')) {
    document.getElementById('add-category-btn').onclick = function () {
        var input = document.getElementById('new-category-name');
        var name = input.value.trim();
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
}

window.moveCategory = function (index, direction) {
    var newIdx = index + direction;
    if (newIdx >= 0 && newIdx < state.categoryOrder.length) {
        var temp = state.categoryOrder.splice(index, 1)[0];
        state.categoryOrder.splice(newIdx, 0, temp);
        saveToStorage();
        renderTabs();
        renderManageUI();
    }
};

window.editCategory = function (oldCat) {
    var newCat = prompt("Rename category:", oldCat);
    if (newCat && newCat.trim() !== "" && newCat !== oldCat) {
        if (state.products[newCat]) return alert("Exists.");
        state.products[newCat] = state.products[oldCat];
        delete state.products[oldCat];
        var ordIdx = state.categoryOrder.indexOf(oldCat);
        if (ordIdx > -1) state.categoryOrder[ordIdx] = newCat;
        Object.keys(state.inventory).forEach(function (key) {
            if (key.indexOf(oldCat + '-') === 0) {
                var pName = key.substring(oldCat.length + 1);
                state.inventory[newCat + '-' + pName] = state.inventory[key];
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

window.removeCategory = function (cat) {
    if (confirm("Delete category?")) {
        delete state.products[cat];
        state.categoryOrder = state.categoryOrder.filter(function (c) { return c !== cat; });
        Object.keys(state.inventory).forEach(function (key) {
            if (key.indexOf(cat + '-') === 0) delete state.inventory[key];
        });
        if (state.currentCategory === cat) state.currentCategory = state.categoryOrder[0] || "";
        saveToStorage();
        renderTabs();
        renderInventory();
        renderManageUI();
    }
};

if (document.getElementById('add-product-btn')) {
    document.getElementById('add-product-btn').onclick = function () {
        var input = document.getElementById('new-product-name');
        var name = input.value.trim();
        if (name && state.currentCategory) {
            state.products[state.currentCategory].push(name);
            saveToStorage();
            input.value = '';
            renderInventory();
            renderManageUI();
        }
    };
}

window.removeProduct = function (index) {
    state.products[state.currentCategory].splice(index, 1);
    saveToStorage();
    renderInventory();
    renderManageUI();
};

// PDF
if (document.getElementById('export-pdf-btn')) {
    document.getElementById('export-pdf-btn').onclick = function () {
        var pdfArea = document.getElementById('pdf-template');
        var pdfContent = document.getElementById('pdf-content');
        document.getElementById('pdf-date').innerText = 'Report Date: ' + new Date().toLocaleString();
        pdfContent.innerHTML = '';
        var hasData = false;
        state.categoryOrder.forEach(function (cat) {
            var activeProducts = (state.products[cat] || []).filter(function (name) {
                return (state.inventory[cat + '-' + name] || '').trim() !== '';
            });
            if (activeProducts.length > 0) {
                hasData = true;
                var block = document.createElement('div');
                block.className = 'pdf-category-block';
                block.innerHTML = '<div class="pdf-category-title">' + cat + '</div>';
                var grid = document.createElement('div');
                grid.className = 'pdf-grid';
                activeProducts.forEach(function (name) {
                    var expr = state.inventory[cat + '-' + name];
                    var total = evaluateExpression(expr);
                    var item = document.createElement('div');
                    item.className = 'pdf-grid-item';
                    item.innerHTML = '<span class="p-name">' + name + '</span><span class="p-val">' + total + '</span>';
                    grid.appendChild(item);
                });
                if (activeProducts.length % 2 !== 0) {
                    var spacer = document.createElement('div');
                    spacer.className = 'pdf-grid-item';
                    spacer.innerHTML = '<span></span><span></span>';
                    grid.appendChild(spacer);
                }
                block.appendChild(grid);
                pdfContent.appendChild(block);
            }
        });
        if (!hasData) return alert('No data.');
        pdfArea.classList.remove('hidden');
        html2pdf().set({
            margin: 10,
            filename: 'Lube_Report.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(pdfArea).save().then(function () { pdfArea.classList.add('hidden'); });
    };
}

// Init
document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
renderTabs();
renderInventory();
if (supabase && state.syncId) pullFromCloud();
