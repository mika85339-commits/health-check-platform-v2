const assert = require("assert");
const { encodeSignatureHeader, SIGNATURE_HEADER_NAME } = require("@sanity/webhook");
const { claimWebhookDelivery, createHandler } = require("../netlify/functions/sanity-build-hook");

function signedEvent(payload, secret, options = {}) {
  const body = options.body || JSON.stringify(payload);
  const timestamp = options.timestamp || Date.now();
  const signature = encodeSignatureHeader(body, timestamp, secret);
  return {
    httpMethod: options.method || "POST",
    body: options.base64 ? Buffer.from(body).toString("base64") : body,
    isBase64Encoded: Boolean(options.base64),
    headers: {
      [SIGNATURE_HEADER_NAME]: signature,
      "sanity-dataset": options.dataset || "production",
      "sanity-transaction-id": options.transactionId || "transaction-1",
      "idempotency-key": options.idempotencyKey || "delivery-1",
      ...options.headers
    }
  };
}

function createMemoryStore() {
  const entries = new Map();
  let deletes = 0;
  const store = {
    async set(key, value, options) {
      assert.deepStrictEqual(options, { onlyIfNew: true });
      if (entries.has(key)) return { modified: false };
      entries.set(key, value);
      return { modified: true, etag: `"entry-${entries.size}"` };
    },
    async delete(key) {
      deletes += 1;
      entries.delete(key);
    }
  };
  return { store, entries, get deletes() { return deletes; } };
}

async function run() {
  const originalSecret = process.env.SANITY_WEBHOOK_SECRET;
  const originalHook = process.env.NETLIFY_BUILD_HOOK_URL;
  const originalDataset = process.env.SANITY_DATASET;
  const secret = "test-secret-with-at-least-32-characters";
  const payload = { _id: "post-1", _type: "post", slug: "chronic-pain", operation: "update", dataset: "production" };

  process.env.SANITY_WEBHOOK_SECRET = secret;
  process.env.NETLIFY_BUILD_HOOK_URL = "https://api.netlify.com/build_hooks/test";
  process.env.SANITY_DATASET = "production";
  let called = 0;
  const memory = createMemoryStore();
  const claimDelivery = (key, metadata) => claimWebhookDelivery(key, metadata, () => memory.store);
  let fetchResult = { ok: true, status: 200 };
  let fetchError = null;
  let lastBuildHookPayload = null;
  const fetchImpl = async (url, options) => {
    called += 1;
    assert.strictEqual(url, process.env.NETLIFY_BUILD_HOOK_URL);
    assert.strictEqual(options.method, "POST");
    lastBuildHookPayload = JSON.parse(options.body);
    if (fetchError) throw fetchError;
    return fetchResult;
  };
  const handler = createHandler({ fetchImpl, claimDelivery });

  const accepted = await handler(signedEvent(payload, secret));
  assert.strictEqual(accepted.statusCode, 200);
  assert.strictEqual(JSON.parse(accepted.body).status, "build_triggered");
  assert.strictEqual(called, 1);
  assert.strictEqual(lastBuildHookPayload.documentId, payload._id);
  assert.strictEqual(lastBuildHookPayload.slug, payload.slug);
  assert.strictEqual(lastBuildHookPayload.operation, payload.operation);

  const wrongSecret = await handler(signedEvent(payload, "wrong-secret-with-at-least-32-characters", { idempotencyKey: "delivery-wrong-secret" }));
  assert.strictEqual(wrongSecret.statusCode, 401);
  assert.strictEqual(called, 1);

  const tampered = signedEvent(payload, secret, { idempotencyKey: "delivery-tampered" });
  tampered.body = JSON.stringify({ ...payload, slug: "tampered" });
  const tamperedResponse = await handler(tampered);
  assert.strictEqual(tamperedResponse.statusCode, 401);
  assert.strictEqual(called, 1);

  const unsigned = signedEvent(payload, secret, { idempotencyKey: "delivery-unsigned" });
  delete unsigned.headers[SIGNATURE_HEADER_NAME];
  const unsignedResponse = await handler(unsigned);
  assert.strictEqual(unsignedResponse.statusCode, 401);
  assert.strictEqual(called, 1);

  const base64Payload = { ...payload, _id: "post-base64", slug: "base64-post" };
  const base64Accepted = await handler(signedEvent(base64Payload, secret, { base64: true, idempotencyKey: "delivery-base64" }));
  assert.strictEqual(base64Accepted.statusCode, 200);
  assert.strictEqual(JSON.parse(base64Accepted.body).status, "build_triggered");
  assert.strictEqual(called, 2);

  const duplicate = await handler(signedEvent(payload, secret));
  assert.deepStrictEqual(JSON.parse(duplicate.body), { status: "ignored", reason: "duplicate_delivery" });
  assert.strictEqual(called, 2);

  const differentKey = await handler(signedEvent({ ...payload, _id: "post-distinct" }, secret, { idempotencyKey: "delivery-distinct" }));
  assert.strictEqual(differentKey.statusCode, 200);
  assert.strictEqual(JSON.parse(differentKey.body).status, "build_triggered");
  assert.strictEqual(called, 3);

  const rejected = await handler({ ...signedEvent(payload, secret), headers: { [SIGNATURE_HEADER_NAME]: "invalid" } });
  assert.strictEqual(rejected.statusCode, 401);
  assert.strictEqual(called, 3);

  const wrongDataset = await handler(signedEvent({ ...payload, dataset: "staging" }, secret, { dataset: "staging", idempotencyKey: "delivery-2" }));
  assert.deepStrictEqual(JSON.parse(wrongDataset.body), { status: "ignored", reason: "unsupported_dataset" });

  const unsupportedType = await handler(signedEvent({ ...payload, _type: "evidenceStudy" }, secret, { idempotencyKey: "delivery-3" }));
  assert.deepStrictEqual(JSON.parse(unsupportedType.body), { status: "ignored", reason: "unsupported_document_type" });

  for (const id of ["drafts.post-1", "versions.release-1.post-1"]) {
    const preview = await handler(signedEvent({ ...payload, _id: id }, secret, { idempotencyKey: `delivery-${id}` }));
    assert.deepStrictEqual(JSON.parse(preview.body), { status: "ignored", reason: "preview_document" });
  }

  const invalidPayload = await handler(signedEvent({ _id: "post-2", _type: "post", dataset: "production" }, secret, { idempotencyKey: "delivery-4" }));
  assert.strictEqual(invalidPayload.statusCode, 400);
  assert.strictEqual(JSON.parse(invalidPayload.body).error, "invalid_payload");

  const missingIdempotency = signedEvent(payload, secret, { idempotencyKey: "delivery-5" });
  delete missingIdempotency.headers["idempotency-key"];
  const missingIdempotencyResponse = await handler(missingIdempotency);
  assert.strictEqual(missingIdempotencyResponse.statusCode, 400);
  assert.strictEqual(JSON.parse(missingIdempotencyResponse.body).error, "missing_idempotency_key");

  for (const operation of ["create", "update", "delete"]) {
    const event = signedEvent({ ...payload, _id: `post-${operation}`, operation }, secret, {
      idempotencyKey: `delivery-${operation}`,
      base64: operation === "delete"
    });
    const result = await handler(event);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(JSON.parse(result.body).status, "build_triggered");
  }

  const unavailableHandler = createHandler({
    fetchImpl,
    claimDelivery: async () => {
      const error = new Error("temporary blobs failure");
      error.name = "BlobsInternalError";
      error.code = "BLOBS_TEMPORARY_FAILURE";
      throw error;
    }
  });
  const unavailable = await unavailableHandler(signedEvent({ ...payload, _id: "post-blobs-unavailable" }, secret, {
    idempotencyKey: "delivery-blobs-unavailable"
  }));
  assert.strictEqual(unavailable.statusCode, 503);
  assert.strictEqual(JSON.parse(unavailable.body).error, "deduplication_unavailable");
  assert.strictEqual(called, 6);

  fetchResult = { ok: false, status: 500 };
  const failedEvent = signedEvent({ ...payload, _id: "post-failed" }, secret, { idempotencyKey: "delivery-failed" });
  const failedHook = await handler(failedEvent);
  assert.strictEqual(failedHook.statusCode, 502);
  assert.strictEqual(memory.deletes, 1);

  fetchResult = { ok: true, status: 200 };
  const retriedHook = await handler(failedEvent);
  assert.strictEqual(retriedHook.statusCode, 200);
  assert.strictEqual(JSON.parse(retriedHook.body).status, "build_triggered");

  fetchError = new Error("network failure");
  const thrownHook = await handler(signedEvent({ ...payload, _id: "post-thrown" }, secret, { idempotencyKey: "delivery-thrown" }));
  assert.strictEqual(thrownHook.statusCode, 502);
  assert.strictEqual(memory.deletes, 2);

  if (originalSecret === undefined) delete process.env.SANITY_WEBHOOK_SECRET;
  else process.env.SANITY_WEBHOOK_SECRET = originalSecret;
  if (originalHook === undefined) delete process.env.NETLIFY_BUILD_HOOK_URL;
  else process.env.NETLIFY_BUILD_HOOK_URL = originalHook;
  if (originalDataset === undefined) delete process.env.SANITY_DATASET;
  else process.env.SANITY_DATASET = originalDataset;
  console.log("sanity-build-hook tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
