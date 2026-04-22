/**
 * App Configuration and Initial State
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Config = {
  VERSION: "v3.4.3",
  ADMIN_PASSWORD: "9898",
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
      "0W20S", "5W30S", "5W30B", "AW68", "AW16S", "0W20E", "0W30E", "50W",
      "75W90GL5", "30W", "ATF", "T0-4 10W", "5W40 DIESEL",
    ],
    "Case Oil": [
      "0W20B", "5W20B", "AW32", "AW46", "5W40E", "5W30E", "UTH",
      "80W90GL5", "10W", "15W40 CK4", "10W30 CK4", "70-4 30W",
    ],
    "Coolant": ["RED 50/50", "GREEN 50/50"],
    "Others": [
      "DEF", "Brake Blast", "MOLY 3% EP2", "CVT",
      "SAE 10W-30 Motor Oil", "OW16S(Quart)",
    ],
  },
};

App.State = {
  currentCategory: "",
  products: null,
  inventory: null,
  categoryOrder: null,
  commonOils: ["5W20S", "5W20B", "5W30S", "5W30B"],
  syncId: "",
  viewMode: "edit",
  sortDirection: "asc",
  lastUpdated: 0,
  lastInventoryUpdate: 0,
  history: [],
  liveMessages: [],
  chartInstance: null,
  mobileAdminUnlocked: false,
};

App.Services = {
  supabase: null,
};
