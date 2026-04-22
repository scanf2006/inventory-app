/**
 * App Cloud Synchronization Service (Supabase)
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Sync = {
  // Initialize Supabase client and real-time subscriptions
  init: async () => {
    const lib = window.supabasejs || window.supabase;
    if (!lib) {
      console.error("Supabase library not found!");
      return;
    }

    const { SUPABASE_URL, SUPABASE_KEY } = App.Config;
    const createClient = lib.createClient || lib.supabase?.createClient;

    if (typeof createClient === "function") {
      App.Services.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("Supabase client initialized.");
      App.Sync.setupRealtime();
    }
  },

  // Set up real-time postgres changes subscriptions
  setupRealtime: () => {
    const { supabase } = App.Services;
    const { syncId } = App.State;
    if (!supabase || !syncId) return;

    // v3.5.5: Cleanup existing channels first to avoid ghost listeners
    if (App.Services.realtimeChannel) {
        supabase.removeChannel(App.Services.realtimeChannel);
    }

    console.log(`Setting up Supabase real-time for ID: ${syncId}`);

    App.Services.realtimeChannel = supabase
      .channel(`sync-channel-${syncId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_sync",
          filter: `sync_id=eq.${syncId}`,
        },
        () => {
          console.log("Cloud update detected via real-time!");
          App.Sync.pull(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_snapshots",
          filter: `sync_id=eq.${syncId}`,
        },
        () => {
          console.log("Real-time update received for inventory_snapshots!");
          // Trigger global snapshot refresh
          if (typeof window.loadSnapshots === "function")
            window.loadSnapshots();
        },
      )
      .subscribe((status) => {
          console.log(`Real-time Status: ${status}`);
      });
  },

  // Push local state to cloud
  push: async () => {
    const { supabase } = App.Services;
    const {
      syncId,
      products,
      inventory,
      categoryOrder,
      lastUpdated,
      lastInventoryUpdate,
      history,
      liveMessages,
    } = App.State;

    if (!supabase || !syncId) return;

    try {
      const { error } = await supabase.from("app_sync").upsert(
        {
          sync_id: syncId,
          data: {
            products,
            inventory,
            category_order: categoryOrder,
            last_updated_ts: lastUpdated,
            last_inventory_update_ts: lastInventoryUpdate,
            recent_history: history,
            live_messages: liveMessages, // Store here safely
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sync_id" },
      );

      if (error) {
        App.UI.updateSyncStatus("Sync Offline", false);
        console.error("Cloud push error:", error);
      } else {
        App.UI.updateSyncStatus("Cloud Synced", true);
      }
    } catch (e) {
      console.error("Cloud push exception:", e);
    }
  },

  // Pull remote state from cloud
  pull: async (isSilent = false) => {
    const { supabase } = App.Services;
    const { syncId, lastUpdated } = App.State;

    if (!supabase || !syncId) return;
    if (!isSilent) App.UI.updateSyncStatus("Checking...", false);

    try {
      const { data, error } = await supabase
        .from("app_sync")
        .select("data, updated_at")
        .eq("sync_id", syncId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Cloud pull error:", error);
        App.UI.updateSyncStatus("Sync Error", false);
        return;
      }

      if (data?.data) {
        const cloudData = data.data;
        const cloudMessages = cloudData.live_messages || [];

        // v3.5.6: Always apply live messages regardless of conflict detection
        if (Array.isArray(cloudMessages)) {
          App.State.liveMessages = cloudMessages;
          App.UI.renderLiveTicker();
          localStorage.setItem(App.Config.STORAGE_KEYS.LIVE_MESSAGES, JSON.stringify(App.State.liveMessages));
        }

        const cloudTS = cloudData.last_updated_ts || new Date(data.updated_at).getTime();

        if (cloudTS >= lastUpdated) {
          App.Sync.handleConflict(cloudData, cloudTS, isSilent);
        } else if (cloudTS < lastUpdated) {
          App.Sync.push();
        } else {
          App.UI.updateSyncStatus("Synced", true);
        }
      } else {
          // No cloud data yet
          App.UI.updateSyncStatus("Synced", true);
      }
    } catch (e) {
      console.error("Cloud pull exception:", e);
      App.UI.updateSyncStatus("Sync Failed", false);
    }
  },

  // Helper to handle data merging and conflicts
  handleConflict: (cloudData, cloudTS, isSilent) => {
    const cloudProductCount = Object.keys(cloudData.products || {}).length;
    const cloudInventoryCount = Object.keys(cloudData.inventory || {}).length;
    const localProductCount = Object.keys(App.State.products || {}).length;
    const localInventoryCount = Object.keys(App.State.inventory || {}).length;

    if (
      localProductCount > 0 &&
      cloudProductCount === 0 &&
      cloudInventoryCount === 0
    ) {
      console.warn(
        "[Sync Guard] Refusing to overwrite local data with empty cloud state.",
      );
      if (!isSilent)
        App.UI.showToast("Cloud data empty. Local preserved.", "error");
      App.Sync.push();
      return;
    }

    if (
      localInventoryCount > 5 &&
      cloudInventoryCount < localInventoryCount * 0.2
    ) {
      if (!isSilent) {
        App.UI.confirm(
          `Cloud data has significantly fewer items (${cloudInventoryCount} vs local ${localInventoryCount}). Overwrite?`,
          () => App.Sync.applyCloudData(cloudData, cloudTS, isSilent),
          () => {
            App.Sync.push();
            App.UI.showToast("Local data pushed to override cloud", "info");
          },
        );
        return;
      }
      return;
    }

    // Input Focus Guard
    const active = document.activeElement;
    if (
      active?.tagName === "INPUT" &&
      active.classList.contains("item-input")
    ) {
      return;
    }

    App.Sync.applyCloudData(cloudData, cloudTS, isSilent);
  },

  // Apply cloud data to local state
  applyCloudData: (cloudData, cloudTS, isSilent) => {
    App.State.products = cloudData.products || App.State.products;
    App.State.inventory = cloudData.inventory || App.State.inventory;
    App.State.categoryOrder =
      cloudData.category_order || App.State.categoryOrder;
    App.State.lastUpdated = cloudTS;
    App.State.lastInventoryUpdate =
      cloudData.last_inventory_update_ts || App.State.lastInventoryUpdate;
    App.State.history = cloudData.recent_history || App.State.history;
    // Live Messages are high-priority and bypass strict timestamp checks
    if (cloudData.live_messages && Array.isArray(cloudData.live_messages)) {
      App.State.liveMessages = cloudData.live_messages;
    }

    // These trigger global re-renders in main.js
    if (typeof window.saveToStorageImmediate === "function")
      window.saveToStorageImmediate(true);
    if (typeof window.initializeCategory === "function")
      window.initializeCategory();
    App.UI.renderTabs();
    App.UI.renderInventory();
    App.UI.renderManageUI();
    App.UI.renderRecentUpdates();
    App.UI.renderLiveTicker();
    if (App.UI.isDesktop()) App.Sync.loadSnapshots();

    if (!isSilent) App.UI.showToast("Sync: Cloud state loaded", "success");
    App.UI.updateSyncStatus("Synced", true);
  },

  // --- Snapshot Features ---

  saveSnapshot: async (note) => {
    const { supabase } = App.Services;
    const { syncId, categoryOrder, products, inventory } = App.State;

    if (!supabase) return App.UI.showToast("Cloud sync not available", "error");
    if (!syncId) return App.UI.showToast("Connect a Sync ID first", "error");

    const snapshotData = {};
    let totalItems = 0;

    (categoryOrder || []).forEach((cat) => {
      const catData = {};
      const prods = products[cat] || [];
      prods.forEach((name) => {
        const key = App.Utils.getProductKey(cat, name);
        const val = App.Utils.safeEvaluate(inventory[key] || "");
        catData[name] = val;
        totalItems++;
      });
      snapshotData[cat] = catData;
    });

    App.UI.showToast("Saving snapshot...", "info");

    try {
      const { error } = await supabase.from("inventory_snapshots").insert({
        sync_id: syncId,
        snapshot_data: snapshotData,
        note: note || "",
      });

      if (error) throw error;

      App.UI.showToast(`Snapshot saved! (${totalItems} items)`, "success");
      const noteInput = document.getElementById("snapshot-note-input");
      if (noteInput) noteInput.value = "";
    } catch (e) {
      console.error("Snapshot save error:", e);
      App.UI.showToast("Failed to save snapshot", "error");
    }
  },

  loadSnapshots: async () => {
    const { supabase } = App.Services;
    const { syncId } = App.State;
    if (!supabase || !syncId) return;

    try {
      const { data, error } = await supabase
        .from("inventory_snapshots")
        .select("id, snapshot_data, note, created_at")
        .eq("sync_id", syncId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      App.UI.renderSnapshots(data || []);
    } catch (e) {
      console.error("Load snapshots error:", e);
    }
  },
};
