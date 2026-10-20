import assert from "node:assert/strict";
import { mergeSnapshotsWithCurrent } from "../netlify/lib/weekly-analytics-store.mjs";
import model from "../admin/weekly-analytics/dashboard-model.js";

// Synthetic observations reproducing the reviewed 16/6 -> 18/6 case. No network/DB.
const identity = { property_id: "559060240", measurement_id: "G-PWV5LBJEQ7",
  host_name: "health-check-platform-v2.netlify.app", state: "cutover_period", cutover_at: "2026-10-16T02:01:16.899Z" };
const coverage = { confirmed_through: "2026-10-17", method: "latest_final_date_lower_bound", fetched_at: "2026-10-20T01:42:56Z" };
const snapshot = { week_start: "2026-10-12", week_end: "2026-10-18", generated_at: "2026-10-19T00:01:14Z",
  schema_version: 2, data_state: "partial_ga4_migration", search_impressions: 16, search_clicks: 6,
  search_actual_start: "2026-10-13", search_actual_end: "2026-10-16", organic_sessions: null,
  source_status: { ga4: "real", search_console: "real", diagnosis_db: "real", sponsor_db: "real" },
  source_periods: { ga4: { measurement_source: identity }, search_console: { coverage: { ...coverage, confirmed_through: "2026-10-16", fetched_at: "2026-10-19T00:01:12Z" } } } };
const fresh = { week: { start_date: "2026-10-12", end_date: "2026-10-18", is_current: false },
  ga4: { measurement_source: identity, organic_search_sessions: 1 },
  search_console: { impressions: 18, clicks: 6, actual_data_start: "2026-10-13", actual_data_end: "2026-10-17", coverage },
  growth: { organic_users: 1, article_transitions: 1, pages: [{ url: "https://example.test/article/", start_events: null }] } };
const live = { generated_at: "2026-10-20T01:43:02Z", source_audit: { sources: { ga4: { state: "real", fetched_at: "2026-10-20T01:43:02Z" }, search_console: { state: "real" } } },
  weeks: [fresh, { ...structuredClone(fresh), week: { start_date: "2026-10-19", end_date: "2026-10-25", is_current: true } }] };
const before = JSON.stringify({ snapshot, live });
const merged = mergeSnapshotsWithCurrent(live, [snapshot]);
assert.equal(JSON.stringify({ snapshot, live }), before, "Reads must not mutate saved or live input.");
const view = model.buildView(merged, { period: "previous" });
const [saved, refreshed] = view.data_versions;
assert.equal(view.current.search_impressions, 16);
assert.equal(view.current.organic_users, null, "No later GA4 value may fill a saved gap.");
assert.deepEqual(view.landing_pages, []);
assert.equal(saved.summary.search_impressions, 16);
assert.equal(refreshed.summary.search_impressions, 18);
assert.equal(saved.summary.search_clicks, 6);
assert.equal(refreshed.summary.search_clicks, 6);
assert.equal(saved.saved_at, snapshot.generated_at);
assert.equal(saved.fetched_at, null, "Save time must not be invented as acquisition time.");
assert.equal(refreshed.fetched_at, live.generated_at);
assert.equal(saved.actual_end, "2026-10-16");
assert.equal(refreshed.actual_end, "2026-10-17");
assert.equal(refreshed.confirmed_through, "2026-10-17");
assert.equal(refreshed.coverage_ready, false);
assert.equal(view.source_periods.ga4.fetched_at, null, "Current connection timestamps must not label saved values.");
assert.equal(model.comparisonAllowed("users", [merged.weeks[0]], [merged.weeks[0]]), false);
const complete = structuredClone(fresh);
complete.search_console.actual_data_end = "2026-10-15";
complete.search_console.coverage.confirmed_through = "2026-10-18";
const completeVersion = model.dataVersions({ generated_at: live.generated_at }, [complete])[0];
assert.equal(completeVersion.actual_end, "2026-10-15");
assert.equal(completeVersion.coverage_ready, true, "No-traffic dates and finalization are distinct.");
for (const value of [null, 0]) {
  const observation = structuredClone(fresh);
  observation.search_console.impressions = value;
  observation.search_console.clicks = value;
  const version = model.dataVersions({ generated_at: live.generated_at }, [observation])[0];
  assert.equal(version.summary.search_impressions, value, "No rows must stay null; returned zero must stay zero.");
}
const legacy = structuredClone(snapshot);
delete legacy.source_periods;
delete legacy.source_status;
delete legacy.generated_at;
const legacyView = model.buildView(mergeSnapshotsWithCurrent(live, [legacy]), { period: "previous" });
assert.equal(legacyView.current.search_impressions, 16);
assert.equal(legacyView.data_versions[0].saved_at, null);
assert.equal(legacyView.data_versions[0].ga4_source.property_id, null);
assert.equal(legacyView.data_versions[0].coverage_ready, false);
const failedLive = structuredClone(live);
failedLive.source_audit.sources.search_console = { state: "error", reason: "unavailable" };
failedLive.weeks[0].search_console = {};
const failed = model.buildView(mergeSnapshotsWithCurrent(failedLive, [snapshot]), { period: "previous" });
assert.equal(failed.current.search_impressions, 16, "Failed refresh must not erase saved history.");
assert.equal(failed.data_versions[1].summary.search_impressions, null);
console.log("Weekly data provenance regression passed: immutable 16/6 and 18/6, source times, finalization, missing/zero, migration, legacy and failed refresh.");
export { live, snapshot };
