const crypto = require("crypto");

const SIGNATURE_HEADER = "sanity-webhook-signature";
const MAX_AGE_SECONDS = 300;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function rawBody(event) {
  const body = event?.body || "";
  return event?.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

function signatureParts(header) {
  return String(header || "").split(",").reduce((parts, value) => {
    const [key, item] = value.trim().split("=");
    if (key && item) parts[key] = item;
    return parts;
  }, {});
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySanitySignature(body, header, secret, now = Date.now()) {
  if (!body || !header || !secret) return false;
  const parts = signatureParts(header);
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > MAX_AGE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  return safeEqual(expected, parts.v1);
}

async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = process.env.SANITY_WEBHOOK_SECRET;
  const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!secret || !buildHookUrl) return json(503, { error: "webhook_not_configured" });

  const body = rawBody(event);
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (!verifySanitySignature(body, headers[SIGNATURE_HEADER], secret)) return json(401, { error: "invalid_signature" });

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_) {
    return json(400, { error: "invalid_json" });
  }

  if (payload?._type && payload._type !== "post") return json(202, { status: "ignored", reason: "unsupported_document_type" });

  const response = await fetch(buildHookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "sanity",
      documentId: payload?._id || "",
      documentType: payload?._type || "post",
      slug: typeof payload?.slug === "string" ? payload.slug : payload?.slug?.current || "",
      transactionId: headers["sanity-transaction-id"] || "",
      idempotencyKey: headers["idempotency-key"] || ""
    })
  });

  if (!response.ok) return json(502, { error: "netlify_build_hook_failed", status: response.status });
  return json(202, { status: "build_triggered" });
}

module.exports = { handler, signatureParts, verifySanitySignature };
