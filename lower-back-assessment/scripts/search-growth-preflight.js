const fs = require("fs");
const path = require("path");
const { collectAvailableLiveInput } = require("./weekly-analytics-sources");
const {
  buildWeeklyReport,
  completedWeekRanges,
} = require("./weekly-analytics");
const dashboard = require("../admin/weekly-analytics/dashboard-model");
const { pagePath } = require("./search-growth");

const finite = (v) =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);
function sumRows(rows, field) {
  return rows?.length && rows.every((r) => finite(r[field]) !== null)
    ? rows.reduce((sum, r) => sum + Number(r[field]), 0)
    : null;
}
function reconcile(input) {
  const report = buildWeeklyReport(input);
  const states = report.source_audit.sources;
  const eligible = report.weeks.filter(
    (w) =>
      !w.week.is_current &&
      states.search_console?.state === "real" &&
      dashboard.searchWeekReady(w),
  );
  const week = eligible.at(-1);
  if (!week)
    return {
      state: "not_verified",
      selected_week: null,
      comparisons: [],
      reason:
        "GSCの確定範囲で返却行のある完了週がありません。接続状態・確定境界・空応答を確認してください。",
    };
  const raw = input.weeks.find((w) => w.week_start === week.week.start_date);
  const view = dashboard.buildView({
    ...report,
    weeks: [week],
    current_week_comparison: null,
    current_week_comparison_period: null,
  });
  const checks = [
    [
      "gsc_impressions",
      "search_console",
      sumRows(raw.search_console.page_rows, "impressions"),
      view.current.search_impressions,
    ],
    [
      "gsc_clicks",
      "search_console",
      sumRows(raw.search_console.page_rows, "clicks"),
      view.current.search_clicks,
    ],
    [
      "organic_sessions",
      "ga4",
      finite(raw.ga4?.organic_search_sessions),
      view.current.organic_search_sessions,
    ],
    [
      "organic_active_users",
      "ga4",
      finite(raw.ga4?.organic_search_users),
      view.current.organic_users,
    ],
    [
      "article_to_diagnosis_all_channels",
      "ga4",
      sumRows(raw.ga4?.article_to_diagnosis, "count"),
      view.current.article_transitions,
    ],
    [
      "diagnosis_start_all_channels_db",
      "diagnosis_db",
      finite(raw.diagnosis?.starts),
      view.current.diagnosis_start_events,
    ],
    [
      "diagnosis_complete_all_channels_db",
      "diagnosis_db",
      finite(raw.diagnosis?.completions),
      view.current.diagnosis_complete_events,
    ],
  ];
  const comparisons = checks.map(
    ([metric, source, apiValue, dashboardValue]) => ({
      metric,
      source,
      api_value: states[source]?.state === "real" ? apiValue : null,
      dashboard_value: finite(dashboardValue),
      state:
        states[source]?.state !== "real" ||
        apiValue === null ||
        finite(dashboardValue) === null
          ? "not_verified"
          : apiValue === finite(dashboardValue)
            ? "match"
            : "mismatch",
    }),
  );
  const eventRows = raw.ga4?.growth_events?.rows || [];
  for (const row of week.growth.pages)
    for (const [field, event] of [
      ["start_events", "muscle_check_start"],
      ["complete_events", "muscle_check_complete"],
      ["article_transitions", "article_to_diagnosis"],
    ]) {
      const rows = eventRows.filter(
        (r) =>
          pagePath(r.landingPagePlusQueryString, report.site.origin) ===
            row.path && r.eventName === event,
      );
      const apiValue = sumRows(rows, "eventCount");
      const shown =
        view.landing_pages.find((r) => r.url === row.url)?.[field] ?? null;
      comparisons.push({
        metric: field,
        source: "ga4_organic_landing",
        url: row.url,
        api_value: apiValue,
        dashboard_value: shown,
        state:
          states.ga4?.state !== "real" || apiValue === null || shown === null
            ? "not_verified"
            : apiValue === shown
              ? "match"
              : "mismatch",
      });
    }
  for (const row of week.growth.pages)
    for (const [field, source, rows, rawField] of [
      [
        "organic_sessions",
        "ga4",
        (raw.ga4?.landings || []).filter(
          (r) => pagePath(r.path, report.site.origin) === row.path,
        ),
        "organic_search_sessions",
      ],
      [
        "impressions",
        "search_console",
        (raw.search_console.page_rows || []).filter(
          (r) => pagePath(r.page, report.site.origin) === row.path,
        ),
        "impressions",
      ],
      [
        "clicks",
        "search_console",
        (raw.search_console.page_rows || []).filter(
          (r) => pagePath(r.page, report.site.origin) === row.path,
        ),
        "clicks",
      ],
    ]) {
      const apiValue = sumRows(rows, rawField),
        shown =
          view.landing_pages.find((r) => r.url === row.url)?.[field] ?? null;
      comparisons.push({
        metric: field,
        source,
        url: row.url,
        api_value: apiValue,
        dashboard_value: shown,
        state:
          states[source]?.state !== "real" ||
          apiValue === null ||
          shown === null
            ? "not_verified"
            : apiValue === shown
              ? "match"
              : "mismatch",
      });
    }
  return {
    state: comparisons.some((c) => c.state === "mismatch")
      ? "mismatch"
      : comparisons.every((c) => c.state === "match")
        ? "model_matched"
        : "partial_verification",
    selected_week: { start: week.week.start_date, end: week.week.end_date },
    comparisons,
    query_rows: raw.search_console.query_rows?.length || 0,
    page_rows: raw.search_console.page_rows?.length || 0,
    timezones: { ga4: "Asia/Tokyo", search_console: "America/Los_Angeles" },
    note: "Same-source values are compared with the existing dashboard model. Browser/rendered production UI still requires authenticated manual verification. GSC clicks are never compared with GA4 sessions.",
  };
}
async function main(args = process.argv.slice(2)) {
  const input = await collectAvailableLiveInput({
    ranges: completedWeekRanges(new Date(), 4),
    includeComparison: false,
  });
  const report = buildWeeklyReport(input);
  const verification = {
    generated_at: report.generated_at,
    read_only: true,
    sources: report.source_audit.sources,
    reconciliation: reconcile(input),
    release_decision: "hold_pending_authenticated_ui_and_release_review",
  };
  const index = args.indexOf("--out");
  const output = path.resolve(
    index >= 0
      ? args[index + 1]
      : path.join(__dirname, "../reports/google-preflight.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(verification, null, 2) + "\n");
  // Full query/page data remain in the ignored reports directory, never stdout.
  const privateFile = path.resolve(
    __dirname,
    "../reports/google-preflight-weekly.json",
  );
  fs.mkdirSync(path.dirname(privateFile), { recursive: true });
  fs.writeFileSync(privateFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(verification, null, 2));
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Read-only preflight failed; provider and credential details suppressed.",
    );
    process.exitCode = 1;
  });
module.exports = { reconcile, main };
