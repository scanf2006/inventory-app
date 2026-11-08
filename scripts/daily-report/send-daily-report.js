/**
 * Daily Bulk Oil email.
 *
 *   node scripts/daily-report/send-daily-report.js            scheduled run (checks send time, sends once per day)
 *   node scripts/daily-report/send-daily-report.js --force    send now (test); does not record today's values
 *   node scripts/daily-report/send-daily-report.js --dry-run [--out preview.html]
 *                                                             build the email only; sends and saves nothing
 *
 * Environment (GitHub Secrets), see docs/daily-report.md:
 *   MS_TENANT_ID, MS_CLIENT_ID   Microsoft app registration
 *   TOKEN_KEY                    key printed by authorize.js (send from your own mailbox)
 *   MS_CLIENT_SECRET, MAIL_FROM  only for the admin-approved setup instead
 *   REPORT_TO                    comma-separated recipients
 */
const fs = require("fs");
const path = require("path");
const report = require("./report");
const { readRow, writeRow } = require("./supabase");
const { sendMail } = require("./mail");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const STATE_ID = `${config.syncId}__bulk-oil-daily-report`;

const main = async () => {
  const now = new Date();
  const stateRow = await readRow(STATE_ID);
  const state = stateRow?.data || {};

  const gate = report.shouldSend(now, config, state.lastSentDate);
  if (!DRY_RUN && !FORCE && !gate.send) {
    console.log(`Not sending: ${gate.reason}`);
    return;
  }
  const today = gate.local.date;

  const row = await readRow(config.syncId);
  if (!row?.data) throw new Error(`No inventory data found for Sync ID "${config.syncId}"`);

  const prev = report.previousReport(state, today);
  const rows = report.buildRows(row.data, config, prev);
  if (rows.length === 0) throw new Error(`Category "${config.category}" has no products`);
  const lastUpdatedMs = row.data.last_inventory_update_ts || Date.parse(row.updated_at);
  const email = report.buildEmail({ rows, config, today, prev, lastUpdatedMs, now });
  const changed = report.hasChanged(rows, prev);

  if (DRY_RUN) {
    if (OUT) fs.writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>${email.subject}</title>${email.html}`);
    console.log(`Subject: ${email.subject}\n\n${email.text}`);
    if (!changed) console.log(`\n(No change since ${prev.date}: the scheduled run would not send this.)`);
    return;
  }

  // Nothing to report: skip without saving, so the next email compares with the last one sent
  if (!changed && !FORCE) {
    console.log(`Not sending: no change since ${prev.date}`);
    return;
  }

  const to = await sendMail(email, { syncId: config.syncId });
  console.log(`Sent "${email.subject}" to ${to.join(", ")}`);

  // A forced test send must not block or replace the real 5:30 PM report
  if (!FORCE) {
    await writeRow(STATE_ID, report.updateState(state, today, rows, row.updated_at));
    console.log(`Saved values for ${today}`);
  }
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
