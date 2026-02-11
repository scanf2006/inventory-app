// 版本 1.3.0 - INV-aiden
console.log("正在加载 INV-aiden 核心逻辑 v1.3.0");

// 初始产品配置
const INITIAL_PRODUCTS = {
    "Bulk Oil": ["0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W", "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL"],
    "Case Oil": ["0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH", "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W"],
    "Coolant": ["RED 50/50", "GREEN 50/50"],
    "Others": ["DEF", "Brake Blast", "MOLY 3% EP2", "CVT", "SAE 10W-30 Motor Oil", "OW16S(Quart)"]
};

// 全局错误捕获，用于手机/PC 调试
window.onerror = function (msg, url, line) {
    alert("运行时错误: " + msg + "\n行号: " + line);
    return false;
};

// 助手函数：安全解析 JSON
function safeGetJSON(key, defaultValue) {
    try {
        var item = localStorage.getItem(key);
        if (!item || item === "undefined") return defaultValue;
        return JSON.parse(item) || defaultValue;
    } catch (e) { return defaultValue; }
}

// 全局状态
var state = {
    currentCategory: "",
    products: safeGetJSON('lubricant_products', INITIAL_PRODUCTS),
    inventory: safeGetJSON('lubricant_inventory', {}),
    categoryOrder: safeGetJSON('lubricant_category_order', Object.keys(INITIAL_PRODUCTS)),
    syncId: localStorage.getItem('lubricant_sync_id') || "",
    viewMode: 'edit' // 'edit' (编辑) 或 'summary' (摘要)
};

// Supabase 配置
var SUPABASE_URL = "https://kutwhtcvhtbhbhhyqiop.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4";
var supabaseClient = null;

function initSupabase() {
    // 检查各种 CDN 导出模式
    var lib = window.supabasejs || window.supabase;

    // 深度检查 'createClient' 是否可用
    if (lib && typeof lib.createClient === 'function') {
        supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else if (lib && lib.supabase && typeof lib.supabase.createClient === 'function') {
        supabaseClient = lib.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
}
initSupabase();

// 确保页面加载时重新初始化
window.addEventListener('load', function () {
    if (!supabaseClient) initSupabase();
});

// 分类修复与初始化
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

// 同步状态工具
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

// 推送到云端
function pushToCloud() {
    if (!supabaseClient) initSupabase();
    if (!supabaseClient || !state.syncId) return;

    supabaseClient
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

// 从云端拉取
function pullFromCloud() {
    if (!supabaseClient) {
        initSupabase();
        if (!supabaseClient) {
            var keys = Object.keys(window).filter(function (k) { return k.toLowerCase().indexOf('supa') !== -1; });
            return alert("Sync Error: Library not loaded.\nTry Ctrl+F5 on PC.\nFound: " + keys.join(', '));
        }
    }
    if (!state.syncId) return alert("Please set a Sync ID in Settings first.");

    updateSyncStatus("Pulling...", false);
    supabaseClient
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
            } else {
                pushToCloud();
            }
        })
        .catch(function (e) {
            alert("Sync Failed: " + (e.message || "Unknown error"));
            updateSyncStatus("Sync Error", false);
        });
}

// 动态更新 PWA/添加产品时的智能建议列表
function updateProductSuggestions() {
    var datalist = document.getElementById('master-product-list');
    if (!datalist) return;

    var allProducts = new Set();
    Object.values(state.products).forEach(function (list) {
        list.forEach(function (p) { allProducts.add(p); });
    });

    datalist.innerHTML = '';
    Array.from(allProducts).sort().forEach(function (p) {
        var option = document.createElement('option');
        option.value = p;
        datalist.appendChild(option);
    });
}

function saveToStorage(autoPush) {
    localStorage.setItem('lubricant_products', JSON.stringify(state.products));
    localStorage.setItem('lubricant_inventory', JSON.stringify(state.inventory));
    localStorage.setItem('lubricant_category_order', JSON.stringify(state.categoryOrder));
    localStorage.setItem('lubricant_sync_id', state.syncId);
    updateProductSuggestions(); // 保存时同步更新建议列表
    if (autoPush !== false && state.syncId) {
        pushToCloud();
    }
}

// 数学逻辑工具
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

// 渲染动态标签页
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

// 渲染库存列表
function renderInventory() {
    var list = document.getElementById('inventory-list');
    var controls = document.getElementById('inventory-controls');
    if (!list || !controls) return;
    list.innerHTML = '';
    controls.innerHTML = '';

    if (!state.currentCategory || !state.products[state.currentCategory]) {
        list.innerHTML = '<p style="text-align:center;color:#888;margin-top:20px;">No products found</p>';
        return;
    }

    // 渲染切换栏与排序按钮到控制容器
    var toggleBar = document.createElement('div');
    toggleBar.className = 'view-toggle-bar';
    toggleBar.innerHTML =
        '<div class="segmented-control">' +
        '<button class="' + (state.viewMode === 'edit' ? 'active' : '') + '" onclick="setViewMode(\'edit\')">Edit</button>' +
        '<button class="' + (state.viewMode === 'summary' ? 'active' : '') + '" onclick="setViewMode(\'summary\')">Summary</button>' +
        '</div>' +
        '<button onclick="sortProductsAZ()" class="btn-edit" style="font-size:0.95rem; padding:10px 16px; background:#fff; border:1px solid var(--border-color); color:var(--primary-color); border-radius:12px; font-weight:700;">Sort A-Z</button>';
    controls.appendChild(toggleBar);

    var categoryProducts = state.products[state.currentCategory];

    if (state.viewMode === 'summary') {
        list.classList.add('summary-mode');

        // 为摘要视图添加统计页眉
        var statsHeader = document.createElement('div');
        statsHeader.style = "grid-column: 1 / -1; padding: 10px 0; font-size: 1.1rem; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border-color); margin-bottom: 10px;";
        statsHeader.innerHTML = '📊 Total: <span style="color:var(--primary-color);">' + categoryProducts.length + '</span> Products';
        list.appendChild(statsHeader);

        categoryProducts.forEach(function (name) {
            var val = state.inventory[state.currentCategory + '-' + name] || '';
            var total = evaluateExpression(val);
            var card = document.createElement('div');
            card.className = 'summary-card';
            card.innerHTML =
                '<div class="s-name">' + name + '</div>' +
                '<div class="s-val">' + total + '</div>';
            list.appendChild(card);
        });
        return;
    }

    list.classList.remove('summary-mode');
    categoryProducts.forEach(function (name, index) {
        var val = state.inventory[state.currentCategory + '-' + name] || '';
        var total = evaluateExpression(val);
        var card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML =
            '<div class="item-info">' +
            '<div class="item-name" onclick="renameProductInline(\'' + name.replace(/'/g, "\\'") + '\', ' + index + ')">' + name + '</div>' +
            '<div class="item-result" id="result-' + index + '">Subtotal: ' + total + '</div>' +
            '</div>' +
            '<div class="input-group">' +
            '<input type="text" class="item-input" placeholder="0" value="' + val + '" ' +
            'oninput="updateValue(\'' + name.replace(/'/g, "\\'") + '\', this.value, ' + index + ')">' +
            '</div>' +
            '<button class="item-delete-btn" onclick="removeProductInline(' + index + ')">&times;</button>';
        list.appendChild(card);
    });

    // 快速添加按钮及内联输入模式
    var quickAddWrapper = document.createElement('div');
    quickAddWrapper.className = 'quick-add-wrapper';

    var quickAddBtn = document.createElement('div');
    quickAddBtn.className = 'quick-add-card';
    quickAddBtn.innerText = '+ Add Product';

    var quickAddForm = document.createElement('div');
    quickAddForm.className = 'quick-add-form hidden';
    quickAddForm.innerHTML =
        '<input type="text" id="quick-add-input" placeholder="Type or select product..." list="master-product-list">' +
        '<div class="quick-add-actions">' +
        '<button onclick="submitQuickAdd()">Add</button>' +
        '<button class="cancel" onclick="toggleQuickAdd(false)">Cancel</button>' +
        '</div>';

    quickAddBtn.onclick = function () { toggleQuickAdd(true); };

    quickAddWrapper.appendChild(quickAddBtn);
    quickAddWrapper.appendChild(quickAddForm);
    list.appendChild(quickAddWrapper);
}

window.toggleQuickAdd = function (show) {
    var btn = document.querySelector('.quick-add-card');
    var form = document.querySelector('.quick-add-form');
    if (btn && form) {
        if (show) {
            btn.classList.add('hidden');
            form.classList.remove('hidden');
            var input = document.getElementById('quick-add-input');
            if (input) {
                input.value = '';
                input.focus();
            }
        } else {
            btn.classList.remove('hidden');
            form.classList.add('hidden');
        }
    }
};

window.submitQuickAdd = function () {
    var input = document.getElementById('quick-add-input');
    var name = input ? input.value.trim() : "";
    if (name && state.currentCategory) {
        if (state.products[state.currentCategory].indexOf(name) !== -1) {
            return alert("Duplicate Product: '" + name + "' already exists in this category.");
        }
        state.products[state.currentCategory].push(name);
        saveToStorage();
        renderInventory();
    }
};

window.renameProductInline = function (oldName, index) {
    var newName = prompt("Rename product:", oldName);
    if (newName && newName.trim() !== "" && newName !== oldName) {
        var trimmedName = newName.trim();
        if (state.products[state.currentCategory].indexOf(trimmedName) !== -1) {
            return alert("Duplicate Product: '" + trimmedName + "' already exists in this category.");
        }
        state.products[state.currentCategory][index] = trimmedName;
        // 迁移库存数据
        var oldKey = state.currentCategory + '-' + oldName;
        var newKey = state.currentCategory + '-' + trimmedName;
        if (state.inventory[oldKey] !== undefined) {
            state.inventory[newKey] = state.inventory[oldKey];
            delete state.inventory[oldKey];
        }
        saveToStorage();
        renderInventory();
    }
};

window.removeProductInline = function (index) {
    if (confirm("Delete this product?")) {
        var name = state.products[state.currentCategory][index];
        state.products[state.currentCategory].splice(index, 1);
        delete state.inventory[state.currentCategory + '-' + name];
        saveToStorage();
        renderInventory();
    }
};

window.sortProductsAZ = function () {
    if (state.currentCategory && state.products[state.currentCategory]) {
        state.products[state.currentCategory].sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        saveToStorage();
        renderInventory();
    }
};

window.setViewMode = function (mode) {
    state.viewMode = mode;
    renderInventory();
};

window.updateValue = function (name, value, index) {
    state.inventory[state.currentCategory + '-' + name] = value;
    saveToStorage();
    var total = evaluateExpression(value);
    var resultEl = document.getElementById('result-' + index);
    if (resultEl) resultEl.innerText = 'Subtotal: ' + total;
};

// 弹窗逻辑
var modal = document.getElementById('modal-overlay');
if (document.getElementById('manage-btn')) {
    document.getElementById('manage-btn').onclick = function () {
        modal.classList.remove('hidden');
        document.getElementById('sync-id-input').value = state.syncId;
        if (supabaseClient && state.syncId) pullFromCloud();
        renderManageUI();
    };
}

if (document.querySelector('.close-modal')) {
    document.querySelector('.close-modal').onclick = function () {
        modal.classList.add('hidden');
    };
}

// 连接同步按钮
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

window.resetInventory = function () {
    if (confirm("Reset ALL inventory values to zero? This will not delete products or categories.")) {
        state.inventory = {};
        saveToStorage();
        renderInventory();
        alert("All inventory values have been reset.");
    }
};

// 删除冗余 resetLocalData

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

// 交互动作
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
            if (state.products[state.currentCategory].indexOf(name) !== -1) {
                return alert("Duplicate Product: '" + name + "' already exists in this category.");
            }
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

// PDF 导出
if (document.getElementById('export-pdf-btn')) {
    document.getElementById('export-pdf-btn').onclick = function () {
        var pdfArea = document.getElementById('pdf-template');
        var pdfContent = document.getElementById('pdf-content');
        document.getElementById('pdf-date').innerText = 'Report Date: ' + new Date().toLocaleString();
        pdfContent.innerHTML = '';
        var hasData = false;
        state.categoryOrder.forEach(function (cat) {
            var allProducts = state.products[cat] || [];
            if (allProducts.length > 0) {
                hasData = true;
                var block = document.createElement('div');
                block.className = 'pdf-category-block';
                block.innerHTML = '<div class="pdf-category-title">' + cat + '</div>';
                var grid = document.createElement('div');
                grid.className = 'pdf-grid';
                allProducts.forEach(function (name) {
                    var expr = state.inventory[cat + '-' + name];
                    var total = evaluateExpression(expr);
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
        if (!hasData) return alert('No data.');
        pdfArea.classList.remove('hidden');
        html2pdf().set({
            margin: 10,
            filename: 'INV_aiden_Report.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(pdfArea).save().then(function () { pdfArea.classList.add('hidden'); });
    };
}

// PWA 安装与服务进程
let deferredPrompt;
const installBtn = document.getElementById('pwa-install-btn');
const iosHint = document.getElementById('ios-install-hint');

// iOS 检测
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('PWA: beforeinstallprompt event fired');
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'block';
});

// 在设置中明确为 iOS 显示提示
if (isIOS && iosHint) {
    iosHint.style.display = 'block';
}

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.style.display = 'none';
        }
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

// 初始化入口
document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
updateProductSuggestions(); // 启动时填充建议
renderTabs();
renderInventory();
if (supabaseClient && state.syncId) pullFromCloud();
