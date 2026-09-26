import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bearerIsAuthorized,
  createSessionToken,
  hashPassword,
  sessionCookie,
  verifyPassword,
  verifySessionToken
} from "../netlify/lib/weekly-analytics-auth.mjs";
import {
  publicSnapshot,
  snapshotToWeek,
  upsertSnapshot
} from "../netlify/lib/weekly-analytics-store.mjs";
import dataHandler from "../netlify/functions/weekly-analytics-data.mjs";
import reportHandler from "../netlify/functions/weekly-analytics-report.mjs";
import adminHandler from "../netlify/functions/weekly-analytics-admin.mjs";
import loginHandler from "../netlify/functions/weekly-analytics-login.mjs";
import logoutHandler from "../netlify/functions/weekly-analytics-logout.mjs";
import { config as scheduleConfig } from "../netlify/functions/weekly-analytics-scheduled.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = "session-secret-for-tests-only-32-bytes";
const token = createSessionToken(secret, { now: 1_000_000, ttlSeconds: 60 });
assert.equal(verifySessionToken(token, secret, { now: 1_030_000 }), true);
assert.equal(verifySessionToken(token, secret, { now: 1_061_000 }), false);
assert.equal(verifySessionToken(`${token}x`, secret, { now: 1_030_000 }), false);
assert(sessionCookie(token).includes("HttpOnly"));
assert(sessionCookie(token).includes("Secure"));
assert(sessionCookie(token).includes("SameSite=Strict"));

const passwordHash = hashPassword("a-long-production-style-password", Buffer.alloc(16, 7));
assert.equal(verifyPassword("a-long-production-style-password", passwordHash), true);
assert.equal(verifyPassword("wrong-password-value", passwordHash), false);

process.env.WEEKLY_ANALYTICS_ADMIN_PASSWORD_HASH = passwordHash;
process.env.WEEKLY_ANALYTICS_SESSION_SECRET = secret;
const loginResponse = await loginHandler(new Request("https://example.test/admin/weekly-analytics/login/", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://example.test" },
  body: new URLSearchParams({ password: "a-long-production-style-password" })
}));
assert.equal(loginResponse.status, 303);
const setCookie = loginResponse.headers.get("set-cookie");
assert(setCookie?.includes("HttpOnly"));
const adminResponse = await adminHandler(new Request("https://example.test/admin/weekly-analytics/", {
  headers: { Cookie: setCookie.split(";")[0] }
}));
assert.equal(adminResponse.status, 200);
const adminHtml = await adminResponse.text();
assert(adminHtml.includes("/admin/weekly-analytics-assets/dashboard.js"));
assert(!adminHtml.includes("weekly-analytics.json"));
const logoutResponse = await logoutHandler(new Request("https://example.test/admin/weekly-analytics/logout/", { method: "POST" }));
assert.equal(logoutResponse.status, 303);
assert(logoutResponse.headers.get("set-cookie")?.includes("Max-Age=0"));
delete process.env.WEEKLY_ANALYTICS_ADMIN_PASSWORD_HASH;
delete process.env.WEEKLY_ANALYTICS_SESSION_SECRET;

const bearerRequest = new Request("https://example.test/api/weekly-report", {
  headers: { Authorization: "Bearer read-only-token" }
});
assert.equal(bearerIsAuthorized(bearerRequest, { WEEKLY_ANALYTICS_READ_TOKEN: "read-only-token" }), true);
assert.equal(bearerIsAuthorized(bearerRequest, { WEEKLY_ANALYTICS_READ_TOKEN: "different" }), false);

const unauthorizedData = await dataHandler(new Request("https://example.test/api/admin/weekly-analytics"));
assert.equal(unauthorizedData.status, 401);
const unauthorizedReport = await reportHandler(new Request("https://example.test/api/weekly-report"));
assert.equal(unauthorizedReport.status, 401);
assert.equal(scheduleConfig.schedule, "0 0 * * 1");

const snapshot = {
  week_start: "2026-09-14",
  week_end: "2026-09-20",
  generated_at: "2026-09-21T00:00:00.000Z",
  schema_version: 2,
  data_state: "complete_with_search_lag",
  report_timezone: "Asia/Tokyo",
  users: 15,
  sessions: 49,
  views: 444,
  organic_sessions: 1,
  search_impressions: 4,
  search_clicks: 1,
  search_ctr: 0.25,
  search_position: 8,
  search_actual_start: "2026-09-14",
  search_actual_end: "2026-09-18",
  diagnosis_start_events: 136,
  diagnosis_start_unique_sessions: 10,
  diagnosis_start_unique_users_equivalent: 6,
  diagnosis_complete_events: 30,
  diagnosis_complete_unique_sessions: 5,
  diagnosis_complete_unique_users_equivalent: 5,
  diagnosis_event_completion_rate: 30 / 136,
  diagnosis_unique_session_completion_rate: 0.5,
  records: 32,
  retry_count: 2,
  ad_impressions: 4,
  ad_clicks: 1,
  ad_ctr: 0.25,
  ad_data_state: "reference_accumulating",
  top_articles: [{ title: "Test", path: "/health-library/test/", views: 2 }],
  top_body_parts: [{ body_part: "neck", count: 3 }],
  top_regions: [],
  sponsor_breakdown: [],
  source_periods: { search_console: { requested_start: "2026-09-14", requested_end: "2026-09-20" } },
  source_status: { ga4: "real", search_console: "real", sponsor_db: "real", diagnosis_db: "real", sanity: "real" }
};

let capturedRequest;
const stored = await upsertSnapshot(snapshot, {
  env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only" },
  fetchImpl: async (url, options) => {
    capturedRequest = { url: String(url), options };
    return new Response(JSON.stringify([{ ...snapshot, snapshot_id: 1 }]), { status: 201 });
  }
});
assert.equal(stored.snapshot_id, 1);
assert(capturedRequest.url.includes("on_conflict=week_start,week_end"));
assert.equal(capturedRequest.options.headers.Prefer, "resolution=merge-duplicates,return=representation");
assert(!capturedRequest.options.body.includes("anonymous_session_id"));
assert(!capturedRequest.options.body.includes("server-only"));

const week = snapshotToWeek(snapshot);
assert.equal(week.week.start_date, "2026-09-14");
assert.equal(week.diagnosis.start_unique_sessions, 10);
assert.equal(week.search_console.actual_data_end, "2026-09-18");
assert.equal(week.articles[0].url, "https://health-check-platform-v2.netlify.app/health-library/test/");
assert(!Object.hasOwn(publicSnapshot({ ...snapshot, private_value: "no" }), "private_value"));

const migration = fs.readFileSync(path.join(root, "supabase-weekly-analytics-phase2a.sql"), "utf8");
[
  "weekly_metric_snapshots", "analytics_event_exclusions", "schema_version", "data_state",
  "diagnosis_start_unique_sessions", "diagnosis_complete_unique_sessions",
  "diagnosis_event_completion_rate", "diagnosis_unique_session_completion_rate",
  "search_actual_start", "search_actual_end", "ad_data_state"
].forEach((field) => assert(migration.includes(field), `Production migration is missing ${field}.`));
assert(!/delete\s+from\s+public\.(sponsor|muscle_diagnosis|anonymous_diagnosis)/i.test(migration));

const buildSource = fs.readFileSync(path.join(root, "scripts", "netlify-build.js"), "utf8");
assert(buildSource.includes('["dashboard.css", "dashboard-model.js", "dashboard.js"]'));
assert(!buildSource.includes("weekly-analytics.json"));
const dashboardSource = fs.readFileSync(path.join(root, "admin", "weekly-analytics", "dashboard.js"), "utf8");
assert(dashboardSource.includes("/api/admin/weekly-analytics"));
assert(!dashboardSource.includes("WEEKLY_ANALYTICS_READ_TOKEN"));

console.log("Weekly analytics production tests passed: authentication, aggregate-only API boundary, idempotent upsert, and schedule.");
