const assert = require("assert");
const crypto = require("crypto");
const { handler, verifySanitySignature } = require("../netlify/functions/sanity-build-hook");

async function run() {
  const originalSecret = process.env.SANITY_WEBHOOK_SECRET;
  const originalHook = process.env.NETLIFY_BUILD_HOOK_URL;
  const originalFetch = global.fetch;
  const secret = "test-secret-with-at-least-32-characters";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ _id: "post-1", _type: "post", slug: "chronic-pain" });
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  const header = `t=${timestamp},v1=${signature}`;

  assert.strictEqual(verifySanitySignature(body, header, secret), true);
  assert.strictEqual(verifySanitySignature(body, header, "wrong-secret"), false);
  assert.strictEqual(verifySanitySignature(body, `t=${timestamp - 600},v1=${signature}`, secret), false);

  process.env.SANITY_WEBHOOK_SECRET = secret;
  process.env.NETLIFY_BUILD_HOOK_URL = "https://api.netlify.com/build_hooks/test";
  let called = 0;
  global.fetch = async (url, options) => {
    called += 1;
    assert.strictEqual(url, process.env.NETLIFY_BUILD_HOOK_URL);
    assert.strictEqual(options.method, "POST");
    return { ok: true, status: 200 };
  };

  const accepted = await handler({
    httpMethod: "POST",
    body,
    headers: { "sanity-webhook-signature": header, "idempotency-key": "delivery-1" }
  });
  assert.strictEqual(accepted.statusCode, 202);
  assert.strictEqual(JSON.parse(accepted.body).status, "build_triggered");
  assert.strictEqual(called, 1);

  const rejected = await handler({ httpMethod: "POST", body, headers: { "sanity-webhook-signature": "invalid" } });
  assert.strictEqual(rejected.statusCode, 401);
  assert.strictEqual(called, 1);

  if (originalSecret === undefined) delete process.env.SANITY_WEBHOOK_SECRET;
  else process.env.SANITY_WEBHOOK_SECRET = originalSecret;
  if (originalHook === undefined) delete process.env.NETLIFY_BUILD_HOOK_URL;
  else process.env.NETLIFY_BUILD_HOOK_URL = originalHook;
  global.fetch = originalFetch;
  console.log("sanity-build-hook tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
