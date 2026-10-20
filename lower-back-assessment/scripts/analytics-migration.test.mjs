import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sources from "./weekly-analytics-sources.js";
import analytics from "./weekly-analytics.js";
import model from "../admin/weekly-analytics/dashboard-model.js";
import { snapshotToWeek, mergeSnapshotsWithCurrent, upsertSnapshot } from "../netlify/lib/weekly-analytics-store.mjs";
import preflight from "./search-growth-preflight.js";
import tagConfig from "./analytics-config.js";

assert.equal(model.normalizeDiagnosisPart("首"), "neck");
assert.equal(model.normalizeDiagnosisPart("lowback"), "lowback");
assert.equal(model.normalizeDiagnosisPart("lower-back"), "lowback");
assert.equal(model.normalizeDiagnosisPart("すね・ふくらはぎ"), "lowerleg");
assert.equal(model.normalizeDiagnosisPart(""), "unknown");
assert.equal(model.normalizeDiagnosisPart("unrecognized"), "unknown");
assert.equal(model.normalizeDiagnosisPart("constructor"), "unknown");
assert.equal(model.normalizeDiagnosisPart("__proto__"), "unknown");
const historicalParts = model.aggregateBodyParts([{ diagnosis: { body_parts: { "首": 3, neck: 2, "": 4, unknown: 1 } } }]);
assert.equal(historicalParts.find(p => p.id === "neck").count, 5);
assert.equal(historicalParts.find(p => p.id === "unknown").count, 5, "Missing historical regions are never guessed or backfilled.");

assert.equal(tagConfig.resolveGaMeasurementId({ GA_MEASUREMENT_ID: "G-PWV5LBJEQ7", GA4_PROPERTY_ID: "559060240" }), "G-PWV5LBJEQ7");
assert.throws(() => tagConfig.resolveGaMeasurementId({ GA_MEASUREMENT_ID: "G-PWV5LBJEQ7" }));
assert.throws(() => tagConfig.resolveGaMeasurementId({ GA4_PROPERTY_ID: "559060240" }));

// CI runs after build: validate the actual deployable files, not just the template.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
let htmlPages = 0;
function inspectBuiltTags(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { inspectBuiltTags(file); continue; }
    if (!/\.(html|js|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (process.env.GA_MEASUREMENT_ID === "G-PWV5LBJEQ7") assert(!text.includes("G-CV0J8DWSVF"), `Old Google tag remains in ${path.relative(dist, file)}.`);
    if (!file.endsWith(".html")) continue;
    htmlPages++;
    assert((text.match(/<script[^>]+src=["'][^"']*analytics-bootstrap\.js/g) || []).length <= 1, `Duplicate bootstrap in ${file}.`);
    assert(!/gtag\s*\(\s*["']config["']|GTM-[A-Z0-9]+|googletagmanager\.com\/gtag\/js/.test(text), `Additional Google tag in ${file}.`);
  }
}
if (fs.existsSync(dist)) {
  inspectBuiltTags(dist);
  assert(htmlPages > 0);
  if (process.env.GA_MEASUREMENT_ID === "G-PWV5LBJEQ7") {
    assert(fs.readFileSync(path.join(dist, "analytics-bootstrap.js"), "utf8").includes("G-PWV5LBJEQ7"));
    assert(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dist, "site-config.json"), "utf8"))).includes("G-PWV5LBJEQ7"));
  }
}

const config = { ga4PropertyId: "559060240", gaMeasurementId: "G-PWV5LBJEQ7", ga4HostName: analytics.SITE_HOST_NAME, ga4CutoverAt: "2026-10-15T16:00:00+09:00" };
const identity = start => sources.ga4MeasurementSource(analytics.weekRange(start), config);
assert.equal(identity("2026-10-05").state, "pre_cutover");
assert.equal(identity("2026-10-12").state, "cutover_period");
assert.equal(identity("2026-10-19").state, "post_cutover");
assert.equal(sources.ga4MeasurementSource(analytics.weekRange("2026-10-19"), { ...config, ga4CutoverAt: "" }).state, "cutover_pending");
assert.throws(() => sources.ga4MeasurementSource(analytics.weekRange("2026-10-19"), { ...config, ga4CutoverAt: "2026-10-15" }));
assert.throws(() => sources.ga4MeasurementSource(analytics.weekRange("2026-10-19"), { ...config, gaMeasurementId: "G-WRONG" }));

const week = (start, source = identity(start)) => ({ week: analytics.weekRange(start), ga4: { sessions: 10, measurement_source: source }, diagnosis: { start_events: 4 }, sponsor: { impressions: 50 }, search_console: { impressions: 3, clicks: 0, actual_data_end: start, coverage: { confirmed_through: "2026-11-01", method: "api_first_incomplete_date" } } });
const a = week("2026-10-19"), b = week("2026-10-26");
const report = { weeks: [a, b], source_audit: { sources: { ga4: { state: "real" }, search_console: { state: "real" } } } };
assert(model.ga4Comparable([a, b]));
assert(model.comparisonAllowed("sessions", [b], [a]));
assert(!model.comparisonAllowed("sessions", [b], [week("2026-10-12")]));
assert(!model.comparisonAllowed("sessions", [b], [week("2026-10-19", { ...identity("2026-10-19"), property_id: "411472877" })]));
assert(!model.comparisonAllowed("sessions", [b], [week("2026-10-19", { state: "legacy_unknown" })]));
assert(!model.comparisonAllowed("sessions", [week("2026-11-02")], [a]), "A missing week cannot be presented as previous week.");
const view = model.buildView(report);
assert.equal(view.summary_cards.find(c => c.key === "sessions").comparison.status, "unchanged");
const boundary = { ...report, weeks: [week("2026-10-12"), a] };
assert.equal(model.buildView(boundary).summary_cards.find(c => c.key === "sessions").comparison.status, "source_boundary");
assert.equal(model.buildView(boundary).summary_cards.find(c => c.key === "diagnosis_start_events").comparison.status, "unchanged");
assert.equal(model.buildView(boundary, { period: "four" }).current.sessions, null);
assert.equal(model.buildView(boundary).trends[1].ga4_break_before, true);
assert.equal(model.buildView(boundary).source_periods.ga4.history[0].cutover_at, config.ga4CutoverAt);

const ranges = [analytics.weekRange("2026-09-21"), analytics.weekRange("2026-09-28")];
const json = value => new Response(JSON.stringify(value));
const coverage = await sources.collectSearchConsoleCoverage(ranges, { gscSiteUrl: analytics.SITE_ORIGIN + "/" }, "fake", "2026-10-06T05:00:00Z", async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.deepEqual(request.dimensions, ["date"]);
  return json(request.dataState === "all" ? { metadata: { first_incomplete_date: "2026-10-03" } } : { rows: [{ keys: ["2026-09-28"], impressions: 1, clicks: 0 }] });
});
assert.equal(coverage.confirmed_through, "2026-10-02");
assert.equal(coverage.method, "api_first_incomplete_date");
const lowerBound = await sources.collectSearchConsoleCoverage(ranges, { gscSiteUrl: analytics.SITE_ORIGIN + "/" }, "fake", "2026-10-06T05:00:00Z", async () => json({ rows: [{ keys: ["2026-09-28"], impressions: 1, clicks: 0 }] }));
assert.equal(lowerBound.confirmed_through, "2026-09-28");
assert.equal(lowerBound.method, "latest_final_date_lower_bound");
const unknown = await sources.collectSearchConsoleCoverage(ranges, {}, "fake", "2026-10-06T05:00:00Z", async () => json({}));
assert.equal(unknown.confirmed_through, null);
const failed = await sources.collectSearchConsoleCoverage(ranges, {}, "fake", "2026-10-06T05:00:00Z", async () => { throw Error("do not log credential detail"); });
assert.equal(failed.method, "probe_failed");
assert(!JSON.stringify(failed).includes("credential"));
const sparseInput = { site: { origin: analytics.SITE_ORIGIN }, source_audit: report.source_audit, articles: [], weeks: ranges.map(r => ({ week_start: r.start_date, search_console: { page_rows: [{ date: r.start_date, page: analytics.SITE_ORIGIN + "/", impressions: 2, clicks: 0, position: 10 }], coverage: lowerBound }, ga4: {} })) };
const reconciled = preflight.reconcile(sparseInput);
assert.equal(reconciled.selected_week.start, "2026-09-21", "Sparse Sundays do not exclude a week before the final-data watermark.");
assert.equal(reconciled.comparisons.find(c => c.metric === "gsc_clicks").state, "match");
const emptyInput = structuredClone(sparseInput);
emptyInput.weeks.forEach(w => { w.search_console.page_rows = []; w.search_console.coverage = coverage; });
assert.equal(preflight.reconcile(emptyInput).selected_week, null, "Even a finalized empty week remains unmeasured, not zero.");
assert.equal(analytics.buildWeeklyReport(emptyInput).weeks[0].search_console.clicks, null);

const raw = { week_start: "2026-10-19", ga4: { sessions: 10, measurement_source: identity("2026-10-19") }, search_console: { page_rows: [], coverage } };
const snapReport = analytics.buildWeeklyReport({ source_audit: report.source_audit, weeks: [raw] });
const snapshot = analytics.buildWeeklySnapshot(snapReport);
const storedWeek = snapshotToWeek(snapshot);
assert.deepEqual(storedWeek.ga4.measurement_source, raw.ga4.measurement_source);
assert.deepEqual(storedWeek.search_console.coverage, coverage);
assert.equal(snapshotToWeek({ ...snapshot, source_periods: {} }).ga4.measurement_source.state, "legacy_unknown");
const live = { ...snapReport, weeks: [{ ...snapReport.weeks[0], growth: { organic_users: 7 } }, { ...b, week: { ...b.week, is_current: true } }] };
assert.equal(mergeSnapshotsWithCurrent(live, [snapshot]).weeks[0].growth, null, "A matching property does not make different acquisition times interchangeable.");
assert.equal(mergeSnapshotsWithCurrent(live, [snapshot]).refreshed_weeks[0].growth.organic_users, 7, "Later reads remain available separately.");
assert.equal(mergeSnapshotsWithCurrent(live, [{ ...snapshot, source_periods: {} }]).weeks[0].growth, null);
const legacyFour = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map((start, index) => ({ ...snapshot, week_start: start, week_end: analytics.weekRange(start).end_date, sessions: index + 1, diagnosis_start_events: index + 5, source_periods: {} }));
const mergedFour = mergeSnapshotsWithCurrent(live, legacyFour);
for (const saved of legacyFour) {
  const shown = mergedFour.weeks.find(w => w.week.start_date === saved.week_start);
  assert.equal(shown.ga4.sessions, saved.sessions);
  assert.equal(shown.diagnosis.start_events, saved.diagnosis_start_events);
  assert.equal(shown.ga4.measurement_source.state, "legacy_unknown");
  assert.equal(shown.growth, null);
}

const db = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake" };
let writes = 0;
await assert.rejects(upsertSnapshot({ ...snapshot, source_periods: { ...snapshot.source_periods, ga4: { measurement_source: { ...identity("2026-10-19"), cutover_at: null, state: "cutover_pending" } } } }, { env: db, fetchImpl: async () => { writes++; return json([]); } }), /cutover/);
assert.equal(writes, 0, "No database call is made while the actual tag cutover is pending.");
await assert.rejects(upsertSnapshot(snapshot, { env: db, fetchImpl: async (_url, options) => { if (options.method !== "GET") writes++; return json([{ ...snapshot, source_periods: {} }]); } }), /source conflict/);
assert.equal(writes, 0);
await upsertSnapshot(snapshot, { env: db, fetchImpl: async (url, options) => {
  if (options.method === "PATCH") {
    assert.equal(new URL(url).searchParams.get("source_periods"), "eq." + JSON.stringify(snapshot.source_periods));
    assert.equal(options.headers.Prefer, "return=representation");
    writes++;
  }
  return json([snapshot]);
} });
assert.equal(writes, 1);
await assert.rejects(upsertSnapshot(snapshot, { env: db, fetchImpl: async () => json([]) }), /exactly one row/, "A concurrent insert is never allowed to overwrite the winner.");
console.log("Analytics migration tests passed: source boundaries, legacy history, sparse/final/empty GSC, guarded snapshot writes and model reconciliation.");
