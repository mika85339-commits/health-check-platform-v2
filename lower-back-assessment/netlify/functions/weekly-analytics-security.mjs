import {
  createSessionToken,
  decryptAdminSecret,
  hasAdminSession,
  hashPassword,
  securityHeaders,
  sessionCookie,
  verifyPassword,
  verifyTotp
} from "../lib/weekly-analytics-auth.mjs";
import { readAdminAuth, updateAdminAuth } from "../lib/weekly-analytics-admin-store.mjs";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function securityHtml({ error = "", success = "" } = {}) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>認証設定 | Health Check Lab</title><link rel="stylesheet" href="/admin/weekly-analytics-assets/dashboard.css"></head>
<body class="login-page"><main class="login-panel auth-panel"><p class="eyebrow">HEALTH CHECK LAB</p>
<h1>管理者認証の設定</h1><p class="auth-status"><strong>二要素認証：有効</strong><span>パスワード＋認証アプリ</span></p>
<h2>パスワードを変更</h2><p>変更すると、ほかの端末のログイン状態は無効になります。</p>
<form method="post" action="/admin/weekly-analytics/security/">
<label>現在のパスワード<input name="current_password" type="password" autocomplete="current-password" required minlength="16"></label>
<label>認証アプリの6桁コード<input name="totp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
<label>新しいパスワード<input name="new_password" type="password" autocomplete="new-password" required minlength="16"></label>
<label>新しいパスワード（確認）<input name="new_password_confirm" type="password" autocomplete="new-password" required minlength="16"></label>
<button type="submit">パスワードを変更</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}
${success ? `<p class="login-success" role="status">${escapeHtml(success)}</p>` : ""}
<a class="auth-back-link" href="/admin/weekly-analytics/">週次分析へ戻る</a></main></body></html>`;
}

function responseHtml(html, status = 200, cookie = "") {
  const headers = { ...securityHeaders() };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(html, { status, headers });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { ...securityHeaders(), Location: location } });
}

export default async function handler(request) {
  if (!await hasAdminSession(request)) return redirect("/admin/weekly-analytics/login/");
  if (request.method === "GET") return responseHtml(securityHtml());
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const auth = await readAdminAuth();
  if (!auth) return responseHtml(securityHtml({ error: "二要素認証の設定を確認できません。" }), 409);
  const form = await request.formData();
  const nextPassword = String(form.get("new_password") || "");
  if (nextPassword !== String(form.get("new_password_confirm") || "")) {
    return responseHtml(securityHtml({ error: "新しいパスワードの確認入力が一致しません。" }), 400);
  }

  const totpSecret = decryptAdminSecret({
    ciphertext: auth.totp_secret_ciphertext,
    iv: auth.totp_secret_iv,
    tag: auth.totp_secret_tag
  }, process.env.WEEKLY_ANALYTICS_SESSION_SECRET);
  if (!verifyPassword(form.get("current_password"), auth.password_hash)
    || !verifyTotp(form.get("totp"), totpSecret)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return responseHtml(securityHtml({ error: "現在のパスワードまたは6桁コードを確認してください。" }), 401);
  }

  let nextHash;
  try {
    nextHash = hashPassword(nextPassword);
  } catch {
    return responseHtml(securityHtml({ error: "新しいパスワードは16文字以上で設定してください。" }), 400);
  }
  const nextVersion = Number(auth.auth_version) + 1;
  await updateAdminAuth({
    password_hash: nextHash,
    auth_version: nextVersion,
    failed_attempts: 0,
    locked_until: null
  });
  const token = createSessionToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET, { authVersion: nextVersion });
  return responseHtml(securityHtml({ success: "パスワードを変更し、ほかのログイン状態を無効にしました。" }), 200, sessionCookie(token));
}

export const config = {
  path: ["/admin/weekly-analytics/security", "/admin/weekly-analytics/security/"]
};
