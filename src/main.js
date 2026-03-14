const App = {
    Config: {
        VERSION: "v3.1.3",
        SUPABASE_URL: "https://kutwhtcvhtbhbhhyqiop.supabase.co",
        SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4",
        STORAGE_KEYS: {
            PRODUCTS: 'lubricant_products',
            INVENTORY: 'lubricant_inventory',
            CATEGORY_ORDER: 'lubricant_category_order',
            SYNC_ID: 'lubricant_sync_id',
            COMMON_OILS: 'lubricant_common_oils',
            LAST_UPDATED: 'lubricant_last_updated',
            LAST_INVENTORY_UPDATE: 'lubricant_last_inventory_update',
            RECENT_HISTORY: 'lubricant_recent_history'
        },
        INITIAL_PRODUCTS: {
            "Bulk Oil": ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
            "Case Oil": ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
            "Coolant": ["RED 50/50", "GREEN 50/50"],
            "Others": ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
        }
    },

    State: {
        currentCategory: "",
        products: null,
        inventory: null,
        categoryOrder: null,
        commonOils: ["5W20S", "5W20B", "5W30S", "5W30B"], // v3.0 Desktop dashboard config
        syncId: "",
        viewMode: 'edit',
        sortDirection: 'asc',
        lastUpdated: 0,
        lastInventoryUpdate: 0, // Specifically for inventory data changes
        history: [], // v3.0.26 Recent update records
        chartInstance: null // v3.0 Chart.js instance tracking
    },

    Services: {
        supabase: null
    },

    Utils: {
        safeGetJSON: function (key, defaultValue) {
            try {
                var item = localStorage.getItem(key);
                if (!item || item === "undefined" || item === "null") return defaultValue;
                return JSON.parse(item) || defaultValue;
            } catch (e) { return defaultValue; }
        },

        debounce: function (func, wait) {
            var timeout;
            return function () {
                var context = this, args = arguments;
                clearTimeout(timeout);
                timeout = setTimeout(function () {
                    func.apply(context, args);
                }, wait);
            };
        },

        safeEvaluate: function (expr) {
            if (!expr || typeof expr !== 'string' || expr.trim() === '') return 0;
            var cleanExpr = expr.replace(/[^0-9+\-*/(). ]/g, '');
            if (!cleanExpr) return 0;
            try {
                var result = new Function('return (' + cleanExpr + ')')();
                var num = parseFloat(result);
                return isNaN(num) ? 0 : Math.round(num * 100) / 100;
            } catch (e) {
                return 0;
            }
        },

        // Helper: Generate unique inventory key
        getProductKey: function (category, product) {
            return category + '-' + product;
        },

        // Helper: Get product list for current category safely
        getCurrentProducts: function () {
            if (!App.State.currentCategory || !App.State.products) return [];
            return App.State.products[App.State.currentCategory] || [];
        },

        // Helper: Escape single quotes safely for HTML injections
        escapeStr: function (str) {
            if (!str) return "";
            return String(str).replace(/'/g, "\\'");
        },

        // New Security Feature: Escape HTML to prevent XSS
        escapeHTML: function (str) {
            if (!str) return "";
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    },

    UI: {
        isDesktop: function () {
            return window.innerWidth >= 768;
        },

        updateSyncStatus: function (status, isOnline) {
            var el = document.getElementById('sync-status');
            if (el) {
                var span = el.querySelector('span');
                if (span) {
                    span.innerText = status;
                    if (isOnline) el.classList.add('online');
                    else el.classList.remove('online');
                }
            }
        },

        showToast: function (message, type) {
            type = type || 'info';
            var container = document.getElementById('toast-container');
            if (!container) return;

            var toast = document.createElement('div');
            toast.className = 'toast ' + type;

            var icon = 'ℹ️';
            if (type === 'success') icon = '✅';
            if (type === 'error') icon = '⚠️';

            toast.innerHTML = '<span>' + icon + '</span><span>' + App.Utils.escapeHTML(message) + '</span>';
            container.appendChild(toast);

            setTimeout(function () {
                toast.classList.add('hiding');
                toast.addEventListener('animationend', function () {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                });
            }, 3000);
        },

        confirm: function (msg, onConfirm) {
            var overlay = document.getElementById('confirm-modal');
            var msgEl = document.getElementById('confirm-msg');
            var yesBtn = document.getElementById('confirm-yes-btn');
            var noBtn = document.getElementById('confirm-no-btn');

            if (!overlay || !msgEl || !yesBtn || !noBtn) {
                if (window.confirm(msg)) onConfirm();
                return;
            }

            msgEl.innerText = msg;
            overlay.classList.remove('hidden');

            var newYes = yesBtn.cloneNode(true);
            var newNo = noBtn.cloneNode(true);
            yesBtn.parentNode.replaceChild(newYes, yesBtn);
            noBtn.parentNode.replaceChild(newNo, noBtn);

            newYes.onclick = function (e) {
                e.stopPropagation();
                overlay.classList.add('hidden');
                onConfirm();
            };

            newNo.onclick = function (e) {
                e.stopImmediatePropagation();
                overlay.classList.add('hidden');
            };
        },

        closeConfirm: function () {
            var el = document.getElementById('confirm-modal');
            if (el) el.classList.add('hidden');
        }
    }
};

// --- Initialization ---

function initApp() {
    var SK = App.Config.STORAGE_KEYS;
    // Data Migration (Recovering data from v1.7.x)
    if (!localStorage.getItem(SK.PRODUCTS) && localStorage.getItem('inventory_products')) {
        localStorage.setItem(SK.PRODUCTS, localStorage.getItem('inventory_products'));
        localStorage.setItem(SK.INVENTORY, localStorage.getItem('inventory_data'));
        localStorage.setItem(SK.CATEGORY_ORDER, localStorage.getItem('inventory_category_order'));
        localStorage.setItem(SK.SYNC_ID, localStorage.getItem('inventory_sync_id'));
    }

    App.State.products = App.Utils.safeGetJSON(SK.PRODUCTS, App.Config.INITIAL_PRODUCTS);
    App.State.inventory = App.Utils.safeGetJSON(SK.INVENTORY, {});
    App.State.categoryOrder = App.Utils.safeGetJSON(SK.CATEGORY_ORDER, Object.keys(App.Config.INITIAL_PRODUCTS));

    // Recovery mechanism for any keys corrupted with '::' during v3.0.1-v3.0.3 timeframe
    var hasCorruptKeys = false;
    Object.keys(App.State.inventory).forEach(function (key) {
        if (key.indexOf('::') !== -1) {
            var newKey = key.replace('::', '-');
            // Give preference to older existing data if conflict, otherwise take the new
            if (!App.State.inventory[newKey]) {
                App.State.inventory[newKey] = App.State.inventory[key];
            }
            delete App.State.inventory[key];
            hasCorruptKeys = true;
        }
    });

    if (hasCorruptKeys) {
        localStorage.setItem(SK.INVENTORY, JSON.stringify(App.State.inventory));
    }

    // v3.0 Common Oils Setup
    var defaultOils = ["5W20S", "5W20B", "5W30S", "5W30B"];
    App.State.commonOils = App.Utils.safeGetJSON(SK.COMMON_OILS, defaultOils);

    App.State.lastUpdated = parseInt(localStorage.getItem(SK.LAST_UPDATED) || '0');
    App.State.lastInventoryUpdate = parseInt(localStorage.getItem(SK.LAST_INVENTORY_UPDATE) || '0');
    App.State.history = App.Utils.safeGetJSON(SK.RECENT_HISTORY, []);

    var savedId = localStorage.getItem(SK.SYNC_ID);
    App.State.syncId = (savedId === null || savedId === "null" || savedId === "undefined") ? "" : savedId;

    initSupabase();
    initializeCategory();

    // UI Init
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    updateProductSuggestions();
    renderTabs();
    renderInventory();

    // Footer button binding
    var manageBtn = document.getElementById('manage-btn');
    if (manageBtn) {
        manageBtn.onclick = function () {
            var modalOverlay = document.getElementById('modal-overlay');
            modalOverlay.classList.remove('hidden');
            document.getElementById('sync-id-input').value = App.State.syncId || '';
            renderCommonOilsCheckboxes();
            renderManageUI();
        };
    }

    if (App.Services.supabase && App.State.syncId) {
        pullFromCloud();

        // Auto-Sync Triggers
        window.addEventListener('focus', function () { pullFromCloud(true); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') pullFromCloud(true);
        });

        // Background Polling (30s)
        setInterval(function () {
            if (document.visibilityState === 'visible') pullFromCloud(true);
        }, 30000);
    }

    // Dynamic Version Display
    var versionEl = document.getElementById('app-version-display');
    if (versionEl) {
        versionEl.innerText = App.Config.VERSION + ' Dashboard Edition';
    }

    // v3.1.0 Snapshot - 手机端保存按钮绑定
    var snapshotBtn = document.getElementById('save-snapshot-btn');
    if (snapshotBtn) {
        snapshotBtn.onclick = function () {
            var noteInput = document.getElementById('snapshot-note-input');
            var note = noteInput ? noteInput.value.trim() : '';
            saveSnapshot(note);
        };
    }

    // v3.1.0 桌面端初始加载快照列表
    if (App.UI.isDesktop()) {
        loadSnapshots();
    }
}

function initSupabase() {
    var lib = window.supabasejs || window.supabase;
    if (lib && typeof lib.createClient === 'function') {
        App.Services.supabase = lib.createClient(App.Config.SUPABASE_URL, App.Config.SUPABASE_KEY);
    } else if (lib && lib.supabase && typeof lib.supabase.createClient === 'function') {
        App.Services.supabase = lib.supabase.createClient(App.Config.SUPABASE_URL, App.Config.SUPABASE_KEY);
    }
}

function initializeCategory() {
    var currentCats = Object.keys(App.State.products);
    var order = App.State.categoryOrder || [];
    App.State.categoryOrder = order.filter(function (c) { return currentCats.indexOf(c) !== -1; });
    currentCats.forEach(function (c) {
        if (App.State.categoryOrder.indexOf(c) === -1) App.State.categoryOrder.push(c);
    });
    if (App.State.categoryOrder.length > 0 && (!App.State.currentCategory || !App.State.products[App.State.currentCategory])) {
        App.State.currentCategory = App.State.categoryOrder[0];
    }
}

// --- Cloud Sync ---

function pushToCloud() {
    if (!App.Services.supabase || !App.State.syncId) return;

    App.Services.supabase
        .from('app_sync')
        .upsert({
            sync_id: App.State.syncId,
            data: {
                products: App.State.products,
                inventory: App.State.inventory,
                category_order: App.State.categoryOrder,
                last_updated_ts: App.State.lastUpdated,
                last_inventory_update_ts: App.State.lastInventoryUpdate,
                recent_history: App.State.history
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'sync_id' })
        .then(function (res) {
            if (res.error) {
                App.UI.updateSyncStatus('Sync Offline', false);
            } else {
                App.UI.updateSyncStatus('Cloud Synced', true);
            }
        });
}

function pullFromCloud(isSilent) {
    if (!App.Services.supabase || !App.State.syncId) return;

    if (!isSilent) App.UI.updateSyncStatus('Checking...', false);

    App.Services.supabase
        .from('app_sync')
        .select('data, updated_at')
        .eq('sync_id', App.State.syncId)
        .single()
        .then(function (res) {
            if (res.data && res.data.data) {
                var cloudData = res.data.data;
                var cloudTS = cloudData.last_updated_ts || new Date(res.data.updated_at).getTime();
                var localTS = App.State.lastUpdated;

                // Conflict Resolution: Only pull if cloud is newer than local
                if (cloudTS > localTS) {
                    App.State.products = cloudData.products || App.State.products;
                    App.State.inventory = cloudData.inventory || App.State.inventory;
                    App.State.categoryOrder = cloudData.category_order || App.State.categoryOrder;
                    App.State.lastUpdated = cloudTS;
                    App.State.lastInventoryUpdate = cloudData.last_inventory_update_ts || App.State.lastInventoryUpdate;
                    App.State.history = cloudData.recent_history || App.State.history;

                    saveToStorageImmediate(true); // Skip generic timestamp update for pull
                    initializeCategory();
                    renderTabs();
                    renderInventory();
                    renderManageUI();
                    if (!isSilent) App.UI.showToast("Sync: Cloud state loaded", 'success');
                    App.UI.updateSyncStatus('Synced', true);
                } else if (cloudTS < localTS) {
                    // Local is newer, push to cloud
                    pushToCloud();
                } else {
                    App.UI.updateSyncStatus('Synced', true);
                }
            } else if (res.error && res.error.code !== 'PGRST116') { // PGRST116 is "not found"
                App.UI.updateSyncStatus('Sync Offline', false);
            } else if (!res.data) {
                pushToCloud();
            }
        })
        .catch(function (err) {
            App.UI.updateSyncStatus('Sync Offline', false);
        });
}

// --- Storage & Data ---

function saveToStorageImmediate(skipTimestamp) {
    var SK = App.Config.STORAGE_KEYS;
    if (!skipTimestamp) App.State.lastUpdated = Date.now();
    localStorage.setItem(SK.PRODUCTS, JSON.stringify(App.State.products));
    localStorage.setItem(SK.INVENTORY, JSON.stringify(App.State.inventory));
    localStorage.setItem(SK.CATEGORY_ORDER, JSON.stringify(App.State.categoryOrder));
    localStorage.setItem(SK.SYNC_ID, App.State.syncId);
    localStorage.setItem(SK.COMMON_OILS, JSON.stringify(App.State.commonOils));
    localStorage.setItem(SK.LAST_UPDATED, App.State.lastUpdated);
    localStorage.setItem(SK.LAST_INVENTORY_UPDATE, App.State.lastInventoryUpdate);
    localStorage.setItem(SK.RECENT_HISTORY, JSON.stringify(App.State.history));
}

var debouncedSave = App.Utils.debounce(function () {
    saveToStorageImmediate();
    pushToCloud();
}, 300);

function saveToStorage(isImmediate) {
    saveToStorageImmediate();
    App.UI.updateSyncStatus('Saving...', false);
    if (isImmediate) {
        pushToCloud();
        App.UI.updateSyncStatus('Saved', true);
    } else {
        debouncedSave();
    }
}

function updateProductSuggestions() {
    var dataList = document.getElementById('master-product-list');
    if (!dataList) return;

    var allProducts = new Set();
    Object.values(App.Config.INITIAL_PRODUCTS).forEach(arr => arr.forEach(p => allProducts.add(p)));
    if (App.State.products) {
        Object.values(App.State.products).forEach(arr => arr.forEach(p => allProducts.add(p)));
    }

    dataList.innerHTML = '';
    allProducts.forEach(function (pName) {
        var opt = document.createElement('option');
        opt.value = pName;
        dataList.appendChild(opt);
    });
}

// --- Rendering ---

function renderTabs() {
    var tabNav = document.getElementById('category-tabs');
    if (!tabNav) return;
    tabNav.innerHTML = '';

    if (!App.State.categoryOrder) App.State.categoryOrder = [];

    App.State.categoryOrder.forEach(function (cat) {
        if (!App.State.products[cat]) return;
        var btn = document.createElement('button');
        btn.className = 'tab' + (cat === App.State.currentCategory ? ' active' : '');
        btn.innerText = cat;
        btn.onclick = function () {
            App.State.currentCategory = cat;
            renderTabs();
            renderInventory();
        };
        tabNav.appendChild(btn);
    });
}

function renderInventory() {
    var list = document.getElementById('inventory-list');
    if (!list) return;
    list.innerHTML = '';

    // Apply layout class based on view mode
    if (App.State.viewMode === 'preview') {
        list.className = 'inventory-list preview-layout';
    } else {
        list.className = 'inventory-list';
    }

    if (!App.State.currentCategory || !App.Utils.getCurrentProducts().length) {
        // Check if category exists but empty, or category not selected
        if (App.State.currentCategory && App.State.products[App.State.currentCategory]) {
            // Valid category, just empty
        } else {
            list.innerHTML = '<div class="empty-state">' + App.Utils.escapeHTML('Select or Add a Category') + '</div>';
            return;
        }
    }

    var products = App.Utils.getCurrentProducts();

    var sortedProducts = products.slice();
    if (App.State.sortDirection === 'asc') sortedProducts.sort();
    else if (App.State.sortDirection === 'desc') sortedProducts.sort().reverse();

    // Filter out zero-stock items in Desktop or Preview mode
    if (App.State.viewMode === 'preview' || App.UI.isDesktop()) {
        sortedProducts = sortedProducts.filter(function (name) {
            var key = App.Utils.getProductKey(App.State.currentCategory, name);
            var valStr = App.State.inventory[key] || '';
            return App.Utils.safeEvaluate(valStr) > 0;
        });
    }

    // Sort & View Controls Wrapper
    var controls = document.getElementById('inventory-controls');
    if (controls) {
        controls.innerHTML = '';
        var bar = document.createElement('div');
        bar.className = 'view-toggle-bar';
        bar.innerHTML =
            '<div class="segmented-control">' +
            '<button onclick="sortProductsToggle()" class="btn-sort">Sort: ' + App.State.sortDirection.toUpperCase() + '</button>' +
            '</div>' +
            '<div class="segmented-control">' +
            '<button onclick="toggleViewMode(\'edit\')" class="btn-edit ' + (App.State.viewMode === 'edit' ? 'active' : '') + '">Edit</button>' +
            '<button onclick="toggleViewMode(\'preview\')" class="btn-edit ' + (App.State.viewMode === 'preview' ? 'active' : '') + '">Preview</button>' +
            '</div>';
        controls.appendChild(bar);

        // Product Variety Count
        var countDiv = document.createElement('div');
        countDiv.className = 'product-count-badge';
        countDiv.style = 'margin-top: 10px; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;';
        countDiv.innerText = 'Products: ' + sortedProducts.length;
        controls.appendChild(countDiv);
    }

    // [v3.0.25 Move] Reset Category Button (Only in Edit Mode at the TOP)
    if (App.State.viewMode === 'edit' && !App.UI.isDesktop()) {
        var resetWrapper = document.createElement('div');
        resetWrapper.style = 'margin: 5px 0 15px 0;';
        resetWrapper.innerHTML =
            '<button onclick="resetCategoryInventory()" class="btn-delete danger-zone-reset w-full" style="opacity: 0.8; font-size: 0.85rem; padding: 12px; border-radius: 12px;">' +
            'Reset ' + App.Utils.escapeHTML(App.State.currentCategory) + ' to Zero</button>';
        list.appendChild(resetWrapper);
    }

    sortedProducts.forEach(function (name, index) {
        var key = App.Utils.getProductKey(App.State.currentCategory, name);
        var val = App.State.inventory[key] || '';
        var total = App.Utils.safeEvaluate(val);
        var safeName = App.Utils.escapeHTML(name);
        var isPreview = App.State.viewMode === 'preview' || App.UI.isDesktop();

        var card = document.createElement('div');
        card.className = 'item-card' + (isPreview ? ' preview-mode' : '');

        if (isPreview) {
            card.innerHTML =
                '<div class="item-info">' +
                '<div class="item-name">' + safeName + '</div>' +
                '<div class="item-result">Total:<br>' + total + '</div>' +
                '</div>';
        } else {
            card.innerHTML =
                '<div class="item-info">' +
                '<div class="item-name" style="cursor: pointer;" onclick="renameProductInline(\'' + App.Utils.escapeStr(name) + '\')">' + safeName + '</div>' +
                '<div class="item-result" id="result-' + index + '">Total:<br>' + total + '</div>' +
                '</div>' +
                '<div class="input-group">' +
                '<input type="tel" class="item-input" value="' + App.Utils.escapeHTML(val) + '" placeholder="0" ' +
                'oninput="window.updateValue(\'' + App.Utils.escapeStr(name) + '\', this.value, ' + index + ')">' +
                '<button class="item-delete-btn" onclick="removeProductInline(\'' + App.Utils.escapeStr(name) + '\')">🗑️</button>' +
                '</div>';
        }

        list.appendChild(card);
    });

    // Quick Add Card (Only in Edit Mode and NOT on Desktop Dashboard)
    if (App.State.viewMode === 'edit' && !App.UI.isDesktop()) {
        // Quick Add Card
        var quickAddWrapper = document.createElement('div');
        quickAddWrapper.className = 'quick-add-wrapper';
        quickAddWrapper.innerHTML =
            '<div class="quick-add-card" onclick="showQuickAddForm()">' +
            '<span>+ Add Product</span>' +
            '</div>' +
            '<div id="quick-add-form-container" class="hidden"></div>';
        list.appendChild(quickAddWrapper);
    }

    // Trigger chart update after rendering
    if (App.UI.isDesktop()) {
        renderDesktopChart();
    }
}

window.showQuickAddForm = function () {
    var container = document.getElementById('quick-add-form-container');
    if (!container) return;
    container.innerHTML =
        '<div class="quick-add-form">' +
        '<input type="text" id="quick-add-name" placeholder="New product name" list="master-product-list">' +
        '<div class="quick-add-actions">' +
        '<button onclick="submitQuickAdd()">Add</button>' +
        '<button class="cancel" onclick="hideQuickAddForm()">Cancel</button>' +
        '</div>' +
        '</div>';
    container.classList.remove('hidden');
    document.querySelector('.quick-add-card').classList.add('hidden');
    document.getElementById('quick-add-name').focus();
};

window.hideQuickAddForm = function () {
    var container = document.getElementById('quick-add-form-container');
    if (container) {
        container.classList.add('hidden');
        document.querySelector('.quick-add-card').classList.remove('hidden');
    }
};

window.submitQuickAdd = function () {
    var input = document.getElementById('quick-add-name');
    var name = input ? input.value.trim() : "";
    if (!name) return;

    var currentProds = App.Utils.getCurrentProducts();
    if (currentProds.includes(name)) {
        return App.UI.showToast("Product exists", 'error');
    }

    currentProds.push(name);
    saveToStorage(true);
    renderInventory();
    App.UI.showToast("Product added", 'success');
};

window.renameProductInline = function (oldName) {
    if (!oldName) return;
    var currentProds = App.Utils.getCurrentProducts();
    var index = currentProds.indexOf(oldName);
    if (index === -1) return;

    var newName = prompt("Rename product:", oldName);
    if (newName && newName.trim() !== "" && newName !== oldName) {
        var trimmedName = newName.trim();
        if (currentProds.includes(trimmedName)) {
            return App.UI.showToast("Product exists", 'error');
        }

        currentProds[index] = trimmedName;

        var oldKey = App.Utils.getProductKey(App.State.currentCategory, oldName);
        var newKey = App.Utils.getProductKey(App.State.currentCategory, trimmedName);

        if (App.State.inventory[oldKey]) {
            App.State.inventory[newKey] = App.State.inventory[oldKey];
            delete App.State.inventory[oldKey];
        }

        saveToStorage(true);
        renderInventory();
    }
};

window.removeProductInline = function (name) {
    if (!name) return;
    var currentProds = App.Utils.getCurrentProducts();
    var index = currentProds.indexOf(name);
    if (index === -1) return;

    App.UI.confirm("Delete this product?", function () {
        currentProds.splice(index, 1);
        var key = App.Utils.getProductKey(App.State.currentCategory, name);
        delete App.State.inventory[key];
        saveToStorage(true);
        renderInventory();
        App.UI.showToast("Product deleted", 'info');
    });
};

window.sortProductsToggle = function () {
    App.State.sortDirection = App.State.sortDirection === 'asc' ? 'desc' : 'asc';
    renderInventory();
};

window.toggleViewMode = function (mode) {
    App.State.viewMode = mode;
    renderInventory();
};

window.updateValue = function (name, value, index) {
    var key = App.Utils.getProductKey(App.State.currentCategory, name);
    // Track if inventory actually changes
    if (App.State.inventory[key] !== value) {
        var oldVal = App.State.inventory[key];
        App.State.inventory[key] = value;
        App.State.lastInventoryUpdate = Date.now();

        // v3.0.27 Optimized History: Deduplicate consecutive updates for same product
        var lastRec = App.State.history[0];
        if (lastRec && lastRec.product === name && lastRec.category === App.State.currentCategory) {
            // Update existing record timestamp and value
            lastRec.value = value;
            lastRec.timestamp = App.State.lastInventoryUpdate;
        } else {
            // New record
            App.State.history.unshift({
                product: name,
                category: App.State.currentCategory,
                value: value,
                timestamp: App.State.lastInventoryUpdate
            });
            if (App.State.history.length > 6) App.State.history = App.State.history.slice(0, 6);
        }

        saveToStorage(false);
    }
    var total = App.Utils.safeEvaluate(value);
    var resultEl = document.getElementById('result-' + index);
    if (resultEl) resultEl.innerHTML = 'Total:<br>' + total;
};

// --- Modal & Management ---

if (document.querySelector('.close-modal')) {
    document.querySelector('.close-modal').onclick = function () {
        document.getElementById('modal-overlay').classList.add('hidden');
    };
}

if (document.getElementById('connect-sync-btn')) {
    document.getElementById('connect-sync-btn').onclick = function () {
        var input = document.getElementById('sync-id-input');
        var id = input ? input.value.trim() : "";
        if (id) {
            App.State.syncId = id;
            // Critical Fix: Do NOT save immediately as it creates a fresh timestamp and would trigger an empty push.
            // Reset local TS to 0 to ensure Cloud data (if any) wins during pullFromCloud.
            App.State.lastUpdated = 0;
            pullFromCloud();
        } else {
            App.UI.showToast("Please enter a Sync ID.", 'info');
        }
    };
}

window.resetInventory = function () {
    App.UI.confirm("Reset ALL inventory values to zero?", function () {
        App.State.inventory = {};
        App.State.lastInventoryUpdate = Date.now();
        saveToStorage(true);
        renderInventory();
        App.UI.showToast("All inventory reset", 'success');
    });
};

window.resetCategoryInventory = function () {
    var cat = App.State.currentCategory;
    if (!cat) return;

    App.UI.confirm("Reset ALL items in '" + cat + "' to zero?", function () {
        var products = App.State.products[cat] || [];
        var changed = false;
        products.forEach(function (pName) {
            var key = App.Utils.getProductKey(cat, pName);
            if (App.State.inventory[key]) {
                delete App.State.inventory[key];
                changed = true;
            }
        });

        if (changed) {
            App.State.lastInventoryUpdate = Date.now();

            // v3.0.27 Log category reset to history
            App.State.history.unshift({
                product: "ALL ITEMS RESET",
                category: cat,
                value: "0 (Cleared)",
                timestamp: App.State.lastInventoryUpdate
            });
            if (App.State.history.length > 6) App.State.history = App.State.history.slice(0, 6);

            saveToStorage(true);
            renderInventory();
            App.UI.showToast("Category '" + cat + "' reset to zero", 'success');
        } else {
            App.UI.showToast("No items to reset in this category", 'info');
        }
    });
};

function renderManageUI() {
    var cList = document.getElementById('category-manage-list');
    if (!cList) return;
    cList.innerHTML = '';
    if (!App.State.categoryOrder) App.State.categoryOrder = [];

    App.State.categoryOrder.forEach(function (cat, idx) {
        var li = document.createElement('li');
        li.className = 'manage-item';
        var safeCat = App.Utils.escapeHTML(cat);
        li.innerHTML =
            '<span class="category-name" style="cursor: pointer;" onclick="editCategory(\'' + App.Utils.escapeStr(cat) + '\')">' + safeCat + '</span>' +
            '<div class="category-actions">' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + '>▲</button>' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', 1)" ' + (idx === App.State.categoryOrder.length - 1 ? 'disabled' : '') + '>▼</button>' +
            '<button class="btn-delete" onclick="removeCategory(\'' + App.Utils.escapeStr(cat) + '\')">🗑️</button>' +
            '</div>';
        cList.appendChild(li);
    });
}

if (document.getElementById('add-category-btn')) {
    document.getElementById('add-category-btn').onclick = function () {
        var input = document.getElementById('new-category-name');
        var name = input ? input.value.trim() : "";
        if (name && !App.State.products[name]) {
            App.State.products[name] = [];
            App.State.categoryOrder.push(name);
            if (!App.State.currentCategory) App.State.currentCategory = name;
            saveToStorage(true);
            input.value = '';
            renderTabs();
            renderManageUI();
            App.UI.showToast("Category added", 'success');
        } else if (name) {
            App.UI.showToast("Category exists", 'error');
        }
    };
}

window.moveCategory = function (index, direction) {
    var newIdx = index + direction;
    if (newIdx >= 0 && newIdx < App.State.categoryOrder.length) {
        var temp = App.State.categoryOrder.splice(index, 1)[0];
        App.State.categoryOrder.splice(newIdx, 0, temp);
        saveToStorage(true);
        renderTabs();
        renderManageUI();
    }
};

window.editCategory = function (oldCat) {
    var newCat = prompt("Rename category:", oldCat);
    if (newCat && newCat.trim() !== "" && newCat !== oldCat) {
        if (App.State.products[newCat]) return App.UI.showToast("Category exists", 'error');

        App.State.products[newCat] = App.State.products[oldCat];
        delete App.State.products[oldCat];

        var ordIdx = App.State.categoryOrder.indexOf(oldCat);
        if (ordIdx > -1) App.State.categoryOrder[ordIdx] = newCat;

        // Efficiently update inventory keys using new standardized check
        Object.keys(App.State.inventory).forEach(function (key) {
            // Check if key starts with category + '-'
            var prefix = oldCat + '-';
            if (key.indexOf(prefix) === 0) {
                var pName = key.substring(prefix.length);
                var newKey = App.Utils.getProductKey(newCat, pName);
                App.State.inventory[newKey] = App.State.inventory[key];
                delete App.State.inventory[key];
            }
        });

        if (App.State.currentCategory === oldCat) App.State.currentCategory = newCat;
        saveToStorage(true);
        renderTabs();
        renderInventory();
        renderManageUI();
    }
};

window.removeCategory = function (cat) {
    App.UI.confirm("Delete category '" + cat + "'?", function () {
        delete App.State.products[cat];
        App.State.categoryOrder = App.State.categoryOrder.filter(function (c) { return c !== cat; });

        // Cleanup inventory keys
        var prefix = cat + '-';
        Object.keys(App.State.inventory).forEach(function (key) {
            if (key.indexOf(prefix) === 0) delete App.State.inventory[key];
        });

        if (App.State.currentCategory === cat) App.State.currentCategory = App.State.categoryOrder[0] || "";
        saveToStorage(true);
        renderTabs();
        renderInventory();
        renderManageUI();
        App.UI.showToast("Category deleted", 'info');
    });
};

// --- PDF Export & Data Management ---

if (document.getElementById('export-pdf-btn')) {
    document.getElementById('export-pdf-btn').onclick = function () {
        var pdfArea = document.getElementById('pdf-template');
        var pdfContent = document.getElementById('pdf-content');
        document.getElementById('pdf-date').innerText = 'Report Date: ' + new Date().toLocaleString();
        pdfContent.innerHTML = '';
        var hasData = false;

        if (!App.State.categoryOrder) App.State.categoryOrder = [];

        App.State.categoryOrder.forEach(function (cat) {
            var allProducts = App.State.products[cat] || [];
            if (allProducts.length > 0) {
                hasData = true;
                var block = document.createElement('div');
                block.className = 'pdf-category-block';
                var unitSuffix = "";
                var catLower = cat.toLowerCase();
                if (catLower.includes('bulk oil')) unitSuffix = " (L)";
                else if (catLower.includes('case oil')) unitSuffix = " (Cases)";

                block.innerHTML = '<div class="pdf-category-title">' + cat + unitSuffix + '</div>';

                var grid = document.createElement('div');
                grid.className = 'pdf-grid';

                allProducts.forEach(function (name) {
                    var key = App.Utils.getProductKey(cat, name);
                    var expr = App.State.inventory[key];
                    var total = App.Utils.safeEvaluate(expr);
                    var item = document.createElement('div');
                    item.className = 'pdf-grid-item';
                    item.innerHTML = '<span class="p-name">' + name + '</span><span class="p-val">' + total + '</span>';
                    grid.appendChild(item);
                });

                if (allProducts.length % 2 !== 0) {
                    var spacer = document.createElement('div');
                    spacer.className = 'pdf-grid-item';
                    spacer.innerHTML = '<span></span><span></span>';
                    grid.appendChild(spacer);
                }

                block.appendChild(grid);
                pdfContent.appendChild(block);
            }
        });

        if (!hasData) return App.UI.showToast("No data to export", 'info');

        pdfArea.classList.remove('hidden');

        var now = new Date();
        var dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
        var fileName = 'INV_aiden_Report_' + dateStr + '.pdf';

        html2pdf().set({
            margin: 10,
            filename: fileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(pdfArea).save().then(function () {
            pdfArea.classList.add('hidden');
            App.UI.showToast("PDF Exported", 'success');
        });
    };
}

// Data Export (JSON)
if (document.getElementById('export-json-btn')) {
    document.getElementById('export-json-btn').onclick = function () {
        var data = {
            products: App.State.products,
            inventory: App.State.inventory,
            categoryOrder: App.State.categoryOrder,
            exportDate: new Date().toISOString(),
            version: App.Config.VERSION
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'inventory_backup_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.UI.showToast("Data Exported", 'success');
    };
}

// Data Import (JSON)
if (document.getElementById('import-json-btn')) {
    var fileInput = document.getElementById('import-file-input');

    document.getElementById('import-json-btn').onclick = function () {
        if (fileInput) fileInput.click();
    };

    // Purge Zero-Stock Items
    if (document.getElementById('purge-zero-btn')) {
        document.getElementById('purge-zero-btn').onclick = function () {
            App.UI.confirm("Are you sure you want to PERMANENTLY delete all products with ZERO inventory? This cannot be undone.", function () {
                purgeZeroStockItems();
            });
        };
    }

    if (fileInput) {
        fileInput.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var data = JSON.parse(e.target.result);

                    // Basic Validation
                    if (!data.products || !data.inventory) {
                        throw new Error("Invalid inventory file format");
                    }

                    // Merge Strategy: Overwrite existing keys, keep new ones
                    // Actually, for "Restore", a deep merge or replacement is often better.
                    // Here we will do a safe merge:
                    // 1. Merge Products
                    Object.keys(data.products).forEach(function (cat) {
                        if (!App.State.products[cat]) {
                            App.State.products[cat] = [];
                        }
                        // Add products that don't exist
                        data.products[cat].forEach(function (p) {
                            if (!App.State.products[cat].includes(p)) {
                                App.State.products[cat].push(p);
                            }
                        });
                    });

                    // 2. Update Inventory Values (Overwrite if exists in import)
                    Object.assign(App.State.inventory, data.inventory);

                    // 3. Update Category Order (Append new categories)
                    if (data.categoryOrder) {
                        data.categoryOrder.forEach(function (cat) {
                            if (!App.State.categoryOrder.includes(cat)) {
                                App.State.categoryOrder.push(cat);
                            }
                        });
                    }

                    App.State.lastInventoryUpdate = Date.now();
                    saveToStorage(true);
                    initializeCategory();
                    renderTabs();
                    renderInventory();
                    renderManageUI();

                    App.UI.showToast("Data Imported Successfully", 'success');

                    // Reset input
                    fileInput.value = '';

                } catch (err) {
                    console.error(err);
                    App.UI.showToast("Import Failed: " + err.message, 'error');
                }
            };
            reader.readAsText(file);
        };
    }
}

// --- v3.0 Desktop Chart Integration ---
function renderDesktopChart() {
    // Add try/catch to absolutely prevent chart errors from breaking the page initialization
    try {
        var ctxContainer = document.getElementById('desktop-chart-container');
        var canvas = document.getElementById('inventoryChart');
        if (!ctxContainer || !canvas || !window.Chart) return;

        // Force commonOils to be an array in case of legacy storage corruption
        var targetOils = App.State.commonOils || [];
        if (typeof targetOils === 'string') {
            targetOils = targetOils.split(',').map(function (s) { return s.trim(); });
            App.State.commonOils = targetOils;
        }

        var aggregatedData = {};
        targetOils.forEach(function (oil) { aggregatedData[oil] = 0; });

        // Safely scan products ONLY from Bulk Oil categories
        if (App.State.products && typeof App.State.products === 'object') {
            Object.keys(App.State.products).forEach(function (category) {
                // Critical Fix: Only aggregate data from 'Bulk Oil' categories to avoid cross-category duplicates
                if (category.toLowerCase().indexOf('bulk oil') === -1) return;

                var prods = App.State.products[category];
                if (!Array.isArray(prods)) return;

                prods.forEach(function (prod) {
                    if (typeof prod !== 'string') return;
                    var trimmedProd = prod.trim();
                    if (targetOils.includes(trimmedProd) || targetOils.includes(prod)) {
                        var key = App.Utils.getProductKey(category, prod);
                        var valStr = App.State.inventory[key] || '';
                        var amount = App.Utils.safeEvaluate(valStr);

                        var matchedOil = targetOils.includes(trimmedProd) ? trimmedProd : prod;
                        aggregatedData[matchedOil] += amount;
                    }
                });
            });
        }

        var filteredOils = targetOils.filter(function (oil) { return aggregatedData[oil] > 0; });

        // Update Last Updated Subtitle
        var subtitle = document.getElementById('chart-last-updated');
        if (subtitle && App.State.lastInventoryUpdate) {
            var d = new Date(App.State.lastInventoryUpdate);
            var timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            subtitle.innerText = 'Last Inventory Update: ' + timeStr;
        } else if (subtitle) {
            subtitle.innerText = 'Last Inventory Update: Never';
        }

        var labels = filteredOils;
        var data = filteredOils.map(function (oil) { return aggregatedData[oil]; });

        var ctx = canvas.getContext('2d');

        if (App.State.chartInstance) {
            App.State.chartInstance.destroy();
        }

        var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        var fontColor = isDark ? '#EEE' : '#333';

        // Dynamic Color Logic based on thresholds
        var bgColors = data.map(function (val) {
            if (val < 100) return 'rgba(255, 69, 58, 0.85)';    // Danger Red
            if (val >= 100 && val < 500) return 'rgba(255, 214, 10, 0.85)'; // Warning Yellow
            if (val >= 1000) return 'rgba(48, 209, 88, 0.85)';  // Healthy Green
            return 'rgba(10, 132, 255, 0.85)';                  // Default Blue (500-1000)
        });

        var borderColors = data.map(function (val) {
            if (val < 100) return '#FF453A';
            if (val >= 100 && val < 500) return '#FFD60A';
            if (val >= 1000) return '#30D158';
            return '#0A84FF';
        });

        App.State.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Stock Level (Liters)',
                    data: data,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 6,
                    hoverBackgroundColor: borderColors, // v3.0.33 Use solid border color on hover instead of white
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeOutElastic',
                    delay: function (context) {
                        // v3.0.33 Prevent delay on hover update to stop elastic flickering
                        var delay = 0;
                        if (context.type === 'data' && context.mode === 'default' && !context.active) {
                            delay = context.dataIndex * 100;
                        }
                        return delay;
                    }
                },
                layout: {
                    padding: {
                        top: 30
                    }
                },
                plugins: {
                    legend: { labels: { color: fontColor } },
                    datalabels: {
                        color: function (context) {
                            return isDark ? '#FFF' : '#000';
                        },
                        anchor: 'end',
                        align: 'top',
                        font: { weight: 'bold', size: 14, family: 'Outfit' },
                        formatter: Math.round,
                        offset: 4
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '15%',
                        grid: { color: gridColor },
                        ticks: { color: fontColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: fontColor, font: { weight: 'bold' } }
                    }
                }
            }
        });

        // Only reveal the container after completely successful chart init
        ctxContainer.classList.remove('hidden');

        // v3.0.26 Also render history on desktop
        renderRecentUpdates();

    } catch (chartErr) {
        console.error("Desktop Chart Initialization Failed:", chartErr);
        // Do not block app execution
    }
}

function renderRecentUpdates() {
    var list = document.getElementById('recent-history-list');
    if (!list) return;

    if (!App.State.history || App.State.history.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 15px; color: var(--text-muted);">No recent activity</div>';
        return;
    }

    list.innerHTML = '';

    // v3.0.31 Force slice to 6 to handle legacy 10-item history in storage
    var displayHistory = App.State.history.slice(0, 6);
    displayHistory.forEach(function (rec) {
        var card = document.createElement('div');
        card.className = 'history-item';

        var date = new Date(rec.timestamp);
        var timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var dayStr = (date.getMonth() + 1) + '/' + date.getDate();

        card.innerHTML =
            '<div class="history-left">' +
            '<span class="history-product">' + App.Utils.escapeHTML(rec.product) + '</span>' +
            '<span class="history-value">' + App.Utils.escapeHTML(rec.value) + '</span>' +
            '</div>' +
            '<div class="history-right text-right">' +
            '<span class="history-cat">' + App.Utils.escapeHTML(rec.category) + '</span>' +
            '<span class="history-time">' + timeStr + ' (' + dayStr + ')</span>' +
            '</div>';
        list.appendChild(card);
    });
}

// Bind Settings Config Action
if (document.getElementById('save-common-oils-btn')) {
    document.getElementById('save-common-oils-btn').onclick = function () {
        var listContainer = document.getElementById('common-oils-checkbox-list');
        if (listContainer) {
            var activeItems = listContainer.querySelectorAll('.checkbox-item.active');
            var newList = Array.from(activeItems).map(function (el) { return el.innerText.trim(); });
            App.State.commonOils = newList;
            saveToStorage(true);
            renderDesktopChart();
            App.UI.showToast("Dashboard Config Updated!", 'success');
        }
    };
}

// Render dynamic common oils checkboxes
function renderCommonOilsCheckboxes() {
    var container = document.getElementById('common-oils-checkbox-list');
    if (!container) return;
    container.innerHTML = '';

    // Collect unique product names ONLY from the 'Bulk Oil' category
    var allProducts = new Set();
    if (App.State.products) {
        Object.keys(App.State.products).forEach(function (cat) {
            if (cat.toLowerCase().indexOf('bulk oil') !== -1) {
                (App.State.products[cat] || []).forEach(function (p) {
                    allProducts.add(p);
                });
            }
        });
    }

    // Convert to sorted array
    var prodArray = Array.from(allProducts).sort();

    // Render checkbox item for each
    prodArray.forEach(function (p) {
        var el = document.createElement('div');
        el.className = 'checkbox-item' + (App.State.commonOils.includes(p) ? ' active' : '');
        el.innerText = p;
        el.onclick = function () {
            el.classList.toggle('active');
        };
        container.appendChild(el);
    });
}

// --- PWA & Service Worker ---

let deferredPrompt;
const installBtn = document.getElementById('pwa-install-btn');
const iosHint = document.getElementById('ios-install-hint');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'block';
});

if (isIOS && iosHint) iosHint.style.display = 'block';

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.style.display = 'none';
        deferredPrompt = null;
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.error('SW Registration Failed', err));
    });
}

// Start App
window.addEventListener('load', function () {
    initSupabase();
    initApp();
});
// --- Utility: Purge Zero Stock Items ---
function purgeZeroStockItems() {
    var count = 0;
    Object.keys(App.State.products).forEach(function (category) {
        var productList = App.State.products[category];
        if (!Array.isArray(productList)) return;

        App.State.products[category] = productList.filter(function (name) {
            var key = App.Utils.getProductKey(category, name);
            var valStr = App.State.inventory[key] || "";
            var amount = App.Utils.safeEvaluate(valStr);

            if (amount > 0) {
                return true;
            } else {
                // If it's 0 or empty, delete from inventory registry and filter out from product list
                delete App.State.inventory[key];
                count++;
                return false;
            }
        });
    });

    if (count > 0) {
        saveToStorageImmediate();
        pushToCloud();
        renderInventory();
        App.UI.showToast("Purged " + count + " item(s)", 'success');
    } else {
        App.UI.showToast("No zero-stock items found", 'info');
    }
}

// --- v3.1.0 库存快照功能 ---

// 保存快照到 Supabase（手机端调用）
function saveSnapshot(note) {
    if (!App.Services.supabase) {
        return App.UI.showToast('Cloud sync not available', 'error');
    }
    if (!App.State.syncId) {
        return App.UI.showToast('Please connect a Sync ID first', 'error');
    }

    // 构建快照数据：每个分类下每个商品的计算值
    var snapshotData = {};
    var totalItems = 0;
    (App.State.categoryOrder || []).forEach(function (cat) {
        var prods = App.State.products[cat] || [];
        var catData = {};
        prods.forEach(function (name) {
            var key = App.Utils.getProductKey(cat, name);
            var expr = App.State.inventory[key] || '';
            var val = App.Utils.safeEvaluate(expr);
            catData[name] = val;
            totalItems++;
        });
        snapshotData[cat] = catData;
    });

    App.UI.showToast('Saving snapshot...', 'info');

    App.Services.supabase
        .from('inventory_snapshots')
        .insert({
            sync_id: App.State.syncId,
            snapshot_data: snapshotData,
            note: note || ''
        })
        .then(function (res) {
            if (res.error) {
                console.error('Snapshot save error:', res.error);
                App.UI.showToast('Failed to save snapshot', 'error');
            } else {
                App.UI.showToast('Snapshot saved! (' + totalItems + ' items)', 'success');
                // 清空备注输入框
                var noteInput = document.getElementById('snapshot-note-input');
                if (noteInput) noteInput.value = '';
            }
        })
        .catch(function (err) {
            console.error('Snapshot save exception:', err);
            App.UI.showToast('Snapshot save failed', 'error');
        });
}

// 从 Supabase 加载快照列表（桌面端调用）
function loadSnapshots() {
    if (!App.Services.supabase || !App.State.syncId) return;

    App.Services.supabase
        .from('inventory_snapshots')
        .select('id, snapshot_data, note, created_at')
        .eq('sync_id', App.State.syncId)
        .order('created_at', { ascending: false })
        .limit(10)
        .then(function (res) {
            if (res.data && res.data.length > 0) {
                renderSnapshots(res.data);
            } else {
                renderSnapshots([]);
            }
        })
        .catch(function (err) {
            console.error('Load snapshots error:', err);
        });
}

// 渲染快照列表（桌面端展示）
function renderSnapshots(snapshots) {
    var container = document.getElementById('snapshot-list');
    if (!container) return;

    if (!snapshots || snapshots.length === 0) {
        container.innerHTML = '<div class="snapshot-empty">No snapshots yet. Save one from your phone!</div>';
        return;
    }

    container.innerHTML = '';
    snapshots.forEach(function (snap) {
        var d = new Date(snap.created_at);
        var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        var data = snap.snapshot_data || {};
        var noteHTML = snap.note ? '<span class="snapshot-note">' + App.Utils.escapeHTML(snap.note) + '</span>' : '';

        var card = document.createElement('div');
        card.className = 'snapshot-card';
        card.innerHTML =
            '<div class="snapshot-card-header">' +
                '<span class="snapshot-time">' + dateStr + '</span>' +
                noteHTML +
            '</div>';

        // 点击展开详情
        card.onclick = function () {
            var detail = card.querySelector('.snapshot-detail');
            if (detail) {
                detail.classList.toggle('hidden');
                return;
            }
            // 首次点击时生成详细列表
            var detailDiv = document.createElement('div');
            detailDiv.className = 'snapshot-detail';
            var detailHTML = '';
            // 按桌面端分类顺序遍历
            var orderedCats = (App.State.categoryOrder || []).concat(
                Object.keys(data).filter(function (c) { return (App.State.categoryOrder || []).indexOf(c) === -1; })
            );
            orderedCats.forEach(function (cat) {
                if (!data[cat]) return;
                var items = data[cat] || {};
                var itemKeys = Object.keys(items).filter(function (k) { return items[k] > 0; });
                if (itemKeys.length === 0) return;
                detailHTML += '<div class="snapshot-cat-label">' + App.Utils.escapeHTML(cat) + '</div>';
                detailHTML += '<div class="snapshot-items-grid">';
                itemKeys.forEach(function (p) {
                    detailHTML += '<span class="snapshot-item">' + App.Utils.escapeHTML(p) + ': <b>' + items[p] + '</b></span>';
                });
                detailHTML += '</div>';
            });
            detailDiv.innerHTML = detailHTML;
            card.appendChild(detailDiv);
        };

        container.appendChild(card);
    });
}

// --- v3.1.1 快照对比功能 ---

// Tab 切换
window.switchSnapshotTab = function (tab) {
    // 更新按钮样式
    var buttons = document.querySelectorAll('.snapshot-tab');
    buttons.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    var listEl = document.getElementById('snapshot-list');
    var compareEl = document.getElementById('snapshot-compare-view');
    if (!listEl || !compareEl) return;

    if (tab === 'list') {
        listEl.classList.remove('hidden');
        compareEl.classList.add('hidden');
    } else {
        listEl.classList.add('hidden');
        compareEl.classList.remove('hidden');
        loadComparison(tab);
    }
};

// 获取对比时间边界
// 规则：周数据在下周二取值，月数据在下月2日取值
function getComparisonBoundaries(type) {
    var now = new Date();

    if (type === 'week') {
        // 找到本周二 00:00（当前周或已过的最近周二）
        var dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, 2=Tue...
        var thisTue = new Date(now);
        thisTue.setHours(0, 0, 0, 0);
        // 计算距离最近的过去的周二有多少天
        var daysSinceTue = (dayOfWeek < 2) ? (dayOfWeek + 5) : (dayOfWeek - 2);
        thisTue.setDate(thisTue.getDate() - daysSinceTue);

        var lastTue = new Date(thisTue);
        lastTue.setDate(lastTue.getDate() - 7);

        var prevTue = new Date(lastTue);
        prevTue.setDate(prevTue.getDate() - 7);

        return {
            // "本周"数据 = 本周二之后的第一条快照
            currentStart: thisTue.toISOString(),
            // "上周"数据 = 上周二之后的第一条快照
            previousStart: lastTue.toISOString(),
            // 用于限制查询范围
            previousEnd: thisTue.toISOString(),
            prevPrevStart: prevTue.toISOString()
        };
    } else {
        // 月对比：本月2日 00:00，上月2日 00:00
        var thisMonth2 = new Date(now.getFullYear(), now.getMonth(), 2, 0, 0, 0, 0);
        var lastMonth2 = new Date(now.getFullYear(), now.getMonth() - 1, 2, 0, 0, 0, 0);
        var prevMonth2 = new Date(now.getFullYear(), now.getMonth() - 2, 2, 0, 0, 0, 0);

        return {
            currentStart: thisMonth2.toISOString(),
            previousStart: lastMonth2.toISOString(),
            previousEnd: thisMonth2.toISOString(),
            prevPrevStart: prevMonth2.toISOString()
        };
    }
}

// 加载对比数据
function loadComparison(type) {
    if (!App.Services.supabase || !App.State.syncId) {
        renderComparisonError('Please connect Cloud Sync first.');
        return;
    }

    var bounds = getComparisonBoundaries(type);
    var label = type === 'week' ? 'Weekly' : 'Monthly';

    var compareEl = document.getElementById('snapshot-compare-view');
    if (compareEl) compareEl.innerHTML = '<div class="snapshot-empty">Loading ' + label + ' data...</div>';

    // 查询"新数据"：currentStart 之后第一条
    var queryNew = App.Services.supabase
        .from('inventory_snapshots')
        .select('snapshot_data, note, created_at')
        .eq('sync_id', App.State.syncId)
        .gte('created_at', bounds.currentStart)
        .order('created_at', { ascending: true })
        .limit(1);

    // 查询"旧数据"：previousStart 到 previousEnd 之间第一条
    var queryOld = App.Services.supabase
        .from('inventory_snapshots')
        .select('snapshot_data, note, created_at')
        .eq('sync_id', App.State.syncId)
        .gte('created_at', bounds.previousStart)
        .lt('created_at', bounds.previousEnd)
        .order('created_at', { ascending: true })
        .limit(1);

    Promise.all([queryNew, queryOld])
        .then(function (results) {
            var newSnap = (results[0].data && results[0].data[0]) || null;
            var oldSnap = (results[1].data && results[1].data[0]) || null;

            if (!newSnap && !oldSnap) {
                renderComparisonError('No snapshots found for this ' + label.toLowerCase() + ' comparison. Save snapshots on Tuesday (weekly) or the 2nd (monthly).');
                return;
            }
            if (!oldSnap) {
                renderComparisonError('No previous ' + label.toLowerCase() + ' snapshot found for comparison. Need at least 2 period snapshots.');
                return;
            }
            if (!newSnap) {
                renderComparisonError('No current ' + label.toLowerCase() + ' snapshot yet. Save one after ' + (type === 'week' ? 'Tuesday' : 'the 2nd') + '.');
                return;
            }

            renderComparison(oldSnap, newSnap, label);
        })
        .catch(function (err) {
            console.error('Comparison load error:', err);
            renderComparisonError('Failed to load comparison data.');
        });
}

function renderComparisonError(msg) {
    var el = document.getElementById('snapshot-compare-view');
    if (el) el.innerHTML = '<div class="snapshot-empty">' + msg + '</div>';
}

// 渲染对比结果
function renderComparison(oldSnap, newSnap, label) {
    var el = document.getElementById('snapshot-compare-view');
    if (!el) return;

    var oldDate = new Date(oldSnap.created_at);
    var newDate = new Date(newSnap.created_at);
    var fmt = function (d) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    var oldData = oldSnap.snapshot_data || {};
    var newData = newSnap.snapshot_data || {};

    // 按桌面端分类顺序收集并遍历分类
    var allCatKeys = {};
    Object.keys(oldData).forEach(function (c) { allCatKeys[c] = true; });
    Object.keys(newData).forEach(function (c) { allCatKeys[c] = true; });
    var orderedCats = (App.State.categoryOrder || []).concat(
        Object.keys(allCatKeys).filter(function (c) { return (App.State.categoryOrder || []).indexOf(c) === -1; })
    ).filter(function (c) { return allCatKeys[c]; });

    var html = '<div class="compare-header">' +
        '<span class="compare-label">📊 ' + label + ' Comparison</span>' +
        '<span class="compare-range">' + fmt(oldDate) + ' → ' + fmt(newDate) + '</span>' +
        '</div>';

    // 汇总统计
    var totalUp = 0, totalDown = 0, totalSame = 0;

    orderedCats.forEach(function (cat) {
        var oldItems = oldData[cat] || {};
        var newItems = newData[cat] || {};

        // 合并所有商品 key
        var allProducts = {};
        Object.keys(oldItems).forEach(function (p) { allProducts[p] = true; });
        Object.keys(newItems).forEach(function (p) { allProducts[p] = true; });

        var productKeys = Object.keys(allProducts);
        if (productKeys.length === 0) return;

        // 只显示有变化的或有值的商品
        var rows = [];
        productKeys.forEach(function (p) {
            var oldVal = oldItems[p] || 0;
            var newVal = newItems[p] || 0;
            var diff = newVal - oldVal;

            if (oldVal === 0 && newVal === 0) return; // 跳过双零

            var cls = '', arrow = '', diffText = '';
            if (diff > 0) {
                cls = 'compare-up';
                arrow = '▲';
                diffText = '+' + diff;
                totalUp++;
            } else if (diff < 0) {
                cls = 'compare-down';
                arrow = '▼';
                diffText = '' + diff;
                totalDown++;
            } else {
                cls = 'compare-same';
                arrow = '─';
                diffText = '0';
                totalSame++;
            }

            rows.push(
                '<div class="compare-row ' + cls + '">' +
                    '<span class="compare-product">' + App.Utils.escapeHTML(p) + '</span>' +
                    '<span class="compare-values">' + oldVal + ' → ' + newVal + '</span>' +
                    '<span class="compare-diff">' + arrow + ' ' + diffText + '</span>' +
                '</div>'
            );
        });

        if (rows.length > 0) {
            html += '<div class="compare-cat-label">' + App.Utils.escapeHTML(cat) + '</div>';
            html += rows.join('');
        }
    });

    // 底部统计摘要
    html += '<div class="compare-summary">' +
        '<span class="compare-up">▲ ' + totalUp + '</span>' +
        '<span class="compare-same">─ ' + totalSame + '</span>' +
        '<span class="compare-down">▼ ' + totalDown + '</span>' +
        '</div>';

    el.innerHTML = html;
}
