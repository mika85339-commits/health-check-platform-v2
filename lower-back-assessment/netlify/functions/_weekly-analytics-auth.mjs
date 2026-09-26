import crypto from "node:crypto";

const SESSION_COOKIE = "hcl_weekly_admin";
const SESSION_TTL_SECONDS = 60 * 60;

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return ["", ""];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function createSessionToken(secret, options = {}) {
  if (!secret) throw new Error("WEEKLY_ANALYTICS_SESSION_SECRET is required.");
  const now = Math.floor((options.now || Date.now()) / 1000);
  const payload = base64UrlJson({
    aud: "health-check-lab-weekly-admin",
    role: "weekly-analytics-admin",
    iat: now,
    exp: now + (options.ttlSeconds || SESSION_TTL_SECONDS),
    nonce: crypto.randomBytes(12).toString("base64url")
  });
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, options = {}) {
  if (!token || !secret) return false;
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor((options.now || Date.now()) / 1000);
    return claims.aud === "health-check-lab-weekly-admin"
      && claims.role === "weekly-analytics-admin"
      && Number.isFinite(claims.exp)
      && claims.exp > now
      && Number.isFinite(claims.iat)
      && claims.iat <= now + 60;
  } catch {
    return false;
  }
}

function hasAdminSession(request, env = process.env) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return verifySessionToken(cookies[SESSION_COOKIE], env.WEEKLY_ANALYTICS_SESSION_SECRET);
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const normalized = String(password || "");
  if (normalized.length < 16) throw new Error("Administrator password must be at least 16 characters.");
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, "base64url");
  const digest = crypto.scryptSync(normalized, saltBuffer, 64);
  return `scrypt$${saltBuffer.toString("base64url")}$${digest.toString("base64url")}`;
}

function verifyPassword(password, encoded) {
  const [algorithm, salt, expected, extra] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expected || extra) return false;
  try {
    const actual = crypto.scryptSync(String(password || ""), Buffer.from(salt, "base64url"), 64).toString("base64url");
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

function bearerIsAuthorized(request, env = process.env) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && env.WEEKLY_ANALYTICS_READ_TOKEN && safeEqual(match[1], env.WEEKLY_ANALYTICS_READ_TOKEN));
}

function securityHeaders(contentType = "text/html; charset=utf-8") {
  return {
    "Cache-Control": "no-store, private",
    "Content-Type": contentType,
    "Content-Security-Policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  };
}

export {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  bearerIsAuthorized,
  clearSessionCookie,
  createSessionToken,
  hasAdminSession,
  hashPassword,
  parseCookies,
  safeEqual,
  securityHeaders,
  sessionCookie,
  verifyPassword,
  verifySessionToken
};
