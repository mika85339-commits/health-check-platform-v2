const crypto = require("crypto");
const { isValidSignature, SIGNATURE_HEADER_NAME } = require("@sanity/webhook");

const SUPPORTED_OPERATIONS = new Set(["create", "update", "delete"]);
const DELIVERY_STORE = "sanity-build-hook-deliveries";

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

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function signatureHeader(headers = {}) {
  return headers[SIGNATURE_HEADER_NAME] || normalizeHeaders(headers)[SIGNATURE_HEADER_NAME] || "";
}

function isNetlifyBuildHookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.netlify.com" && url.pathname.startsWith("/build_hooks/");
  } catch (_) {
    return false;
  }
}

function documentIdIsPreview(id) {
  return String(id || "").startsWith("drafts.") || String(id || "").startsWith("versions.");
}

function deliveryKey(idempotencyKey) {
  return `delivery-${crypto.createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

function log(level, event, details = {}) {
  const logger = console[level] || console.log;
  logger(`[sanity-build-hook] ${JSON.stringify({ event, ...details })}`);
}

async function claimWebhookDelivery(key, metadata) {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore(DELIVERY_STORE);
  const result = await store.setJSON(key, metadata, { onlyIfNew: true });
  return {
    claimed: result.modified,
    release: async () => {
      if (result.modified) await store.delete(key);
    }
  };
}

function createHandler({ fetchImpl = (...args) => fetch(...args), claimDelivery = claimWebhookDelivery, validateSignature = isValidSignature } = {}) {
  return async function handler(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

    const secret = process.env.SANITY_WEBHOOK_SECRET;
    const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
    const expectedDataset = process.env.SANITY_DATASET || "production";
    if (!secret || !buildHookUrl || !isNetlifyBuildHookUrl(buildHookUrl)) {
      log("error", "configuration_error", { hasSecret: Boolean(secret), hasValidBuildHook: isNetlifyBuildHookUrl(buildHookUrl) });
      return json(503, { error: "webhook_not_configured" });
    }

    const body = rawBody(event);
    const signature = signatureHeader(event.headers);
    if (!(await validateSignature(body, signature, secret))) {
      log("warn", "request_rejected", { reason: "invalid_signature" });
      return json(401, { error: "invalid_signature" });
    }

    const headers = normalizeHeaders(event.headers);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (_) {
      return json(400, { error: "invalid_json" });
    }

    const dataset = payload?.dataset || headers["sanity-dataset"] || "";
    if (dataset !== expectedDataset) {
      log("info", "request_ignored", { reason: "unsupported_dataset", dataset });
      return json(202, { status: "ignored", reason: "unsupported_dataset" });
    }

    if (!payload?._id || !payload?._type || !SUPPORTED_OPERATIONS.has(payload?.operation)) {
      return json(400, { error: "invalid_payload" });
    }

    if (payload._type !== "post") {
      return json(202, { status: "ignored", reason: "unsupported_document_type" });
    }

    if (documentIdIsPreview(payload._id)) {
      return json(202, { status: "ignored", reason: "preview_document" });
    }

    const idempotencyKey = String(headers["idempotency-key"] || "").trim();
    if (!idempotencyKey) return json(400, { error: "missing_idempotency_key" });

    const key = deliveryKey(idempotencyKey);
    let claim;
    try {
      claim = await claimDelivery(key, {
        documentId: payload._id,
        operation: payload.operation,
        dataset,
        receivedAt: new Date().toISOString()
      });
    } catch (error) {
      log("error", "deduplication_error", { message: error.message });
      return json(503, { error: "deduplication_unavailable" });
    }

    if (!claim.claimed) {
      log("info", "request_ignored", { reason: "duplicate_delivery", documentId: payload._id, operation: payload.operation });
      return json(202, { status: "ignored", reason: "duplicate_delivery" });
    }

    let response;
    try {
      response = await fetchImpl(buildHookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "sanity",
          documentId: payload._id,
          documentType: payload._type,
          operation: payload.operation,
          dataset,
          slug: typeof payload.slug === "string" ? payload.slug : payload?.slug?.current || "",
          transactionId: headers["sanity-transaction-id"] || "",
          idempotencyKey
        })
      });
    } catch (error) {
      await claim.release().catch((releaseError) => log("error", "deduplication_release_error", { message: releaseError.message }));
      log("error", "build_hook_error", { documentId: payload._id, operation: payload.operation, message: error.message });
      return json(502, { error: "netlify_build_hook_failed" });
    }

    if (!response.ok) {
      await claim.release().catch((error) => log("error", "deduplication_release_error", { message: error.message }));
      log("error", "build_hook_rejected", { documentId: payload._id, operation: payload.operation, status: response.status });
      return json(502, { error: "netlify_build_hook_failed", status: response.status });
    }

    log("info", "build_triggered", { documentId: payload._id, operation: payload.operation, dataset });
    return json(202, { status: "build_triggered" });
  };
}

const handler = createHandler();

module.exports = {
  handler,
  createHandler,
  deliveryKey,
  isNetlifyBuildHookUrl,
  rawBody,
  signatureHeader
};
