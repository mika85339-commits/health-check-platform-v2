import crypto from "node:crypto";
import { readAdminAuth } from "./weekly-analytics-admin-store.mjs";

const SESSION_COOKIE = "hcl_weekly_admin";
const SETUP_COOKIE = "hcl_weekly_setup";
const SESSION_TTL_SECONDS = 60 * 60;
const SETUP_TTL_SECONDS = 20 * 60;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

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
    ver: Number.isInteger(options.authVersion) ? options.authVersion : 0,
    iat: now,
    exp: now + (options.ttlSeconds || SESSION_TTL_SECONDS),
    nonce: crypto.randomBytes(12).toString("base64url")
  });
  return `${payload}.${sign(payload, secret)}`;
}

function readSessionClaims(token, secret, options = {}) {
  if (!token || !secret) return false;
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor((options.now || Date.now()) / 1000);
    return claims.aud === "health-check-lab-weekly-admin"
      && claims.role === "weekly-analytics-admin"
      && Number.isFinite(claims.exp)
      && claims.exp > now
      && Number.isFinite(claims.iat)
      && claims.iat <= now + 60
      ? claims
      : null;
  } catch {
    return null;
  }
}

function verifySessionToken(token, secret, options = {}) {
  return Boolean(readSessionClaims(token, secret, options));
}

async function hasAdminSession(request, env = process.env, deps = {}) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const claims = readSessionClaims(cookies[SESSION_COOKIE], env.WEEKLY_ANALYTICS_SESSION_SECRET);
  if (!claims) return false;
  try {
    const auth = await readAdminAuth({ env, ...deps });
    if (!auth) return Number(claims.ver || 0) === 0;
    return Number(claims.ver) === Number(auth.auth_version);
  } catch {
    return false;
  }
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function setupCookie(token) {
  return `${SETUP_COOKIE}=${encodeURIComponent(token)}; Path=/admin/weekly-analytics/setup; Max-Age=${SETUP_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSetupCookie() {
  return `${SETUP_COOKIE}=; Path=/admin/weekly-analytics/setup; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
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

function normalizeRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
}

function hmacFingerprint(value, secret, purpose) {
  return crypto.createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("base64url");
}

function createSetupToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSetupToken(token, secret) {
  return hmacFingerprint(String(token || ""), secret, "weekly-admin-setup-ticket-v1");
}

function generateRecoveryCodes(count = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(12);
    const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    return raw.match(/.{1,4}/g).join("-");
  });
}

function hashRecoveryCode(code, secret) {
  return hmacFingerprint(normalizeRecoveryCode(code), secret, "weekly-admin-recovery-code-v1");
}

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= bits ? (1 << bits) - 1 : 0;
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let current = 0;
  const output = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret.");
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
      current &= bits ? (1 << bits) - 1 : 0;
    }
  }
  return Buffer.from(output);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpAt(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** TOTP_DIGITS);
  return String(value).padStart(TOTP_DIGITS, "0");
}

function verifyTotp(code, secret, options = {}) {
  const normalized = String(code || "").replace(/\D/g, "");
  if (normalized.length !== TOTP_DIGITS) return false;
  const now = options.now || Date.now();
  const window = Number.isInteger(options.window) ? options.window : 1;
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqual(normalized, totpAt(secret, now + offset * TOTP_PERIOD_SECONDS * 1000))) return true;
  }
  return false;
}

function encryptionKey(secret) {
  if (!secret) throw new Error("WEEKLY_ANALYTICS_SESSION_SECRET is required.");
  return crypto.hkdfSync(
    "sha256",
    Buffer.from(secret),
    Buffer.from("health-check-lab-weekly-admin-v1"),
    Buffer.from("totp-and-recovery-at-rest"),
    32
  );
}

function encryptAdminSecret(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url")
  };
}

function decryptAdminSecret(record, secret) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(record.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
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
  SETUP_COOKIE,
  bearerIsAuthorized,
  clearSetupCookie,
  clearSessionCookie,
  createSessionToken,
  createSetupToken,
  decryptAdminSecret,
  encryptAdminSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hasAdminSession,
  hashPassword,
  hashRecoveryCode,
  hashSetupToken,
  parseCookies,
  readSessionClaims,
  safeEqual,
  securityHeaders,
  setupCookie,
  sessionCookie,
  totpAt,
  verifyPassword,
  verifySessionToken,
  verifyTotp
};
