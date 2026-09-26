const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_ADMIN_TEST_EVENT_IDS,
  EVENT_AUDIT,
  INTERACTION_EVENT_MAP,
  SOURCE_OF_TRUTH,
  aggregateSponsor,
  buildWeeklyReport,
  buildWeeklySnapshot,
  compareMetric,
  completedWeekRanges,
  currentWeekRange,
  loadFixture,
  previousSameWeekdayRange,
  reportingWeekRanges,
  weekRange
} = require("./weekly-analytics");
const {
  collectAvailableLiveInput,
  collectGa4Week,
  collectSearchConsoleWeek,
  collectSupabaseWeek,
  ga4HostFilter,
  healthCheckGa4Request,
  searchConsoleRequestBody
} = require("./weekly-analytics-sources");

const fixturePath = path.join(__dirname, "fixtures", "weekly-analytics.json");
const fixture = loadFixture(fixturePath);
const report = buildWeeklyReport(fixture);

assert.strictEqual(report.weeks.length, 8, "Fixture must produce eight complete weeks.");
assert.strictEqual(report.weeks[0].week.start_date, "2026-07-27");
assert.strictEqual(report.weeks.at(-1).week.end_date, "2026-09-20");
assert.strictEqual(report.source_audit.mode, "fixture");
assert.strictEqual(report.measurement_model.event_audit, EVENT_AUDIT);
assert.strictEqual(report.measurement_model.interaction_event_map, INTERACTION_EVENT_MAP);
assert.strictEqual(report.measurement_model.source_of_truth, SOURCE_OF_TRUTH);

const eventAudit = new Map(EVENT_AUDIT.map((event) => [event.event_name, event]));
[
  "muscle_check_start",
  "muscle_check_complete",
  "diagnosis_save_click",
  "diagnosis_save_complete",
  "diagnosis_history_view",
  "diagnosis_retry_click",
  "article_to_diagnosis",
  "sponsor_banner_impression",
  "sponsor_banner_click"
].forEach((eventName) => assert.strictEqual(eventAudit.get(eventName)?.classification, "A_current_ui_emitter"));
assert.strictEqual(eventAudit.get("diagnosis_compare_view")?.classification, "B_historical_ga4_no_current_emitter");
assert.strictEqual(eventAudit.get("sponsor_banner_impression")?.report_source, "sponsor_db");
assert.strictEqual(eventAudit.get("sponsor_banner_impression")?.ga4_classification, "C_name_only_or_unused");

const root = path.resolve(__dirname, "..");
const analyticsSource = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
const bodyCheckSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8");
const sponsorSource = fs.readFileSync(path.join(root, "sponsor-platform.js"), "utf8");
assert(analyticsSource.includes('trackMeasurement("muscle_check_start"'));
assert(analyticsSource.includes('trackMeasurement("muscle_check_complete"'));
assert(analyticsSource.includes('trackMeasurement("article_to_diagnosis"'));
["diagnosis_save_click", "diagnosis_save_complete", "diagnosis_history_view", "diagnosis_retry_click"].forEach((eventName) => {
  assert(bodyCheckSource.includes(`emit("${eventName}")`), `${eventName} must have a current UI emitter.`);
});
assert(!bodyCheckSource.includes('emit("diagnosis_compare_view")'), "A comparison event must not be fabricated without a current comparison action.");
assert(!bodyCheckSource.includes('id="compareBodyBtn"'), "The retired comparison control must remain absent.");
assert(sponsorSource.includes('impression: "sponsor_banner_impression"'));
assert(sponsorSource.includes('click: "sponsor_banner_click"'));
assert(sponsorSource.includes('new runtime.CustomEvent("hcl:sponsor-event"'));
assert(!analyticsSource.includes('addEventListener("hcl:sponsor-event"'), "Sponsor events remain sponsor-DB events, not GA4 events.");

const actionEvents = new Map(INTERACTION_EVENT_MAP.map((item) => [item.action, item]));
assert.strictEqual(actionEvents.get("record_button_press").event_name, "diagnosis_save_click");
assert.strictEqual(actionEvents.get("record_complete").event_name, "diagnosis_save_complete");
assert.strictEqual(actionEvents.get("history_panel_open").event_name, "diagnosis_history_view");
assert.strictEqual(actionEvents.get("comparison_open").event_name, null);
assert.strictEqual(actionEvents.get("comparison_open").availability, "not_in_current_ui");
assert.strictEqual(actionEvents.get("retry_button_press").event_name, "diagnosis_retry_click");

const jstWeek = weekRange("2026-09-14");
assert.strictEqual(jstWeek.start_at, "2026-09-13T15:00:00.000Z");
assert.strictEqual(jstWeek.end_at_exclusive, "2026-09-20T15:00:00.000Z");
assert.throws(() => weekRange("2026-09-15"), /Monday JST/);
const completed = completedWeekRanges("2026-09-26T12:00:00+09:00", 8);
assert.strictEqual(completed[0].start_date, "2026-07-27");
assert.strictEqual(completed.at(-1).start_date, "2026-09-14");

const current = currentWeekRange("2026-09-26T21:46:00+09:00");
assert.strictEqual(current.start_date, "2026-09-21");
assert.strictEqual(current.end_date, "2026-09-27");
assert.strictEqual(current.data_end_date, "2026-09-26");
assert.strictEqual(current.is_current, true);
assert.strictEqual(current.data_end_at_exclusive, "2026-09-26T15:00:00.000Z");

const sunday = currentWeekRange("2026-09-27T23:59:59+09:00");
assert.strictEqual(sunday.start_date, "2026-09-21");
assert.strictEqual(sunday.data_end_date, "2026-09-27");
const monday = currentWeekRange("2026-09-28T00:00:00+09:00");
assert.strictEqual(monday.start_date, "2026-09-28");
assert.strictEqual(monday.end_date, "2026-10-04");
const monthCrossing = currentWeekRange("2026-08-01T12:00:00+09:00");
assert.strictEqual(monthCrossing.start_date, "2026-07-27");
assert.strictEqual(monthCrossing.end_date, "2026-08-02");
const yearCrossing = currentWeekRange("2027-01-01T12:00:00+09:00");
assert.strictEqual(yearCrossing.start_date, "2026-12-28");
assert.strictEqual(yearCrossing.end_date, "2027-01-03");

const reporting = reportingWeekRanges("2026-09-26T21:46:00+09:00", 8);
assert.strictEqual(reporting[0].start_date, "2026-08-03");
assert.strictEqual(reporting.at(-1).start_date, "2026-09-21");
assert.strictEqual(reporting.at(-1).is_current, true);
const sameWeekday = previousSameWeekdayRange("2026-09-26T21:46:00+09:00");
assert.strictEqual(sameWeekday.start_date, "2026-09-14");
assert.strictEqual(sameWeekday.end_date, "2026-09-20");
assert.strictEqual(sameWeekday.data_end_date, "2026-09-19");
assert.strictEqual(searchConsoleRequestBody(current).endDate, "2026-09-26");

assert.deepStrictEqual(compareMetric(5, 0), { current: 5, previous: 0, delta: 5, percent_change: null, status: "new" });
assert.deepStrictEqual(compareMetric(0, 0), { current: 0, previous: 0, delta: 0, percent_change: null, status: "unchanged_zero" });
assert.strictEqual(compareMetric(12, null).status, "no_previous");
assert.strictEqual(compareMetric(12, 8).percent_change, 50);

const latest = report.weeks.at(-1);
assert.strictEqual(report.weeks[0].search_console.requested_start, "2026-07-27");
assert.strictEqual(report.weeks[0].search_console.requested_end, "2026-08-02");
assert.strictEqual(report.weeks[0].search_console.actual_data_start, null);
assert.strictEqual(report.weeks[0].search_console.actual_data_end, null);
assert.strictEqual(report.weeks[0].search_console.empty_response_is_zero_demand, false);
assert.strictEqual(latest.search_console.actual_data_start, "2026-09-17");
assert.strictEqual(latest.search_console.actual_data_end, "2026-09-18");
assert.strictEqual(latest.sponsor.impressions, 4, "The exact known administrator impression must be excluded.");
assert.strictEqual(latest.sponsor.clicks, 1, "The exact known administrator click must be excluded.");
assert.strictEqual(latest.sponsor.ctr, 0.25);
assert.deepStrictEqual(latest.sponsor.excluded_admin_tests, { impressions: 1, clicks: 1 });
assert.strictEqual(latest.sponsor.by_day[0].date, "2026-09-17");
assert.strictEqual(latest.sponsor.breakdown[0].sponsor_name, "Hariplus");
assert(!("symptoms" in latest.sponsor.breakdown[0]));
assert(!("answers" in latest.sponsor.breakdown[0]));
assert(!("candidate_muscles" in latest.sponsor.breakdown[0]));

const laterEvent = aggregateSponsor({
  impressions: [{
    event_id: "later-real-impression",
    sponsor_id: "sponsor",
    creative_id: "creative",
    placement_id: "result_top",
    body_part: "shoulder",
    country_code: "JP",
    region_code: "JP-23",
    region_name: "Aichi",
    occurred_at: "2026-09-26T00:00:00.000Z"
  }],
  clicks: []
}, DEFAULT_ADMIN_TEST_EVENT_IDS);
assert.strictEqual(laterEvent.impressions, 1, "Later low-volume events must not be guessed to be tests.");

assert.strictEqual(latest.diagnosis.anonymous_records, 16);
assert.strictEqual(latest.diagnosis.ga4_events.diagnosis_save_complete, 7);
assert.strictEqual(latest.diagnosis.completion_rate, 0.8);
assert.strictEqual(latest.articles.length, 2);
const shoulderArticle = latest.articles.find((article) => article.path === "/health-library/fixture-shoulder/");
assert.strictEqual(shoulderArticle.views, 21);
assert.strictEqual(shoulderArticle.users, 16);
assert.strictEqual(shoulderArticle.organic_search_sessions, 8);
assert.strictEqual(shoulderArticle.search_console_impressions, 25);
assert.strictEqual(shoulderArticle.search_console_clicks, 3);
assert.strictEqual(shoulderArticle.article_to_diagnosis, 3);

const hostFilter = ga4HostFilter("health-check-platform-v2.netlify.app");
assert(JSON.stringify(hostFilter).includes("health-check-platform-v2.netlify.app"));
const requiredHostRequest = healthCheckGa4Request("health-check-platform-v2.netlify.app", { metrics: [{ name: "sessions" }] });
assert(JSON.stringify(requiredHostRequest.dimensionFilter).includes("health-check-platform-v2.netlify.app"));
assert.throws(() => healthCheckGa4Request("", {}), /GA4_HOST_NAME is required/);
assert.throws(() => healthCheckGa4Request("health-check-platform-v2.netlify.app", { dimensionFilter: {} }), /cannot be replaced/);
const gscBody = searchConsoleRequestBody(jstWeek);
assert.deepStrictEqual(gscBody.dimensions, ["date", "page", "query"]);
assert.strictEqual(gscBody.dataState, "final");
assert.strictEqual(gscBody.rowLimit, 25000);

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

(async () => {
  const gaRequests = [];
  const gaFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    gaRequests.push(body);
    assert(JSON.stringify(body.dimensionFilter).includes("health-check-platform-v2.netlify.app"));
    const dimensions = (body.dimensions || []).map((item) => item.name);
    const metrics = body.metrics.map((item) => item.name);
    let values;
    let rows;
    if (dimensions.includes("pagePath")) {
      if (dimensions.includes("eventName")) {
        values = { dimensions: ["article_to_diagnosis", "/health-library/fixture-shoulder/"], metrics: ["2"] };
      } else {
        values = { dimensions: ["/health-library/fixture-shoulder/"], metrics: ["9", "7"] };
      }
    } else if (dimensions.includes("landingPagePlusQueryString")) {
      values = { dimensions: ["/health-library/fixture-shoulder/?from=google"], metrics: ["3"] };
    } else if (dimensions.includes("eventName")) {
      rows = [
        { dimensions: ["diagnosis_start"], metrics: ["136", "12", "10"] },
        { dimensions: ["diagnosis_complete"], metrics: ["30", "8", "7"] },
        { dimensions: ["article_to_diagnosis"], metrics: ["2", "2", "2"] }
      ];
    } else if (metrics.includes("activeUsers")) {
      values = { dimensions: [], metrics: ["10", "11", "8", "14", "25"] };
    } else {
      values = { dimensions: [], metrics: ["4"] };
    }
    return jsonResponse({
      dimensionHeaders: dimensions.map((name) => ({ name })),
      metricHeaders: metrics.map((name) => ({ name, type: "TYPE_INTEGER" })),
      rows: (rows || [values]).map((row) => ({
        dimensionValues: row.dimensions.map((value) => ({ value })),
        metricValues: row.metrics.map((value) => ({ value }))
      })),
      rowCount: (rows || [values]).length
    });
  };
  const ga4 = await collectGa4Week(jstWeek, {
    ga4PropertyId: "411472877",
    ga4HostName: "health-check-platform-v2.netlify.app"
  }, "test-token", gaFetch);
  assert.strictEqual(gaRequests.length, 6);
  assert.strictEqual(ga4.users, 11);
  assert.strictEqual(ga4.organic_search_sessions, 4);
  assert.strictEqual(ga4.pages[0].views, 9);
  assert.strictEqual(ga4.landings[0].path, "/health-library/fixture-shoulder/");
  assert.strictEqual(ga4.events.article_to_diagnosis, 2);
  assert.strictEqual(ga4.event_sessions.diagnosis_start, 12);
  assert.strictEqual(ga4.event_users.diagnosis_start, 10);
  assert.strictEqual(ga4.event_users.diagnosis_complete, 7);

  const gscRequests = [];
  const gsc = await collectSearchConsoleWeek(jstWeek, {
    gscSiteUrl: "https://health-check-platform-v2.netlify.app/"
  }, "test-token", async (url, options) => {
    assert(url.includes(encodeURIComponent("https://health-check-platform-v2.netlify.app/")));
    const request = JSON.parse(options.body);
    gscRequests.push(request);
    const values = {
      date: "2026-09-18",
      page: "https://health-check-platform-v2.netlify.app/health-library/fixture-shoulder/",
      query: "fixture query"
    };
    return jsonResponse({
      responseAggregationType: "byPage",
      rows: [{
        keys: request.dimensions.map((dimension) => values[dimension]),
        clicks: 1,
        impressions: 4,
        ctr: 0.25,
        position: 8
      }]
    });
  });
  assert.strictEqual(gscRequests.length, 3);
  assert(gscRequests.every((request) => request.dataState === "final"));
  assert(gscRequests.some((request) => request.dimensions.join(",") === "date,page"));
  assert(gscRequests.some((request) => request.dimensions.join(",") === "date,query"));
  assert(gscRequests.some((request) => request.dimensions.join(",") === "date,page,query"));
  assert.strictEqual(gsc.data_through, "2026-09-18");
  assert.strictEqual(gsc.requested_start, "2026-09-14");
  assert.strictEqual(gsc.requested_end, "2026-09-20");
  assert.strictEqual(gsc.actual_data_start, "2026-09-18");
  assert.strictEqual(gsc.actual_data_end, "2026-09-18");
  assert.strictEqual(gsc.source_timezone, "America/Los_Angeles");
  assert.strictEqual(gsc.page_rows[0].page.includes("fixture-shoulder"), true);
  assert.strictEqual(gsc.query_rows[0].query, "fixture query");

  const emptyGsc = await collectSearchConsoleWeek(jstWeek, {
    gscSiteUrl: "https://health-check-platform-v2.netlify.app/"
  }, "test-token", async () => jsonResponse({ rows: [] }));
  assert.strictEqual(emptyGsc.requested_start, "2026-09-14");
  assert.strictEqual(emptyGsc.requested_end, "2026-09-20");
  assert.strictEqual(emptyGsc.actual_data_start, null);
  assert.strictEqual(emptyGsc.actual_data_end, null);
  assert.strictEqual(emptyGsc.data_state, "final");

  const dbRequests = [];
  const db = await collectSupabaseWeek(jstWeek, {
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "test-key",
    diagnosisEventsTable: "muscle_diagnosis_events",
    anonymousRecordsTable: "anonymous_diagnosis_records"
  }, [{ sponsor_id: "sponsor", sponsor_key: "test", clinic_name: "Test" }], async (url, options) => {
    dbRequests.push({ url: String(url), method: options.method });
    assert.strictEqual(options.method, "GET", "Weekly DB collector must be read-only.");
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/muscle_diagnosis_events")) {
      return jsonResponse([
        { event_name: "diagnosis_started", selected_region: "neck", anonymous_session_id: "session-a", created_at: jstWeek.start_at },
        { event_name: "diagnosis_started", selected_region: "neck", anonymous_session_id: "session-a", created_at: jstWeek.start_at },
        { event_name: "diagnosis_started", selected_region: "neck", anonymous_session_id: "session-b", created_at: jstWeek.start_at },
        { event_name: "diagnosis_completed", selected_region: "neck", anonymous_session_id: "session-a", created_at: jstWeek.start_at },
        { event_name: "diagnosis_completed", selected_region: "neck", anonymous_session_id: "session-a", created_at: jstWeek.start_at }
      ]);
    }
    if (pathname.endsWith("/anonymous_diagnosis_records")) {
      return jsonResponse([{ body_part: "neck", diagnosis_date: jstWeek.start_at }]);
    }
    return jsonResponse([]);
  });
  assert.strictEqual(dbRequests.length, 4);
  assert(dbRequests.every((request) => request.url.includes("gte.") && request.url.includes("lt.")));
  assert.strictEqual(db.diagnosis.starts, 3);
  assert.strictEqual(db.diagnosis.start_unique_sessions, 2);
  assert.strictEqual(db.diagnosis.completions, 2);
  assert.strictEqual(db.diagnosis.complete_unique_sessions, 1);
  assert.strictEqual(db.diagnosis.body_parts.neck, 2);
  assert(dbRequests.some((request) => request.url.includes("anonymous_session_id")));

  const unavailableInput = await collectAvailableLiveInput({
    asOf: "2026-09-26T12:00:00+09:00",
    env: {},
    fetchImpl: async () => { throw new Error("network unavailable"); }
  });
  assert.strictEqual(unavailableInput.source_audit.mode, "unavailable");
  assert.strictEqual(unavailableInput.source_audit.sources.ga4.state, "missing_configuration");
  assert.strictEqual(unavailableInput.source_audit.sources.search_console.state, "missing_configuration");
  assert.strictEqual(unavailableInput.source_audit.sources.sponsor_db.state, "missing_configuration");
  assert.strictEqual(unavailableInput.source_audit.sources.diagnosis_db.state, "missing_configuration");
  assert.strictEqual(unavailableInput.source_audit.sources.sanity.state, "error");
  assert.strictEqual(unavailableInput.weeks.at(-1).week_start, "2026-09-21");
  assert.strictEqual(unavailableInput.weeks.at(-1).data_end_date, "2026-09-26");
  assert.strictEqual(unavailableInput.weeks.at(-1).is_current, true);
  assert.deepStrictEqual(unavailableInput.current_week_comparison_period, {
    start_date: "2026-09-14",
    end_date: "2026-09-19"
  });
  const unavailableReport = buildWeeklyReport(unavailableInput);
  const unavailableLatest = unavailableReport.weeks.at(-1);
  assert.strictEqual(unavailableLatest.ga4.users, null, "Unavailable GA4 must stay missing rather than becoming zero.");
  assert.strictEqual(unavailableLatest.search_console.impressions, null, "Unavailable Search Console must stay missing.");
  assert.strictEqual(unavailableLatest.diagnosis.starts, null, "Unavailable diagnosis DB must stay missing.");
  assert.strictEqual(unavailableLatest.diagnosis.start_unique_sessions, null, "Unavailable unique diagnosis sessions must stay missing.");
  assert.strictEqual(unavailableLatest.sponsor.impressions, null, "Unavailable sponsor DB must stay missing.");
  assert(unavailableLatest.reconciliation.every((row) => row.matches), "Raw and dashboard values must reconcile, including missing values.");

  const secretMarker = "service-role-secret-must-not-leak";
  const apiFailureInput = await collectAvailableLiveInput({
    asOf: "2026-09-26T12:00:00+09:00",
    env: {
      GA4_PROPERTY_ID: "411472877",
      GA4_HOST_NAME: "health-check-platform-v2.netlify.app",
      GSC_SITE_URL: "https://health-check-platform-v2.netlify.app/",
      GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(JSON.stringify({ client_email: "analytics@example.test", private_key: "invalid-key" })).toString("base64"),
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: secretMarker
    },
    fetchImpl: async () => { throw new Error("simulated API failure"); }
  });
  assert.strictEqual(apiFailureInput.source_audit.sources.ga4.state, "error");
  assert.strictEqual(apiFailureInput.source_audit.sources.search_console.state, "error");
  assert.strictEqual(apiFailureInput.source_audit.sources.sponsor_db.state, "error");
  assert.strictEqual(apiFailureInput.source_audit.sources.diagnosis_db.state, "error");
  assert(!JSON.stringify(apiFailureInput).includes(secretMarker), "Service-role credentials must never enter generated report data.");

  const zeroInput = {
    generated_at: "2026-09-21T00:00:00.000Z",
    source_audit: {
      mode: "real",
      sources: Object.fromEntries(["ga4", "search_console", "sponsor_db", "diagnosis_db", "sanity"].map((key) => [key, { state: "real" }]))
    },
    articles: [],
    weeks: [{
      week_start: "2026-09-14",
      ga4: { users: 0, sessions: 0, views: 0, organic_search_sessions: 0, events: {}, event_users: {} },
      search_console: { page_rows: [], actual_data_start: "2026-09-14", actual_data_end: "2026-09-20" },
      sponsor: { impressions: [], clicks: [], sponsors: [] },
      diagnosis: { starts: 0, start_unique_sessions: 0, completions: 0, complete_unique_sessions: 0, anonymous_records: 0, body_parts: {} }
    }]
  };
  const zeroLatest = buildWeeklyReport(zeroInput).weeks[0];
  assert.strictEqual(zeroLatest.ga4.users, 0, "A real zero must remain zero.");
  assert.strictEqual(zeroLatest.search_console.impressions, 0, "A confirmed real zero must remain zero.");
  assert.strictEqual(zeroLatest.diagnosis.starts, 0);
  assert.strictEqual(zeroLatest.diagnosis.start_unique_sessions, 0);
  assert.strictEqual(zeroLatest.sponsor.impressions, 0);

  const snapshot = buildWeeklySnapshot(buildWeeklyReport(zeroInput), { weekStart: "2026-09-14" });
  [
    "week_start", "week_end", "generated_at", "schema_version", "data_state", "users", "sessions", "views", "organic_sessions",
    "search_impressions", "search_clicks", "search_ctr", "search_position", "search_actual_start", "search_actual_end",
    "diagnosis_start_events", "diagnosis_start_unique_sessions", "diagnosis_start_unique_users_equivalent",
    "diagnosis_complete_events", "diagnosis_complete_unique_sessions", "diagnosis_complete_unique_users_equivalent",
    "diagnosis_event_completion_rate", "diagnosis_unique_session_completion_rate", "records", "retry_count",
    "ad_impressions", "ad_clicks", "ad_ctr", "ad_data_state", "top_articles", "top_body_parts", "top_regions"
  ].forEach((field) => assert(Object.hasOwn(snapshot, field), `Snapshot is missing ${field}.`));
  assert(!JSON.stringify(snapshot).includes("anonymous_session_id"), "Snapshots must not contain raw anonymous session identifiers.");

  const migration = fs.readFileSync(path.join(__dirname, "..", "supabase-weekly-analytics-phase2a.sql"), "utf8");
  assert(migration.includes("weekly_metric_snapshots"));
  assert(migration.includes("analytics_event_exclusions"));
  [
    "generated_at", "users", "sessions", "views", "organic_sessions", "search_impressions", "search_clicks",
    "schema_version", "data_state", "search_ctr", "search_position", "search_actual_start", "search_actual_end",
    "diagnosis_start_events", "diagnosis_start_unique_sessions", "diagnosis_start_unique_users_equivalent",
    "diagnosis_complete_events", "diagnosis_complete_unique_sessions", "diagnosis_complete_unique_users_equivalent",
    "diagnosis_event_completion_rate", "diagnosis_unique_session_completion_rate", "records", "retry_count",
    "ad_impressions", "ad_clicks", "ad_ctr", "ad_data_state", "top_articles", "top_body_parts", "top_regions",
    "source_periods", "source_status"
  ].forEach((field) => assert(migration.includes(field), `Migration is missing ${field}.`));
  DEFAULT_ADMIN_TEST_EVENT_IDS.forEach((eventId) => assert(migration.includes(eventId)));
  assert(!/delete\s+from\s+public\.sponsor_(impressions|clicks)/i.test(migration));

  console.log("Weekly analytics tests passed: live-source states, missing vs zero, API failures, secret isolation, JST weeks, joins, and exclusions.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
