const assert = require("assert/strict");
const { reconcile } = require("./search-growth-preflight");
const origin = "https://health-check-platform-v2.netlify.app";
const sourceStates = {
  ga4: { state: "real" },
  search_console: { state: "real" },
  diagnosis_db: { state: "real" },
  sanity: { state: "real" },
  sponsor_db: { state: "missing_configuration" },
};
function week(start, end) {
  return {
    week_start: start,
    ga4: {
      organic_search_sessions: 10,
      organic_search_users: 8,
      landings: [{ path: "/test/", organic_search_sessions: 10 }],
      article_to_diagnosis: [{ path: "/test/", count: 0 }],
      growth_events: {
        state: "real",
        rows: [
          {
            landingPagePlusQueryString: "/test/",
            eventName: "muscle_check_start",
            eventCount: 2,
          },
          {
            landingPagePlusQueryString: "/test/",
            eventName: "muscle_check_complete",
            eventCount: 1,
          },
        ],
      },
    },
    diagnosis: { starts: 3, completions: 1 },
    search_console: {
      page_rows: [
        {
          page: origin + "/test/",
          date: end,
          impressions: 100,
          clicks: 0,
          position: 8,
        },
      ],
      query_rows: [{ query: "test", date: end, impressions: 20, clicks: 0 }],
      actual_data_end: end,
    },
  };
}
const input = {
  site: { origin },
  source_audit: { sources: sourceStates },
  articles: [],
  weeks: [week("2026-09-28", "2026-10-04"), week("2026-10-05", "2026-10-09")],
};
const result = reconcile(input);
assert.equal(
  result.selected_week.start,
  "2026-09-28",
  "Select the newest fully returned week rather than the newest delayed week.",
);
assert.equal(
  result.comparisons.find((r) => r.metric === "gsc_clicks").api_value,
  0,
);
assert.equal(
  result.comparisons.find((r) => r.metric === "gsc_clicks").state,
  "match",
);
assert.equal(
  result.comparisons.find((r) => r.metric === "organic_sessions" && !r.url)
    .api_value,
  10,
);
assert(!result.comparisons.some((r) => r.state === "mismatch"));
assert.equal(
  reconcile({
    ...input,
    source_audit: {
      sources: {
        ...sourceStates,
        search_console: { state: "missing_configuration" },
      },
    },
  }).state,
  "not_verified",
);
assert.equal(
  reconcile({ ...input, source_audit: { mode: "fixture" } }).selected_week,
  null,
);
const absent = { ...input, weeks: [week("2026-09-28", "2026-10-04")] };
absent.weeks[0].ga4.growth_events.rows = [];
assert.equal(
  reconcile(absent).comparisons.find((r) => r.metric === "start_events").state,
  "not_verified",
);
console.log(
  "Preflight checks passed: latest available complete week, source-specific API/model reconciliation, real zero, missing rows and fixture rejection.",
);
