/**
 * Minimal Supabase REST helpers for the report scripts. Uses the same URL and
 * public (anon) key the web app ships with.
 */
const fs = require("fs");
const path = require("path");

const appConfig = fs.readFileSync(path.join(__dirname, "..", "..", "src", "app-config.js"), "utf8");
const SUPABASE_URL = appConfig.match(/SUPABASE_URL:\s*"([^"]+)"/)[1];
const SUPABASE_KEY = appConfig.match(/SUPABASE_KEY:\s*"([^"]+)"/)[1];

const request = async (pathAndQuery, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
};

// Rows of the app_sync table, keyed by sync_id
const readRow = async (syncId) => {
  const rows = await request(`app_sync?sync_id=eq.${encodeURIComponent(syncId)}&select=data,updated_at`);
  return rows[0] || null;
};

const writeRow = (syncId, data) =>
  request("app_sync?on_conflict=sync_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ sync_id: syncId, data, updated_at: new Date().toISOString() }),
  });

module.exports = { readRow, writeRow };
