const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildWeeklyReport, loadFixture } = require("./weekly-analytics");
const {
  aggregateArticles,
  aggregatePeriod,
  buildView,
  compare,
  periodSlices,
  ratio,
  smallCell,
  sourcePeriods,
  trendWeeks
} = require("../admin/weekly-analytics/dashboard-model");

const root = path.resolve(__dirname, "..");
const fixture = loadFixture(path.join(__dirname, "fixtures", "weekly-analytics.json"));
const report = buildWeeklyReport(fixture);

const current = periodSlices(report, "current");
assert.strictEqual(current.selected.length, 1);
assert.strictEqual(current.previous.length, 1);
assert.strictEqual(current.start_date, "2026-09-14");
assert.strictEqual(current.end_date, "2026-09-20");

const previous = periodSlices(report, "previous");
assert.strictEqual(previous.selected[0].week.start_date, "2026-09-07");
assert.strictEqual(previous.previous[0].week.start_date, "2026-08-31");

const four = periodSlices(report, "four");
assert.strictEqual(four.selected.length, 4);
assert.strictEqual(four.previous.length, 4);
assert.strictEqual(four.start_date, "2026-08-24");

const eight = periodSlices(report, "eight");
assert.strictEqual(eight.selected.length, 8);
assert.strictEqual(eight.previous.length, 0, "Eight-week fixture has no preceding eight-week comparison period.");

const liveFixture = structuredClone(fixture);
liveFixture.generated_at = "2026-09-26T12:46:00.000Z";
liveFixture.weeks.push({
  week_start: "2026-09-21",
  data_end_date: "2026-09-26",
  is_current: true,
  ga4: {
    users: 10,
    sessions: 32,
    views: 307,
    organic_search_sessions: 1,
    events: {},
    event_users: { diagnosis_start: 10, diagnosis_complete: 7 }
  },
  search_console: {
    page_rows: [{ date: "2026-09-24", page: "https://health-check-platform-v2.netlify.app/", impressions: 4, clicks: 1, ctr: 0.25, position: 8 }],
    actual_data_start: "2026-09-21",
    actual_data_end: "2026-09-24",
    requested_start: "2026-09-21",
    requested_end: "2026-09-26"
  },
  sponsor: { sponsors: fixture.sponsors || [], impressions: [], clicks: [] },
  diagnosis: {
    starts: 136,
    start_unique_sessions: 18,
    completions: 30,
    complete_unique_sessions: 12,
    anonymous_records: 32,
    body_parts: { neck: 30 }
  }
});
liveFixture.current_week_comparison = {
  week_start: "2026-09-14",
  data_end_date: "2026-09-19",
  ga4: {
    users: 8,
    sessions: 20,
    views: 200,
    organic_search_sessions: 0,
    events: {},
    event_users: { diagnosis_start: 8, diagnosis_complete: 5 }
  },
  search_console: {
    page_rows: [],
    actual_data_start: null,
    actual_data_end: null,
    requested_start: "2026-09-14",
    requested_end: "2026-09-19"
  },
  sponsor: { sponsors: fixture.sponsors || [], impressions: [], clicks: [] },
  diagnosis: {
    starts: 80,
    start_unique_sessions: 12,
    completions: 20,
    complete_unique_sessions: 8,
    anonymous_records: 20,
    body_parts: { neck: 20 }
  }
};
liveFixture.current_week_comparison_period = { start_date: "2026-09-14", end_date: "2026-09-19" };
const liveReport = buildWeeklyReport(liveFixture);
const liveCurrent = periodSlices(liveReport, "current");
assert.strictEqual(liveCurrent.start_date, "2026-09-21");
assert.strictEqual(liveCurrent.end_date, "2026-09-27");
assert.strictEqual(liveCurrent.data_end_date, "2026-09-26");
assert.strictEqual(liveCurrent.in_progress, true);
assert.strictEqual(liveCurrent.comparison_start_date, "2026-09-14");
assert.strictEqual(liveCurrent.comparison_end_date, "2026-09-19");
assert.strictEqual(liveCurrent.comparison_label, "先週同曜日");
assert.strictEqual(liveCurrent.previous[0].ga4.users, 8, "Current partial week must compare with the prior week through the same weekday.");
const livePrevious = periodSlices(liveReport, "previous");
assert.strictEqual(livePrevious.start_date, "2026-09-14");
assert.strictEqual(livePrevious.end_date, "2026-09-20");
assert.strictEqual(livePrevious.in_progress, false);
const liveFour = periodSlices(liveReport, "four");
const liveEight = periodSlices(liveReport, "eight");
assert.strictEqual(liveFour.selected.at(-1).week.is_current, true);
assert.strictEqual(liveEight.selected.at(-1).week.is_current, true);
assert.strictEqual(trendWeeks(liveReport).at(-1).in_progress, true);
const liveView = buildView(liveReport, { period: "current" });
assert.strictEqual(liveView.current.users, 10);
assert.strictEqual(liveView.current.sessions, 32);
assert.strictEqual(liveView.current.views, 307);
assert.strictEqual(liveView.current.search_impressions, 4);
assert.strictEqual(liveView.current.search_clicks, 1);
assert.strictEqual(liveView.current.diagnosis_starts, 136);
assert.strictEqual(liveView.current.diagnosis_completions, 30);
assert.strictEqual(liveView.current.diagnosis_start_events, 136);
assert.strictEqual(liveView.current.diagnosis_start_unique, 18);
assert.strictEqual(liveView.current.diagnosis_start_unique_users, 10);
assert.strictEqual(liveView.current.diagnosis_complete_events, 30);
assert.strictEqual(liveView.current.diagnosis_complete_unique, 12);
assert.strictEqual(liveView.current.diagnosis_complete_unique_users, 7);
assert.strictEqual(liveView.current.diagnosis_event_completion_rate, 30 / 136);
assert.strictEqual(liveView.current.diagnosis_unique_completion_rate, 12 / 18);
assert.strictEqual(liveView.previous.users, 8);
assert.strictEqual(liveView.source_periods.ga4.end, "2026-09-26");
assert.strictEqual(liveView.source_periods.search_console.actual_end, "2026-09-24");
assert.strictEqual(liveView.source_periods.search_console.requested_end, "2026-09-26");

assert.deepStrictEqual(compare(0, 0), {
  status: "unchanged_zero", current: 0, previous: 0, delta: 0, percent_change: null
});
assert.strictEqual(compare(null, 0).status, "no_data");
assert.strictEqual(compare(5, 0).status, "new");
assert.strictEqual(compare(0.5, 0.25, true).delta, 25);
assert.strictEqual(ratio(1, 4), 0.25);
assert.strictEqual(ratio(0, 4), 0);
assert.strictEqual(ratio(1, 0), null);

const latestTotals = aggregatePeriod(current.selected);
assert.strictEqual(latestTotals.diagnosis_completion_rate, 0.8);
assert.strictEqual(latestTotals.sponsor_ctr, 0.25);
assert.strictEqual(latestTotals.search_ctr, 5 / 48);
assert.strictEqual(latestTotals.sponsor_impressions, 4, "Known administrator test impression stays excluded upstream.");
assert.strictEqual(latestTotals.sponsor_clicks, 1, "Known administrator test click stays excluded upstream.");
const emptyTotals = aggregatePeriod([]);
assert.strictEqual(emptyTotals.users, null, "Missing source data must remain missing rather than becoming zero.");
assert.strictEqual(emptyTotals.diagnosis_completion_rate, null);

const articles = aggregateArticles(current.selected);
const shoulder = articles.find((article) => article.path === "/health-library/fixture-shoulder/");
assert.strictEqual(shoulder.diagnosis_referral_rate, 3 / 16);
assert.strictEqual(shoulder.search_console_ctr, 3 / 25);
assert.strictEqual(shoulder.search_console_position, 9);

assert.strictEqual(smallCell({ impressions: 9, clicks: 1, ctr: 1 / 9 }, true).suppressed, true);
assert.strictEqual(smallCell({ impressions: 10, clicks: 1, ctr: 0.1 }, true).suppressed, false);
assert.strictEqual(smallCell({ impressions: 2, clicks: 1, ctr: 0.5 }, false).suppressed, false);

const source = sourcePeriods(current.selected);
assert.strictEqual(source.search_console.requested_start, "2026-09-14");
assert.strictEqual(source.search_console.requested_end, "2026-09-20");
assert.strictEqual(source.search_console.actual_start, "2026-09-17");
assert.strictEqual(source.search_console.actual_end, "2026-09-18");
assert.notStrictEqual(source.search_console.actual_end, source.search_console.requested_end, "Search Console lag must remain visible.");
assert.strictEqual(source.sanity.state, undefined);

const view = buildView(report, { period: "current" });
assert.strictEqual(view.body_parts.length, 13);
assert.strictEqual(view.articles_access.length, 2);
assert.strictEqual(view.articles_diagnosis.length, 2);
assert.strictEqual(view.sponsor.by_body_part[0].body_part, "neck");
assert.strictEqual(view.sponsor.by_region[0].region_code, "JP-23");
assert.strictEqual(view.summary_cards.find((card) => card.key === "diagnosis_event_completion_rate").comparison.unit, "point");
assert.strictEqual(liveView.summary_cards.find((card) => card.key === "diagnosis_unique_completion_rate").comparison.unit, "point");
assert(view.sponsor.filters.sponsors.includes("d685ab5b-efb3-4a40-9ecf-9695a9b1a5b6"));
assert(view.sponsor.filters.creatives.includes("hariplus_result_top_v1"));
assert(view.sponsor.filters.placements.includes("result_top"));
assert.strictEqual(view.source_states.ga4.state, "fixture");
assert.strictEqual(view.source_states.search_console.state, "fixture");
const filteredOut = buildView(report, { period: "current", filters: { creative_id: "not-present" } });
assert.strictEqual(filteredOut.sponsor.rows.length, 0, "Sponsor filters must affect the displayed breakdown.");

const dashboardHtml = fs.readFileSync(path.join(root, "admin", "weekly-analytics", "index.html"), "utf8");
const dashboardJs = fs.readFileSync(path.join(root, "admin", "weekly-analytics", "dashboard.js"), "utf8");
const buildSource = fs.readFileSync(path.join(root, "scripts", "netlify-build.js"), "utf8");
assert(dashboardHtml.includes('meta name="robots" content="noindex,nofollow"'));
assert(dashboardHtml.includes("ローカル確認用データ") || dashboardJs.includes("ローカル確認用データ"));
assert(dashboardJs.includes("/api/admin/weekly-analytics"), "Production dashboard data must come from the authenticated API.");
assert(dashboardJs.includes("credentials: \"same-origin\""), "Production dashboard must use the HttpOnly session cookie.");
assert(dashboardJs.includes("未取得（設定不足）"), "Dashboard must distinguish missing configuration from a real zero.");
assert(dashboardJs.includes("未取得（接続エラー）"), "Dashboard must expose source API failures without inventing data.");
assert(dashboardJs.includes("記事メタデータ"), "Published article metadata must expose its own source state.");
assert(dashboardJs.includes("最終集計:"), "Dashboard must label the aggregation timestamp explicitly.");
assert(dashboardJs.includes("JST"), "Dashboard aggregation timestamp must show JST.");
assert(dashboardJs.includes("途中"), "Current week must be visibly marked as in progress.");
assert(dashboardJs.includes("イベント完了率"), "Event-based completion must be labelled explicitly.");
assert(dashboardJs.includes("ユニーク完了率"), "Unique-session completion must be labelled explicitly.");
assert(dashboardJs.includes("参考値・データ蓄積中"), "Low-volume sponsor CTR must be labelled as provisional.");
assert(!/const folders\s*=\s*\[[^\]]*["']admin["']/.test(buildSource), "The dashboard HTML and data must not be copied as public static files.");
assert(buildSource.includes("copyWeeklyAnalyticsAssets"), "Only non-secret dashboard assets should be copied into the public build.");

console.log("Weekly analytics dashboard tests passed.");
