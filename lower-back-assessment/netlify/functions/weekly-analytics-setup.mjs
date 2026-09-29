import QRCode from "qrcode";
import {
  SETUP_COOKIE,
  clearSetupCookie,
  createSessionToken,
  decryptAdminSecret,
  encryptAdminSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
  hashSetupToken,
  parseCookies,
  securityHeaders,
  sessionCookie,
  setupCookie,
  verifyTotp
} from "../lib/weekly-analytics-auth.mjs";
import {
  consumeSetupTicket,
  createAdminAuth,
  readAdminAuth,
  readSetupTicket,
  updateSetupTicket
} from "../lib/weekly-analytics-admin-store.mjs";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function page(content, options = {}) {
  const script = options.setupScript
    ? '<script src="/admin/weekly-analytics-assets/setup.js" defer></script>'
    : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(options.title || "管理者認証設定")} | Health Check Lab</title>
<link rel="stylesheet" href="/admin/weekly-analytics-assets/dashboard.css">${script}</head>
<body class="login-page"><main class="login-panel auth-panel"><p class="eyebrow">HEALTH CHECK LAB</p>${content}</main></body></html>`;
}

function setupHtml(error = "") {
  return page(`<h1>管理者認証の初回設定</h1>
<p>一度だけ有効な設定コードと、新しい管理者パスワードを入力します。</p>
<form method="post" action="/admin/weekly-analytics/setup/" data-admin-setup-form>
<input type="hidden" name="step" value="prepare">
<label>設定コード<input name="setup_token" type="password" autocomplete="one-time-code" required></label>
<label>新しいパスワード<input name="password" type="password" autocomplete="new-password" required minlength="16"></label>
<label>新しいパスワード（確認）<input name="password_confirm" type="password" autocomplete="new-password" required minlength="16"></label>
<p class="auth-help">16文字以上で、他のサービスと異なるパスワードを設定してください。</p>
<button type="submit">認証アプリの設定へ</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}`, {
    title: "管理者認証の初回設定",
    setupScript: true
  });
}

function groupedSecret(secret) {
  return String(secret || "").match(/.{1,4}/g)?.join(" ") || "";
}

async function enrollmentHtml(secret, recoveryCodes, error = "") {
  const uri = `otpauth://totp/${encodeURIComponent("Health Check Lab:weekly-analytics-admin")}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent("Health Check Lab")}&algorithm=SHA1&digits=6&period=30`;
  const qrCode = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#0b5138", light: "#ffffff" }
  });
  return page(`<h1>認証アプリを登録</h1>
<ol class="auth-steps">
<li>認証アプリで「セットアップキーを入力」を選びます。</li>
<li>アカウント名を「Health Check Lab」、種類を「時間ベース」にします。</li>
<li>下のキーを入力し、表示された6桁コードを確認します。</li>
</ol>
<div class="auth-qr"><img src="${qrCode}" width="240" height="240" alt="認証アプリ登録用QRコード"></div>
<div class="auth-secret"><span>セットアップキー</span><code>${escapeHtml(groupedSecret(secret))}</code></div>
<a class="auth-app-link" href="${escapeHtml(uri)}">対応アプリで開く</a>
<details class="recovery-codes" open><summary>復旧コード（今ここで保存）</summary>
<p>認証アプリを使えない時に、1回ずつ利用できます。再表示はできません。</p>
<div class="recovery-code-grid">${recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join("")}</div></details>
<form method="post" action="/admin/weekly-analytics/setup/">
<input type="hidden" name="step" value="verify">
<label>認証アプリの6桁コード<input name="totp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
<button type="submit">設定を完了する</button></form>
${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}`);
}

function successHtml(recoveryCodes) {
  return page(`<h1>二要素認証を設定しました</h1>
<p>管理画面は、新しいパスワードと認証アプリの6桁コードで保護されています。</p>
<details class="recovery-codes" open><summary>復旧コードを最後に確認</summary>
<p>安全な場所に保管してください。この画面を離れると再表示できません。</p>
<div class="recovery-code-grid">${recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join("")}</div></details>
<a class="auth-primary-link" href="/admin/weekly-analytics/">管理画面を開く</a>`);
}

function responseHtml(html, status = 200, cookies = []) {
  const headers = new Headers(securityHeaders());
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  return new Response(html, { status, headers });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { ...securityHeaders(), Location: location } });
}

function pendingEncryption(row, prefix) {
  return {
    ciphertext: row[`pending_${prefix}_ciphertext`],
    iv: row[`pending_${prefix}_iv`],
    tag: row[`pending_${prefix}_tag`]
  };
}

export default async function handler(request) {
  const existing = await readAdminAuth();
  if (existing) return redirect("/admin/weekly-analytics/login/");

  if (request.method === "GET") return responseHtml(setupHtml());
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const form = await request.formData();
  const step = String(form.get("step") || "");
  const sessionSecret = process.env.WEEKLY_ANALYTICS_SESSION_SECRET;
  if (!sessionSecret) return responseHtml(setupHtml("認証設定を開始できません。"), 503);

  if (step === "prepare") {
    const rawToken = String(form.get("setup_token") || "");
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("password_confirm") || "");
    if (password !== confirmation) return responseHtml(setupHtml("確認用パスワードが一致しません。"), 400);
    let passwordHash;
    try {
      passwordHash = hashPassword(password);
    } catch {
      return responseHtml(setupHtml("パスワードは16文字以上で設定してください。"), 400);
    }
    const tokenHash = hashSetupToken(rawToken, sessionSecret);
    const ticket = await readSetupTicket(tokenHash);
    if (!ticket) return responseHtml(setupHtml("設定コードが無効か、有効期限が切れています。"), 401);

    const totpSecret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    const encryptedTotp = encryptAdminSecret(totpSecret, sessionSecret);
    const encryptedRecovery = encryptAdminSecret(JSON.stringify(recoveryCodes), sessionSecret);
    await updateSetupTicket(tokenHash, {
      pending_password_hash: passwordHash,
      pending_totp_ciphertext: encryptedTotp.ciphertext,
      pending_totp_iv: encryptedTotp.iv,
      pending_totp_tag: encryptedTotp.tag,
      pending_recovery_ciphertext: encryptedRecovery.ciphertext,
      pending_recovery_iv: encryptedRecovery.iv,
      pending_recovery_tag: encryptedRecovery.tag,
      pending_recovery_hashes: recoveryCodes.map((code) => hashRecoveryCode(code, sessionSecret))
    });
    return responseHtml(await enrollmentHtml(totpSecret, recoveryCodes), 200, [setupCookie(rawToken)]);
  }

  if (step === "verify") {
    const rawToken = parseCookies(request.headers.get("cookie") || "")[SETUP_COOKIE];
    const tokenHash = hashSetupToken(rawToken, sessionSecret);
    const ticket = rawToken ? await readSetupTicket(tokenHash) : null;
    const pendingReady = ticket?.pending_password_hash
      && ticket.pending_totp_ciphertext
      && ticket.pending_recovery_ciphertext
      && Array.isArray(ticket.pending_recovery_hashes);
    if (!pendingReady) return responseHtml(setupHtml("初回設定を最初からやり直してください。"), 401, [clearSetupCookie()]);

    const totpSecret = decryptAdminSecret(pendingEncryption(ticket, "totp"), sessionSecret);
    const recoveryCodes = JSON.parse(decryptAdminSecret(pendingEncryption(ticket, "recovery"), sessionSecret));
    if (!verifyTotp(form.get("totp"), totpSecret)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return responseHtml(await enrollmentHtml(totpSecret, recoveryCodes, "6桁コードを確認してください。"), 401);
    }

    const auth = await createAdminAuth({
      password_hash: ticket.pending_password_hash,
      totp_secret_ciphertext: ticket.pending_totp_ciphertext,
      totp_secret_iv: ticket.pending_totp_iv,
      totp_secret_tag: ticket.pending_totp_tag,
      recovery_code_hashes: ticket.pending_recovery_hashes,
      auth_version: 1,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString()
    });
    await consumeSetupTicket(tokenHash);
    const session = createSessionToken(sessionSecret, { authVersion: Number(auth.auth_version) });
    return responseHtml(successHtml(recoveryCodes), 200, [sessionCookie(session), clearSetupCookie()]);
  }

  return responseHtml(setupHtml("設定手順を確認できませんでした。"), 400);
}

export const config = {
  path: ["/admin/weekly-analytics/setup", "/admin/weekly-analytics/setup/"]
};
