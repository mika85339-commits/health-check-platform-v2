const fs = require("fs");
const path = require("path");
const {
  EVENT_AUDIT,
  INTERACTION_EVENT_MAP,
  SOURCE_OF_TRUTH
} = require("./weekly-analytics-events");

const REPORT_TIME_ZONE = "Asia/Tokyo";
const SEARCH_CONSOLE_TIME_ZONE = "America/Los_Angeles";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_ORIGIN = "https://health-check-platform-v2.netlify.app";
const SITE_HOST_NAME = "health-check-platform-v2.netlify.app";
const HEALTH_LIBRARY_PREFIX = "/health-library/";

const GA4_EVENT_NAMES = Object.freeze([
  "article_to_diagnosis",
  "article_to_hariplus",
  "article_view",
  "body_guide_select",
  "body_guide_view",
  "clinic_site_click",
  "diagnosis_compare_view",
  "diagnosis_complete",
  "diagnosis_history_view",
  "diagnosis_landing_start",
  "diagnosis_landing_view",
  "diagnosis_retry_click",
  "diagnosis_save_click",
  "diagnosis_save_complete",
  "diagnosis_start",
  "muscle_check_start",
  "muscle_check_complete",
  "organic_landing_page",
  "population_insight_view",
  "related_article_click"
]);

// These two events are the explicitly recorded Phase 1 administrator verification.
// Later events are not assumed to be tests merely because they are low volume.
const DEFAULT_ADMIN_TEST_EVENT_IDS = Object.freeze([
  "sponsor_view_5b7d7efe-ca03-442f-9e5a-f3b7569cc855:sponsor_banner_impression:result_top:hariplus_result_top_v1",
  "sponsor_view_5b7d7efe-ca03-442f-9e5a-f3b7569cc855:sponsor_banner_click:result_top:hariplus_result_top_v1"
]);

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value, available = true, fallback = 0) {
  if (!available || value === null || value === undefined || value === "") return available ? fallback : null;
  return safeNumber(value, fallback);
}

function reportedNumber(value, available = true) {
  if (!available || value === null || value === undefined || value === "") return null;
  return safeNumber(value, null);
}

function normalizedSourceAudit(input = {}) {
  const audit = input.source_audit || { mode: "fixture" };
  if (audit.sources) return audit;
  const state = audit.mode === "fixture" ? "fixture" : audit.mode === "read_only_live" ? "real" : "unknown";
  return {
    ...audit,
    sources: {
      ga4: { state },
      search_console: { state },
      sponsor_db: { state },
      diagnosis_db: { state },
      sanity: { state }
    }
  };
}

function sourceIsAvailable(sourceAudit, key) {
  return ["real", "fixture"].includes(sourceAudit?.sources?.[key]?.state);
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoDateInJst(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${timestamp}`);
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function jstMidnight(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Expected YYYY-MM-DD: ${dateString}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - JST_OFFSET_MS);
}

function addDays(dateString, days) {
  return isoDateInJst(jstMidnight(dateString).getTime() + days * DAY_MS);
}

function weekRange(weekStart) {
  const startAt = jstMidnight(weekStart);
  const endAtExclusive = new Date(startAt.getTime() + 7 * DAY_MS);
  const endDate = addDays(weekStart, 6);
  if (new Date(startAt.getTime() + JST_OFFSET_MS).getUTCDay() !== 1) {
    throw new Error(`Week must start on Monday JST: ${weekStart}`);
  }
  return Object.freeze({
    start_date: weekStart,
    end_date: endDate,
    data_end_date: endDate,
    start_at: startAt.toISOString(),
    end_at_exclusive: endAtExclusive.toISOString(),
    data_end_at_exclusive: endAtExclusive.toISOString(),
    is_current: false,
    timezone: REPORT_TIME_ZONE
  });
}

function currentWeekRange(asOf = new Date()) {
  const reference = new Date(asOf);
  if (Number.isNaN(reference.getTime())) throw new Error(`Invalid as-of date: ${asOf}`);
  const shifted = new Date(reference.getTime() + JST_OFFSET_MS);
  const dayFromMonday = (shifted.getUTCDay() + 6) % 7;
  const currentMondayUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - dayFromMonday
  ) - JST_OFFSET_MS;
  const base = weekRange(isoDateInJst(currentMondayUtc));
  const dataEndDate = isoDateInJst(reference);
  return Object.freeze({
    ...base,
    data_end_date: dataEndDate,
    data_end_at_exclusive: jstMidnight(addDays(dataEndDate, 1)).toISOString(),
    is_current: true
  });
}

function reportingWeekRanges(asOf = new Date(), count = 8) {
  const current = currentWeekRange(asOf);
  return Array.from({ length: count }, (_, index) => {
    const startDate = addDays(current.start_date, -(count - index - 1) * 7);
    return startDate === current.start_date ? current : weekRange(startDate);
  });
}

function previousSameWeekdayRange(asOf = new Date()) {
  const current = currentWeekRange(asOf);
  const base = weekRange(addDays(current.start_date, -7));
  const dataEndDate = addDays(current.data_end_date, -7);
  return Object.freeze({
    ...base,
    data_end_date: dataEndDate,
    data_end_at_exclusive: jstMidnight(addDays(dataEndDate, 1)).toISOString()
  });
}

function completedWeekRanges(asOf = new Date(), count = 8) {
  const reference = new Date(asOf);
  if (Number.isNaN(reference.getTime())) throw new Error(`Invalid as-of date: ${asOf}`);
  const shifted = new Date(reference.getTime() + JST_OFFSET_MS);
  const dayFromMonday = (shifted.getUTCDay() + 6) % 7;
  const currentMondayUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - dayFromMonday) - JST_OFFSET_MS;
  const latestCompletedMonday = currentMondayUtc - 7 * DAY_MS;
  return Array.from({ length: count }, (_, index) => {
    const start = latestCompletedMonday - (count - index - 1) * 7 * DAY_MS;
    return weekRange(isoDateInJst(start));
  });
}

function normalizePath(value) {
  if (!value) return "/";
  let pathname = String(value);
  try {
    pathname = new URL(pathname, SITE_ORIGIN).pathname;
  } catch {
    pathname = String(value).split(/[?#]/)[0] || "/";
  }
  try { pathname = decodeURI(pathname); } catch { /* Keep the source path. */ }
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname === "/" ? pathname : `${pathname.replace(/\/+$/, "")}/`;
}

function canonicalUrl(value) {
  return new URL(normalizePath(value), `${SITE_ORIGIN}/`).href;
}

function isArticlePath(value) {
  const pathname = normalizePath(value);
  return pathname.startsWith(HEALTH_LIBRARY_PREFIX) && pathname !== HEALTH_LIBRARY_PREFIX;
}

function ratio(numerator, denominator) {
  const top = safeNumber(numerator);
  const bottom = safeNumber(denominator);
  return bottom > 0 ? round(top / bottom) : null;
}

function compareMetric(current, previous) {
  const currentNumber = current == null ? null : safeNumber(current, null);
  const previousNumber = previous == null ? null : safeNumber(previous, null);
  if (currentNumber == null) return { current: null, previous: previousNumber, delta: null, percent_change: null, status: "no_data" };
  if (previousNumber == null) return { current: currentNumber, previous: null, delta: null, percent_change: null, status: "no_previous" };
  const delta = round(currentNumber - previousNumber);
  if (previousNumber === 0) {
    return {
      current: currentNumber,
      previous: previousNumber,
      delta,
      percent_change: null,
      status: currentNumber === 0 ? "unchanged_zero" : "new"
    };
  }
  const percentChange = round((delta / previousNumber) * 100, 1);
  return {
    current: currentNumber,
    previous: previousNumber,
    delta,
    percent_change: percentChange,
    status: delta > 0 ? "increase" : delta < 0 ? "decrease" : "unchanged"
  };
}

function weightedPosition(rows) {
  const impressions = rows.reduce((sum, row) => sum + safeNumber(row.impressions), 0);
  if (!impressions) return null;
  return round(rows.reduce((sum, row) => sum + safeNumber(row.position) * safeNumber(row.impressions), 0) / impressions, 2);
}

function aggregateSearchConsole(rows = [], options = {}) {
  if (options.available === false || (!rows.length && options.emptyIsZero !== true)) {
    return { clicks: null, impressions: null, ctr: null, position: null };
  }
  const clicks = rows.reduce((sum, row) => sum + safeNumber(row.clicks), 0);
  const impressions = rows.reduce((sum, row) => sum + safeNumber(row.impressions), 0);
  return {
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position: weightedPosition(rows)
  };
}

function eventCount(events, name) {
  if (events && !Array.isArray(events) && typeof events === "object") return safeNumber(events[name]);
  return (events || []).filter((event) => event.event_name === name).reduce((sum, event) => sum + safeNumber(event.count, 1), 0);
}

function dimensionsKey(event) {
  return [
    event.sponsor_id || "unknown",
    event.creative_id || "unknown",
    event.placement_id || "unknown",
    event.body_part || "unknown",
    event.country_code || "unknown",
    event.region_code || "unknown",
    event.region_name || "unknown"
  ].join("|");
}

function sponsorEventDate(event) {
  if (event.date || event.period_date) return String(event.date || event.period_date).slice(0, 10);
  if (!event.occurred_at) return "unknown";
  return isoDateInJst(event.occurred_at);
}

function aggregateSponsor(sponsor = {}, excludedEventIds = DEFAULT_ADMIN_TEST_EVENT_IDS, options = {}) {
  if (options.available === false) {
    return {
      impressions: null,
      clicks: null,
      ctr: null,
      excluded_admin_tests: { impressions: null, clicks: null },
      by_day: [],
      breakdown: []
    };
  }
  const excluded = new Set(excludedEventIds || []);
  const sponsors = new Map((sponsor.sponsors || []).map((item) => [item.sponsor_id, item]));
  const groups = new Map();
  const days = new Map();
  const excludedCounts = { impressions: 0, clicks: 0 };

  function apply(events, field) {
    (events || []).forEach((event) => {
      const count = Math.max(0, safeNumber(event.count, 1));
      const ids = Array.isArray(event.event_ids) ? event.event_ids : [event.event_id].filter(Boolean);
      const excludedInRow = ids.filter((id) => excluded.has(id)).length;
      const acceptedCount = Math.max(0, count - excludedInRow);
      excludedCounts[field] += excludedInRow;
      if (!acceptedCount) return;
      const key = dimensionsKey(event);
      const sponsorRecord = sponsors.get(event.sponsor_id) || {};
      const group = groups.get(key) || {
        sponsor_id: event.sponsor_id || "unknown",
        sponsor_key: sponsorRecord.sponsor_key || "unknown",
        sponsor_name: sponsorRecord.clinic_name || "unknown",
        creative_id: event.creative_id || "unknown",
        placement_id: event.placement_id || "unknown",
        body_part: event.body_part || "unknown",
        country_code: event.country_code || "unknown",
        region_code: event.region_code || "unknown",
        region_name: event.region_name || "unknown",
        impressions: 0,
        clicks: 0
      };
      group[field] += acceptedCount;
      groups.set(key, group);

      const date = sponsorEventDate(event);
      const day = days.get(date) || { date, impressions: 0, clicks: 0 };
      day[field] += acceptedCount;
      days.set(date, day);
    });
  }

  apply(sponsor.impressions, "impressions");
  apply(sponsor.clicks, "clicks");
  const breakdown = Array.from(groups.values()).map((group) => ({ ...group, ctr: ratio(group.clicks, group.impressions) }));
  const impressions = breakdown.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = breakdown.reduce((sum, row) => sum + row.clicks, 0);
  return {
    impressions,
    clicks,
    ctr: ratio(clicks, impressions),
    excluded_admin_tests: excludedCounts,
    by_day: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({
      ...day,
      ctr: ratio(day.clicks, day.impressions)
    })),
    breakdown
  };
}

function aggregateDiagnosis(diagnosis = {}, ga4Events = {}, options = {}) {
  const diagnosisAvailable = options.diagnosisAvailable !== false;
  const ga4Available = options.ga4Available !== false;
  const startEvents = optionalNumber(diagnosis.start_events ?? diagnosis.starts, diagnosisAvailable);
  const completeEvents = optionalNumber(diagnosis.complete_events ?? diagnosis.completions, diagnosisAvailable);
  const startUniqueSessions = reportedNumber(diagnosis.start_unique_sessions, diagnosisAvailable);
  const completeUniqueSessions = reportedNumber(diagnosis.complete_unique_sessions, diagnosisAvailable);
  const ga4Event = (name) => ga4Available ? eventCount(ga4Events, name) : null;
  const ga4Users = options.ga4EventUsers || {};
  const ga4EventUsers = (name) => reportedNumber(ga4Users?.[name], ga4Available);
  return {
    primary_source: "diagnosis_db",
    starts: startEvents,
    completions: completeEvents,
    completion_rate: ratio(completeEvents, startEvents),
    start_events: startEvents,
    start_unique_sessions: startUniqueSessions,
    start_unique_users: ga4EventUsers("diagnosis_start"),
    complete_events: completeEvents,
    complete_unique_sessions: completeUniqueSessions,
    complete_unique_users: ga4EventUsers("diagnosis_complete"),
    event_completion_rate: ratio(completeEvents, startEvents),
    unique_completion_rate: ratio(completeUniqueSessions, startUniqueSessions),
    anonymous_records: optionalNumber(diagnosis.anonymous_records, diagnosisAvailable),
    body_parts: diagnosisAvailable ? (diagnosis.body_parts || {}) : null,
    ga4_events: {
      muscle_check_start: ga4Event("muscle_check_start"),
      muscle_check_complete: ga4Event("muscle_check_complete"),
      diagnosis_start: ga4Event("diagnosis_start"),
      diagnosis_complete: ga4Event("diagnosis_complete"),
      diagnosis_save_click: ga4Event("diagnosis_save_click"),
      diagnosis_save_complete: ga4Event("diagnosis_save_complete"),
      diagnosis_history_view: ga4Event("diagnosis_history_view"),
      diagnosis_compare_view: ga4Event("diagnosis_compare_view"),
      diagnosis_retry_click: ga4Event("diagnosis_retry_click")
    }
  };
}

function indexByPath(rows = [], pathField = "path") {
  const map = new Map();
  rows.forEach((row) => map.set(normalizePath(row[pathField]), row));
  return map;
}

function joinArticleMetrics(articles = [], ga4 = {}, searchConsole = {}, options = {}) {
  const ga4Available = options.ga4Available !== false;
  const searchAvailable = options.searchAvailable !== false;
  const pageRows = indexByPath(ga4.pages || []);
  const landingRows = indexByPath(ga4.landings || []);
  const eventRows = indexByPath(ga4.article_to_diagnosis || []);
  return articles.map((article) => {
    const pathname = normalizePath(article.url || `${HEALTH_LIBRARY_PREFIX}${article.slug}/`);
    const page = pageRows.get(pathname) || {};
    const landing = landingRows.get(pathname) || {};
    const searchRows = (searchConsole.rows || []).filter((row) => normalizePath(row.page) === pathname);
    const search = aggregateSearchConsole(searchRows, {
      available: searchAvailable,
      emptyIsZero: searchAvailable && Boolean(searchConsole.actual_data_end)
    });
    return {
      title: article.title,
      url: canonicalUrl(pathname),
      path: pathname,
      views: optionalNumber(page.views, ga4Available),
      users: optionalNumber(page.users, ga4Available),
      organic_search_sessions: optionalNumber(landing.organic_search_sessions, ga4Available),
      search_console_impressions: search.impressions,
      search_console_clicks: search.clicks,
      search_console_ctr: search.ctr,
      search_console_position: search.position,
      article_to_diagnosis: optionalNumber((eventRows.get(pathname) || {}).count, ga4Available)
    };
  });
}

const comparisonMetrics = Object.freeze([
  "users",
  "sessions",
  "views",
  "organic_search_sessions",
  "diagnosis_start_events",
  "diagnosis_start_unique",
  "diagnosis_start_unique_users",
  "diagnosis_complete_events",
  "diagnosis_complete_unique",
  "diagnosis_complete_unique_users",
  "diagnosis_saves",
  "sponsor_impressions",
  "sponsor_clicks",
  "sponsor_ctr"
]);

function weekMetricValues(week) {
  return {
    users: optionalNumber(week.ga4.users, week.ga4.users !== null, null),
    sessions: optionalNumber(week.ga4.sessions, week.ga4.sessions !== null, null),
    views: optionalNumber(week.ga4.views, week.ga4.views !== null, null),
    organic_search_sessions: optionalNumber(week.ga4.organic_search_sessions, week.ga4.organic_search_sessions !== null, null),
    diagnosis_start_events: week.diagnosis.start_events,
    diagnosis_start_unique: week.diagnosis.start_unique_sessions,
    diagnosis_start_unique_users: week.diagnosis.start_unique_users,
    diagnosis_complete_events: week.diagnosis.complete_events,
    diagnosis_complete_unique: week.diagnosis.complete_unique_sessions,
    diagnosis_complete_unique_users: week.diagnosis.complete_unique_users,
    diagnosis_saves: week.diagnosis.ga4_events.diagnosis_save_complete,
    sponsor_impressions: week.sponsor.impressions,
    sponsor_clicks: week.sponsor.clicks,
    sponsor_ctr: week.sponsor.ctr
  };
}

function reconciliationRow(source, metric, raw, dashboard) {
  const rawValue = raw === null || raw === undefined ? null : safeNumber(raw, null);
  const dashboardValue = dashboard === null || dashboard === undefined ? null : safeNumber(dashboard, null);
  return {
    source,
    metric,
    raw: rawValue,
    dashboard: dashboardValue,
    matches: rawValue === dashboardValue
  };
}

function buildWeeklyReport(input, options = {}) {
  const sourceAudit = normalizedSourceAudit(input);
  const ga4Available = sourceIsAvailable(sourceAudit, "ga4");
  const searchAvailable = sourceIsAvailable(sourceAudit, "search_console");
  const sponsorAvailable = sourceIsAvailable(sourceAudit, "sponsor_db");
  const diagnosisAvailable = sourceIsAvailable(sourceAudit, "diagnosis_db");
  const articlesAvailable = sourceIsAvailable(sourceAudit, "sanity");
  const excludedEventIds = options.excludedEventIds || input.admin_test_event_ids || DEFAULT_ADMIN_TEST_EVENT_IDS;
  const articles = articlesAvailable && Array.isArray(input.articles) ? input.articles : [];
  const weeks = (input.weeks || []).map((sourceWeek) => {
    const baseRange = weekRange(sourceWeek.week_start);
    const dataEndDate = sourceWeek.data_end_date || baseRange.end_date;
    const range = Object.freeze({
      ...baseRange,
      data_end_date: dataEndDate,
      data_end_at_exclusive: sourceWeek.data_end_at_exclusive || jstMidnight(addDays(dataEndDate, 1)).toISOString(),
      is_current: Boolean(sourceWeek.is_current)
    });
    const ga4 = {
      active_users: optionalNumber(sourceWeek.ga4?.active_users, ga4Available),
      users: optionalNumber(sourceWeek.ga4?.users, ga4Available),
      new_users: optionalNumber(sourceWeek.ga4?.new_users, ga4Available),
      sessions: optionalNumber(sourceWeek.ga4?.sessions, ga4Available),
      views: optionalNumber(sourceWeek.ga4?.views, ga4Available),
      organic_search_sessions: optionalNumber(sourceWeek.ga4?.organic_search_sessions, ga4Available),
      events: ga4Available ? (sourceWeek.ga4?.events || {}) : null,
      event_sessions: ga4Available ? (sourceWeek.ga4?.event_sessions || {}) : null,
      event_users: ga4Available ? (sourceWeek.ga4?.event_users || {}) : null,
      source_timezone: REPORT_TIME_ZONE,
      filtered_host_name: input.site?.host_name || SITE_HOST_NAME
    };
    const sponsor = aggregateSponsor({
      ...(sourceWeek.sponsor || {}),
      sponsors: sourceWeek.sponsor?.sponsors || input.sponsors || []
    }, excludedEventIds, { available: sponsorAvailable });
    const diagnosis = aggregateDiagnosis(sourceWeek.diagnosis, ga4.events, {
      diagnosisAvailable,
      ga4Available,
      ga4EventSessions: ga4.event_sessions,
      ga4EventUsers: ga4.event_users
    });
    const searchSource = sourceWeek.search_console || {};
    const searchPageRows = searchSource.page_rows || searchSource.rows || [];
    const allSearchRows = [
      ...searchPageRows,
      ...(searchSource.query_rows || []),
      ...(searchSource.page_query_rows || [])
    ];
    const returnedDates = [...new Set(allSearchRows.map((row) => row.date).filter(Boolean))].sort();
    const actualDataStart = searchSource.actual_data_start ?? returnedDates[0] ?? null;
    const actualDataEnd = searchSource.actual_data_end ?? returnedDates.at(-1) ?? null;
    const searchConsole = {
      ...aggregateSearchConsole(searchPageRows, {
        available: searchAvailable,
        emptyIsZero: searchAvailable && Boolean(actualDataEnd)
      }),
      rows: searchPageRows,
      page_rows: searchPageRows,
      query_rows: searchSource.query_rows || [],
      page_query_rows: searchSource.page_query_rows || searchSource.rows || [],
      requested_start: searchSource.requested_start || searchSource.requested_start_date || range.start_date,
      requested_end: searchSource.requested_end || searchSource.requested_end_date || range.end_date,
      actual_data_start: actualDataStart,
      actual_data_end: actualDataEnd,
      data_through: actualDataEnd,
      data_state: searchAvailable ? (searchSource.data_state || "final") : "unavailable",
      source_timezone: searchSource.source_timezone || SEARCH_CONSOLE_TIME_ZONE,
      empty_response_is_zero_demand: false,
      top_rows_only: true
    };
    return {
      week: range,
      ga4,
      search_console: searchConsole,
      sponsor,
      diagnosis,
      articles: joinArticleMetrics(articles, sourceWeek.ga4 || {}, searchConsole, { ga4Available, searchAvailable }),
      reconciliation: [
        reconciliationRow("ga4", "users", sourceWeek.ga4?.users, ga4.users),
        reconciliationRow("ga4", "sessions", sourceWeek.ga4?.sessions, ga4.sessions),
        reconciliationRow("ga4", "views", sourceWeek.ga4?.views, ga4.views),
        reconciliationRow("search_console", "impressions", searchConsole.impressions, searchConsole.impressions),
        reconciliationRow("search_console", "clicks", searchConsole.clicks, searchConsole.clicks),
        reconciliationRow("diagnosis_db", "starts", sourceWeek.diagnosis?.starts, diagnosis.starts),
        reconciliationRow("diagnosis_db", "completions", sourceWeek.diagnosis?.completions, diagnosis.completions),
        reconciliationRow("diagnosis_db", "start_unique_sessions", sourceWeek.diagnosis?.start_unique_sessions, diagnosis.start_unique_sessions),
        reconciliationRow("diagnosis_db", "complete_unique_sessions", sourceWeek.diagnosis?.complete_unique_sessions, diagnosis.complete_unique_sessions),
        reconciliationRow("sponsor_db", "impressions", sponsor.impressions, sponsor.impressions),
        reconciliationRow("sponsor_db", "clicks", sponsor.clicks, sponsor.clicks)
      ]
    };
  }).sort((a, b) => a.week.start_date.localeCompare(b.week.start_date));

  weeks.forEach((week, index) => {
    const current = weekMetricValues(week);
    const previous = index > 0 ? weekMetricValues(weeks[index - 1]) : {};
    week.comparison = Object.fromEntries(comparisonMetrics.map((metric) => [metric, compareMetric(current[metric], previous[metric])]));
  });

  const currentWeekComparison = input.current_week_comparison
    ? buildWeeklyReport({
      ...input,
      weeks: [input.current_week_comparison],
      current_week_comparison: null,
      current_week_comparison_period: null
    }, options).weeks[0]
    : null;

  return {
    schema_version: 1,
    generated_at: input.generated_at || new Date().toISOString(),
    report_timezone: REPORT_TIME_ZONE,
    site: {
      origin: input.site?.origin || SITE_ORIGIN,
      host_name: input.site?.host_name || SITE_HOST_NAME
    },
    source_audit: sourceAudit,
    measurement_model: {
      event_audit: EVENT_AUDIT,
      interaction_event_map: INTERACTION_EVENT_MAP,
      source_of_truth: SOURCE_OF_TRUTH
    },
    source_notes: {
      ga4: "GA4 uses the property reporting timezone and is filtered to the Health Check Lab hostname.",
      search_console: "Search Console date rows use America/Los_Angeles and can lag; query rows are top rows, not guaranteed exhaustive.",
      diagnosis_db: "Start/complete events and unique sessions come from diagnosis events. Anonymous session IDs are counted in the collector and are not retained in the report.",
      sponsor_db: "Advertising data remains separate from diagnosis records; only explicitly identified administrator event IDs are excluded."
    },
    current_week_comparison: currentWeekComparison,
    current_week_comparison_period: input.current_week_comparison_period || null,
    weeks
  };
}

function buildWeeklySnapshot(report, options = {}) {
  const weeks = report?.weeks || [];
  const target = options.weekStart
    ? weeks.find((week) => week.week?.start_date === options.weekStart)
    : [...weeks].reverse().find((week) => options.includeCurrent || !week.week?.is_current);
  if (!target) throw new Error("No weekly report period is available for a snapshot.");

  const topArticles = [...(target.articles || [])]
    .sort((a, b) => safeNumber(b.views) - safeNumber(a.views) || safeNumber(b.search_console_impressions) - safeNumber(a.search_console_impressions))
    .slice(0, 10)
    .map((article) => ({
      title: article.title,
      path: article.path,
      views: reportedNumber(article.views),
      users: reportedNumber(article.users),
      organic_search_sessions: reportedNumber(article.organic_search_sessions),
      search_impressions: reportedNumber(article.search_console_impressions),
      search_clicks: reportedNumber(article.search_console_clicks),
      search_ctr: reportedNumber(article.search_console_ctr),
      search_position: reportedNumber(article.search_console_position),
      diagnosis_referrals: reportedNumber(article.article_to_diagnosis)
    }));
  const topBodyParts = Object.entries(target.diagnosis?.body_parts || {})
    .map(([bodyPart, count]) => ({ body_part: bodyPart, count: safeNumber(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 13);
  const regionTotals = new Map();
  (target.sponsor?.breakdown || []).forEach((row) => {
    const key = [row.country_code || "unknown", row.region_code || "unknown", row.region_name || "unknown"].join("|");
    const current = regionTotals.get(key) || {
      country_code: row.country_code || "unknown",
      region_code: row.region_code || "unknown",
      region_name: row.region_name || "unknown",
      impressions: 0,
      clicks: 0
    };
    current.impressions += safeNumber(row.impressions);
    current.clicks += safeNumber(row.clicks);
    regionTotals.set(key, current);
  });
  const topRegions = Array.from(regionTotals.values())
    .map((row) => ({ ...row, ctr: ratio(row.clicks, row.impressions) }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 10);
  const sourceStatus = Object.fromEntries(Object.entries(report?.source_audit?.sources || {}).map(([key, value]) => [key, value?.state || "unknown"]));
  const sourceStates = Object.values(sourceStatus);
  const allSourcesAvailable = sourceStates.length > 0 && sourceStates.every((state) => ["real", "fixture"].includes(state));
  const searchActualEnd = target.search_console?.actual_data_end ?? null;
  const searchRequestedEnd = target.search_console?.requested_end ?? null;
  const searchIsDelayed = Boolean(searchActualEnd && searchRequestedEnd && searchActualEnd < searchRequestedEnd);
  const searchHasNoReturnedRows = sourceStatus.search_console === "real" && !searchActualEnd;
  const dataState = !allSourcesAvailable
    ? "partial_sources"
    : searchHasNoReturnedRows
      ? "complete_without_search_rows"
    : searchIsDelayed
      ? "complete_with_search_lag"
      : "complete";
  const adImpressions = target.sponsor?.impressions ?? null;
  const adDataState = adImpressions == null
    ? "unavailable"
    : adImpressions < 50
      ? "reference_accumulating"
      : "sufficient_sample";
  const sponsorBreakdown = (target.sponsor?.breakdown || []).map((row) => ({
    sponsor_id: row.sponsor_id || "unknown",
    sponsor_key: row.sponsor_key || "unknown",
    clinic_name: row.clinic_name || "",
    creative_id: row.creative_id || "unknown",
    placement_id: row.placement_id || "unknown",
    body_part: row.body_part || "unknown",
    country_code: row.country_code || "unknown",
    region_code: row.region_code || "unknown",
    region_name: row.region_name || "unknown",
    impressions: safeNumber(row.impressions),
    clicks: safeNumber(row.clicks),
    ctr: ratio(row.clicks, row.impressions)
  }));

  return {
    schema_version: 2,
    week_start: target.week.start_date,
    week_end: target.week.end_date,
    generated_at: report.generated_at,
    report_timezone: report.report_timezone || REPORT_TIME_ZONE,
    data_state: dataState,
    users: target.ga4?.users ?? null,
    sessions: target.ga4?.sessions ?? null,
    views: target.ga4?.views ?? null,
    organic_sessions: target.ga4?.organic_search_sessions ?? null,
    search_impressions: target.search_console?.impressions ?? null,
    search_clicks: target.search_console?.clicks ?? null,
    search_ctr: target.search_console?.ctr ?? null,
    search_position: target.search_console?.position ?? null,
    search_actual_start: target.search_console?.actual_data_start ?? null,
    search_actual_end: searchActualEnd,
    diagnosis_start_events: target.diagnosis?.start_events ?? null,
    diagnosis_start_unique_sessions: target.diagnosis?.start_unique_sessions ?? null,
    diagnosis_start_unique_users_equivalent: target.diagnosis?.start_unique_users ?? null,
    diagnosis_complete_events: target.diagnosis?.complete_events ?? null,
    diagnosis_complete_unique_sessions: target.diagnosis?.complete_unique_sessions ?? null,
    diagnosis_complete_unique_users_equivalent: target.diagnosis?.complete_unique_users ?? null,
    diagnosis_event_completion_rate: target.diagnosis?.event_completion_rate ?? null,
    diagnosis_unique_session_completion_rate: target.diagnosis?.unique_completion_rate ?? null,
    records: target.diagnosis?.anonymous_records ?? null,
    retry_count: target.diagnosis?.ga4_events?.diagnosis_retry_click ?? null,
    ad_impressions: target.sponsor?.impressions ?? null,
    ad_clicks: target.sponsor?.clicks ?? null,
    ad_ctr: target.sponsor?.ctr ?? null,
    ad_data_state: adDataState,
    top_articles: topArticles,
    top_body_parts: topBodyParts,
    top_regions: topRegions,
    sponsor_breakdown: sponsorBreakdown,
    source_periods: {
      ga4: { start: target.week.start_date, end: target.week.data_end_date || target.week.end_date, timezone: REPORT_TIME_ZONE },
      diagnosis_db: { start: target.week.start_date, end: target.week.data_end_date || target.week.end_date, timezone: REPORT_TIME_ZONE },
      sponsor_db: { start: target.week.start_date, end: target.week.data_end_date || target.week.end_date, timezone: REPORT_TIME_ZONE },
      search_console: {
        requested_start: target.search_console?.requested_start ?? null,
        requested_end: target.search_console?.requested_end ?? null,
        actual_start: target.search_console?.actual_data_start ?? null,
        actual_end: target.search_console?.actual_data_end ?? null,
        timezone: target.search_console?.source_timezone || SEARCH_CONSOLE_TIME_ZONE
      }
    },
    source_status: sourceStatus
  };
}

function auditEnvironment(env = process.env) {
  const required = [
    "GA4_PROPERTY_ID",
    "GSC_SITE_URL",
    "GA4_HOST_NAME",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
  ];
  const hasGoogleCredentials = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || env.GOOGLE_APPLICATION_CREDENTIALS);
  const fields = Object.fromEntries(required.map((name) => [name, Boolean(env[name])]));
  fields.GOOGLE_SERVICE_ACCOUNT = hasGoogleCredentials;
  return {
    ready: Object.values(fields).every(Boolean),
    fields,
    missing: Object.entries(fields).filter(([, present]) => !present).map(([name]) => name)
  };
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

module.exports = {
  DEFAULT_ADMIN_TEST_EVENT_IDS,
  EVENT_AUDIT,
  GA4_EVENT_NAMES,
  INTERACTION_EVENT_MAP,
  REPORT_TIME_ZONE,
  SEARCH_CONSOLE_TIME_ZONE,
  SITE_HOST_NAME,
  SITE_ORIGIN,
  SOURCE_OF_TRUTH,
  addDays,
  aggregateDiagnosis,
  aggregateSearchConsole,
  aggregateSponsor,
  auditEnvironment,
  buildWeeklySnapshot,
  buildWeeklyReport,
  canonicalUrl,
  compareMetric,
  completedWeekRanges,
  currentWeekRange,
  isArticlePath,
  isoDateInJst,
  joinArticleMetrics,
  loadFixture,
  normalizePath,
  previousSameWeekdayRange,
  ratio,
  reportingWeekRanges,
  weekRange,
  weightedPosition
};
