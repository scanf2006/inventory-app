/**
 * Sending the report through Microsoft 365 (Microsoft Graph).
 *
 * Two ways to sign in:
 * - Your own account (default): authorize.js signs you in once and stores a
 *   refresh token, encrypted with TOKEN_KEY, in Supabase. Each run swaps it for
 *   a fresh one, so it keeps working as long as it is used.
 * - Admin-approved app: if MS_CLIENT_SECRET is set, the app signs in by itself
 *   and sends as MAIL_FROM (needs Mail.Send application permission).
 */
const crypto = require("crypto");
const { readRow, writeRow } = require("./supabase");

const SCOPES = "offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read";

const tokenRowId = (syncId) => `${syncId}__report-mail-token`;

// AES-256-GCM; the key is 32 random bytes, base64 encoded
const encrypt = (text, keyB64) => {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes, base64 encoded");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
};

const decrypt = (payload, keyB64) => {
  const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

const newTokenKey = () => crypto.randomBytes(32).toString("base64");

const tokenEndpoint = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

const postToken = async (tenant, params) => {
  const res = await fetch(tokenEndpoint(tenant), { method: "POST", body: new URLSearchParams(params) });
  const body = await res.json();
  if (!res.ok) throw new Error(`Microsoft sign-in failed: ${body.error_description || body.error || res.status}`);
  return body;
};

const saveRefreshToken = (syncId, refreshToken, keyB64, account) =>
  writeRow(tokenRowId(syncId), {
    token: encrypt(refreshToken, keyB64),
    account,
    savedAt: new Date().toISOString(),
  });

// Own-account sign-in: swap the stored refresh token for an access token
const delegatedAccessToken = async ({ syncId, tenant, clientId, tokenKey }) => {
  const row = await readRow(tokenRowId(syncId));
  if (!row?.data?.token) throw new Error("No saved sign-in found. Run scripts/daily-report/authorize.js first.");
  let refreshToken;
  try {
    refreshToken = decrypt(row.data.token, tokenKey);
  } catch {
    throw new Error("Saved sign-in could not be decrypted: TOKEN_KEY does not match. Run authorize.js again.");
  }
  const body = await postToken(tenant, {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES,
  });
  // Store the replacement right away so the next run uses the newest one
  if (body.refresh_token) await saveRefreshToken(syncId, body.refresh_token, tokenKey, row.data.account);
  return body.access_token;
};

const appAccessToken = async ({ tenant, clientId, clientSecret }) =>
  (
    await postToken(tenant, {
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    })
  ).access_token;

const requireEnv = (env, name) => {
  if (!env[name]) throw new Error(`Missing environment variable ${name}`);
  return env[name];
};

const sendMail = async ({ subject, html }, { syncId, env = process.env }) => {
  const tenant = requireEnv(env, "MS_TENANT_ID");
  const clientId = requireEnv(env, "MS_CLIENT_ID");
  const to = requireEnv(env, "REPORT_TO")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const useApp = Boolean(env.MS_CLIENT_SECRET);
  const accessToken = useApp
    ? await appAccessToken({ tenant, clientId, clientSecret: env.MS_CLIENT_SECRET })
    : await delegatedAccessToken({ syncId, tenant, clientId, tokenKey: requireEnv(env, "TOKEN_KEY") });
  const url = useApp
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(requireEnv(env, "MAIL_FROM"))}/sendMail`
    : "https://graph.microsoft.com/v1.0/me/sendMail";

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202) throw new Error(`Send failed (${res.status}): ${await res.text()}`);
  return to;
};

module.exports = { SCOPES, encrypt, decrypt, newTokenKey, postToken, saveRefreshToken, sendMail, tokenRowId };
