import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSessionToken,
  createSetupToken,
  decryptAdminSecret,
  encryptAdminSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hasAdminSession,
  hashRecoveryCode,
  hashSetupToken,
  sessionCookie,
  totpAt,
  verifySessionToken,
  verifyTotp
} from "../netlify/lib/weekly-analytics-auth.mjs";
import setupHandler from "../netlify/functions/weekly-analytics-setup.mjs";
import loginHandler from "../netlify/functions/weekly-analytics-login.mjs";
import adminHandler from "../netlify/functions/weekly-analytics-admin.mjs";
import securityHandler from "../netlify/functions/weekly-analytics-security.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionSecret = "test-session-secret-that-is-long-enough";
const totpSecret = generateTotpSecret();
const now = Date.now();
const code = totpAt(totpSecret, now);
assert.equal(verifyTotp(code, totpSecret, { now }), true);
assert.equal(verifyTotp("000000", totpSecret, { now }), code === "000000");
assert.equal(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000), "287082");

const encrypted = encryptAdminSecret("server-only-value", sessionSecret);
assert.equal(decryptAdminSecret(encrypted, sessionSecret), "server-only-value");
assert.throws(() => decryptAdminSecret(encrypted, "different-secret"));
const recovery = generateRecoveryCodes();
assert.equal(recovery.length, 8);
assert.equal(new Set(recovery).size, recovery.length);
assert.equal(hashRecoveryCode(recovery[0], sessionSecret), hashRecoveryCode(recovery[0].toLowerCase(), sessionSecret));

const authRow = { admin_id: "primary", auth_version: 2 };
const versionedToken = createSessionToken(sessionSecret, { authVersion: 2 });
const staleToken = createSessionToken(sessionSecret, { authVersion: 1 });
const authFetch = async () => new Response(JSON.stringify([authRow]), { status: 200 });
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
  WEEKLY_ANALYTICS_SESSION_SECRET: sessionSecret
};
assert.equal(await hasAdminSession(new Request("https://example.test", {
  headers: { Cookie: sessionCookie(versionedToken).split(";")[0] }
}), env, { fetchImpl: authFetch }), true);
assert.equal(await hasAdminSession(new Request("https://example.test", {
  headers: { Cookie: sessionCookie(staleToken).split(";")[0] }
}), env, { fetchImpl: authFetch }), false);
assert.equal(verifySessionToken(versionedToken, sessionSecret), true);

const tables = {
  weekly_analytics_admin_auth: [],
  weekly_analytics_admin_setup_tokens: []
};

function tableFor(url) {
  return Object.keys(tables).find((name) => url.pathname.includes(`/rest/v1/${name}`));
}

function rowMatches(row, url) {
  const params = url.searchParams;
  if (params.get("admin_id")?.startsWith("eq.")) return row.admin_id === params.get("admin_id").slice(3);
  if (params.get("token_hash")?.startsWith("eq.")) return row.token_hash === params.get("token_hash").slice(3) && !row.consumed_at;
  return true;
}

const originalFetch = globalThis.fetch;
const previousEnv = { ...process.env };
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const table = tableFor(url);
  if (!table) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  if (options.method === "GET") {
    return new Response(JSON.stringify(tables[table].filter((row) => rowMatches(row, url))), { status: 200 });
  }
  const body = JSON.parse(options.body || "null");
  if (options.method === "POST") {
    const records = Array.isArray(body) ? body : [body];
    tables[table].push(...records.map((row) => ({ ...row })));
    return new Response(JSON.stringify(records), { status: 201 });
  }
  if (options.method === "PATCH") {
    const matched = tables[table].filter((row) => rowMatches(row, url));
    matched.forEach((row) => Object.assign(row, body));
    return new Response(JSON.stringify(matched), { status: 200 });
  }
  return new Response("", { status: 405 });
};

Object.assign(process.env, env);
try {
  const rawTicket = createSetupToken();
  tables.weekly_analytics_admin_setup_tokens.push({
    token_hash: hashSetupToken(rawTicket, sessionSecret),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null
  });
  const password = "a-new-production-style-password";
  const prepareResponse = await setupHandler(new Request("https://example.test/admin/weekly-analytics/setup/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://example.test" },
    body: new URLSearchParams({
      step: "prepare",
      setup_token: rawTicket,
      password,
      password_confirm: password
    })
  }));
  assert.equal(prepareResponse.status, 200);
  assert((await prepareResponse.clone().text()).includes("data:image/png;base64"));
  const setupCookieHeader = prepareResponse.headers.get("set-cookie");
  assert(setupCookieHeader?.includes("hcl_weekly_setup="));
  const pending = tables.weekly_analytics_admin_setup_tokens[0];
  assert(!JSON.stringify(pending).includes(password));
  const pendingTotp = decryptAdminSecret({
    ciphertext: pending.pending_totp_ciphertext,
    iv: pending.pending_totp_iv,
    tag: pending.pending_totp_tag
  }, sessionSecret);
  const verifyResponse = await setupHandler(new Request("https://example.test/admin/weekly-analytics/setup/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://example.test",
      Cookie: setupCookieHeader.split(";")[0]
    },
    body: new URLSearchParams({ step: "verify", totp: totpAt(pendingTotp) })
  }));
  assert.equal(verifyResponse.status, 200);
  assert.equal(tables.weekly_analytics_admin_auth.length, 1);
  assert.equal(Boolean(tables.weekly_analytics_admin_setup_tokens[0].consumed_at), true);
  const responseCookies = verifyResponse.headers.get("set-cookie");
  const sessionMatch = responseCookies.match(/hcl_weekly_admin=([^;,]+)/);
  assert(sessionMatch);

  const adminResponse = await adminHandler(new Request("https://example.test/admin/weekly-analytics/", {
    headers: { Cookie: `hcl_weekly_admin=${sessionMatch[1]}` }
  }));
  assert.equal(adminResponse.status, 200);

  const loginCodeSecret = decryptAdminSecret({
    ciphertext: tables.weekly_analytics_admin_auth[0].totp_secret_ciphertext,
    iv: tables.weekly_analytics_admin_auth[0].totp_secret_iv,
    tag: tables.weekly_analytics_admin_auth[0].totp_secret_tag
  }, sessionSecret);
  const loginResponse = await loginHandler(new Request("https://example.test/admin/weekly-analytics/login/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://example.test" },
    body: new URLSearchParams({ password, verification: totpAt(loginCodeSecret) })
  }));
  assert.equal(loginResponse.status, 303);

  const currentSession = loginResponse.headers.get("set-cookie").split(";")[0];
  const nextPassword = "a-second-production-style-password";
  const securityResponse = await securityHandler(new Request("https://example.test/admin/weekly-analytics/security/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://example.test",
      Cookie: currentSession
    },
    body: new URLSearchParams({
      current_password: password,
      totp: totpAt(loginCodeSecret),
      new_password: nextPassword,
      new_password_confirm: nextPassword
    })
  }));
  assert.equal(securityResponse.status, 200);
  assert.equal(tables.weekly_analytics_admin_auth[0].auth_version, 2);
  const staleSessionResponse = await adminHandler(new Request("https://example.test/admin/weekly-analytics/", {
    headers: { Cookie: currentSession }
  }));
  assert.equal(staleSessionResponse.status, 302);
} finally {
  globalThis.fetch = originalFetch;
  Object.keys(process.env).forEach((key) => {
    if (!(key in previousEnv)) delete process.env[key];
  });
  Object.assign(process.env, previousEnv);
}

const migration = fs.readFileSync(path.join(root, "supabase-weekly-admin-auth.sql"), "utf8");
[
  "weekly_analytics_admin_auth",
  "weekly_analytics_admin_setup_tokens",
  "enable row level security",
  "revoke all",
  "password_hash",
  "totp_secret_ciphertext",
  "recovery_code_hashes",
  "auth_version"
].forEach((value) => assert(migration.includes(value), `Admin auth migration is missing ${value}.`));
assert(!migration.includes("WEEKLY_ANALYTICS_SESSION_SECRET"));

console.log("Weekly admin authentication tests passed: TOTP, encrypted secrets, one-time setup, recovery hashes, login, and session invalidation.");
