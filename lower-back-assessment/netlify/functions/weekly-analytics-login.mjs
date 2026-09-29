import {
  createSessionToken,
  createTrustedDeviceToken,
  decryptAdminSecret,
  hasAdminSession,
  hasTrustedDevice,
  hashRecoveryCode,
  safeEqual,
  securityHeaders,
  sessionCookie,
  trustedDeviceCookie,
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

function loginHtml({ error = "", secondFactor = true, trustedDevice = false } = {}) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>管理者ログイン | Health Check Lab</title>
<link rel="stylesheet" href="/admin/weekly-analytics-assets/dashboard.css"></head>
<body class="login-page"><main class="login-panel"><p class="eyebrow">HEALTH CHECK LAB</p>
<h1>週次分析 管理者ログイン</h1><p>${trustedDevice ? "この端末は信頼済みです。パスワードだけでログインできます。" : secondFactor ? "パスワードと認証アプリのコードを入力してください。" : "管理者パスワードを入力してください。"}</p>
<form method="post" action="/admin/weekly-analytics/login/">
<label>パスワード<input name="password" type="password" autocomplete="current-password" required minlength="16"></label>
${secondFactor ? '<label>6桁コードまたは復旧コード<input name="verification" type="text" inputmode="text" autocomplete="one-time-code" required></label>' : ""}
${secondFactor ? '<label class="trusted-device-option"><input name="remember_device" type="checkbox" value="1" checked><span>この端末では30日間、認証コードを省略する<small>共有端末ではチェックを外してください。</small></span></label>' : ""}
${trustedDevice ? '<p class="trusted-device-status">信頼済み期間中も、明示的にログアウトすると端末の記憶は解除されます。</p>' : ""}
<button type="submit">ログイン</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}</main></body></html>`;
}

function redirect(location, cookies = []) {
  const headers = new Headers({ ...securityHeaders(), Location: location });
  const values = Array.isArray(cookies) ? cookies : [cookies];
  values.filter(Boolean).forEach((cookie) => headers.append("Set-Cookie", cookie));
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
    const trustedDevice = hasTrustedDevice(request, auth);
    return new Response(loginHtml({ secondFactor: Boolean(auth) && !trustedDevice, trustedDevice }), { status: 200, headers: securityHeaders() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const form = await request.formData();
  if (!auth) {
    if (!verifyPassword(form.get("password"), process.env.WEEKLY_ANALYTICS_ADMIN_PASSWORD_HASH)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return new Response(loginHtml({ error: "認証情報を確認してください。", secondFactor: false }), { status: 401, headers: securityHeaders() });
    }
    const legacyToken = createSessionToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET, { authVersion: 0 });
    return redirect("/admin/weekly-analytics/", [sessionCookie(legacyToken)]);
  }

  const trustedDevice = hasTrustedDevice(request, auth);
  if (isLocked(auth)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return new Response(loginHtml({
      error: "ログインを一時停止しています。15分後にもう一度お試しください。",
      secondFactor: !trustedDevice,
      trustedDevice
    }), { status: 429, headers: securityHeaders() });
  }

  let factors = { valid: trustedDevice, recoveryCodeHashes: auth.recovery_code_hashes || [] };
  if (!trustedDevice) {
    try {
      factors = secondFactorResult(form.get("verification"), auth, process.env);
    } catch {
      factors = { valid: false, recoveryCodeHashes: auth.recovery_code_hashes || [] };
    }
  }
  if (!verifyPassword(form.get("password"), auth.password_hash) || !factors.valid) {
    await recordFailure(auth);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return new Response(loginHtml({
      error: "認証情報を確認してください。",
      secondFactor: !trustedDevice,
      trustedDevice
    }), { status: 401, headers: securityHeaders() });
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
  const cookies = [sessionCookie(token)];
  if (!trustedDevice && form.get("remember_device") === "1") {
    const trustedToken = createTrustedDeviceToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET, {
      authVersion: Number(auth.auth_version)
    });
    cookies.push(trustedDeviceCookie(trustedToken));
  }
  return redirect("/admin/weekly-analytics/", cookies);
}

export const config = {
  path: ["/admin/weekly-analytics/login", "/admin/weekly-analytics/login/"]
};

export { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, isLocked, secondFactorResult };
