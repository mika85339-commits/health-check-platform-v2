import fs from "node:fs";
import sources from "../../scripts/weekly-analytics-sources.js";

const REASONS = new Set(["SERVICE_DISABLED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "USER_PERMISSION_DENIED", "IAM_PERMISSION_DENIED", "PERMISSION_DENIED", "CONSUMER_INVALID", "RATE_LIMIT_EXCEEDED"]);

// Only called after the existing administrator session check. Never return raw
// provider messages, request headers, credentials, tokens or API response bodies.
export async function googleReadDiagnostics({ env = process.env, fetchImpl = fetch } = {}) {
  const result = {
    checked_at: new Date().toISOString(), read_only: true,
    property_id: String(env.GA4_PROPERTY_ID || "").replace(/^properties\//, ""),
    measurement_id: env.GA_MEASUREMENT_ID || null,
    host_filter: env.GA4_HOST_NAME || null,
    cutover_at: env.GA4_CUTOVER_AT || null,
    scopes: sources.GOOGLE_READ_SCOPES, checks: []
  };
  if (result.property_id !== "559060240" || result.measurement_id !== "G-PWV5LBJEQ7" || result.host_filter !== "health-check-platform-v2.netlify.app") {
    return { ...result, state: "configuration_mismatch" };
  }
  let account;
  try {
    account = sources.loadServiceAccount(env);
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
      ? JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"))
      : JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    result.service_account = account.client_email;
    result.cloud_project = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(raw.project_id || "") ? raw.project_id : null;
    result.expected_account_matches = account.client_email === "hariplus-seo-reader@hariplus-seo-analytics.iam.gserviceaccount.com";
  } catch { return { ...result, state: "credential_unavailable" }; }
  let operation = "oauth_token";
  const monitoredFetch = async (url, options) => {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(20000) });
    const check = { operation, http_status: response.status };
    if (!response.ok) {
      let body;
      try { body = await response.clone().json(); } catch { /* no raw body */ }
      const info = (body?.error?.details || []).find(item => item?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo");
      check.reason = REASONS.has(info?.reason) ? info.reason : "unclassified";
      if (["analyticsadmin.googleapis.com", "analyticsdata.googleapis.com"].includes(info?.metadata?.service)) check.service = info.metadata.service;
      if (/^projects\/\d+$/.test(info?.metadata?.consumer || "")) check.consumer_project = info.metadata.consumer;
      check.classification = check.reason === "SERVICE_DISABLED" ? "api_disabled"
        : check.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ? "oauth_scope_insufficient"
        : operation === "oauth_token" ? "authentication_failed"
        : response.status === 403 ? "property_access_denied_or_property_not_accessible" : "api_request_failed";
    }
    result.checks.push(check);
    return response;
  };
  let token;
  try { token = await sources.createGoogleAccessToken(account, { fetchImpl: monitoredFetch }); }
  catch { return { ...result, state: "authentication_failed" }; }
  operation = "analyticsadmin.properties.get";
  try {
    const property = await sources.getGa4Property(result.property_id, token, monitoredFetch);
    result.property_timezone = property.timeZone || null;
  } catch { /* safe response status already captured */ }
  operation = "analyticsdata.runReport";
  try {
    const rows = await sources.runGa4Report(result.property_id, token, sources.healthCheckGa4Request(result.host_filter, {
      dateRanges: [{ startDate: "yesterday", endDate: "today" }], metrics: [{ name: "sessions" }]
    }), monitoredFetch);
    result.data_state = rows.length ? "rows_returned" : "no_rows";
    result.row_count = rows.length;
  } catch { result.data_state = "unavailable"; }
  result.state = result.checks.length === 3 && result.checks.every(check => check.http_status === 200) ? "connected" : "connection_error";
  return result;
}
