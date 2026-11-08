# Daily Bulk Oil Email

Every weekday around **5:30 PM Toronto time**, a GitHub Actions job reads the
`Bulk Oil` category for Sync ID `scanf2006` from Supabase and emails a report:

- current quantity of each Bulk Oil product (L), using the same math as the app
- change since the previous report
- low-stock warnings (minimums in `scripts/daily-report/config.json`)
- when the inventory was last updated, with a warning if nobody counted today

Files:

| File | Purpose |
| --- | --- |
| `.github/workflows/daily-bulk-oil-report.yml` | Schedule (weekdays) and manual "Run workflow" button |
| `scripts/daily-report/send-daily-report.js` | Reads data, sends the email, saves today's values |
| `scripts/daily-report/report.js` | Totals, comparison, low stock, email layout |
| `scripts/daily-report/mail.js` | Sends through Microsoft 365; keeps the saved sign-in fresh |
| `scripts/daily-report/authorize.js` | One-time sign-in for sending from your own mailbox |
| `scripts/daily-report/config.json` | Sync ID, category, time window, low-stock minimums |

Each day's values are kept in Supabase table `app_sync`, row
`scanf2006__bulk-oil-daily-report` (last 60 days). The app never reads this row.

## One-time setup

The email is sent from your own Microsoft 365 mailbox. You sign in once; after
that the job keeps the sign-in fresh by itself. No admin is needed if the
company lets staff approve apps for their own account (Option A). If not, an
admin can approve the app instead (Option B).

### Option A: your own account (no admin)

1. Open https://entra.microsoft.com → **App registrations → New registration**.
   - Name: `Waycred Inventory Report`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: platform **Public client/native (mobile & desktop)**, value `http://localhost`

   If you cannot create a registration, use Option B.
2. On the **Overview** page, copy the **Application (client) ID** and **Directory (tenant) ID**.
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions →
   `Mail.Send`** → Add. (`User.Read` is already there.)
4. In PowerShell, from the project folder:

   ```powershell
   $env:MS_TENANT_ID="<tenant-id>"; $env:MS_CLIENT_ID="<client-id>"; node scripts/daily-report/authorize.js
   ```

   A browser opens. Sign in as yourself and accept *Send mail as you*.
   If Microsoft says **Need admin approval**, your company blocks this; use Option B.
   The terminal then prints a **TOKEN_KEY**. It is shown only once.
5. Add GitHub secrets (**Settings → Secrets and variables → Actions → New repository secret**):

   | Secret | Value |
   | --- | --- |
   | `MS_TENANT_ID` | Directory (tenant) ID |
   | `MS_CLIENT_ID` | Application (client) ID |
   | `TOKEN_KEY` | Key printed by `authorize.js` |
   | `REPORT_TO` | Recipients, comma-separated, e.g. `aiden@waycred.com` |

The sign-in is stored encrypted in Supabase (`app_sync` row
`scanf2006__report-mail-token`). Without `TOKEN_KEY` it cannot be read, so keep
that key only in GitHub secrets.

**If it stops working** (for example after a password change or a new company
security policy), the scheduled run fails and GitHub emails you. Sign in again,
reusing the same key so the GitHub secret stays valid:

```powershell
$env:MS_TENANT_ID="<tenant-id>"; $env:MS_CLIENT_ID="<client-id>"; $env:TOKEN_KEY="<current key>"; node scripts/daily-report/authorize.js
```

### Option B: admin-approved app (needs a Microsoft 365 admin)

Same registration, but the admin adds the **Application** permission `Mail.Send`,
grants admin consent and creates a client secret. Recommended: limit the app to
your mailbox only:

```powershell
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId aiden@waycred.com -AccessRight RestrictAccess -Description "Inventory report sender"
```

GitHub secrets: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
`MAIL_FROM` (`aiden@waycred.com`) and `REPORT_TO`. When `MS_CLIENT_SECRET` is set,
the job uses this option. Client secrets expire; renew before the date shown in Entra.

### Test

**Actions → Daily Bulk Oil report → Run workflow**:

- `test`: sends the email now. Does not record today's values, so the real
  5:30 PM report still goes out.
- `preview`: builds the report and prints it in the job log; sends nothing.

Locally (no email, nothing saved):

```bash
node scripts/daily-report/send-daily-report.js --dry-run --out preview.html
```

## Common changes

- **Add recipients:** edit the `REPORT_TO` secret.
- **Low-stock minimums:** edit `lowStock` in `config.json`. `default` applies to
  every product without its own entry, e.g.
  `"products": { "R-H1030B-B": 5000, "R-AW68-B": 300 }`. Set `"default": null`
  to warn only for products listed there.
- **Holidays:** `skipHolidays` in `config.json` lists the holidays with no email.
  Default: Ontario's 9 statutory holidays. Dates are computed every year; a holiday
  on a weekend moves to the next weekday (e.g. Boxing Day on Saturday -> Monday).
  Optional names you can add: `Civic Holiday`, `Easter Monday`,
  `Truth and Reconciliation Day`, `Remembrance Day`. For one-off closures add dates
  to `skipDates`, e.g. `["2026-12-24", "2026-12-31"]`.
- **Send time:** the job runs at 21:30, 22:30 and 23:30 UTC on weekdays and sends
  on the first run at or after `sendWindow.start` Toronto time, once per day.

## Notes

- No email on weekends or on the holidays listed in `skipHolidays` (see Common changes).
- No email when no Bulk Oil quantity changed since the last email sent. Nothing is
  saved that day, so the next email compares with the last one actually sent. If
  someone updates Bulk Oil after 5:30 PM, a backup run (6:30 or 7:30 PM) sends it.
  Manual test sends always go out.
- GitHub may start scheduled jobs a few minutes late.
- In a public repository, GitHub pauses scheduled jobs after 60 days without
  commits. Re-enable it on the Actions tab if that happens.
