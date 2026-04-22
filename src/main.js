/**
 * Waycred Inventory v3.3.2
 * Primary application controller
 */
window.App = window.App || {};

console.log('Waycred Inventory v3.3.2 Modular core active');

// --- Initialization ---

window.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

/**
 * Bootstraps the application state and UI
 */
const initApp = async () => {
  console.log(`Waycred Inventory ${App.Config.VERSION} System initializing...`);

  const SK = App.Config.STORAGE_KEYS;
  const load = (key, def) => App.Utils.safeGetJSON(key, def);

  // Data Migration (Recovering data from older versions)
  if (!localStorage.getItem(SK.PRODUCTS) && localStorage.getItem("inventory_products")) {
    localStorage.setItem(SK.PRODUCTS, localStorage.getItem("inventory_products"));
    localStorage.setItem(SK.INVENTORY, localStorage.getItem("inventory_data"));
    localStorage.setItem(SK.CATEGORY_ORDER, localStorage.getItem("inventory_category_order"));
    localStorage.setItem(SK.SYNC_ID, localStorage.getItem("inventory_sync_id"));
  }

  // Load State from Storage
  App.State.products = load(SK.PRODUCTS, App.Config.INITIAL_PRODUCTS);
  App.State.inventory = load(SK.INVENTORY, {});
  App.State.categoryOrder = load(SK.CATEGORY_ORDER, Object.keys(App.Config.INITIAL_PRODUCTS));
  App.State.commonOils = load(SK.COMMON_OILS, ["5W20S", "5W20B", "5W30S", "5W30B"]);
  App.State.lastUpdated = parseInt(localStorage.getItem(SK.LAST_UPDATED) || "0");
  App.State.lastInventoryUpdate = parseInt(localStorage.getItem(SK.LAST_INVENTORY_UPDATE) || "0");
  App.State.history = load(SK.RECENT_HISTORY, []);
  App.State.liveMessages = load(SK.LIVE_MESSAGES, []);
  
  const savedId = localStorage.getItem(SK.SYNC_ID);
  App.State.syncId = (savedId === null || savedId === "null" || savedId === "undefined") ? "" : savedId;

  // Key Integrity Fix
  let hasCorruptKeys = false;
  Object.keys(App.State.inventory).forEach(key => {
    if (key.includes("::")) {
      const newKey = key.replace("::", "-");
      if (!App.State.inventory[newKey]) App.State.inventory[newKey] = App.State.inventory[key];
      delete App.State.inventory[key];
      hasCorruptKeys = true;
    }
  });
  if (hasCorruptKeys) localStorage.setItem(SK.INVENTORY, JSON.stringify(App.State.inventory));

  // Check Admin Lock (Session persistence)
  if (sessionStorage.getItem("admin_unlocked") === "true") {
    App.State.mobileAdminUnlocked = true;
    App.State.viewMode = "edit";
  } else if (!App.UI.isDesktop()) {
    App.State.viewMode = "preview";
  }

  // Initialize Services
  App.Sync.init();
  initializeCategory();

  // Initial Render
  document.getElementById("current-date").innerText = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const versionEl = document.getElementById("app-version-display");
  if (versionEl)
    versionEl.innerText = `${App.Config.VERSION} Dashboard Edition`;

  window.updateAdminLoginUI();
  window.updateProductSuggestions();
  App.UI.renderTabs();
  App.UI.renderInventory();
  App.UI.renderRecentUpdates();

  // Cloud Sync Bootstrap
  if (App.Services.supabase && App.State.syncId) {
    App.Sync.pull();

    // Auto-Sync Polling
    setInterval(() => {
      if (document.visibilityState === "visible") App.Sync.pull(true);
    }, 10000);
  }

  // Desktop Features
  if (App.UI.isDesktop()) {
    App.Sync.loadSnapshots();
    App.UI.renderLiveTicker();
  }
};

/**
 * Setup global event listeners
 */
const setupEventListeners = () => {
  // Admin UI
  const adminUnlockBtn = document.getElementById("admin-unlock-btn");
  adminUnlockBtn?.addEventListener("click", () => {
    const pwd = document.getElementById("admin-password-input").value;
    if (pwd === App.Config.ADMIN_PASSWORD) {
      App.State.mobileAdminUnlocked = true;
      sessionStorage.setItem("admin_unlocked", "true");
      App.State.viewMode = "edit"; 
      document.getElementById("admin-password-input").value = "";
      window.updateAdminLoginUI();
      App.UI.renderInventory();
      App.UI.showToast("Edit mode unlocked", "success");
    } else {
      App.UI.showToast("Incorrect password", "error");
    }
  });

  const adminLockBtn = document.getElementById("admin-lock-btn");
  adminLockBtn?.addEventListener("click", () => {
    App.State.mobileAdminUnlocked = false;
    sessionStorage.removeItem("admin_unlocked");
    App.State.viewMode = "preview";
    window.updateAdminLoginUI();
    App.UI.renderInventory();
    App.UI.showToast("Edit mode locked", "info");
  });

  // Global Sync Listeners
  window.addEventListener("focus", () => App.Sync.pull(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") App.Sync.pull(true);
  });

  // Footer Actions
  document.getElementById("manage-btn")?.addEventListener("click", () => {
    document.getElementById("modal-overlay").classList.remove("hidden");
    document.getElementById("sync-id-input").value = App.State.syncId || "";
    App.UI.renderCommonOilsCheckboxes();
    App.UI.renderManageUI();
    window.updateAdminLoginUI();
  });

  document.querySelector(".close-modal")?.addEventListener("click", () => {
    document.getElementById("modal-overlay").classList.add("hidden");
  });

  // Data Actions
  document.getElementById("connect-sync-btn")?.addEventListener("click", () => {
    const id = document.getElementById("sync-id-input")?.value.trim() || "";
    if (id) {
      App.State.syncId = id;
      App.State.lastUpdated = 0; // Ensure cloud wins
      App.Sync.pull();
    } else {
      App.UI.showToast("Please enter a Sync ID.", "info");
    }
  });

  document.getElementById("export-pdf-btn")?.addEventListener("click", () => App.Data.exportPDF());
  document.getElementById("export-json-btn")?.addEventListener("click", () => App.Data.exportJSON());
  document.getElementById("import-json-btn")?.addEventListener("click", () => document.getElementById("import-file-input")?.click());
  document.getElementById("import-file-input")?.addEventListener("change", (e) => App.Data.importJSON(e.target.files[0]));
  document.getElementById("purge-zero-btn")?.addEventListener("click", () => {
    App.UI.confirm("Are you sure? This PERMANENTLY deletes all zero-stock products.", () => App.Data.purgeZeroStock());
  });

  document.getElementById("reset-all-btn")?.addEventListener("click", () => window.resetInventory());
  document.getElementById("save-snapshot-btn")?.addEventListener("click", () => {
    const note = document.getElementById("snapshot-note-input")?.value.trim() || "";
    App.Sync.saveSnapshot(note);
  });

  document.getElementById("send-live-btn")?.addEventListener("click", () => window.sendLiveMessage());

  // Snapshot Tabs
  document.getElementById("snapshot-tab-group")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".snapshot-tab");
    if (btn?.dataset.tab) window.switchSnapshotTab(btn.dataset.tab);
  });
};

// --- CORE LOGIC ---

window.initializeCategory = () => {
  const products = App.State.products || App.Config.INITIAL_PRODUCTS;
  const currentCats = Object.keys(products);
  const order = App.State.categoryOrder || [];
  App.State.categoryOrder = order.filter(c => currentCats.includes(c));
  currentCats.forEach(c => {
    if (!App.State.categoryOrder.includes(c)) App.State.categoryOrder.push(c);
  });
  if (App.State.categoryOrder.length > 0 && (!App.State.currentCategory || !App.State.products[App.State.currentCategory])) {
    App.State.currentCategory = App.State.categoryOrder[0];
  }
};

window.saveToStorageImmediate = (skipTimestamp) => {
  const SK = App.Config.STORAGE_KEYS;
  if (!skipTimestamp) App.State.lastUpdated = Date.now();
  localStorage.setItem(SK.PRODUCTS, JSON.stringify(App.State.products));
  localStorage.setItem(SK.INVENTORY, JSON.stringify(App.State.inventory));
  localStorage.setItem(SK.CATEGORY_ORDER, JSON.stringify(App.State.categoryOrder));
  localStorage.setItem(SK.SYNC_ID, App.State.syncId);
  localStorage.setItem(SK.COMMON_OILS, JSON.stringify(App.State.commonOils));
  localStorage.setItem(SK.LAST_UPDATED, App.State.lastUpdated);
  localStorage.setItem(SK.LAST_INVENTORY_UPDATE, App.State.lastInventoryUpdate);
  localStorage.setItem(SK.RECENT_HISTORY, JSON.stringify(App.State.history));
  localStorage.setItem(SK.LIVE_MESSAGES, JSON.stringify(App.State.liveMessages));
};

const debouncedSave = App.Utils.debounce(() => {
  window.saveToStorageImmediate();
  App.Sync.push();
}, 300);

window.saveToStorage = (isImmediate) => {
  window.saveToStorageImmediate();
  App.UI.updateSyncStatus("Saving...", false);
  if (isImmediate) {
    App.Sync.push();
    App.UI.updateSyncStatus("Saved", true);
  } else {
    debouncedSave();
  }
};

// --- PRODUCT ACTIONS ---

window.updateValue = (name, value, index) => {
  const key = App.Utils.getProductKey(App.State.currentCategory, name);
  if (App.State.inventory[key] !== value) {
    App.State.inventory[key] = value;
    App.State.lastInventoryUpdate = Date.now();

    // Contextual History
    const lastRec = App.State.history[0];
    if (lastRec && lastRec.product === name && lastRec.category === App.State.currentCategory) {
      lastRec.value = value;
      lastRec.timestamp = App.State.lastInventoryUpdate;
    } else {
      App.State.history.unshift({
        product: name, category: App.State.currentCategory, value, timestamp: App.State.lastInventoryUpdate
      });
      if (App.State.history.length > 6) App.State.history.pop();
    }
    window.saveToStorage(false);
  }
  const total = App.Utils.safeEvaluate(value);
  const resultEl = document.getElementById(`result-${index}`);
  if (resultEl) resultEl.innerHTML = `Total:<br>${total}`;
};

window.renameProductInline = (oldName) => {
  const currentProds = App.Utils.getCurrentProducts();
  const index = currentProds.indexOf(oldName);
  if (index === -1) return;

  const newName = prompt("Rename product:", oldName);
  if (newName && newName.trim() !== "" && newName !== oldName) {
    const trimmed = newName.trim();
    if (currentProds.includes(trimmed)) return App.UI.showToast("Product exists", "error");

    currentProds[index] = trimmed;
    const oldKey = App.Utils.getProductKey(App.State.currentCategory, oldName);
    const newKey = App.Utils.getProductKey(App.State.currentCategory, trimmed);

    if (App.State.inventory[oldKey] !== undefined) {
      App.State.inventory[newKey] = App.State.inventory[oldKey];
      delete App.State.inventory[oldKey];
    }

    window.saveToStorage(true);
    App.UI.renderInventory();
  }
};

window.removeProductInline = (name) => {
  const currentProds = App.Utils.getCurrentProducts();
  const index = currentProds.indexOf(name);
  if (index === -1) return;

  App.UI.confirm(`Delete product "${name}"?`, () => {
    currentProds.splice(index, 1);
    delete App.State.inventory[App.Utils.getProductKey(App.State.currentCategory, name)];
    window.saveToStorage(true);
    App.UI.renderInventory();
    App.UI.showToast("Product deleted", "info");
  });
};

window.submitQuickAdd = () => {
    const input = document.getElementById("quick-add-name");
    const name = input?.value.trim();
    if (!name) return;

    const currentProds = App.Utils.getCurrentProducts();
    if (currentProds.includes(name)) return App.UI.showToast("Product exists", "error");

    currentProds.push(name);
    window.saveToStorage(true);
    App.UI.renderInventory();
    App.UI.showToast("Product added", "success");
};

// --- CATEGORY ACTIONS ---

window.moveCategory = (index, direction) => {
  const next = index + direction;
  if (next >= 0 && next < App.State.categoryOrder.length) {
    [App.State.categoryOrder[index], App.State.categoryOrder[next]] = [App.State.categoryOrder[next], App.State.categoryOrder[index]];
    window.saveToStorage(true);
    App.UI.renderTabs();
    App.UI.renderManageUI();
  }
};

window.editCategory = (oldCat) => {
  const newCat = prompt("Rename category:", oldCat);
  if (newCat?.trim() && newCat !== oldCat) {
    if (App.State.products[newCat]) return App.UI.showToast("Category exists", "error");

    App.State.products[newCat] = App.State.products[oldCat];
    delete App.State.products[oldCat];

    const idx = App.State.categoryOrder.indexOf(oldCat);
    if (idx > -1) App.State.categoryOrder[idx] = newCat;

    // Migrate inventory keys
    const prefix = `${oldCat}-`;
    Object.keys(App.State.inventory).forEach(key => {
      if (key.startsWith(prefix)) {
        const pName = key.substring(prefix.length);
        App.State.inventory[App.Utils.getProductKey(newCat, pName)] = App.State.inventory[key];
        delete App.State.inventory[key];
      }
    });

    if (App.State.currentCategory === oldCat) App.State.currentCategory = newCat;
    window.saveToStorage(true);
    App.UI.renderTabs();
    App.UI.renderInventory();
    App.UI.renderManageUI();
  }
};

window.removeCategory = (cat) => {
  App.UI.confirm(`Delete category "${cat}"?`, () => {
    delete App.State.products[cat];
    App.State.categoryOrder = App.State.categoryOrder.filter(c => c !== cat);
    
    const prefix = `${cat}-`;
    Object.keys(App.State.inventory).forEach(key => {
      if (key.startsWith(prefix)) delete App.State.inventory[key];
    });

    if (App.State.currentCategory === cat) App.State.currentCategory = App.State.categoryOrder[0] || "";
    window.saveToStorage(true);
    App.UI.renderTabs();
    App.UI.renderInventory();
    App.UI.renderManageUI();
    App.UI.showToast("Category deleted", "info");
  });
};

// --- RESET ACTIONS ---

window.resetInventory = () => {
  App.UI.confirm("Reset ALL inventory values to zero?", () => {
    App.State.inventory = {};
    App.State.lastInventoryUpdate = Date.now();
    window.saveToStorage(true);
    App.UI.renderInventory();
    App.UI.showToast("All inventory reset", "success");
  });
};

window.resetCategoryInventory = () => {
  const cat = App.State.currentCategory;
  if (!cat) return;
  App.UI.confirm(`Reset ALL items in "${cat}" to zero?`, () => {
    const prods = App.State.products[cat] || [];
    let changed = false;
    prods.forEach(p => {
      const key = App.Utils.getProductKey(cat, p);
      if (App.State.inventory[key]) { delete App.State.inventory[key]; changed = true; }
    });

    if (changed) {
      App.State.lastInventoryUpdate = Date.now();
      App.State.history.unshift({ product: "ALL ITEMS RESET", category: cat, value: "0 (Cleared)", timestamp: App.State.lastInventoryUpdate });
      if (App.State.history.length > 6) App.State.history.pop();
      window.saveToStorage(true);
      App.UI.renderInventory();
      App.UI.showToast(`Category "${cat}" reset`, "success");
    }
  });
};

// --- MISC ---

window.updateAdminLoginUI = () => {
  const isUnlocked = App.UI.isDesktop() || App.State.mobileAdminUnlocked;
  document.getElementById("admin-login-form")?.classList.toggle("hidden", isUnlocked);
  document.getElementById("admin-logout-form")?.classList.toggle("hidden", !isUnlocked);
  document.getElementById("admin-protected-content")?.classList.toggle("hidden", !isUnlocked);
};

window.updateProductSuggestions = () => {
  const dataList = document.getElementById("master-product-list");
  if (!dataList) return;
  const allProds = new Set();
  Object.values(App.Config.INITIAL_PRODUCTS).forEach(arr => arr.forEach(p => allProds.add(p)));
  Object.values(App.State.products).forEach(arr => arr.forEach(p => allProds.add(p)));
  dataList.innerHTML = "";
  allProds.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    dataList.appendChild(opt);
  });
};

window.sortProductsToggle = () => {
  App.State.sortDirection = App.State.sortDirection === "asc" ? "desc" : "asc";
  App.UI.renderInventory();
};

window.toggleViewMode = (mode) => {
  App.State.viewMode = mode;
  App.UI.renderInventory();
};

window.showQuickAddForm = () => {
  const container = document.getElementById("quick-add-form-container");
  if (!container) return;
  container.innerHTML = `
    <div class="quick-add-form">
      <input type="text" id="quick-add-name" placeholder="New product name" list="master-product-list">
      <div class="quick-add-actions">
        <button onclick="window.submitQuickAdd()">Add</button>
        <button class="cancel" onclick="window.hideQuickAddForm()">Cancel</button>
      </div>
    </div>
  `;
  container.classList.remove("hidden");
  document.querySelector(".quick-add-card").classList.add("hidden");
  document.getElementById("quick-add-name")?.focus();
};

window.hideQuickAddForm = () => {
  document.getElementById("quick-add-form-container")?.classList.add("hidden");
  document.querySelector(".quick-add-card")?.classList.remove("hidden");
};

// --- SNAPSHOT ACTIONS ---

window.sendLiveMessage = () => {
  const input = document.getElementById("live-msg-input");
  const msg = input?.value.trim();
  if (!msg) return;

  App.UI.confirm(`Broadcast message: "${msg}"?`, () => {
    const combined = [msg, ...(App.State.liveMessages || [])].slice(0, 10);
    App.State.liveMessages = combined;
    input.value = "";
    window.saveToStorageImmediate(true);
    App.Sync.push();
    App.UI.showToast("Broadcast Success!", "success");
    App.UI.renderLiveTicker();
  });
};

window.switchSnapshotTab = (tab) => {
  document.querySelectorAll(".snapshot-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  const isList = tab === "list";
  document.getElementById("snapshot-list")?.classList.toggle("hidden", !isList);
  document.getElementById("snapshot-compare-view")?.classList.toggle("hidden", isList);
  if (!isList) window.loadComparison(tab);
};

window.loadComparison = async (type) => {
  if (!App.Services.supabase || !App.State.syncId) return App.UI.renderComparisonError("Connect Cloud Sync first.");
  
  const label = type === "week" ? "Weekly" : "Monthly";
  App.UI.renderComparisonError(`Loading ${label} data...`);

  // Simple boundaries
  const now = new Date();
  let currentStart, previousStart, previousEnd;

  if (type === "week") {
    const day = now.getDay();
    const thisTue = new Date(now);
    thisTue.setHours(0,0,0,0);
    thisTue.setDate(thisTue.getDate() - (day < 2 ? day + 5 : day - 2));
    currentStart = thisTue.toISOString();
    const lastTue = new Date(thisTue); lastTue.setDate(thisTue.getDate() - 7);
    previousStart = lastTue.toISOString();
    previousEnd = thisTue.toISOString();
  } else {
    const thisM2 = new Date(now.getFullYear(), now.getMonth(), 2, 0, 0, 0);
    currentStart = thisM2.toISOString();
    const lastM2 = new Date(now.getFullYear(), now.getMonth() - 1, 2, 0, 0, 0);
    previousStart = lastM2.toISOString();
    previousEnd = currentStart;
  }

  try {
    const [resNew, resOld] = await Promise.all([
      App.Services.supabase.from("inventory_snapshots").select("*").eq("sync_id", App.State.syncId).gte("created_at", currentStart).order("created_at", { ascending: true }).limit(1),
      App.Services.supabase.from("inventory_snapshots").select("*").eq("sync_id", App.State.syncId).gte("created_at", previousStart).lt("created_at", previousEnd).order("created_at", { ascending: true }).limit(1)
    ]);

    const newSnap = resNew.data?.[0];
    const oldSnap = resOld.data?.[0];

    if (!newSnap || !oldSnap) return App.UI.renderComparisonError(`Insufficient snapshots for ${label} comparison.`);
    App.UI.renderComparison(oldSnap, newSnap, label);
  } catch (err) {
    App.UI.renderComparisonError("Failed to load comparison.");
  }
};

window.compareWithCurrent = async (id, label) => {
  if (!App.Services.supabase || !App.State.syncId) return;
  App.UI.showToast("Loading report data...", "info");
  try {
     const { data, error } = await App.Services.supabase.from("inventory_snapshots").select("*").eq("id", id).single();
     if (error) throw error;

     // Synthesize current as a snapshot
     const currentData = {};
     App.State.categoryOrder.forEach(cat => {
         currentData[cat] = {};
         (App.State.products[cat] || []).forEach(p => {
             currentData[cat][p] = App.Utils.safeEvaluate(App.State.inventory[App.Utils.getProductKey(cat, p)]);
         });
     });

     window.switchSnapshotTab("compare");
     App.UI.renderComparison(data, { snapshot_data: currentData, created_at: new Date().toISOString() }, `Current vs ${label}`);
  } catch (err) {
      App.UI.showToast("Failed to load snapshot", "error");
  }
};

window.deleteSnapshot = async (id) => {
  App.UI.confirm("Permanently delete this record?", async () => {
    const { error } = await App.Services.supabase.from("inventory_snapshots").delete().eq("id", id).eq("sync_id", App.State.syncId);
    if (error) return App.UI.showToast("Delete failed", "error");
    App.UI.showToast("Record deleted", "success");
    App.Sync.loadSnapshots();
  });
};

window.editSnapshotNote = async (id, newNote) => {
  if (!App.Services.supabase || !App.State.syncId) return;
  try {
    const { error } = await App.Services.supabase
      .from("inventory_snapshots")
      .update({ note: newNote })
      .eq("id", id)
      .eq("sync_id", App.State.syncId);
    if (error) throw error;
    App.UI.showToast("Note updated", "success");
    App.Sync.loadSnapshots();
  } catch (err) {
    App.UI.showToast("Failed to update note", "error");
  }
};

// --- MISC OVERRIDES ---

(function initAdminTrigger() {
  let count = 0;
  let timer = null;
  document.getElementById('hidden-admin-trigger')?.addEventListener('click', () => {
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 1500);
    if (count >= 7) {
      count = 0;
      if (prompt('Enter Admin PIN (v3):') === '9900') {
        App.State.isAdmin = !App.State.isAdmin;
        document.body.classList.toggle('admin-edit-mode', App.State.isAdmin);
        App.UI.showToast(`Admin Mode ${App.State.isAdmin ? 'Enabled' : 'Disabled'}`, 'success');
        initializeCategory();
        App.UI.renderTabs();
        App.UI.renderInventory();
      }
    }
  });
})();
