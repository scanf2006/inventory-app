const App = {
  Config: {
    VERSION: "v3.1.52",
    SUPABASE_URL: "https://kutwhtcvhtbhbhhyqiop.supabase.co",
    SUPABASE_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dHdodGN2aHRiaGJoaHlxaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDE4OTUsImV4cCI6MjA4NjMxNzg5NX0.XhQ4m5SXV0GfmryV9iRQE9FEsND3HAep6c56VwPFcm4",
    STORAGE_KEYS: {
      PRODUCTS: "lubricant_products",
      INVENTORY: "lubricant_inventory",
      CATEGORY_ORDER: "lubricant_category_order",
      SYNC_ID: "lubricant_sync_id",
      COMMON_OILS: "lubricant_common_oils",
      LAST_UPDATED: "lubricant_last_updated",
      LAST_INVENTORY_UPDATE: "lubricant_last_inventory_update",
      RECENT_HISTORY: "lubricant_recent_history",
      LIVE_MESSAGES: "lubricant_live_messages",
    },
    INITIAL_PRODUCTS: {
      "Bulk Oil": [
        "0W20S",
        "5W30S",
        "5W30B",
        "AW68",
        "AW16S",
        "0W20E",
        "0W30E",
        "50W",
        "75W90GL5",
        "30W",
        "ATF",
        "T0-4 10W",
        "5W40 DIESEL",
      ],
      "Case Oil": [
        "0W20B",
        "5W20B",
        "AW32",
        "AW46",
        "5W40E",
        "5W30E",
        "UTH",
        "80W90GL5",
        "10W",
        "15W40 CK4",
        "10W30 CK4",
        "70-4 30W",
      ],
      Coolant: ["RED 50/50", "GREEN 50/50"],
      Others: [
        "DEF",
        "Brake Blast",
        "MOLY 3% EP2",
        "CVT",
        "SAE 10W-30 Motor Oil",
        "OW16S(Quart)",
      ],
    },
  },

  State: {
    currentCategory: "",
    products: null,
    inventory: null,
    categoryOrder: null,
    commonOils: ["5W20S", "5W20B", "5W30S", "5W30B"], // v3.0 Desktop dashboard config
    syncId: "",
    viewMode: "edit",
    sortDirection: "asc",
    lastUpdated: 0,
    lastInventoryUpdate: 0, // Specifically for inventory data changes
    history: [], // v3.0.26 Recent update records
    liveMessages: [], // v3.1.14 Live ticker messages
    chartInstance: null, // v3.0 Chart.js instance tracking
  },

  Services: {
    supabase: null,
  },

  Utils: {
    safeGetJSON: function (key, defaultValue) {
      try {
        var item = localStorage.getItem(key);
        if (!item || item === "undefined" || item === "null")
          return defaultValue;
        return JSON.parse(item) || defaultValue;
      } catch (e) {
        return defaultValue;
      }
    },

    debounce: function (func, wait) {
      var timeout;
      return function () {
        var context = this,
          args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
          func.apply(context, args);
        }, wait);
      };
    },

    safeEvaluate: function (expr) {
      if (!expr || typeof expr !== "string" || expr.trim() === "") return 0;
      var cleanExpr = expr.replace(/[^0-9+\-*/(). ]/g, "");
      if (!cleanExpr) return 0;
      try {
        // Pure arithmetic parser: tokenize and compute without eval/Function
        var tokens = cleanExpr.match(/(?:\d+\.?\d*|[+\-*/()])/g);
        if (!tokens) return 0;
        var pos = 0;
        function parseExpr() {
          var result = parseTerm();
          while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
            var op = tokens[pos++];
            var right = parseTerm();
            result = op === '+' ? result + right : result - right;
          }
          return result;
        }
        function parseTerm() {
          var result = parseFactor();
          while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
            var op = tokens[pos++];
            var right = parseFactor();
            if (op === '/' && right === 0) return 0;
            result = op === '*' ? result * right : result / right;
          }
          return result;
        }
        function parseFactor() {
          if (tokens[pos] === '(') {
            pos++;
            var result = parseExpr();
            if (tokens[pos] === ')') pos++;
            return result;
          }
          var num = parseFloat(tokens[pos++]);
          return isNaN(num) ? 0 : num;
        }
        var result = parseExpr();
        return isNaN(result) ? 0 : Math.round(result * 100) / 100;
      } catch (e) {
        return 0;
      }
    },

    // Helper: Generate unique inventory key
    getProductKey: function (category, product) {
      return category + "-" + product;
    },

    // Helper: Get product list for current category safely
    getCurrentProducts: function () {
      if (!App.State.currentCategory || !App.State.products) return [];
      return App.State.products[App.State.currentCategory] || [];
    },

    // Helper: Escape illegal characters for inline HTML/JS injections
    escapeStr: function (str) {
      if (!str) return "";
      return String(str)
        .replace(/\\/g, "\\\\") // Escape backslashes first
        .replace(/'/g, "\\'") // Escape single quotes
        .replace(/"/g, "&quot;") // Escape double quotes to prevent breaking attributes
        .replace(/\n/g, "\\n") // Handle newlines
        .replace(/\r/g, "\\r");
    },

    // New Security Feature: Escape HTML to prevent XSS
    escapeHTML: function (str) {
      if (!str) return "";
      var div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    },
  },

  UI: {
    isDesktop: function () {
      if (App.State.isAdmin) return false;
      return window.innerWidth >= 768;
    },

    updateSyncStatus: function (status, isOnline) {
      var el = document.getElementById("sync-status");
      if (el) {
        var span = el.querySelector("span");
        if (span) {
          span.innerText = status;
          if (isOnline) el.classList.add("online");
          else el.classList.remove("online");
        }
      }
    },

    showToast: function (message, type) {
      type = type || "info";
      var container = document.getElementById("toast-container");
      if (!container) return;

      var toast = document.createElement("div");
      toast.className = "toast " + type;

      var icon = "ℹ️";
      if (type === "success") icon = "✅";
      if (type === "error") icon = "⚠️";

      toast.innerHTML =
        "<span>" +
        icon +
        "</span><span>" +
        App.Utils.escapeHTML(message) +
        "</span>";
      container.appendChild(toast);

      setTimeout(function () {
        toast.classList.add("hiding");
        toast.addEventListener("animationend", function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
      }, 3000);
    },

    confirm: function (msg, onConfirm, onCancel, options) {
      options = options || {};
      var overlay = document.getElementById("confirm-modal");
      var msgEl = document.getElementById("confirm-msg");
      var yesBtn = document.getElementById("confirm-yes-btn");
      var noBtn = document.getElementById("confirm-no-btn");

      if (!overlay || !msgEl || !yesBtn || !noBtn) {
        if (window.confirm(msg)) {
          if (onConfirm) onConfirm();
        } else if (onCancel) {
          onCancel();
        }
        return;
      }

      msgEl.innerHTML = msg; 
      
      // Customizable button text (defaults to Yes/No)
      yesBtn.textContent = options.confirmText || "Yes";
      noBtn.textContent = options.cancelText || "No";

      // Toggle No button visibility for simple alerts
      noBtn.style.display = options.hideCancel ? "none" : "inline-block";

      yesBtn.onclick = function () {
        overlay.classList.add("hidden");
        if (onConfirm) onConfirm();
      };
      noBtn.onclick = function () {
        overlay.classList.add("hidden");
        if (onCancel) onCancel();
      };
      overlay.classList.remove("hidden");
    },

    closeConfirm: function () {
      var el = document.getElementById("confirm-modal");
      if (el) el.classList.add("hidden");
    },
  },
};

// --- Initialization ---

function initApp() {
  var SK = App.Config.STORAGE_KEYS;
  // Data Migration (Recovering data from v1.7.x)
  if (
    !localStorage.getItem(SK.PRODUCTS) &&
    localStorage.getItem("inventory_products")
  ) {
    localStorage.setItem(
      SK.PRODUCTS,
      localStorage.getItem("inventory_products"),
    );
    localStorage.setItem(SK.INVENTORY, localStorage.getItem("inventory_data"));
    localStorage.setItem(
      SK.CATEGORY_ORDER,
      localStorage.getItem("inventory_category_order"),
    );
    localStorage.setItem(SK.SYNC_ID, localStorage.getItem("inventory_sync_id"));
  }

  App.State.products = App.Utils.safeGetJSON(
    SK.PRODUCTS,
    App.Config.INITIAL_PRODUCTS,
  );
  App.State.inventory = App.Utils.safeGetJSON(SK.INVENTORY, {});
  App.State.categoryOrder = App.Utils.safeGetJSON(
    SK.CATEGORY_ORDER,
    Object.keys(App.Config.INITIAL_PRODUCTS),
  );

  // Recovery mechanism for any keys corrupted with '::' during v3.0.1-v3.0.3 timeframe
  var hasCorruptKeys = false;
  Object.keys(App.State.inventory).forEach(function (key) {
    if (key.indexOf("::") !== -1) {
      var newKey = key.replace("::", "-");
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

  App.State.lastUpdated = parseInt(
    localStorage.getItem(SK.LAST_UPDATED) || "0",
  );
  App.State.lastInventoryUpdate = parseInt(
    localStorage.getItem(SK.LAST_INVENTORY_UPDATE) || "0",
  );
  App.State.history = App.Utils.safeGetJSON(SK.RECENT_HISTORY, []);
  App.State.liveMessages = App.Utils.safeGetJSON(SK.LIVE_MESSAGES, []);

  var savedId = localStorage.getItem(SK.SYNC_ID);
  App.State.syncId =
    savedId === null || savedId === "null" || savedId === "undefined"
      ? ""
      : savedId;

  initSupabase();
  initializeCategory();

  // UI Init
  document.getElementById("current-date").innerText =
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  updateProductSuggestions();
  renderTabs();
  renderInventory();

  // Footer button binding
  var manageBtn = document.getElementById("manage-btn");
  if (manageBtn) {
    manageBtn.onclick = function () {
      var modalOverlay = document.getElementById("modal-overlay");
      modalOverlay.classList.remove("hidden");
      document.getElementById("sync-id-input").value = App.State.syncId || "";
      renderCommonOilsCheckboxes();
      renderManageUI();
    };
  }

  // v3.1.36 CRITICAL DATA LOSS FIX: Sync ID input binding
  var syncInput = document.getElementById("sync-id-input");
  if (syncInput) {
    syncInput.addEventListener("input", function () {
      App.State.syncId = this.value.trim().toUpperCase();
      // DO NOT call saveToStorage()! It arms App.State.syncId and schedules debounced pushToCloud(),
      // which silently destroys the cloud database with empty local factory state before pull wins.
      localStorage.setItem(App.Config.STORAGE_KEYS.SYNC_ID, App.State.syncId);
    });
  }

  // v3.1.27 Reset All Inventory binding (replaces inline onclick)
  var resetAllBtn = document.getElementById("reset-all-btn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", function () {
      resetInventory();
    });
  }

  if (App.Services.supabase && App.State.syncId) {
    pullFromCloud();

    // Auto-Sync Triggers
    window.addEventListener("focus", function () {
      pullFromCloud(true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") pullFromCloud(true);
    });

    // v3.1.37 Accelerated Background Polling (10s)
    setInterval(function () {
      if (document.visibilityState === "visible") pullFromCloud(true);
    }, 10000);

    // v3.1.37 Immediate Sync on Tab Focus
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") {
        pullFromCloud(true);
      }
    });
  }

  // Dynamic Version Display
  var versionEl = document.getElementById("app-version-display");
  if (versionEl) {
    versionEl.innerText = App.Config.VERSION + " Dashboard Edition";
  }

  // v3.1.0 Snapshot - Mobile save button binding
  var snapshotBtn = document.getElementById("save-snapshot-btn");
  if (snapshotBtn) {
    snapshotBtn.onclick = function () {
      var noteInput = document.getElementById("snapshot-note-input");
      var note = noteInput ? noteInput.value.trim() : "";
      saveSnapshot(note);
    };
  }

  // v3.1.0 Desktop: initial snapshot list load
  if (App.UI.isDesktop()) {
    loadSnapshots();
    renderLiveTicker(); // v3.1.14
  }

  // v3.1.14 Live Message Send
  var sendLiveBtn = document.getElementById("send-live-btn");
  if (sendLiveBtn) {
    sendLiveBtn.onclick = window.sendLiveMessage;
  }

  // v3.1.27 Snapshot Tab Event Delegation (replaces inline onclick)
  var tabGroup = document.getElementById("snapshot-tab-group");
  if (tabGroup) {
    tabGroup.addEventListener("click", function (e) {
      var btn = e.target.closest(".snapshot-tab");
      if (btn && btn.dataset.tab) {
        window.switchSnapshotTab(btn.dataset.tab);
      }
    });
  }
}

function initSupabase() {
  var lib = window.supabasejs || window.supabase;
  if (lib && typeof lib.createClient === "function") {
    App.Services.supabase = lib.createClient(
      App.Config.SUPABASE_URL,
      App.Config.SUPABASE_KEY,
    );
  } else if (
    lib &&
    lib.supabase &&
    typeof lib.supabase.createClient === "function"
  ) {
    App.Services.supabase = lib.supabase.createClient(
      App.Config.SUPABASE_URL,
      App.Config.SUPABASE_KEY,
    );
  }

  // Initialize real-time listeners on all devices
  if (App.Services.supabase) {
    setupRealtimeSubscriptions();
  }
}

// v3.1.2 Real-time data sync subscriptions
function setupRealtimeSubscriptions() {
  if (!App.Services.supabase || !App.State.syncId) return;

  console.log("Setting up Supabase real-time subscriptions...");

  App.Services.supabase
    .channel("custom-all-channel-" + App.State.syncId)
    // Listen for app_sync table changes (inventory, live messages, etc.)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_sync",
        filter: "sync_id=eq." + App.State.syncId,
      },
      function (payload) {
        console.log("Real-time update received for app_sync!");
        pullFromCloud(true);
      }
    )
    // Listen for inventory_snapshots table changes (history/notes/deletes)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "inventory_snapshots",
        filter: "sync_id=eq." + App.State.syncId,
      },
      function (payload) {
        console.log("Real-time update received for inventory_snapshots!");
        loadSnapshots();
      }
    )
    .subscribe(function (status) {
      console.log("Supabase subscription status:", status);
    });
}

function initializeCategory() {
  var currentCats = Object.keys(App.State.products);
  var order = App.State.categoryOrder || [];
  App.State.categoryOrder = order.filter(function (c) {
    return currentCats.indexOf(c) !== -1;
  });
  currentCats.forEach(function (c) {
    if (App.State.categoryOrder.indexOf(c) === -1)
      App.State.categoryOrder.push(c);
  });
  if (
    App.State.categoryOrder.length > 0 &&
    (!App.State.currentCategory ||
      !App.State.products[App.State.currentCategory])
  ) {
    App.State.currentCategory = App.State.categoryOrder[0];
  }
}

// --- Cloud Sync ---

function pushToCloud() {
  if (!App.Services.supabase || !App.State.syncId) return;

  App.Services.supabase
    .from("app_sync")
    .upsert(
      {
        sync_id: App.State.syncId,
        data: {
          products: App.State.products,
          inventory: App.State.inventory,
          category_order: App.State.categoryOrder,
          last_updated_ts: App.State.lastUpdated,
          last_inventory_update_ts: App.State.lastInventoryUpdate,
          recent_history: App.State.history,
          live_messages: App.State.liveMessages,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sync_id" },
    )
    .then(function (res) {
      if (res.error) {
        App.UI.updateSyncStatus("Sync Offline", false);
      } else {
        App.UI.updateSyncStatus("Cloud Synced", true);
      }
    });
}

function pullFromCloud(isSilent) {
  if (!App.Services.supabase || !App.State.syncId) return;

  if (!isSilent) App.UI.updateSyncStatus("Checking...", false);

  App.Services.supabase
    .from("app_sync")
    .select("data, updated_at")
    .eq("sync_id", App.State.syncId)
    .single()
    .then(function (res) {
      if (res.data && res.data.data) {
        var cloudData = res.data.data;
        var cloudTS =
          cloudData.last_updated_ts || new Date(res.data.updated_at).getTime();
        var localTS = App.State.lastUpdated;

        // Conflict Resolution: Only pull if cloud is newer than local
        if (cloudTS > localTS) {
          // v3.1.28 Data Integrity Guard: prevent empty cloud from overwriting real data
          var cloudProductCount = cloudData.products ? Object.keys(cloudData.products).length : 0;
          var cloudInventoryCount = cloudData.inventory ? Object.keys(cloudData.inventory).length : 0;
          var localProductCount = App.State.products ? Object.keys(App.State.products).length : 0;
          var localInventoryCount = App.State.inventory ? Object.keys(App.State.inventory).length : 0;

          // If cloud data is substantially empty but local has real data, warn user
          if (localProductCount > 0 && cloudProductCount === 0 && cloudInventoryCount === 0) {
            console.warn("[Sync Guard] Cloud data is empty but local has " + localProductCount + " categories. Refusing to overwrite.");
            if (!isSilent) {
              App.UI.showToast("Cloud data appears empty. Local data preserved.", "error");
            }
            // Push local data to cloud to fix the empty cloud state
            pushToCloud();
            return;
          }

          // If cloud inventory is dramatically smaller (>80% loss), ask for confirmation
          if (localInventoryCount > 5 && cloudInventoryCount < localInventoryCount * 0.2) {
            console.warn("[Sync Guard] Cloud inventory (" + cloudInventoryCount + ") is much smaller than local (" + localInventoryCount + ").");
            if (!isSilent) {
              App.UI.confirm(
                "Cloud data has significantly fewer items (" + cloudInventoryCount + " vs local " + localInventoryCount + "). Overwrite local data with cloud?",
                function () {
                  applyCloudData(cloudData, cloudTS, isSilent);
                },
                function () {
                  console.log("[Sync Guard] User rejected destructive overwrite. Counter-pushing local data to override empty cloud state.");
                  pushToCloud();
                  App.UI.showToast("Local data pushed to cloud", "info");
                }
              );
              return;
            }
            // If silent sync, refuse destructive overwrite
            return;
          }

          // v3.1.30 Input Focus Guard: DO NOT wipe DOM if user is actively typing
          if (document.activeElement && document.activeElement.tagName === "INPUT" && document.activeElement.classList.contains("item-input")) {
            console.log("[Sync Guard] Pausing cloud apply because user is actively typing.");
            return;
          }

          applyCloudData(cloudData, cloudTS, isSilent);
        } else if (cloudTS < localTS) {
          // Local is newer, push to cloud
          pushToCloud();
        } else {
          App.UI.updateSyncStatus("Synced", true);
        }
      } else if (res.error && res.error.code !== "PGRST116") {
        // PGRST116 is "not found"
        App.UI.updateSyncStatus("Sync Offline", false);
      } else if (!res.data) {
        pushToCloud();
      }
    })
    .catch(function (err) {
      App.UI.updateSyncStatus("Sync Offline", false);
    });
}

// v3.1.28 Extracted: safely apply cloud data to local state
function applyCloudData(cloudData, cloudTS, isSilent) {
  App.State.products = cloudData.products || App.State.products;
  App.State.inventory = cloudData.inventory || App.State.inventory;
  App.State.categoryOrder =
    cloudData.category_order || App.State.categoryOrder;
  App.State.lastUpdated = cloudTS;
  App.State.lastInventoryUpdate =
    cloudData.last_inventory_update_ts || App.State.lastInventoryUpdate;
  App.State.history = cloudData.recent_history || App.State.history;
  App.State.liveMessages =
    cloudData.live_messages || App.State.liveMessages;

  saveToStorageImmediate(true);
  initializeCategory();
  renderTabs();
  renderInventory();
  renderManageUI();
  renderLiveTicker();
  if (!isSilent)
    App.UI.showToast("Sync: Cloud state loaded", "success");
  App.UI.updateSyncStatus("Synced", true);
}

// --- Storage & Data ---

function saveToStorageImmediate(skipTimestamp) {
  var SK = App.Config.STORAGE_KEYS;
  if (!skipTimestamp) App.State.lastUpdated = Date.now();
  localStorage.setItem(SK.PRODUCTS, JSON.stringify(App.State.products));
  localStorage.setItem(SK.INVENTORY, JSON.stringify(App.State.inventory));
  localStorage.setItem(
    SK.CATEGORY_ORDER,
    JSON.stringify(App.State.categoryOrder),
  );
  localStorage.setItem(SK.SYNC_ID, App.State.syncId);
  localStorage.setItem(SK.COMMON_OILS, JSON.stringify(App.State.commonOils));
  localStorage.setItem(SK.LAST_UPDATED, App.State.lastUpdated);
  localStorage.setItem(SK.LAST_INVENTORY_UPDATE, App.State.lastInventoryUpdate);
  localStorage.setItem(SK.RECENT_HISTORY, JSON.stringify(App.State.history));
  localStorage.setItem(
    SK.LIVE_MESSAGES,
    JSON.stringify(App.State.liveMessages),
  );
}

var debouncedSave = App.Utils.debounce(function () {
  saveToStorageImmediate();
  pushToCloud();
}, 300);

function saveToStorage(isImmediate) {
  saveToStorageImmediate();
  App.UI.updateSyncStatus("Saving...", false);
  if (isImmediate) {
    pushToCloud();
    App.UI.updateSyncStatus("Saved", true);
  } else {
    debouncedSave();
  }
}

function updateProductSuggestions() {
  var dataList = document.getElementById("master-product-list");
  if (!dataList) return;

  var allProducts = new Set();
  Object.values(App.Config.INITIAL_PRODUCTS).forEach((arr) =>
    arr.forEach((p) => allProducts.add(p)),
  );
  if (App.State.products) {
    Object.values(App.State.products).forEach((arr) =>
      arr.forEach((p) => allProducts.add(p)),
    );
  }

  dataList.innerHTML = "";
  allProducts.forEach(function (pName) {
    var opt = document.createElement("option");
    opt.value = pName;
    dataList.appendChild(opt);
  });
}

// --- Rendering ---

function renderTabs() {
  var tabNav = document.getElementById("category-tabs");
  if (!tabNav) return;
  tabNav.innerHTML = "";

  if (!App.State.categoryOrder) App.State.categoryOrder = [];

  App.State.categoryOrder.forEach(function (cat) {
    if (!App.State.products[cat]) return;
    var btn = document.createElement("button");
    btn.className =
      "tab" + (cat === App.State.currentCategory ? " active" : "");
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
  var list = document.getElementById("inventory-list");
  if (!list) return;
  list.innerHTML = "";

  // Apply layout class based on view mode
  if (App.State.viewMode === "preview") {
    list.className = "inventory-list preview-layout";
  } else {
    list.className = "inventory-list";
  }

  if (!App.State.currentCategory || !App.Utils.getCurrentProducts().length) {
    // Check if category exists but empty, or category not selected
    if (
      App.State.currentCategory &&
      App.State.products[App.State.currentCategory]
    ) {
      // Valid category, just empty
    } else {
      list.innerHTML =
        '<div class="empty-state">' +
        App.Utils.escapeHTML("Select or Add a Category") +
        "</div>";
      return;
    }
  }

  var products = App.Utils.getCurrentProducts();

  var sortedProducts = products.slice();
  if (App.State.sortDirection === "asc") sortedProducts.sort();
  else if (App.State.sortDirection === "desc") sortedProducts.sort().reverse();

  // Filter out zero-stock items in Desktop or Preview mode
  if (App.State.viewMode === "preview" || App.UI.isDesktop()) {
    sortedProducts = sortedProducts.filter(function (name) {
      var key = App.Utils.getProductKey(App.State.currentCategory, name);
      var valStr = App.State.inventory[key] || "";
      return App.Utils.safeEvaluate(valStr) > 0;
    });
  }

  // Sort & View Controls Wrapper
  var controls = document.getElementById("inventory-controls");
  if (controls) {
    controls.innerHTML = "";
    var bar = document.createElement("div");
    bar.className = "view-toggle-bar";

    var sortControl = document.createElement("div");
    sortControl.className = "segmented-control";
    var sortBtn = document.createElement("button");
    sortBtn.className = "btn-sort";
    sortBtn.textContent = "Sort: " + App.State.sortDirection.toUpperCase();
    sortBtn.addEventListener("click", function () { sortProductsToggle(); });
    sortControl.appendChild(sortBtn);

    var viewControl = document.createElement("div");
    viewControl.className = "segmented-control";
    var editBtn = document.createElement("button");
    editBtn.className = "btn-edit" + (App.State.viewMode === "edit" ? " active" : "");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { toggleViewMode("edit"); });
    var previewBtn = document.createElement("button");
    previewBtn.className = "btn-edit" + (App.State.viewMode === "preview" ? " active" : "");
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", function () { toggleViewMode("preview"); });
    viewControl.appendChild(editBtn);
    viewControl.appendChild(previewBtn);

    bar.appendChild(sortControl);
    bar.appendChild(viewControl);
    controls.appendChild(bar);
  }

  // Product Variety Count - Moved ABOVE inventory-list (v3.1.14)
  var countBadge = document.getElementById("inventory-count-badge");
  if (!countBadge) {
    countBadge = document.createElement("div");
    countBadge.id = "inventory-count-badge";
    countBadge.className = "product-count-badge";
    countBadge.style =
      "text-align: center; margin: 15px 0 10px 0; font-size: 0.85rem; color: var(--text-muted); font-weight: 600; width: 100%;";
    list.parentNode.insertBefore(countBadge, list);
  }
  countBadge.innerText = "Products: " + sortedProducts.length;

  // [v3.0.25 Move] Reset Category Button (Only in Edit Mode at the TOP)
  if (App.State.viewMode === "edit" && !App.UI.isDesktop()) {
    var resetWrapper = document.createElement("div");
    resetWrapper.style = "margin: 5px 0 15px 0;";
    var resetBtn = document.createElement("button");
    resetBtn.className = "btn-delete danger-zone-reset w-full";
    resetBtn.style = "opacity: 0.8; font-size: 0.85rem; padding: 12px; border-radius: 12px;";
    resetBtn.textContent = "Reset " + App.State.currentCategory + " to Zero";
    resetBtn.addEventListener("click", function () { resetCategoryInventory(); });
    resetWrapper.appendChild(resetBtn);
    list.appendChild(resetWrapper);
  }

  sortedProducts.forEach(function (name, index) {
    var key = App.Utils.getProductKey(App.State.currentCategory, name);
    var val = App.State.inventory[key] || "";
    var total = App.Utils.safeEvaluate(val);
    var isPreview = App.State.viewMode === "preview" || App.UI.isDesktop();

    var card = document.createElement("div");
    card.className = "item-card" + (isPreview ? " preview-mode" : "");

    // Safe DOM construction: user data via textContent, events via addEventListener
    var infoDiv = document.createElement("div");
    infoDiv.className = "item-info";

    var nameDiv = document.createElement("div");
    nameDiv.className = "item-name";
    nameDiv.textContent = name;

    var resultDiv = document.createElement("div");
    resultDiv.className = "item-result";
    resultDiv.id = "result-" + index;
    resultDiv.innerHTML = 'Total: <span class="highlight-total">' + total + "</span>";

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(resultDiv);
    card.appendChild(infoDiv);

    if (!isPreview) {
      nameDiv.style.cursor = "pointer";
      nameDiv.addEventListener("click", (function (prodName) {
        return function () { renameProductInline(prodName); };
      })(name));

      var inputGroup = document.createElement("div");
      inputGroup.className = "input-group";

      var input = document.createElement("input");
      input.type = "tel"; // 使用电话拨号键盘，提供 * # 符号键
      input.className = "item-input";
      input.value = val;
      input.placeholder = "0";
      input.addEventListener("input", (function (prodName, idx) {
        return function () { 
          // v3.1.52：由于部分手机拨号盘按 * # 没反应，将减号 (-) 也强制转换为 *（乘号）
          if (this.value.includes('#') || this.value.includes('-')) {
            this.value = this.value.replace(/[-#]/g, '*');
          }
          window.updateValue(prodName, this.value, idx); 
        };
      })(name, index));

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "item-delete-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.addEventListener("click", (function (prodName) {
        return function () { removeProductInline(prodName); };
      })(name));

      inputGroup.appendChild(input);
      inputGroup.appendChild(deleteBtn);
      card.appendChild(inputGroup);
    }

    list.appendChild(card);
  });

  // Quick Add Card (Only in Edit Mode and NOT on Desktop Dashboard)
  if (App.State.viewMode === "edit" && !App.UI.isDesktop()) {
    var quickAddWrapper = document.createElement("div");
    quickAddWrapper.className = "quick-add-wrapper";

    var quickAddCard = document.createElement("div");
    quickAddCard.className = "quick-add-card";
    quickAddCard.addEventListener("click", function () { showQuickAddForm(); });
    var quickAddLabel = document.createElement("span");
    quickAddLabel.textContent = "+ Add Product";
    quickAddCard.appendChild(quickAddLabel);

    var formContainer = document.createElement("div");
    formContainer.id = "quick-add-form-container";
    formContainer.className = "hidden";

    quickAddWrapper.appendChild(quickAddCard);
    quickAddWrapper.appendChild(formContainer);
    list.appendChild(quickAddWrapper);
  }

  // Trigger chart update after rendering
  if (App.UI.isDesktop()) {
    renderDesktopChart();
  }
}

window.showQuickAddForm = function () {
  var container = document.getElementById("quick-add-form-container");
  if (!container) return;
  container.innerHTML = "";

  var formDiv = document.createElement("div");
  formDiv.className = "quick-add-form";

  var nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "quick-add-name";
  nameInput.placeholder = "New product name";
  nameInput.setAttribute("list", "master-product-list");

  var actionsDiv = document.createElement("div");
  actionsDiv.className = "quick-add-actions";

  var addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", function () { submitQuickAdd(); });

  var cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", function () { hideQuickAddForm(); });

  actionsDiv.appendChild(addBtn);
  actionsDiv.appendChild(cancelBtn);
  formDiv.appendChild(nameInput);
  formDiv.appendChild(actionsDiv);
  container.appendChild(formDiv);

  container.classList.remove("hidden");
  document.querySelector(".quick-add-card").classList.add("hidden");
  nameInput.focus();
};

window.hideQuickAddForm = function () {
  var container = document.getElementById("quick-add-form-container");
  if (container) {
    container.classList.add("hidden");
    document.querySelector(".quick-add-card").classList.remove("hidden");
  }
};

window.submitQuickAdd = function () {
  var input = document.getElementById("quick-add-name");
  var name = input ? input.value.trim() : "";
  if (!name) return;

  var currentProds = App.Utils.getCurrentProducts();
  if (currentProds.includes(name)) {
    return App.UI.showToast("Product exists", "error");
  }

  currentProds.push(name);
  saveToStorage(true);
  renderInventory();
  App.UI.showToast("Product added", "success");
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
      return App.UI.showToast("Product exists", "error");
    }

    currentProds[index] = trimmedName;

    var oldKey = App.Utils.getProductKey(App.State.currentCategory, oldName);
    var newKey = App.Utils.getProductKey(
      App.State.currentCategory,
      trimmedName,
    );

    if (App.State.inventory[oldKey] !== undefined) {
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
    App.UI.showToast("Product deleted", "info");
  });
};

window.sortProductsToggle = function () {
  App.State.sortDirection = App.State.sortDirection === "asc" ? "desc" : "asc";
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
    if (
      lastRec &&
      lastRec.product === name &&
      lastRec.category === App.State.currentCategory
    ) {
      // Update existing record timestamp and value
      lastRec.value = value;
      lastRec.timestamp = App.State.lastInventoryUpdate;
    } else {
      // New record
      App.State.history.unshift({
        product: name,
        category: App.State.currentCategory,
        value: value,
        timestamp: App.State.lastInventoryUpdate,
      });
      if (App.State.history.length > 6)
        App.State.history = App.State.history.slice(0, 6);
    }

    saveToStorage(false);
  }
  var total = App.Utils.safeEvaluate(value);
  var resultEl = document.getElementById("result-" + index);
  if (resultEl) resultEl.innerHTML = "Total:<br>" + total;
};

// --- Modal & Management ---

if (document.querySelector(".close-modal")) {
  document.querySelector(".close-modal").onclick = function () {
    document.getElementById("modal-overlay").classList.add("hidden");
  };
}

if (document.getElementById("connect-sync-btn")) {
  document.getElementById("connect-sync-btn").onclick = function () {
    var input = document.getElementById("sync-id-input");
    var id = input ? input.value.trim() : "";
    if (id) {
      App.State.syncId = id;
      // Critical Fix: Do NOT save immediately as it creates a fresh timestamp and would trigger an empty push.
      // Reset local TS to 0 to ensure Cloud data (if any) wins during pullFromCloud.
      App.State.lastUpdated = 0;
      pullFromCloud();
    } else {
      App.UI.showToast("Please enter a Sync ID.", "info");
    }
  };
}

window.resetInventory = function () {
  App.UI.confirm("Reset ALL inventory values to zero?", function () {
    App.State.inventory = {};
    App.State.lastInventoryUpdate = Date.now();
    saveToStorage(true);
    renderInventory();
    App.UI.showToast("All inventory reset", "success");
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
        timestamp: App.State.lastInventoryUpdate,
      });
      if (App.State.history.length > 6)
        App.State.history = App.State.history.slice(0, 6);

      saveToStorage(true);
      renderInventory();
      App.UI.showToast("Category '" + cat + "' reset to zero", "success");
    } else {
      App.UI.showToast("No items to reset in this category", "info");
    }
  });
};

function renderManageUI() {
  var cList = document.getElementById("category-manage-list");
  if (!cList) return;
  cList.innerHTML = "";
  if (!App.State.categoryOrder) App.State.categoryOrder = [];

  App.State.categoryOrder.forEach(function (cat, idx) {
    var li = document.createElement("li");
    li.className = "manage-item";

    // Safe DOM construction: category name via textContent, events via closures
    var catSpan = document.createElement("span");
    catSpan.className = "category-name";
    catSpan.style.cursor = "pointer";
    catSpan.textContent = cat;
    catSpan.addEventListener("click", (function (catName) {
      return function () { editCategory(catName); };
    })(cat));

    var actionsDiv = document.createElement("div");
    actionsDiv.className = "category-actions";

    var upBtn = document.createElement("button");
    upBtn.className = "btn-sort";
    upBtn.textContent = "▲";
    if (idx === 0) upBtn.disabled = true;
    upBtn.addEventListener("click", (function (i) {
      return function () { moveCategory(i, -1); };
    })(idx));

    var downBtn = document.createElement("button");
    downBtn.className = "btn-sort";
    downBtn.textContent = "▼";
    if (idx === App.State.categoryOrder.length - 1) downBtn.disabled = true;
    downBtn.addEventListener("click", (function (i) {
      return function () { moveCategory(i, 1); };
    })(idx));

    var delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", (function (catName) {
      return function () { removeCategory(catName); };
    })(cat));

    actionsDiv.appendChild(upBtn);
    actionsDiv.appendChild(downBtn);
    actionsDiv.appendChild(delBtn);

    li.appendChild(catSpan);
    li.appendChild(actionsDiv);
    cList.appendChild(li);
  });
}

if (document.getElementById("add-category-btn")) {
  document.getElementById("add-category-btn").onclick = function () {
    var input = document.getElementById("new-category-name");
    var name = input ? input.value.trim() : "";
    if (name && !App.State.products[name]) {
      App.State.products[name] = [];
      App.State.categoryOrder.push(name);
      if (!App.State.currentCategory) App.State.currentCategory = name;
      saveToStorage(true);
      input.value = "";
      renderTabs();
      renderManageUI();
      App.UI.showToast("Category added", "success");
    } else if (name) {
      App.UI.showToast("Category exists", "error");
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
    if (App.State.products[newCat])
      return App.UI.showToast("Category exists", "error");

    App.State.products[newCat] = App.State.products[oldCat];
    delete App.State.products[oldCat];

    var ordIdx = App.State.categoryOrder.indexOf(oldCat);
    if (ordIdx > -1) App.State.categoryOrder[ordIdx] = newCat;

    // Efficiently update inventory keys using new standardized check
    Object.keys(App.State.inventory).forEach(function (key) {
      // Check if key starts with category + '-'
      var prefix = oldCat + "-";
      if (key.indexOf(prefix) === 0) {
        var pName = key.substring(prefix.length);
        var newKey = App.Utils.getProductKey(newCat, pName);
        App.State.inventory[newKey] = App.State.inventory[key];
        delete App.State.inventory[key];
      }
    });

    if (App.State.currentCategory === oldCat)
      App.State.currentCategory = newCat;
    saveToStorage(true);
    renderTabs();
    renderInventory();
    renderManageUI();
  }
};

window.removeCategory = function (cat) {
  App.UI.confirm("Delete category '" + cat + "'?", function () {
    delete App.State.products[cat];
    App.State.categoryOrder = App.State.categoryOrder.filter(function (c) {
      return c !== cat;
    });

    // Cleanup inventory keys
    var prefix = cat + "-";
    Object.keys(App.State.inventory).forEach(function (key) {
      if (key.indexOf(prefix) === 0) delete App.State.inventory[key];
    });

    if (App.State.currentCategory === cat)
      App.State.currentCategory = App.State.categoryOrder[0] || "";
    saveToStorage(true);
    renderTabs();
    renderInventory();
    renderManageUI();
    App.UI.showToast("Category deleted", "info");
  });
};

// --- PDF Export & Data Management ---

if (document.getElementById("export-pdf-btn")) {
  document.getElementById("export-pdf-btn").onclick = function () {
    var pdfArea = document.getElementById("pdf-template");
    var pdfContent = document.getElementById("pdf-content");
    document.getElementById("pdf-date").innerText =
      "Report Date: " + new Date().toLocaleString();
    pdfContent.innerHTML = "";
    var hasData = false;

    if (!App.State.categoryOrder) App.State.categoryOrder = [];

    App.State.categoryOrder.forEach(function (cat) {
      var allProducts = App.State.products[cat] || [];
      if (allProducts.length > 0) {
        hasData = true;
        var block = document.createElement("div");
        block.className = "pdf-category-block";
        var unitSuffix = "";
        var catLower = cat.toLowerCase();
        if (catLower.includes("bulk oil")) unitSuffix = " (L)";
        else if (catLower.includes("case oil")) unitSuffix = " (Cases)";

         block.innerHTML =
          '<div class="pdf-category-title">' + App.Utils.escapeHTML(cat) + unitSuffix + "</div>";

        var grid = document.createElement("div");
        grid.className = "pdf-grid";

        allProducts.forEach(function (name) {
          var key = App.Utils.getProductKey(cat, name);
          var expr = App.State.inventory[key];
          var total = App.Utils.safeEvaluate(expr);
          var item = document.createElement("div");
          item.className = "pdf-grid-item";
          item.innerHTML =
            '<span class="p-name">' +
            name +
            '</span><span class="p-val">' +
            total +
            "</span>";
          grid.appendChild(item);
        });

        if (allProducts.length % 2 !== 0) {
          var spacer = document.createElement("div");
          spacer.className = "pdf-grid-item";
          spacer.innerHTML = "<span></span><span></span>";
          grid.appendChild(spacer);
        }

        block.appendChild(grid);
        pdfContent.appendChild(block);
      }
    });

    if (!hasData) return App.UI.showToast("No data to export", "info");

    pdfArea.classList.remove("hidden");

    var now = new Date();
    var dateStr =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");
    var fileName = "INV_aiden_Report_" + dateStr + ".pdf";

    html2pdf()
      .set({
        margin: 10,
        filename: fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(pdfArea)
      .save()
      .then(function () {
        pdfArea.classList.add("hidden");
        App.UI.showToast("PDF Exported", "success");
      });
  };
}

// Data Export (JSON)
if (document.getElementById("export-json-btn")) {
  document.getElementById("export-json-btn").onclick = function () {
    var now = new Date();
    var localDateStr =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");
    var localTimeStr =
      localDateStr +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      ":" +
      String(now.getSeconds()).padStart(2, "0");

    var data = {
      products: App.State.products,
      inventory: App.State.inventory,
      categoryOrder: App.State.categoryOrder,
      exportDate: localTimeStr,
      version: App.Config.VERSION,
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "inventory_backup_" + localDateStr + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.UI.showToast("Data Exported", "success");
  };
}

// Data Import (JSON)
if (document.getElementById("import-json-btn")) {
  var fileInput = document.getElementById("import-file-input");

  document.getElementById("import-json-btn").onclick = function () {
    if (fileInput) fileInput.click();
  };

  // Purge Zero-Stock Items
  if (document.getElementById("purge-zero-btn")) {
    document.getElementById("purge-zero-btn").onclick = function () {
      App.UI.confirm(
        "Are you sure you want to PERMANENTLY delete all products with ZERO inventory? This cannot be undone.",
        function () {
          purgeZeroStockItems();
        },
      );
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

          // Strategy: Exact Replacement for Products, Categories, and Inventory
          // This ensures renamed or deleted default products don't resurrect from INITIAL_PRODUCTS
          
          // 1. Exact overwrite of products
          App.State.products = {};
          Object.keys(data.products).forEach(function (cat) {
            App.State.products[cat] = [].concat(data.products[cat]);
          });

          // 2. Exact overwrite of Inventory Values
          App.State.inventory = Object.assign({}, data.inventory);

          // 3. Update Category Order (Exact Replacement)
          if (data.categoryOrder) {
            App.State.categoryOrder = [].concat(data.categoryOrder);
          }

          App.State.lastInventoryUpdate = Date.now();
          saveToStorage(true);
          initializeCategory();
          renderTabs();
          renderInventory();
          renderManageUI();

          App.UI.showToast("Data Imported Successfully", "success");

          // Reset input
          fileInput.value = "";
        } catch (err) {
          console.error(err);
          App.UI.showToast("Import Failed: " + err.message, "error");
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
    var ctxContainer = document.getElementById("desktop-chart-container");
    var canvas = document.getElementById("inventoryChart");
    if (!ctxContainer || !canvas || !window.Chart) return;

    // Force commonOils to be an array in case of legacy storage corruption
    var targetOils = App.State.commonOils || [];
    if (typeof targetOils === "string") {
      targetOils = targetOils.split(",").map(function (s) {
        return s.trim();
      });
      App.State.commonOils = targetOils;
    }

    var aggregatedData = {};
    targetOils.forEach(function (oil) {
      aggregatedData[oil] = 0;
    });

    // Safely scan products ONLY from Bulk Oil categories
    if (App.State.products && typeof App.State.products === "object") {
      Object.keys(App.State.products).forEach(function (category) {
        // Critical Fix: Only aggregate data from 'Bulk Oil' categories to avoid cross-category duplicates
        if (category.toLowerCase().indexOf("bulk oil") === -1) return;

        var prods = App.State.products[category];
        if (!Array.isArray(prods)) return;

        prods.forEach(function (prod) {
          if (typeof prod !== "string") return;
          var trimmedProd = prod.trim();
          if (targetOils.includes(trimmedProd) || targetOils.includes(prod)) {
            var key = App.Utils.getProductKey(category, prod);
            var valStr = App.State.inventory[key] || "";
            var amount = App.Utils.safeEvaluate(valStr);

            var matchedOil = targetOils.includes(trimmedProd)
              ? trimmedProd
              : prod;
            aggregatedData[matchedOil] += amount;
          }
        });
      });
    }

    var filteredOils = targetOils.filter(function (oil) {
      return aggregatedData[oil] > 0;
    });

    // Update Last Updated Subtitle
    var subtitle = document.getElementById("chart-last-updated");
    if (subtitle && App.State.lastInventoryUpdate) {
      var d = new Date(App.State.lastInventoryUpdate);
      var timeStr =
        d.toLocaleDateString() +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      subtitle.innerText = "Last Inventory Update: " + timeStr;
    } else if (subtitle) {
      subtitle.innerText = "Last Inventory Update: Never";
    }

    var labels = filteredOils;
    var data = filteredOils.map(function (oil) {
      return aggregatedData[oil];
    });

    var ctx = canvas.getContext("2d");

    if (App.State.chartInstance) {
      App.State.chartInstance.destroy();
    }

    var isDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    var gridColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";
    var fontColor = isDark ? "#EEE" : "#333";

    // Dynamic Color Logic based on thresholds
    var bgColors = data.map(function (val) {
      if (val < 100) return "rgba(255, 69, 58, 0.85)"; // Danger Red
      if (val >= 100 && val < 500) return "rgba(255, 214, 10, 0.85)"; // Warning Yellow
      if (val >= 1000) return "rgba(48, 209, 88, 0.85)"; // Healthy Green
      return "rgba(10, 132, 255, 0.85)"; // Default Blue (500-1000)
    });

    var borderColors = data.map(function (val) {
      if (val < 100) return "#FF453A";
      if (val >= 100 && val < 500) return "#FFD60A";
      if (val >= 1000) return "#30D158";
      return "#0A84FF";
    });

    App.State.chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Stock Level (Liters)",
            data: data,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 6,
            hoverBackgroundColor: borderColors, // v3.0.33 Use solid border color on hover instead of white
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1200,
          easing: "easeOutElastic",
          delay: function (context) {
            // v3.0.33 Prevent delay on hover update to stop elastic flickering
            var delay = 0;
            if (
              context.type === "data" &&
              context.mode === "default" &&
              !context.active
            ) {
              delay = context.dataIndex * 100;
            }
            return delay;
          },
        },
        layout: {
          padding: {
            top: 30,
          },
        },
        plugins: {
          legend: { labels: { color: fontColor } },
          datalabels: {
            color: function (context) {
              return isDark ? "#FFF" : "#000";
            },
            anchor: "end",
            align: "top",
            font: { weight: "bold", size: 14, family: "Outfit" },
            formatter: Math.round,
            offset: 4,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grace: "15%",
            grid: { color: gridColor },
            ticks: { color: fontColor },
          },
          x: {
            grid: { display: false },
            ticks: { color: fontColor, font: { weight: "bold" } },
          },
        },
      },
    });

    // Only reveal the container after completely successful chart init
    ctxContainer.classList.remove("hidden");

    // v3.0.26 Also render history on desktop
    renderRecentUpdates();
  } catch (chartErr) {
    console.error("Desktop Chart Initialization Failed:", chartErr);
    // Do not block app execution
  }
}

function renderRecentUpdates() {
  var list = document.getElementById("recent-history-list");
  if (!list) return;

  if (!App.State.history || App.State.history.length === 0) {
    list.innerHTML =
      '<div class="empty-state" style="padding: 10px; color: var(--text-muted); font-size: 0.75rem;">No recent activity</div>';
    return;
  }

  list.innerHTML = "";

  // v3.0.31 Force slice to 6 to handle legacy 10-item history in storage
  var displayHistory = App.State.history.slice(0, 6);
  displayHistory.forEach(function (rec) {
    var row = document.createElement("div");
    row.className = "history-item";

    var date = new Date(rec.timestamp);
    var timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    var dayStr = date.getMonth() + 1 + "/" + date.getDate();

    // v3.1.6 Single-line format: Category [Product] Value Time(Date)
    row.innerHTML =
      '<span class="history-cat">' +
      App.Utils.escapeHTML(rec.category) +
      "</span>" +
      '<span class="history-product">[' +
      App.Utils.escapeHTML(rec.product) +
      "]</span>" +
      '<span class="history-value">' +
      App.Utils.escapeHTML(String(rec.value)) +
      "</span>" +
      '<span class="history-time">' +
      timeStr +
      " (" +
      dayStr +
      ")</span>";
    list.appendChild(row);
  });
}

// Bind Settings Config Action
if (document.getElementById("save-common-oils-btn")) {
  document.getElementById("save-common-oils-btn").onclick = function () {
    var listContainer = document.getElementById("common-oils-checkbox-list");
    if (listContainer) {
      var activeItems = listContainer.querySelectorAll(".checkbox-item.active");
      var newList = Array.from(activeItems).map(function (el) {
        return el.innerText.trim();
      });
      App.State.commonOils = newList;
      saveToStorage(true);
      renderDesktopChart();
      App.UI.showToast("Dashboard Config Updated!", "success");
    }
  };
}

// Render dynamic common oils checkboxes
function renderCommonOilsCheckboxes() {
  var container = document.getElementById("common-oils-checkbox-list");
  if (!container) return;
  container.innerHTML = "";

  // Collect unique product names ONLY from the 'Bulk Oil' category
  var allProducts = new Set();
  if (App.State.products) {
    Object.keys(App.State.products).forEach(function (cat) {
      if (cat.toLowerCase().indexOf("bulk oil") !== -1) {
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
    var el = document.createElement("div");
    el.className =
      "checkbox-item" + (App.State.commonOils.includes(p) ? " active" : "");
    el.innerText = p;
    el.onclick = function () {
      el.classList.toggle("active");
    };
    container.appendChild(el);
  });
}

// --- PWA & Service Worker ---

let deferredPrompt;
const installBtn = document.getElementById("pwa-install-btn");
const iosHint = document.getElementById("ios-install-hint");
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = "block";
});

if (isIOS && iosHint) iosHint.style.display = "block";

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") installBtn.style.display = "none";
    deferredPrompt = null;
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js?v=" + App.Config.VERSION)
      .then((reg) => {
        console.log("SW Registered", reg);
        // v3.1.28 Force update: check for new SW immediately
        reg.update();
      })
      .catch((err) => console.error("SW Registration Failed", err));
  });
}

// Start App
window.addEventListener("load", function () {
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
    App.UI.showToast("Purged " + count + " item(s)", "success");
  } else {
    App.UI.showToast("No zero-stock items found", "info");
  }
}

// --- v3.1.0 Inventory Snapshot Feature ---

// Save snapshot to Supabase (called from mobile)
function saveSnapshot(note) {
  if (!App.Services.supabase) {
    return App.UI.showToast("Cloud sync not available", "error");
  }
  if (!App.State.syncId) {
    return App.UI.showToast("Please connect a Sync ID first", "error");
  }

  // Build snapshot data: computed value for each product in each category
  var snapshotData = {};
  var totalItems = 0;
  (App.State.categoryOrder || []).forEach(function (cat) {
    var prods = App.State.products[cat] || [];
    var catData = {};
    prods.forEach(function (name) {
      var key = App.Utils.getProductKey(cat, name);
      var expr = App.State.inventory[key] || "";
      var val = App.Utils.safeEvaluate(expr);
      catData[name] = val;
      totalItems++;
    });
    snapshotData[cat] = catData;
  });

  App.UI.showToast("Saving snapshot...", "info");

  App.Services.supabase
    .from("inventory_snapshots")
    .insert({
      sync_id: App.State.syncId,
      snapshot_data: snapshotData,
      note: note || "",
    })
    .then(function (res) {
      if (res.error) {
        console.error("Snapshot save error:", res.error);
        App.UI.showToast("Failed to save snapshot", "error");
      } else {
        App.UI.showToast(
          "Snapshot saved! (" + totalItems + " items)",
          "success",
        );
        // Clear note input
        var noteInput = document.getElementById("snapshot-note-input");
        if (noteInput) noteInput.value = "";
      }
    })
    .catch(function (err) {
      console.error("Snapshot save exception:", err);
      App.UI.showToast("Snapshot save failed", "error");
    });
}

// --- v3.1.39 Robust Cloud-Aware Message Broadcast
window.sendLiveMessage = function () {
  var input = document.getElementById("live-msg-input");
  if (!input || !input.value.trim()) return;
  var msg = input.value.trim();

  // First, force a pull from cloud to get the most recent list from other devices
  App.UI.showToast("Broadcasting...", "info");
  
  // v3.1.39 Note: pullFromCloud returns a promise-like behavior in Supabase, 
  // but here we just wait for a small delay or just perform the append.
  // To be ultra-safe, we define the push as an append to the current state
  // and hope the 10s heartbeat synced it. 
  // Better: we perform a fresh fetch-append-push cycle.
  if (App.Services.supabase && App.State.syncId) {
    App.Services.supabase
      .from("app_sync")
      .select("data")
      .eq("sync_id", App.State.syncId)
      .single()
      .then(function (res) {
        var cloudMsgs = [];
        if (res.data && res.data.data && res.data.data.live_messages) {
          cloudMsgs = res.data.data.live_messages;
        }

        var newObj = {
          text: msg,
          ts: Date.now(),
        };

        // Merge with cloud messages and keep unique by text+ts (approx)
        var combined = cloudMsgs.concat(App.State.liveMessages || []);
        combined.push(newObj);
        
        // Dedup and sort
        combined = combined.filter(function(m, index, self) {
          return self.findIndex(function(t){ return t.ts === m.ts && t.text === m.text; }) === index;
        });
        combined.sort(function(a,b) { return a.ts - b.ts; });

        // Slice to latest 20
        if (combined.length > 20) combined = combined.slice(-20);

        App.State.liveMessages = combined;
        input.value = "";
        saveToStorageImmediate(true);
        pushToCloud();
        App.UI.showToast("Broadcast Success!", "success");
        renderLiveTicker();
      });
  } else {
    // No sync, just local
    var newObj = { text: msg, ts: Date.now() };
    if (!App.State.liveMessages) App.State.liveMessages = [];
    App.State.liveMessages.push(newObj);
    if (App.State.liveMessages.length > 20) App.State.liveMessages.shift();
    input.value = "";
    saveToStorageImmediate();
    App.UI.showToast("Message Saved Locally", "info");
    renderLiveTicker();
  }
};

window.renderLiveTicker = function () {
  if (!App.UI.isDesktop()) return;

  var container = document.getElementById("live-ticker-container");
  var textEl = document.getElementById("live-ticker-text");
  if (!container || !textEl) return;

  var totalMessages = App.State.liveMessages || [];
  
  // v3.1.38 Filter and show ALL messages from the last 24 hours
  var activeMessages = totalMessages.filter(function (m) {
    return Date.now() - m.ts <= 24 * 60 * 60 * 1000;
  });

  if (activeMessages.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");

  // v3.1.40 Multi-message Scrolling String
  // We repeat the whole sequence twice to ensure the scrolling is continuous and doesn't leave gaps
  var scrollItems = activeMessages.map(function (m) {
    var timeStr = new Date(m.ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return "[" + timeStr + "] " + m.text + " •";
  });

  var displayStr = scrollItems.join("                                                  ");
  // If only one or two messages, repeat them to fill space nicely
  if (scrollItems.length < 3) {
     displayStr = displayStr + "                                                  " + displayStr + "                                                  " + displayStr;
  }

  // Only restyle/re-animate if text actually changed
  if (textEl.innerText !== displayStr) {
    textEl.innerText = displayStr;
    textEl.style.animation = "none";
    void textEl.offsetWidth; // Trigger reflow to restart animation
    // v3.1.39 Adjust scroll speed based on content length
    var duration = Math.max(12, displayStr.length * 0.15); 
    textEl.style.animation = "tickerScroll " + duration + "s linear infinite";
  }

  // v3.1.39 Click ticker to show vertical history modal
  container.onclick = function() { window.showLiveHistory(); };
};

window.showLiveHistory = function() {
  var msgs = App.State.liveMessages || [];
  if (msgs.length === 0) return;
  
  // v3.1.41 Improved vertical listing
  var html = "<div style='text-align: left; max-height: 400px; overflow-y: auto; background:#f9f9f9; padding: 10px; border-radius: 8px;'>";
  html += "<h2 style='margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 5px;'>Live History (24h)</h2>";
  
  msgs.slice().sort(function(a,b){ return b.ts - a.ts; }).forEach(function(m) {
    if (Date.now() - m.ts > 24 * 60 * 60 * 1000) return; 
    
    var d = new Date(m.ts);
    var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += "<div style='padding: 12px 15px; margin-bottom: 10px; border-radius: 12px; border: 1px solid #eee; background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.05);'>";
    html += "<div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;'>";
    html += "<span style='font-size: 0.85rem; color: #666; font-weight: 500; font-family: monospace;'>" + time + "</span>";
    html += "</div>";
    html += "<div style='color: #222; font-size: 1.1rem;'>" + App.Utils.escapeHTML(m.text) + "</div>";
    html += "</div>";
  });
  html += "</div>";
  
  App.UI.confirm(html, null, null, {
    confirmText: "Close history",
    hideCancel: true
  });
};

// Load snapshot list from Supabase (called on desktop)
function loadSnapshots() {
  if (!App.Services.supabase || !App.State.syncId) return;

  App.Services.supabase
    .from("inventory_snapshots")
    .select("id, snapshot_data, note, created_at")
    .eq("sync_id", App.State.syncId)
    .order("created_at", { ascending: false })
    .limit(10)
    .then(function (res) {
      if (res.data && res.data.length > 0) {
        renderSnapshots(res.data);
      } else {
        renderSnapshots([]);
      }
    })
    .catch(function (err) {
      console.error("Load snapshots error:", err);
    });
}

// Render snapshot list (desktop display)
function renderSnapshots(snapshots) {
  var container = document.getElementById("snapshot-list");
  if (!container) return;

  if (!snapshots || snapshots.length === 0) {
    container.innerHTML =
      '<div class="snapshot-empty">No snapshots yet. Save one from your phone!</div>';
    return;
  }

  container.innerHTML = "";
  snapshots.forEach(function (snap) {
    var d = new Date(snap.created_at);
    var dateStr = d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    var data = snap.snapshot_data || {};
    var noteHTML = snap.note
      ? '<span class="snapshot-note">' +
        App.Utils.escapeHTML(snap.note) +
        "</span>"
      : "";

    var card = document.createElement("div");
    card.className = "snapshot-card";
    card.innerHTML =
      '<div class="snapshot-card-header" style="display: flex; justify-content: space-between; align-items: center;">' +
      '<div style="display: flex; align-items: center;">' +
      '<button class="edit-snapshot-btn" title="Edit Note" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #007aff; padding: 4px; margin-right: 8px;">✏️</button>' +
      '<span class="snapshot-time">' +
      dateStr +
      "</span>" +
      noteHTML +
      '</div>' +
      '<div>' +
      '<button class="delete-snapshot-btn" title="Delete Record" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #ff3b30; padding: 4px; margin-left: 10px;">🗑️</button>' +
      '</div>' +
      "</div>";

    // Bind delete button event
    var deleteBtn = card.querySelector(".delete-snapshot-btn");
    if (deleteBtn) {
      deleteBtn.onclick = function (e) {
        e.stopPropagation(); // Prevent expanding details
        if (confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
          window.deleteSnapshot(snap.id);
        }
      };
    }

    // Bind edit button event
    var editBtn = card.querySelector(".edit-snapshot-btn");
    if (editBtn) {
      editBtn.onclick = function (e) {
        e.stopPropagation(); // Prevent expanding details
        var currentNote = snap.note || "";
        var newNote = prompt("Enter a new note:", currentNote);
        if (newNote !== null && newNote !== currentNote) {
          window.editSnapshotNote(snap.id, newNote.trim());
        }
      };
    }

    // Click to expand details
    card.onclick = function () {
      var detail = card.querySelector(".snapshot-detail");
      if (detail) {
        detail.classList.toggle("hidden");
        return;
      }
      // First click: generate detailed list
      var detailDiv = document.createElement("div");
      detailDiv.className = "snapshot-detail";
      var detailHTML = "";
      // Iterate categories in desktop order
      var orderedCats = (App.State.categoryOrder || []).concat(
        Object.keys(data).filter(function (c) {
          return (App.State.categoryOrder || []).indexOf(c) === -1;
        }),
      );
      orderedCats.forEach(function (cat) {
        if (!data[cat]) return;
        var items = data[cat] || {};
        var itemKeys = Object.keys(items).filter(function (k) {
          return items[k] > 0;
        });
        if (itemKeys.length === 0) return;
        detailHTML +=
          '<div class="snapshot-cat-label">' +
          App.Utils.escapeHTML(cat) +
          "</div>";
        detailHTML += '<div class="snapshot-items-grid">';
        itemKeys.forEach(function (p) {
          detailHTML +=
            '<span class="snapshot-item">' +
            App.Utils.escapeHTML(p) +
            ": <b>" +
            items[p] +
            "</b></span>";
        });
        detailHTML += "</div>";
      });
      detailDiv.innerHTML = detailHTML;
      card.appendChild(detailDiv);
    };

    container.appendChild(card);
  });
}

// Delete snapshot record
window.deleteSnapshot = async function (id) {
  if (!App.Services.supabase || !App.State.syncId) return;
  try {
    const { error } = await App.Services.supabase
      .from("inventory_snapshots")
      .delete()
      .eq("id", id)
      .eq("sync_id", App.State.syncId); // Access Control: only allow deletion of own snapshots
    if (error) throw error;
    App.UI.showToast("Record deleted successfully", "success");
    loadSnapshots(); // Reload list
  } catch (err) {
    console.error("Error deleting snapshot:", err);
    App.UI.showToast("Failed to delete record", "error");
  }
};

// Edit snapshot note
window.editSnapshotNote = async function (id, newNote) {
  if (!App.Services.supabase || !App.State.syncId) return;
  try {
    const { error } = await App.Services.supabase
      .from("inventory_snapshots")
      .update({ note: newNote })
      .eq("id", id)
      .eq("sync_id", App.State.syncId); // Access Control: only allow editing of own snapshots
    if (error) throw error;
    App.UI.showToast("Note updated successfully", "success");
    loadSnapshots(); // Reload list
  } catch (err) {
    console.error("Error editing snapshot note:", err);
    App.UI.showToast("Failed to update note", "error");
  }
};

// --- v3.1.1 Snapshot Comparison Feature ---

// Tab switching
window.switchSnapshotTab = function (tab) {
  // Update button styles
  var buttons = document.querySelectorAll(".snapshot-tab");
  buttons.forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });

  var listEl = document.getElementById("snapshot-list");
  var compareEl = document.getElementById("snapshot-compare-view");
  if (!listEl || !compareEl) return;

  if (tab === "list") {
    listEl.classList.remove("hidden");
    compareEl.classList.add("hidden");
  } else {
    listEl.classList.add("hidden");
    compareEl.classList.remove("hidden");
    loadComparison(tab);
  }
};

// Get comparison time boundaries
// Rule: Weekly data taken on next Tuesday, monthly data on the 2nd of next month
function getComparisonBoundaries(type) {
  var now = new Date();

  if (type === "week") {
    // Find this Tuesday 00:00 (current or most recent past Tuesday)
    var dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, 2=Tue...
    var thisTue = new Date(now);
    thisTue.setHours(0, 0, 0, 0);
    // Calculate days since the most recent past Tuesday
    var daysSinceTue = dayOfWeek < 2 ? dayOfWeek + 5 : dayOfWeek - 2;
    thisTue.setDate(thisTue.getDate() - daysSinceTue);

    var lastTue = new Date(thisTue);
    lastTue.setDate(lastTue.getDate() - 7);

    var prevTue = new Date(lastTue);
    prevTue.setDate(prevTue.getDate() - 7);

    return {
      // "This week" data = first snapshot after this Tuesday
      currentStart: thisTue.toISOString(),
      // "Last week" data = first snapshot after last Tuesday
      previousStart: lastTue.toISOString(),
      // Used to limit query scope
      previousEnd: thisTue.toISOString(),
      prevPrevStart: prevTue.toISOString(),
    };
  } else {
    // Monthly comparison: 2nd of this month 00:00, 2nd of last month 00:00
    var thisMonth2 = new Date(now.getFullYear(), now.getMonth(), 2, 0, 0, 0, 0);
    var lastMonth2 = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      2,
      0,
      0,
      0,
      0,
    );
    var prevMonth2 = new Date(
      now.getFullYear(),
      now.getMonth() - 2,
      2,
      0,
      0,
      0,
      0,
    );

    return {
      currentStart: thisMonth2.toISOString(),
      previousStart: lastMonth2.toISOString(),
      previousEnd: thisMonth2.toISOString(),
      prevPrevStart: prevMonth2.toISOString(),
    };
  }
}

// Load comparison data
function loadComparison(type) {
  if (!App.Services.supabase || !App.State.syncId) {
    renderComparisonError("Please connect Cloud Sync first.");
    return;
  }

  var bounds = getComparisonBoundaries(type);
  var label = type === "week" ? "Weekly" : "Monthly";

  var compareEl = document.getElementById("snapshot-compare-view");
  if (compareEl)
    compareEl.innerHTML =
      '<div class="snapshot-empty">Loading ' + label + " data...</div>";

  // Query "new data": first record after currentStart
  var queryNew = App.Services.supabase
    .from("inventory_snapshots")
    .select("snapshot_data, note, created_at")
    .eq("sync_id", App.State.syncId)
    .gte("created_at", bounds.currentStart)
    .order("created_at", { ascending: true })
    .limit(1);

  // Query "old data": first record between previousStart and previousEnd
  var queryOld = App.Services.supabase
    .from("inventory_snapshots")
    .select("snapshot_data, note, created_at")
    .eq("sync_id", App.State.syncId)
    .gte("created_at", bounds.previousStart)
    .lt("created_at", bounds.previousEnd)
    .order("created_at", { ascending: true })
    .limit(1);

  Promise.all([queryNew, queryOld])
    .then(function (results) {
      var newSnap = (results[0].data && results[0].data[0]) || null;
      var oldSnap = (results[1].data && results[1].data[0]) || null;

      if (!newSnap && !oldSnap) {
        renderComparisonError(
          "No snapshots found for this " +
            label.toLowerCase() +
            " comparison. Save snapshots on Tuesday (weekly) or the 2nd (monthly).",
        );
        return;
      }
      if (!oldSnap) {
        renderComparisonError(
          "No previous " +
            label.toLowerCase() +
            " snapshot found for comparison. Need at least 2 period snapshots.",
        );
        return;
      }
      if (!newSnap) {
        renderComparisonError(
          "No current " +
            label.toLowerCase() +
            " snapshot yet. Save one after " +
            (type === "week" ? "Tuesday" : "the 2nd") +
            ".",
        );
        return;
      }

      renderComparison(oldSnap, newSnap, label);
    })
    .catch(function (err) {
      console.error("Comparison load error:", err);
      renderComparisonError("Failed to load comparison data.");
    });
}

function renderComparisonError(msg) {
  var el = document.getElementById("snapshot-compare-view");
  if (el) el.innerHTML = '<div class="snapshot-empty">' + msg + "</div>";
}

// Render comparison results
function renderComparison(oldSnap, newSnap, label) {
  var el = document.getElementById("snapshot-compare-view");
  if (!el) return;

  var oldDate = new Date(oldSnap.created_at);
  var newDate = new Date(newSnap.created_at);
  var fmt = function (d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  var oldData = oldSnap.snapshot_data || {};
  var newData = newSnap.snapshot_data || {};

  // Iterate categories in desktop order and collect data
  var allCatKeys = {};
  Object.keys(oldData).forEach(function (c) {
    allCatKeys[c] = true;
  });
  Object.keys(newData).forEach(function (c) {
    allCatKeys[c] = true;
  });
  var orderedCats = (App.State.categoryOrder || [])
    .concat(
      Object.keys(allCatKeys).filter(function (c) {
        return (App.State.categoryOrder || []).indexOf(c) === -1;
      }),
    )
    .filter(function (c) {
      return allCatKeys[c];
    });

  var html =
    '<div class="compare-header">' +
    '<span class="compare-label">📊 ' +
    label +
    " Comparison</span>" +
    '<span class="compare-range">' +
    fmt(oldDate) +
    " → " +
    fmt(newDate) +
    "</span>" +
    "</div>";

  // Summary statistics
  var totalUp = 0,
    totalDown = 0,
    totalSame = 0;

  orderedCats.forEach(function (cat) {
    var oldItems = oldData[cat] || {};
    var newItems = newData[cat] || {};

    // Merge all product keys
    var allProducts = {};
    Object.keys(oldItems).forEach(function (p) {
      allProducts[p] = true;
    });
    Object.keys(newItems).forEach(function (p) {
      allProducts[p] = true;
    });

    var productKeys = Object.keys(allProducts);
    if (productKeys.length === 0) return;

    // Only show products with changes or non-zero values
    var rows = [];
    productKeys.forEach(function (p) {
      var oldVal = oldItems[p] || 0;
      var newVal = newItems[p] || 0;
      var diff = newVal - oldVal;

      if (oldVal === 0 && newVal === 0) return; // Skip double zeros

      var cls = "",
        arrow = "",
        diffText = "";
      if (diff > 0) {
        cls = "compare-up";
        arrow = "▲";
        diffText = "+" + diff;
        totalUp++;
      } else if (diff < 0) {
        cls = "compare-down";
        arrow = "▼";
        diffText = "" + diff;
        totalDown++;
      } else {
        cls = "compare-same";
        arrow = "─";
        diffText = "0";
        totalSame++;
      }

      rows.push(
        '<div class="compare-row ' +
          cls +
          '">' +
          '<span class="compare-product">' +
          App.Utils.escapeHTML(p) +
          "</span>" +
          '<span class="compare-values">' +
          oldVal +
          " → " +
          newVal +
          "</span>" +
          '<span class="compare-diff">' +
          arrow +
          " " +
          diffText +
          "</span>" +
          "</div>",
      );
    });

    if (rows.length > 0) {
      html +=
        '<div class="compare-cat-label">' +
        App.Utils.escapeHTML(cat) +
        "</div>";
      html += rows.join("");
    }
  });

  // Bottom summary statistics
  html +=
    '<div class="compare-summary">' +
    '<span class="compare-up">▲ ' +
    totalUp +
    "</span>" +
    '<span class="compare-same">─ ' +
    totalSame +
    "</span>" +
    '<span class="compare-down">▼ ' +
    totalDown +
    "</span>" +
    "</div>";

  el.innerHTML = html;
}

// --- v3.1 Admin Mode Desktop-to-Mobile Override ---
(function initAdminTrigger() {
  var clickCount = 0;
  var clickTimer = null;
  var trigger = document.getElementById('hidden-admin-trigger');
  if (trigger) {
    trigger.addEventListener('click', function() {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(function() { clickCount = 0; }, 1500);

      if (clickCount >= 7) {
        clickCount = 0;
        if (!App.State.isAdmin) {
          if (prompt('Enter Admin PIN (v3):') === '9900') {
            App.State.isAdmin = true;
            document.body.classList.add('admin-edit-mode');
            App.UI.showToast('Admin Edit Mode Enabled', 'success');
            initializeCategory();
            renderTabs();
            renderInventory();
          }
        } else {
          App.State.isAdmin = false;
          document.body.classList.remove('admin-edit-mode');
          App.UI.showToast('Admin Mode Disabled', 'info');
          initializeCategory();
          renderTabs();
          renderInventory();
        }
      }
    });
  }
})();

