import {
  createSessionToken,
  hasAdminSession,
  securityHeaders,
  sessionCookie,
  verifyPassword
} from "./_weekly-analytics-auth.mjs";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function loginHtml(error = "") {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>管理者ログイン | Health Check Lab</title>
<link rel="stylesheet" href="/admin/weekly-analytics-assets/dashboard.css"></head>
<body class="login-page"><main class="login-panel"><p class="eyebrow">HEALTH CHECK LAB</p>
<h1>週次分析 管理者ログイン</h1><p>管理者パスワードを入力してください。</p>
<form method="post" action="/admin/weekly-analytics/login/">
<label>パスワード<input name="password" type="password" autocomplete="current-password" required minlength="16"></label>
<button type="submit">ログイン</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}</main></body></html>`;
}

function redirect(location, cookie) {
  const headers = { ...securityHeaders(), Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}

export default async function handler(request) {
  if (request.method === "GET") {
    return hasAdminSession(request)
      ? redirect("/admin/weekly-analytics/")
      : new Response(loginHtml(), { status: 200, headers: securityHeaders() });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response(loginHtml("ログインを確認できませんでした。"), { status: 403, headers: securityHeaders() });
  }
  const form = await request.formData();
  if (!verifyPassword(form.get("password"), process.env.WEEKLY_ANALYTICS_ADMIN_PASSWORD_HASH)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return new Response(loginHtml("パスワードを確認してください。"), { status: 401, headers: securityHeaders() });
  }
  const token = createSessionToken(process.env.WEEKLY_ANALYTICS_SESSION_SECRET);
  return redirect("/admin/weekly-analytics/", sessionCookie(token));
}

export const config = {
  path: ["/admin/weekly-analytics/login", "/admin/weekly-analytics/login/"]
};
