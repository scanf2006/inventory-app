/**
 * Pure helpers for the daily Bulk Oil email: totals, comparison, low-stock
 * flags, send-time check and the email body. No network access here.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { holidayOn } = require("./holidays");

// Reuse the app's own expression parser so totals match what the app shows
const loadSafeEvaluate = () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "src", "app-utils.js"), "utf8"), ctx);
  return ctx.App.Utils.safeEvaluate;
};
const safeEvaluate = loadSafeEvaluate();

// Same key format as the app (App.Utils.getProductKey)
const productKey = (category, product) => `${category}-${product}`;

// Local date/time parts in the configured time zone
const localParts = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
};

// Should the scheduled run send now? Weekdays, inside the window, once per day.
const shouldSend = (now, config, lastSentDate) => {
  const local = localParts(now, config.timeZone);
  if (["Sat", "Sun"].includes(local.weekday)) return { send: false, reason: `weekend (${local.weekday})`, local };
  const holiday = holidayOn(local.date, config.skipHolidays || [], config.skipDates || []);
  if (holiday) return { send: false, reason: `holiday (${holiday})`, local };
  if (local.time < config.sendWindow.start || local.time >= config.sendWindow.end) {
    return { send: false, reason: `outside send window (${local.time})`, local };
  }
  if (lastSentDate === local.date) return { send: false, reason: `already sent for ${local.date}`, local };
  return { send: true, reason: "ok", local };
};

const thresholdFor = (product, config) => {
  const t = config.lowStock?.products?.[product];
  return typeof t === "number" ? t : config.lowStock?.default ?? null;
};

// Current totals for the category, in the app's product order
const currentTotals = (data, category) => {
  const products = data?.products?.[category] || [];
  const inventory = data?.inventory || {};
  return products.map((name) => ({ name, value: safeEvaluate(inventory[productKey(category, name)] || "") }));
};

// Most recent stored report from an earlier date
const previousReport = (state, today) => {
  const dates = Object.keys(state?.reports || {})
    .filter((d) => d < today)
    .sort();
  const date = dates[dates.length - 1];
  return date ? { date, totals: state.reports[date].totals || {} } : null;
};

const buildRows = (data, config, prev) =>
  currentTotals(data, config.category).map(({ name, value }) => {
    const prevValue = prev && name in prev.totals ? prev.totals[name] : null;
    const min = thresholdFor(name, config);
    return {
      name,
      value,
      prevValue,
      change: prevValue === null ? null : Math.round((value - prevValue) * 100) / 100,
      min,
      low: min !== null && value < min,
    };
  });

// Did any quantity change since the previous report? Missing counts as zero,
// so adding or removing an empty product is not a change.
const hasChanged = (rows, prev) => {
  if (!prev) return true;
  const today = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  const names = new Set([...Object.keys(today), ...Object.keys(prev.totals)]);
  return [...names].some((n) => (today[n] || 0) !== (prev.totals[n] || 0));
};

// Keep stored history small
const updateState = (state, today, rows, sourceUpdatedAt, keepDays = 60) => {
  const reports = { ...(state?.reports || {}) };
  reports[today] = { totals: Object.fromEntries(rows.map((r) => [r.name, r.value])), sourceUpdatedAt };
  const kept = Object.keys(reports).sort().slice(-keepDays);
  return { lastSentDate: today, reports: Object.fromEntries(kept.map((d) => [d, reports[d]])) };
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const fmtChange = (n) => (n === null ? "—" : n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");

const formatDateTime = (ms, timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));

const buildEmail = ({ rows, config, today, prev, lastUpdatedMs, now }) => {
  const { unit, category, timeZone } = config;
  // Leave out products sitting at zero, but keep ones that dropped to zero since the last report
  const hiddenCount = rows.filter((r) => r.value === 0 && !r.prevValue).length;
  rows = rows.filter((r) => !(r.value === 0 && !r.prevValue));
  const hiddenNote = hiddenCount
    ? `${hiddenCount} product${hiddenCount === 1 ? "" : "s"} at zero not shown.`
    : "";
  const low = rows.filter((r) => r.low);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const prevTotal = prev ? rows.reduce((s, r) => s + (r.prevValue ?? 0), 0) : null;
  const updatedLocal = lastUpdatedMs ? localParts(new Date(lastUpdatedMs), timeZone).date : null;
  const daysOld = updatedLocal ? Math.round((Date.parse(today) - Date.parse(updatedLocal)) / 86400000) : null;
  const staleNote =
    daysOld === null
      ? "No count has been recorded yet."
      : daysOld > 0
        ? `No count was recorded today — figures are from ${daysOld} day${daysOld === 1 ? "" : "s"} ago.`
        : "";

  const subject = `${category} Inventory — ${formatDateTime(now.getTime(), timeZone).replace(/,? \d+:\d+.*$/, "")}${
    low.length ? ` — ${low.length} low` : ""
  }`;

  const cell = "padding:6px 10px;border-bottom:1px solid #e5e5e5;";
  const num = `${cell}text-align:right;font-variant-numeric:tabular-nums;`;
  const changeColor = (c) => (c === null || c === 0 ? "#666" : c > 0 ? "#1a7f37" : "#c62828");

  const tableRows = rows
    .map(
      (r) => `<tr style="${r.low ? "background:#fdecea;" : ""}">
      <td style="${cell}">${escapeHtml(r.name)}${r.low ? ' <span style="color:#c62828;font-weight:600;">LOW</span>' : ""}</td>
      <td style="${num}font-weight:600;">${fmt(r.value)}</td>
      <td style="${num}color:#666;">${fmt(r.prevValue)}</td>
      <td style="${num}color:${changeColor(r.change)};">${fmtChange(r.change)}</td>
      <td style="${num}color:#666;">${fmt(r.min)}</td>
    </tr>`,
    )
    .join("");

  const lowBlock = low.length
    ? `<div style="margin:12px 0;padding:10px 12px;background:#fdecea;border-left:4px solid #c62828;">
        <strong>Low stock (${low.length}):</strong> ${low
          .map((r) => `${escapeHtml(r.name)} ${fmt(r.value)} ${unit} (min ${fmt(r.min)})`)
          .join(", ")}
      </div>`
    : "";

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;max-width:720px;">
  <h2 style="margin:0 0 4px;">${escapeHtml(category)} Inventory (${unit})</h2>
  <div style="color:#666;">Report for ${escapeHtml(formatDateTime(now.getTime(), timeZone))}</div>
  <div style="color:#666;">Inventory last updated: ${
    lastUpdatedMs ? escapeHtml(formatDateTime(lastUpdatedMs, timeZone)) : "unknown"
  }</div>
  ${staleNote ? `<div style="margin:12px 0;padding:10px 12px;background:#fff8e1;border-left:4px solid #f9a825;">${staleNote}</div>` : ""}
  ${lowBlock}
  <table style="border-collapse:collapse;width:100%;margin-top:12px;">
    <thead><tr style="background:#f3f4f6;">
      <th style="${cell}text-align:left;">Product</th>
      <th style="${cell}text-align:right;">Today</th>
      <th style="${cell}text-align:right;">${prev ? escapeHtml(prev.date) : "Previous"}</th>
      <th style="${cell}text-align:right;">Change</th>
      <th style="${cell}text-align:right;">Min</th>
    </tr></thead>
    <tbody>${tableRows}
      <tr style="font-weight:600;">
        <td style="${cell}">Total</td>
        <td style="${num}">${fmt(total)}</td>
        <td style="${num}">${fmt(prevTotal)}</td>
        <td style="${num}">${prev ? fmtChange(Math.round((total - prevTotal) * 100) / 100) : "—"}</td>
        <td style="${cell}"></td>
      </tr>
    </tbody>
  </table>
  ${hiddenNote ? `<p style="color:#666;">${hiddenNote}</p>` : ""}
  ${prev ? "" : '<p style="color:#666;">No earlier report stored yet, so there is no comparison today.</p>'}
  <p style="color:#999;font-size:12px;margin-top:16px;">Sent automatically by Waycred Inventory.</p>
</div>`;

  const text = [
    `${category} Inventory (${unit}) — ${formatDateTime(now.getTime(), timeZone)}`,
    `Inventory last updated: ${lastUpdatedMs ? formatDateTime(lastUpdatedMs, timeZone) : "unknown"}`,
    staleNote,
    low.length ? `Low stock: ${low.map((r) => `${r.name} ${fmt(r.value)}`).join(", ")}` : "",
    "",
    ...rows.map((r) => `${r.name}: ${fmt(r.value)} (prev ${fmt(r.prevValue)}, change ${fmtChange(r.change)})${r.low ? " LOW" : ""}`),
    `Total: ${fmt(total)}`,
    hiddenNote,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
    .trim();

  return { subject, html, text };
};

module.exports = {
  safeEvaluate,
  localParts,
  shouldSend,
  currentTotals,
  previousReport,
  buildRows,
  hasChanged,
  updateState,
  buildEmail,
};
