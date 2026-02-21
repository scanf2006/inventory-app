// Version 1.9.4 - INV-aiden
// Comprehensive Audit & Cleanup

const App = {
    Config: {
        SUPABASE_URL: "https://kutwhtcvhtbhbhhyqiop.supabase.co",
        SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4",
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
        chartInstance: null // v3.0 Chart.js instance tracking
    },

    Services: {
        supabase: null
    },

    Utils: {
        safeGetJSON: function (key, defaultValue) {
            try {
                var item = localStorage.getItem(key);
                if (!item || item === "undefined") return defaultValue;
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
            return str ? str.replace(/'/g, "\\'") : '';
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

            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
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
    // Data Migration (Recovering data from v1.7.x)
    if (!localStorage.getItem('lubricant_products') && localStorage.getItem('inventory_products')) {
        localStorage.setItem('lubricant_products', localStorage.getItem('inventory_products'));
        localStorage.setItem('lubricant_inventory', localStorage.getItem('inventory_data'));
        localStorage.setItem('lubricant_category_order', localStorage.getItem('inventory_category_order'));
        localStorage.setItem('lubricant_sync_id', localStorage.getItem('inventory_sync_id'));
    }

    App.State.products = App.Utils.safeGetJSON('lubricant_products', App.Config.INITIAL_PRODUCTS);
    App.State.inventory = App.Utils.safeGetJSON('lubricant_inventory', {});
    App.State.categoryOrder = App.Utils.safeGetJSON('lubricant_category_order', Object.keys(App.Config.INITIAL_PRODUCTS));

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
        localStorage.setItem('lubricant_inventory', JSON.stringify(App.State.inventory));
    }

    // v3.0 Common Oils Setup
    var defaultOils = ["5W20S", "5W20B", "5W30S", "5W30B"];
    App.State.commonOils = App.Utils.safeGetJSON('lubricant_common_oils', defaultOils);

    App.State.lastUpdated = parseInt(localStorage.getItem('lubricant_last_updated') || '0');

    var savedId = localStorage.getItem('lubricant_sync_id');
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
                last_updated_ts: App.State.lastUpdated // Stored inside JSON to avoid DB schema changes
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

                    saveToStorageImmediate(true); // Skip timestamp update for pull
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
    if (!skipTimestamp) App.State.lastUpdated = Date.now();
    localStorage.setItem('lubricant_products', JSON.stringify(App.State.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(App.State.inventory));
    localStorage.setItem('lubricant_category_order', JSON.stringify(App.State.categoryOrder));
    localStorage.setItem('lubricant_sync_id', App.State.syncId);
    localStorage.setItem('lubricant_common_oils', JSON.stringify(App.State.commonOils));
    localStorage.setItem('lubricant_last_updated', App.State.lastUpdated);
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
            list.innerHTML = '<div class="empty-state">Select or Add a Category</div>';
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

    sortedProducts.forEach(function (name, index) {
        var key = App.Utils.getProductKey(App.State.currentCategory, name);
        var val = App.State.inventory[key] || '';
        var total = App.Utils.safeEvaluate(val);

        var card = document.createElement('div');
        card.className = 'item-card' + (App.State.viewMode === 'preview' ? ' preview-mode' : '');

        if (App.State.viewMode === 'preview' || App.UI.isDesktop()) {
            card.innerHTML =
                '<div class="item-info">' +
                '<div class="item-name">' + name + '</div>' +
                '<div class="item-result">Total:<br>' + total + '</div>' +
                '</div>';
        } else {
            card.innerHTML =
                '<div class="item-info">' +
                '<div class="item-name" style="cursor: pointer;" onclick="renameProductInline(\'' + App.Utils.escapeStr(name) + '\')">' + name + '</div>' +
                '<div class="item-result" id="result-' + index + '">Total:<br>' + total + '</div>' +
                '</div>' +
                '<div class="input-group">' +
                '<input type="tel" class="item-input" value="' + val + '" placeholder="0" ' +
                'oninput="window.updateValue(\'' + App.Utils.escapeStr(name) + '\', this.value, ' + index + ')">' +
                '<button class="item-delete-btn" onclick="removeProductInline(\'' + App.Utils.escapeStr(name) + '\')">🗑️</button>' +
                '</div>';
        }

        list.appendChild(card);
    });

    // Quick Add Card (Only in Edit Mode and NOT on Desktop Dashboard)
    if (App.State.viewMode === 'edit' && !App.UI.isDesktop()) {
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
    App.State.inventory[key] = value;
    saveToStorage(false);
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
            saveToStorage(true);
            pullFromCloud();
        } else {
            App.UI.showToast("Please enter a Sync ID.", 'info');
        }
    };
}

window.resetInventory = function () {
    App.UI.confirm("Reset ALL inventory values to zero?", function () {
        App.State.inventory = {};
        saveToStorage(true);
        renderInventory();
        App.UI.showToast("All inventory reset", 'success');
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
        li.innerHTML =
            '<span style="cursor: pointer;" onclick="editCategory(\'' + App.Utils.escapeStr(cat) + '\')">' + cat + '</span>' +
            '<div class="item-actions">' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button class="btn-sort" onclick="moveCategory(' + idx + ', 1)" ' + (idx === App.State.categoryOrder.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button class="btn-delete" onclick="removeCategory(\'' + App.Utils.escapeStr(cat) + '\')">Delete</button>' +
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
            version: '1.9.4'
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
                    hoverBackgroundColor: 'rgba(255, 255, 255, 0.6)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1200,
                    easing: 'easeOutElastic',
                    delay: function (context) { return context.dataIndex * 100; }
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

    } catch (chartErr) {
        console.error("Desktop Chart Initialization Failed:", chartErr);
        // Do not block app execution
    }
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
