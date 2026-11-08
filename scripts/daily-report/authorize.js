/**
 * One-time sign-in so the daily report can send email from your own mailbox.
 *
 *   MS_TENANT_ID=... MS_CLIENT_ID=... node scripts/daily-report/authorize.js
 *
 * Opens the Microsoft sign-in page in your browser. After you sign in, the
 * refresh token is encrypted and saved to Supabase, and the encryption key
 * (TOKEN_KEY) is printed once for you to add as a GitHub secret.
 * Set TOKEN_KEY in the environment to reuse an existing key.
 */
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { SCOPES, newTokenKey, postToken, saveRefreshToken } = require("./mail");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const tenant = process.env.MS_TENANT_ID;
const clientId = process.env.MS_CLIENT_ID;
if (!tenant || !clientId) {
  console.error("Set MS_TENANT_ID and MS_CLIENT_ID first (from the app registration's Overview page).");
  process.exit(1);
}

const base64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = base64url(crypto.randomBytes(32));
const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
const state = base64url(crypto.randomBytes(16));

const openBrowser = (url) => {
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
};

const page = (msg) => `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">${msg}</body>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || url.searchParams.get("error"));
    if (url.searchParams.get("state") !== state) throw new Error("Sign-in response did not match this request.");

    const tokens = await postToken(tenant, {
      client_id: clientId,
      grant_type: "authorization_code",
      code: url.searchParams.get("code"),
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: SCOPES,
    });
    if (!tokens.refresh_token) throw new Error("No refresh token returned (is offline_access allowed?).");

    const me = await (
      await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
    ).json();
    const account = me.mail || me.userPrincipalName || "unknown";

    const generated = !process.env.TOKEN_KEY;
    const tokenKey = process.env.TOKEN_KEY || newTokenKey();
    await saveRefreshToken(config.syncId, tokens.refresh_token, tokenKey, account);

    res.writeHead(200, { "Content-Type": "text/html" }).end(page(`Signed in as <b>${account}</b>. You can close this tab.`));
    console.log(`\nSigned in as ${account}. Sign-in saved (encrypted).`);
    if (generated) {
      console.log("\nAdd this as the GitHub secret TOKEN_KEY (shown only once):\n");
      console.log(`  ${tokenKey}\n`);
    } else {
      console.log("Reused the TOKEN_KEY from the environment; no GitHub change needed.");
    }
    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" }).end(page(`Sign-in failed: ${String(err.message).replace(/</g, "&lt;")}`));
    console.error(`\nSign-in failed: ${err.message}`);
    server.close();
    process.exitCode = 1;
  }
});

let redirectUri;
// No host: listen on IPv4 and IPv6 so "localhost" works whichever the browser picks
server.listen(0, () => {
  redirectUri = `http://localhost:${server.address().port}`;
  const authUrl =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  console.log("Opening the Microsoft sign-in page. If it does not open, visit:\n");
  console.log(`  ${authUrl}\n`);
  openBrowser(authUrl);
});
