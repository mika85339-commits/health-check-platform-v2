const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildGrowthWeek, findGrowthOpportunities } = require("./search-growth");
const { buildWeeklyReport } = require("./weekly-analytics");
const { exportSanityArticles } = require("./sanity-export");
const { coverage } = require("./sanity-audit-coverage");
const { fetchSanityPosts } = require("./sanity-client");
const { runGa4Report } = require("./weekly-analytics-sources");
const model = require("../admin/weekly-analytics/dashboard-model");
const origin = "https://health-check-platform-v2.netlify.app";
const sources = { ga4: { state: "real" }, search_console: { state: "real" } };
const search = {
  page_rows: [
    { page: origin + "/a/", impressions: 500, clicks: 2, position: 5 },
  ],
  actual_data_end: "2026-10-11",
};
const ga = {
  organic_search_users: 22,
  landings: [{ path: "/a/", organic_search_sessions: 40 }],
  article_to_diagnosis: [{ count: 3 }],
  growth_events: {
    state: "real",
    rows: [
      {
        landingPagePlusQueryString: "/a/?utm_source=google",
        eventName: "muscle_check_start",
        eventCount: 2,
      },
      {
        landingPagePlusQueryString: "/a/",
        eventName: "muscle_check_complete",
        eventCount: 1,
      },
    ],
  },
};
const growth = buildGrowthWeek(ga, search, sources, origin);
assert.equal(growth.organic_users, 22);
assert.equal(growth.pages[0].start_events, 2);
assert.equal(growth.pages[0].complete_events, 1);
assert.equal(growth.pages[0].ctr, 0.004);
assert.equal(growth.pages[0].article_transitions, null);
assert(!JSON.stringify(growth).includes("utm_source"));
const week = {
  week: { start_date: "2026-10-05", end_date: "2026-10-11", is_current: false },
  growth,
  search_console: search,
};
const report = { weeks: [week], source_audit: { sources } };
assert.equal(findGrowthOpportunities(report).candidates.length, 1);
assert.equal(
  findGrowthOpportunities(report).candidates[0].expected_metrics.length,
  2,
);
assert.equal(
  findGrowthOpportunities({
    ...report,
    source_audit: {
      sources: {
        ga4: { state: "fixture" },
        search_console: { state: "fixture" },
      },
    },
  }).candidates.length,
  0,
);
assert.equal(
  findGrowthOpportunities({
    ...report,
    weeks: [
      {
        ...week,
        search_console: { actual_data_end: "2026-10-09" },
        growth: { ...growth, events_state: "error" },
      },
    ],
  }).candidates.length,
  0,
);
assert.equal(
  buildGrowthWeek(
    {},
    search,
    {
      ga4: { state: "missing_configuration" },
      search_console: { state: "real" },
    },
    origin,
  ).organic_users,
  null,
);
const noEvents = buildGrowthWeek(
  { ...ga, growth_events: { state: "real", rows: [] } },
  {},
  sources,
  origin,
);
assert.equal(noEvents.pages[0].start_events, null);
assert.equal(noEvents.pages[0].complete_events, null);
const many = {
  ...report,
  weeks: [
    {
      ...week,
      growth: {
        ...growth,
        pages: Array.from({ length: 5 }, (_, i) => ({
          ...growth.pages[0],
          url: origin + "/page-" + i + "/",
          impressions: 1000 + i,
        })),
      },
    },
  ],
};
assert.equal(findGrowthOpportunities(many).candidates.length, 3);
assert(findGrowthOpportunities(many).candidates[0].url.endsWith("/page-4/"));
const liveInput = {
  source_audit: {
    sources: {
      ...sources,
      sanity: { state: "real" },
      diagnosis_db: { state: "missing_configuration" },
      sponsor_db: { state: "missing_configuration" },
    },
  },
  site: { origin },
  articles: [],
  weeks: [{ week_start: "2026-10-05", ga4: ga, search_console: search }],
};
const integrated = buildWeeklyReport(liveInput);
assert.equal(integrated.weeks[0].growth.organic_users, 22);
assert(integrated.growth_opportunities);
assert.equal(model.buildView(integrated).current.organic_users, 22);
(async () => {
  await assert.rejects(
    runGa4Report(
      "id",
      "private-token",
      {},
      async () =>
        new Response(JSON.stringify({ error: { message: "private-token" } }), {
          status: 403,
        }),
    ),
    (e) => e.status === 403 && !e.message.includes("private-token"),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hcl-growth-test-"));
  const dist = path.join(root, "dist");
  const logger = { log() {}, warn() {}, error() {} };
  try {
    await exportSanityArticles({ root, dist, env: {}, logger });
    assert.equal(coverage(dist).state, "missing_configuration");
    assert.equal(coverage(dist).complete, false);
    await assert.rejects(
      exportSanityArticles({
        root,
        dist,
        logger,
        fetchPosts: async () => {
          throw Error("secret-provider-text");
        },
      }),
    );
    assert.equal(coverage(dist).state, "fetch_failed");
    assert(!JSON.stringify(coverage(dist)).includes("secret-provider-text"));
    await exportSanityArticles({
      root,
      dist,
      logger,
      fetchPosts: async () => ({ posts: [], config: {}, skipped: false }),
    });
    assert.equal(coverage(dist).state, "empty");
    assert.equal(coverage(dist).complete, true);
    assert.equal(coverage(dist).article_count, 0);
    await exportSanityArticles({
      root, dist, logger,
      fetchPosts: async () => ({ posts: [{ _id: "invalid-post", title: "No slug" }], config: {}, skipped: false }),
    });
    assert.equal(coverage(dist).state, "partial");
    assert.equal(coverage(dist).complete, false);
    await assert.rejects(
      fetchSanityPosts({
        config: {
          projectId: "test",
          dataset: "production",
          apiVersion: "2026-07-15",
          token: "secret-key",
        },
        logger,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ error: { description: "secret-key" } }),
            { status: 403 },
          ),
      }),
      (e) => !e.message.includes("secret-key"),
    );
    await assert.rejects(
      fetchSanityPosts({
        config: {
          projectId: "test",
          dataset: "production",
          apiVersion: "2026-07-15",
        },
        logger,
        fetchImpl: async () => new Response(JSON.stringify({ result: null })),
      }),
      /invalid result/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(
    "Search growth tests passed: cohort attribution, missing vs zero, insufficient/fixture/lagged data, max-three ranking, Sanity coverage states and secret isolation.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
