/**
 * App Cloud Synchronization Service (Supabase)
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Sync = {
  pendingPullAfterEdit: false,

  isInventoryInputActive: () =>
    document.activeElement?.matches(".item-input, .desktop-edit-input"),

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
          App.Sync.loadSnapshots();
        },
      )
      .subscribe((status) => {
          console.log(`Real-time Status: ${status}`);
      });
  },

  // --- Sync queue: pushes and pulls on this device run one at a time ---

  _chain: Promise.resolve(),
  _queued: {},

  _enqueue: (name, fn) => {
    const S = App.Sync;
    if (S._queued[name]) return S._queued[name]; // same task already waiting
    const task = S._chain.then(() => {
      delete S._queued[name];
      return fn();
    });
    S._queued[name] = task;
    S._chain = task.catch(() => {});
    return task;
  },

  // --- Base: the cloud state this device last synced with ---

  getBase: () => App.Utils.safeGetJSON(App.Config.STORAGE_KEYS.SYNC_BASE, null),

  getRemoteTs: () => localStorage.getItem(App.Config.STORAGE_KEYS.SYNC_REMOTE_TS) || "",

  setBase: (payload, remoteTs) => {
    const SK = App.Config.STORAGE_KEYS;
    localStorage.setItem(SK.SYNC_BASE, JSON.stringify(App.SyncMerge.normalize(payload)));
    localStorage.setItem(SK.SYNC_REMOTE_TS, remoteTs || "");
  },

  // Forget the base, e.g. after switching Sync ID or importing a backup
  resetBase: () => {
    const SK = App.Config.STORAGE_KEYS;
    localStorage.removeItem(SK.SYNC_BASE);
    localStorage.removeItem(SK.SYNC_REMOTE_TS);
  },

  localPayload: () =>
    App.SyncMerge.clone(
      App.SyncMerge.normalize({
        products: App.State.products,
        inventory: App.State.inventory,
        category_order: App.State.categoryOrder,
        recent_history: App.State.history,
        live_messages: App.State.liveMessages,
      }),
    ),

  // Replace local state with a merged payload and re-render
  applyPayload: (payload) => {
    const p = App.SyncMerge.clone(payload);
    const tickerChanged = !App.SyncMerge.same(p.live_messages, App.State.liveMessages);
    App.State.products = p.products;
    App.State.inventory = p.inventory;
    App.State.categoryOrder = p.category_order;
    App.State.history = p.recent_history;
    App.State.liveMessages = p.live_messages;

    if (typeof window.initializeCategory === "function") window.initializeCategory();
    if (typeof window.saveToStorageImmediate === "function") window.saveToStorageImmediate(true);
    App.UI.renderTabs();
    App.UI.renderInventory();
    App.UI.renderManageUI();
    App.UI.renderRecentUpdates();
    if (tickerChanged) App.UI.renderLiveTicker();
  },

  _fetchRow: async () =>
    App.Services.supabase
      .from("app_sync")
      .select("data, updated_at")
      .eq("sync_id", App.State.syncId)
      .maybeSingle(),

  // A timestamp strictly later than the previous one, used as the row's version
  _nextUpdatedAt: (prev) => {
    const prevMs = prev ? Date.parse(prev) : 0;
    return new Date(Math.max(Date.now(), prevMs + 1)).toISOString();
  },

  _isCloudEmpty: (cloud) =>
    Object.keys(cloud.products).length === 0 && Object.keys(cloud.inventory).length === 0,

  // Push local changes: read latest cloud, merge, then write only if nobody wrote in between
  push: () => App.Sync._enqueue("push", () => App.Sync._pushNow()),

  _pushNow: async () => {
    const S = App.Sync;
    const M = App.SyncMerge;
    const { supabase } = App.Services;
    const { syncId } = App.State;
    if (!supabase || !syncId) return { ok: false, reason: "sync_not_ready" };

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const snapshot = S.localPayload();
        const { data: row, error } = await S._fetchRow();
        if (error) throw error;

        const cloud = row?.data ? M.normalize(row.data) : null;
        // Never treat an empty cloud as "everything was deleted"
        const base = cloud && !S._isCloudEmpty(cloud) ? S.getBase() : null;
        const merged = cloud ? M.mergePayload(cloud, snapshot, base) : snapshot;
        const updatedAt = S._nextUpdatedAt(row?.updated_at);
        const body = {
          ...merged,
          // Kept for older app versions that still compare these timestamps
          last_updated_ts: Date.now(),
          last_inventory_update_ts: Math.max(
            row?.data?.last_inventory_update_ts || 0,
            App.State.lastInventoryUpdate || 0,
          ),
        };

        const table = supabase.from("app_sync");
        const res = row
          ? await table
              .update({ data: body, updated_at: updatedAt })
              .eq("sync_id", syncId)
              .eq("updated_at", row.updated_at)
              .select("updated_at")
          : await table.insert({ sync_id: syncId, data: body, updated_at: updatedAt }).select("updated_at");

        if (res.error) {
          if (!row && res.error.code === "23505") continue; // another device created the row first
          throw res.error;
        }
        if (!res.data || res.data.length === 0) continue; // another device wrote first: merge again

        S.setBase(merged, res.data[0].updated_at);
        // Keep edits made while this push was in flight, and pick up other devices' changes
        const current = S.localPayload();
        const rebased = M.mergePayload(merged, current, snapshot);
        if (!M.same(rebased, current)) S.applyPayload(rebased);

        App.UI.updateSyncStatus("Cloud Synced", true);
        return { ok: true };
      }
      App.UI.updateSyncStatus("Sync Busy", false);
      return { ok: false, reason: "conflict" };
    } catch (e) {
      console.error("Cloud push error:", e);
      App.UI.updateSyncStatus("Sync Offline", false);
      return { ok: false, error: e };
    }
  },

  pushWithRetry: async (attempts = 3, delayMs = 600) => {
    // Retry is intentionally linear-backoff to keep cloud pressure predictable
    // while still healing short mobile network drops.
    let lastResult = { ok: false, reason: "unknown" };
    for (let i = 0; i < attempts; i++) {
      lastResult = await App.Sync.push();
      if (lastResult?.ok) return lastResult;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
    return lastResult;
  },

  // Pull cloud state and merge it with any local changes not pushed yet
  pull: (isSilent = false, force = false) =>
    App.Sync._enqueue(`pull-${isSilent ? "s" : "v"}${force ? "f" : ""}`, () =>
      App.Sync._pullNow(isSilent, force),
    ),

  _pullNow: async (isSilent, force) => {
    const S = App.Sync;
    const M = App.SyncMerge;
    const { supabase } = App.Services;
    if (!supabase || !App.State.syncId) return;
    if (!isSilent) App.UI.updateSyncStatus("Checking...", false);

    try {
      const { data: row, error } = await S._fetchRow();
      if (error) {
        console.error("Cloud pull error:", error);
        App.UI.updateSyncStatus("Sync Error", false);
        return;
      }

      const local = S.localPayload();
      const localProductCount = Object.keys(local.products).length;

      if (!row?.data) {
        // No cloud data yet: upload what this device has
        if (localProductCount > 0) return S._pushNow();
        App.UI.updateSyncStatus("Synced", true);
        return;
      }

      const cloud = M.normalize(row.data);
      if (S._isCloudEmpty(cloud) && localProductCount > 0) {
        console.warn("[Sync Guard] Refusing to overwrite local data with empty cloud state.");
        if (!isSilent) App.UI.showToast("Cloud data empty. Local preserved.", "error");
        S.resetBase();
        return S._pushNow();
      }

      let base = S.getBase();
      if (!base) {
        // First sync on this device (or after switching Sync ID): fall back to
        // the old timestamp rule to decide whether cloud or local wins
        const cloudTS = row.data.last_updated_ts || Date.parse(row.updated_at) || 0;
        const cloudInvTS = row.data.last_inventory_update_ts || 0;
        const cloudWins =
          force ||
          cloudTS > (App.State.lastUpdated || 0) ||
          cloudInvTS > (App.State.lastInventoryUpdate || 0) ||
          Object.keys(local.inventory).length === 0;
        base = cloudWins ? local : cloud;
      }

      if (row.updated_at === S.getRemoteTs() && !M.hasLocalChanges(local, base)) {
        App.UI.updateSyncStatus("Synced", true);
        return; // nothing new on either side
      }

      // Input Focus Guard: avoid snapping values while user is typing.
      if (S.isInventoryInputActive()) {
        App.Sync.pendingPullAfterEdit = true;
        return;
      }

      const rebased = M.mergePayload(cloud, local, base);
      S.setBase(cloud, row.updated_at);
      App.State.lastUpdated = Math.max(App.State.lastUpdated || 0, row.data.last_updated_ts || 0);
      App.State.lastInventoryUpdate = Math.max(
        App.State.lastInventoryUpdate || 0,
        row.data.last_inventory_update_ts || 0,
      );

      if (!M.same(rebased, local)) {
        S.applyPayload(rebased);
        if (App.UI.isDesktop()) S.loadSnapshots();
        if (!isSilent) App.UI.showToast("Sync: Cloud state loaded", "success");
      }

      if (M.hasLocalChanges(rebased, cloud)) return S._pushNow();
      App.UI.updateSyncStatus("Synced", true);
    } catch (e) {
      console.error("Cloud pull exception:", e);
      App.UI.updateSyncStatus("Sync Failed", false);
    }
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
