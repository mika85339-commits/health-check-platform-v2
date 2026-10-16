import assert from "node:assert/strict";
import crypto from "node:crypto";
import { googleReadDiagnostics } from "../netlify/lib/google-read-diagnostics.mjs";
import handler from "../netlify/functions/weekly-analytics-data.mjs";

const privateKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
const env = { GA4_PROPERTY_ID: "559060240", GA_MEASUREMENT_ID: "G-PWV5LBJEQ7", GA4_HOST_NAME: "health-check-platform-v2.netlify.app", GA4_CUTOVER_AT: "2026-10-16T02:01:16.899Z",
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify({ client_email: "hariplus-seo-reader@hariplus-seo-analytics.iam.gserviceaccount.com", project_id: "hariplus-seo-analytics", private_key: privateKey })).toString("base64") };
const fakeToken = "synthetic-access-token-must-never-escape";
const rawMessage = "provider-message-must-never-escape";
function mock(adminStatus = 200, dataStatus = 200, reason = "SERVICE_DISABLED") {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method || "GET" });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: fakeToken });
    assert(options.headers.Authorization === `Bearer ${fakeToken}`);
    const admin = url.startsWith("https://analyticsadmin.googleapis.com/");
    assert(admin || url.startsWith("https://analyticsdata.googleapis.com/"));
    const status = admin ? adminStatus : dataStatus;
    if (status !== 200) return Response.json({ error: { message: rawMessage, details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, metadata: { service: admin ? "analyticsadmin.googleapis.com" : "analyticsdata.googleapis.com", consumer: "projects/123456789", forbidden: privateKey } }] } }, { status });
    if (admin) return Response.json({ name: "properties/559060240", timeZone: "Asia/Tokyo" });
    const request = JSON.parse(options.body);
    assert.equal(request.dimensionFilter.filter.fieldName, "hostName");
    return Response.json({ rows: [], rowCount: 0 });
  } };
}
for (const [adminStatus, dataStatus, reason] of [[200,200,""],[403,200,"SERVICE_DISABLED"],[200,403,"ACCESS_TOKEN_SCOPE_INSUFFICIENT"],[403,403,"USER_PERMISSION_DENIED"]]) {
  const deps = mock(adminStatus, dataStatus, reason);
  const report = await googleReadDiagnostics({ env, fetchImpl: deps.fetchImpl });
  assert.equal(report.checks[1].operation, "analyticsadmin.properties.get");
  assert.equal(report.checks[1].http_status, adminStatus);
  assert.equal(report.checks[2].http_status, dataStatus);
  assert.equal(report.expected_account_matches, true);
  assert.equal(report.cloud_project, "hariplus-seo-analytics");
  assert.equal(report.cutover_at, env.GA4_CUTOVER_AT);
  assert.equal(report.data_state, dataStatus === 200 ? "no_rows" : "unavailable");
  assert.equal(report.state, adminStatus === 200 && dataStatus === 200 ? "connected" : "connection_error");
  for (const forbidden of [privateKey, env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, fakeToken, rawMessage, "Authorization", "forbidden"]) assert(!JSON.stringify(report).includes(forbidden));
  assert.equal(deps.calls.length, 3);
  if (reason === "SERVICE_DISABLED") assert.equal(report.checks[1].classification, "api_disabled");
  if (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") assert.equal(report.checks[2].classification, "oauth_scope_insufficient");
}
const rejected = mock();
assert.equal((await googleReadDiagnostics({ env: { ...env, GA4_PROPERTY_ID: "different" }, fetchImpl: rejected.fetchImpl })).state,"configuration_mismatch");
assert.equal(rejected.calls.length, 0);
assert.equal((await handler(new Request("https://example.test/api/admin/weekly-analytics?google_connection_check=1"))).status,401);
console.log("Google read diagnostics: API classification, empty rows, secret redaction and authentication passed.");
