import {
  createSessionToken,
  decryptAdminSecret,
  hasAdminSession,
  hashRecoveryCode,
  safeEqual,
  securityHeaders,
  sessionCookie,
  verifyPassword,
  verifyTotp
} from "../lib/weekly-analytics-auth.mjs";
import { readAdminAuth, updateAdminAuth } from "../lib/weekly-analytics-admin-store.mjs";

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function loginHtml({ error = "", secondFactor = true } = {}) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>管理者ログイン | Health Check Lab</title>
<link rel="stylesheet" href="/admin/weekly-analytics-assets/dashboard.css"></head>
<body class="login-page"><main class="login-panel"><p class="eyebrow">HEALTH CHECK LAB</p>
<h1>週次分析 管理者ログイン</h1><p>${secondFactor ? "パスワードと認証アプリのコードを入力してください。" : "管理者パスワードを入力してください。"}</p>
<form method="post" action="/admin/weekly-analytics/login/">
<label>パスワード<input name="password" type="password" autocomplete="current-password" required minlength="16"></label>
${secondFactor ? '<label>6桁コードまたは復旧コード<input name="verification" type="text" inputmode="text" autocomplete="one-time-code" required></label>' : ""}
<button type="submit">ログイン</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}</main></body></html>`;
}

function redirect(location, cookie) {
  const headers = { ...securityHeaders(), Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}

function isLocked(auth, now = Date.now()) {
  return Boolean(auth?.locked_until && new Date(auth.locked_until).getTime() > now);
}

async function recordFailure(auth) {
  const now = Date.now();
  const lockExpired = auth.locked_until && new Date(auth.locked_until).getTime() <= now;
  const attempts = (lockExpired ? 0 : Number(auth.failed_attempts || 0)) + 1;
  await updateAdminAuth({
    failed_attempts: attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts,
    locked_until: attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now + LOCK_MINUTES * 60 * 1000).toISOString()
      : null
  });
}

function secondFactorResult(value, auth, env) {
  const sessionSecret = env.WEEKLY_ANALYTICS_SESSION_SECRET;
  const normalized = String(value || "").trim();
  const totpSecret = decryptAdminSecret({
    ciphertext: auth.totp_secret_ciphertext,
    iv: auth.totp_secret_iv,
    tag: auth.totp_secret_tag
  }, sessionSecret);
  if (/^\d{6}$/.test(normalized) && verifyTotp(normalized, totpSecret)) {
    return { valid: true, recoveryCodeHashes: auth.recovery_code_hashes || [] };
  }
  const fingerprint = hashRecoveryCode(normalized, sessionSecret);
  const existing = Array.isArray(auth.recovery_code_hashes) ? auth.recovery_code_hashes : [];
  const index = existing.findIndex((hash) => safeEqual(hash, fingerprint));
  if (index < 0) return { valid: false, recoveryCodeHashes: existing };
  return { valid: true, recoveryCodeHashes: existing.filter((_, itemIndex) => itemIndex !== index) };
}

export default async function handler(request) {
  const auth = await readAdminAuth();
  if (request.method === "GET") {
    if (await hasAdminSession(request)) return redirect("/admin/weekly-analytics/");
    return new Response(loginHtml({ secondFactor: Boolean(auth) }), { status: 200, headers: securityHeaders() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response(loginHtml({ error: "ログインを確認できませんでした。", secondFactor: Boolean(auth) }), { status: 403, headers: securityHeaders() });
  }

  const form = await request.formData();
  if (!auth) {
    if (!verifyPassword(form.get("password"), process.env.WEEKLY_ANALYTICS_ADMIN_PASSWORD_HASH)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return new Response(loginHtml({ error: "認証情報を確認してください。", secondFactor: false }), { status: 401, headers: securityHeaders() });
    }
    const legacyToken = createSessionToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET, { authVersion: 0 });
    return redirect("/admin/weekly-analytics/", sessionCookie(legacyToken));
  }

  if (isLocked(auth)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return new Response(loginHtml({ error: "ログインを一時停止しています。15分後にもう一度お試しください。" }), { status: 429, headers: securityHeaders() });
  }

  let factors;
  try {
    factors = secondFactorResult(form.get("verification"), auth, process.env);
  } catch {
    factors = { valid: false, recoveryCodeHashes: auth.recovery_code_hashes || [] };
  }
  if (!verifyPassword(form.get("password"), auth.password_hash) || !factors.valid) {
    await recordFailure(auth);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return new Response(loginHtml({ error: "認証情報を確認してください。" }), { status: 401, headers: securityHeaders() });
  }

  await updateAdminAuth({
    failed_attempts: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
    recovery_code_hashes: factors.recoveryCodeHashes
  });
  const token = createSessionToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET, {
    authVersion: Number(auth.auth_version)
  });
  return redirect("/admin/weekly-analytics/", sessionCookie(token));
}

export const config = {
  path: ["/admin/weekly-analytics/login", "/admin/weekly-analytics/login/"]
};

export { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, isLocked, secondFactorResult };
