const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { normalizeDiagnosisPart } = require("../admin/weekly-analytics/dashboard-model");
const {
  GA4_EVENT_NAMES,
  REPORT_TIME_ZONE,
  SEARCH_CONSOLE_TIME_ZONE,
  SITE_HOST_NAME,
  SITE_ORIGIN,
  buildWeeklyReport,
  normalizePath,
  previousSameWeekdayRange,
  reportingWeekRanges
} = require("./weekly-analytics");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_DATA_ROOT = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_ROOT = "https://analyticsadmin.googleapis.com/v1beta";
const SEARCH_CONSOLE_ROOT = "https://www.googleapis.com/webmasters/v3";
const GOOGLE_READ_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly"
]);
const PAGE_SIZE = 1000;

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function loadServiceAccount(env = process.env) {
  let source = "";
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    source = Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8");
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    source = fs.readFileSync(path.resolve(env.GOOGLE_APPLICATION_CREDENTIALS), "utf8");
  } else {
    throw new Error("Google read-only credentials are not configured.");
  }
  const account = JSON.parse(source);
  if (!account.client_email || !account.private_key) throw new Error("The Google service-account file is incomplete.");
  return { client_email: account.client_email, private_key: account.private_key };
}

async function requestJson(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
    const error = new Error("Analytics API request failed");
    error.status = response.status;
    throw error;
  }
  return { body, headers: response.headers, status: response.status };
}

async function createGoogleAccessToken(account, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const scopes = options.scopes || GOOGLE_READ_SCOPES;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: scopes.join(" "),
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${unsigned}.${signature}`
  });
  const { body } = await requestJson(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, options.fetchImpl);
  if (!body?.access_token) throw new Error("Google did not return an access token.");
  return body.access_token;
}

function stringFilter(fieldName, value) {
  return { filter: { fieldName, stringFilter: { matchType: "EXACT", value, caseSensitive: false } } };
}

function inListFilter(fieldName, values) {
  return { filter: { fieldName, inListFilter: { values, caseSensitive: true } } };
}

function ga4HostFilter(hostName, extras = []) {
  const expressions = [stringFilter("hostName", hostName), ...extras];
  return expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
}

function healthCheckGa4Request(hostName, request = {}, extraFilters = []) {
  if (!hostName) throw new Error("GA4_HOST_NAME is required for every Health Check Lab GA4 report.");
  if (request.dimensionFilter) {
    throw new Error("Pass extra GA4 filters separately so the required hostName filter cannot be replaced.");
  }
  return { ...request, dimensionFilter: ga4HostFilter(hostName, extraFilters) };
}

function parseGa4Rows(response = {}) {
  const dimensions = (response.dimensionHeaders || []).map((item) => item.name);
  const metrics = (response.metricHeaders || []).map((item) => item.name);
  return (response.rows || []).map((row) => {
    const result = {};
    dimensions.forEach((name, index) => { result[name] = row.dimensionValues?.[index]?.value || ""; });
    metrics.forEach((name, index) => {
      const raw = row.metricValues?.[index]?.value;
      const number = Number(raw);
      result[name] = Number.isFinite(number) ? number : raw;
    });
    return result;
  });
}

async function runGa4Report(propertyId, accessToken, request, fetchImpl = fetch) {
  const rows = [];
  rows.data_quality = {};
  let offset = 0;
  let rowCount = 0;
  do {
    const { body } = await requestJson(`${GA4_DATA_ROOT}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, limit: "100000", offset: String(offset), keepEmptyRows: false })
    }, fetchImpl);
    rows.data_quality.thresholded ||= Boolean(body?.metadata?.subjectToThresholding);
    rows.data_quality.other_row ||= Boolean(body?.metadata?.dataLossFromOtherRow);
    rows.data_quality.sampled ||= Boolean(body?.metadata?.samplingMetadatas?.length);
    const page = parseGa4Rows(body);
    rows.push(...page);
    rowCount = Number(body?.rowCount || rows.length);
    offset += page.length;
    if (!page.length) break;
  } while (offset < rowCount);
  return rows;
}

function sumRowsByPath(rows, mapping) {
  const result = new Map();
  rows.forEach((row) => {
    const pathName = normalizePath(row.pagePath || row.landingPagePlusQueryString || "/");
    const current = result.get(pathName) || { path: pathName };
    Object.entries(mapping).forEach(([target, source]) => {
      current[target] = Number(current[target] || 0) + Number(row[source] || 0);
    });
    if (row.pageTitle && !current.title) current.title = row.pageTitle;
    result.set(pathName, current);
  });
  return Array.from(result.values());
}

async function getGa4Property(propertyId, accessToken, fetchImpl = fetch) {
  const { body } = await requestJson(`${GA4_ADMIN_ROOT}/properties/${propertyId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, fetchImpl);
  return body;
}

async function collectGa4Week(range, config, accessToken, fetchImpl = fetch) {
  const measurementSource = ga4MeasurementSource(range, config);
  const dateRanges = [{ startDate: range.start_date, endDate: range.data_end_date || range.end_date }];
  const overviewRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    metrics: ["activeUsers", "totalUsers", "newUsers", "sessions", "screenPageViews"].map((name) => ({ name }))
  }), fetchImpl);
  const organicRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    metrics: [{ name: "sessions" }, { name: "activeUsers" }]
  }, [stringFilter("sessionDefaultChannelGroup", "Organic Search")]), fetchImpl);
  const pageRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }]
  }), fetchImpl);
  const landingRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }]
  }, [stringFilter("sessionDefaultChannelGroup", "Organic Search")]), fetchImpl);
  const eventRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    dimensions: [{ name: "eventName" }, { name: "pagePath" }],
    metrics: [{ name: "eventCount" }]
  }, [inListFilter("eventName", GA4_EVENT_NAMES)]), fetchImpl);
  const eventSummaryRows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
    dateRanges,
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "sessions" }, { name: "totalUsers" }]
  }, [inListFilter("eventName", GA4_EVENT_NAMES)]), fetchImpl);

  let growthEvents;
  try {
    const rows = await runGa4Report(config.ga4PropertyId, accessToken, healthCheckGa4Request(config.ga4HostName, {
      dateRanges, dimensions: [{ name: "landingPagePlusQueryString" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }]
    }, [stringFilter("sessionDefaultChannelGroup", "Organic Search"), inListFilter("eventName", ["muscle_check_start", "muscle_check_complete", "article_to_diagnosis"])]), fetchImpl);
    growthEvents = { state: "real", rows, data_quality: rows.data_quality };
  } catch (error) { growthEvents = sourceError(error); }
  const overview = overviewRows[0] || {};
  const events = {};
  const eventSessions = {};
  const eventUsers = {};
  eventSummaryRows.forEach((row) => {
    events[row.eventName] = Number(row.eventCount || 0);
    eventSessions[row.eventName] = Number(row.sessions || 0);
    eventUsers[row.eventName] = Number(row.totalUsers || 0);
  });
  const articleClicks = sumRowsByPath(eventRows.filter((row) => row.eventName === "article_to_diagnosis"), { count: "eventCount" });
  return {
    measurement_source: measurementSource,
    active_users: overview.activeUsers ?? null,
    users: overview.totalUsers ?? null,
    new_users: overview.newUsers ?? null,
    sessions: overview.sessions ?? null,
    views: overview.screenPageViews ?? null,
    organic_search_sessions: organicRows[0]?.sessions ?? null,
    organic_search_users: organicRows[0]?.activeUsers ?? null,
    growth_events: growthEvents,
    data_state: overviewRows.length ? "rows_returned" : "no_rows",
    row_availability: {
      overview: overviewRows.length, organic: organicRows.length, pages: pageRows.length,
      landings: landingRows.length, article_events: eventRows.length, event_summary: eventSummaryRows.length
    },
    pages: sumRowsByPath(pageRows, { views: "screenPageViews", users: "totalUsers" }),
    landings: sumRowsByPath(landingRows, { organic_search_sessions: "sessions" }),
    article_to_diagnosis: articleClicks,
    events,
    event_sessions: eventSessions,
    event_users: eventUsers
  };
}

function searchConsoleRequestBody(range, startRow = 0, dimensions = ["date", "page", "query"]) {
  return {
    startDate: range.start_date,
    endDate: range.data_end_date || range.end_date,
    dimensions,
    type: "web",
    dataState: "final",
    aggregationType: "auto",
    rowLimit: 25000,
    startRow
  };
}

async function collectSearchConsoleRows(range, dimensions, config, accessToken, fetchImpl = fetch, dataState = "final") {
  const rows = [];
  let startRow = 0;
  let metadata = {};
  while (true) {
    const { body } = await requestJson(`${SEARCH_CONSOLE_ROOT}/sites/${encodeURIComponent(config.gscSiteUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...searchConsoleRequestBody(range, startRow, dimensions), dataState })
    }, fetchImpl);
    metadata = body?.responseAggregationType ? { response_aggregation_type: body.responseAggregationType } : metadata;
    if (body?.metadata?.first_incomplete_date) metadata.first_incomplete_date = body.metadata.first_incomplete_date;
    const page = body?.rows || [];
    page.forEach((row) => {
      const dimensionsResult = Object.fromEntries(dimensions.map((name, index) => [name, row.keys?.[index] || null]));
      rows.push({
        ...dimensionsResult,
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0)
      });
    });
    if (page.length < 25000) break;
    startRow += page.length;
  }
  return { rows, metadata };
}

async function collectSearchConsoleWeek(range, config, accessToken, fetchImpl = fetch) {
  const [pages, queries, pageQueries] = await Promise.all([
    collectSearchConsoleRows(range, ["date", "page"], config, accessToken, fetchImpl),
    collectSearchConsoleRows(range, ["date", "query"], config, accessToken, fetchImpl),
    collectSearchConsoleRows(range, ["date", "page", "query"], config, accessToken, fetchImpl)
  ]);
  const availableDates = [...new Set([
    ...pages.rows,
    ...queries.rows,
    ...pageQueries.rows
  ].map((row) => row.date).filter(Boolean))].sort();
  const actualDataStart = availableDates[0] || null;
  const actualDataEnd = availableDates.at(-1) || null;
  return {
    rows: pages.rows,
    page_rows: pages.rows,
    query_rows: queries.rows,
    page_query_rows: pageQueries.rows,
    data_state: "final",
    coverage: config.gscCoverage || { confirmed_through: null, method: "not_probed" },
    data_through: actualDataEnd,
    requested_start: range.start_date,
    requested_end: range.data_end_date || range.end_date,
    actual_data_start: actualDataStart,
    actual_data_end: actualDataEnd,
    requested_start_date: range.start_date,
    requested_end_date: range.data_end_date || range.end_date,
    source_timezone: SEARCH_CONSOLE_TIME_ZONE,
    response_aggregation: {
      pages: pages.metadata.response_aggregation_type || null,
      queries: queries.metadata.response_aggregation_type || null,
      page_queries: pageQueries.metadata.response_aggregation_type || null
    }
  };
}

function ga4MeasurementSource(range, config) {
  const cutover = config.ga4CutoverAt || null;
  if (cutover && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(cutover) || !Number.isFinite(Date.parse(cutover)))) throw new Error("Invalid GA4 cutover timestamp.");
  if ((config.ga4PropertyId === "559060240" || config.gaMeasurementId === "G-PWV5LBJEQ7") && (config.ga4PropertyId !== "559060240" || config.gaMeasurementId !== "G-PWV5LBJEQ7")) throw new Error("GA4 property and measurement configuration mismatch.");
  const start = range.start_at || `${range.start_date}T00:00:00+09:00`;
  const end = range.data_end_at_exclusive || range.end_at_exclusive || `${range.end_date}T23:59:59.999+09:00`;
  const state = cutover ? Date.parse(end) <= Date.parse(cutover) ? "pre_cutover" : Date.parse(start) < Date.parse(cutover) ? "cutover_period" : "post_cutover" : config.ga4PropertyId === "559060240" ? "cutover_pending" : "identified";
  return { property_id: config.ga4PropertyId || null, measurement_id: config.gaMeasurementId || null, host_name: config.ga4HostName || null, cutover_at: cutover, state };
}

async function collectSearchConsoleCoverage(ranges, config, token, asOf, fetchImpl = fetch) {
  // A later finalized date is a conservative watermark, even when Sundays have no traffic.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SEARCH_CONSOLE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(asOf));
  const range = { start_date: ranges.map(r => r.start_date).sort()[0], end_date: today };
  try {
    const [all, final] = await Promise.all([
      collectSearchConsoleRows(range, ["date"], config, token, fetchImpl, "all"),
      collectSearchConsoleRows(range, ["date"], config, token, fetchImpl, "final")
    ]);
    const incomplete = all.metadata.first_incomplete_date;
    const through = incomplete ? new Date(Date.parse(incomplete + "T00:00:00Z") - 86400000).toISOString().slice(0, 10) : final.rows.map(r => r.date).filter(Boolean).sort().at(-1) || null;
    return { confirmed_through: through, first_incomplete_date: incomplete || null, method: incomplete ? "api_first_incomplete_date" : through ? "latest_final_date_lower_bound" : "unknown", fetched_at: new Date().toISOString() };
  } catch { return { confirmed_through: null, method: "probe_failed", fetched_at: null }; }
}

function supabaseHeaders(serviceKey, rangeStart, rangeEnd) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    Prefer: "count=exact",
    Range: `${rangeStart}-${rangeEnd}`
  };
}

async function supabaseSelect(table, params, config, fetchImpl = fetch) {
  const rows = [];
  let from = 0;
  while (true) {
    const url = new URL(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`);
    Object.entries(params).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((item) => url.searchParams.append(key, item));
    });
    const { body } = await requestJson(url, {
      method: "GET",
      headers: supabaseHeaders(config.supabaseServiceRoleKey, from, from + PAGE_SIZE - 1)
    }, fetchImpl);
    const page = Array.isArray(body) ? body : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += page.length;
  }
  return rows;
}

function timeRangeParams(column, range) {
  return {
    [column]: [`gte.${range.start_at}`, `lt.${range.data_end_at_exclusive || range.end_at_exclusive}`],
    order: `${column}.asc`
  };
}

function countBy(rows, key, normalize = value => value || "unknown") {
  return rows.reduce((result, row) => {
    const label = normalize(row[key]);
    result[label] = Number(result[label] || 0) + 1;
    return result;
  }, {});
}

async function collectSupabaseWeek(range, config, sponsors, fetchImpl = fetch) {
  const [sponsor, diagnosis] = await Promise.all([
    collectSponsorWeek(range, config, sponsors, fetchImpl),
    collectDiagnosisWeek(range, config, fetchImpl)
  ]);
  return { sponsor, diagnosis };
}

async function collectSponsorWeek(range, config, sponsors, fetchImpl = fetch) {
  const [impressions, clicks] = await Promise.all([
    supabaseSelect("sponsor_impressions", {
      select: "event_id,sponsor_id,creative_id,placement_id,body_part,country_code,region_code,region_name,occurred_at",
      ...timeRangeParams("occurred_at", range)
    }, config, fetchImpl),
    supabaseSelect("sponsor_clicks", {
      select: "event_id,sponsor_id,creative_id,placement_id,body_part,country_code,region_code,region_name,occurred_at",
      ...timeRangeParams("occurred_at", range)
    }, config, fetchImpl)
  ]);
  return { sponsors, impressions, clicks };
}

async function collectDiagnosisWeek(range, config, fetchImpl = fetch) {
  const [diagnosisEvents, anonymousRecords] = await Promise.all([
    supabaseSelect(config.diagnosisEventsTable, {
      select: "event_name,selected_region,anonymous_session_id,created_at",
      ...timeRangeParams("created_at", range)
    }, config, fetchImpl),
    supabaseSelect(config.anonymousRecordsTable, {
      select: "body_part,diagnosis_date",
      ...timeRangeParams("diagnosis_date", range)
    }, config, fetchImpl)
  ]);
  const started = diagnosisEvents.filter((row) => row.event_name === "diagnosis_started");
  const completed = diagnosisEvents.filter((row) => row.event_name === "diagnosis_completed");
  const uniqueSessions = (rows) => new Set(rows.map((row) => row.anonymous_session_id).filter(Boolean)).size;
  return {
    starts: started.length,
    start_unique_sessions: uniqueSessions(started),
    completions: completed.length,
    complete_unique_sessions: uniqueSessions(completed),
    anonymous_records: anonymousRecords.length,
    body_parts: countBy(completed.length ? completed : anonymousRecords, completed.length ? "selected_region" : "body_part", normalizeDiagnosisPart)
  };
}

async function fetchPublishedArticles(config, fetchImpl = fetch) {
  const { body } = await requestJson(`${config.siteOrigin}/data/sanity-articles/index.json`, {}, fetchImpl);
  if (!Array.isArray(body)) throw new Error("The production article index did not return an array.");
  return body.map((article) => ({
    id: article.id,
    title: article.title,
    slug: article.slug,
    url: `/health-library/${article.slug}/`
  }));
}

function configFromEnvironment(env = process.env) {
  return {
    ga4PropertyId: String(env.GA4_PROPERTY_ID || "").replace(/^properties\//, ""),
    gaMeasurementId: env.GA_MEASUREMENT_ID || "",
    ga4CutoverAt: env.GA4_CUTOVER_AT || "",
    ga4HostName: env.GA4_HOST_NAME || "",
    gscSiteUrl: env.GSC_SITE_URL || "",
    siteOrigin: String(env.SITE_URL || SITE_ORIGIN).replace(/\/$/, ""),
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    diagnosisEventsTable: env.MUSCLE_DIAGNOSIS_EVENTS_TABLE || "muscle_diagnosis_events",
    anonymousRecordsTable: env.ANONYMOUS_DIAGNOSIS_RECORDS_TABLE || "anonymous_diagnosis_records"
  };
}

function assertLiveConfiguration(config) {
  const required = ["ga4PropertyId", "ga4HostName", "gscSiteUrl", "supabaseUrl", "supabaseServiceRoleKey"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing live analytics configuration: ${missing.join(", ")}`);
}

function sourceError(error) {
  const status = error?.status;
  const reason = status === 401 ? "authentication_failed" : status === 403 ? "permission_denied" : status === 429 ? "rate_limited" : error?.name === "TimeoutError" ? "timeout" : "api_request_failed";
  return { state: "error", reason, http_status: status || null };
}

function missingConfiguration(names) {
  return { state: "missing_configuration", missing: names };
}

async function collectRangeSeries(ranges, collector) {
  const values = [];
  for (const range of ranges) values.push(await collector(range));
  return values;
}

function reportMode(sources) {
  const states = Object.values(sources).map((source) => source.state);
  if (states.every((state) => state === "real")) return "real";
  if (states.some((state) => state === "real")) return "mixed";
  if (states.every((state) => state === "fixture")) return "fixture";
  return "unavailable";
}

async function collectAvailableLiveInput(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = configFromEnvironment(env);
  const asOf = options.asOf || new Date();
  const ranges = options.ranges || reportingWeekRanges(asOf, options.weekCount || 8);
  const comparisonRange = options.includeComparison === false ? null : previousSameWeekdayRange(asOf);
  const attemptedAt = new Date().toISOString();
  const sources = {};
  let articles = [];

  try {
    articles = await fetchPublishedArticles(config, fetchImpl);
    sources.sanity = { state: "real", article_count: articles.length, origin: config.siteOrigin };
  } catch (error) {
    sources.sanity = sourceError(error);
  }

  const hasGoogleCredentials = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || env.GOOGLE_APPLICATION_CREDENTIALS);
  let accessToken = null;
  let googleCredentialError = false;
  if (hasGoogleCredentials) {
    try {
      accessToken = await createGoogleAccessToken(loadServiceAccount(env), { fetchImpl });
    } catch {
      googleCredentialError = true;
    }
  }

  let ga4Weeks = ranges.map(() => ({}));
  let ga4Comparison = {};
  const ga4Missing = [
    !config.ga4PropertyId && "GA4_PROPERTY_ID",
    !config.ga4HostName && "GA4_HOST_NAME",
    !hasGoogleCredentials && "GOOGLE_SERVICE_ACCOUNT"
  ].filter(Boolean);
  if (ga4Missing.length) {
    sources.ga4 = missingConfiguration(ga4Missing);
  } else if (config.ga4HostName !== SITE_HOST_NAME) {
    sources.ga4 = { state: "error", reason: "invalid_host_filter" };
  } else if (googleCredentialError || !accessToken) {
    sources.ga4 = sourceError();
  } else {
    try {
      const ga4Property = await getGa4Property(config.ga4PropertyId, accessToken, fetchImpl);
      if (ga4Property.timeZone !== REPORT_TIME_ZONE) {
        throw new Error("Unexpected GA4 property timezone.");
      }
      ga4Weeks = await collectRangeSeries(ranges, (range) => collectGa4Week(range, config, accessToken, fetchImpl));
      if (comparisonRange) ga4Comparison = await collectGa4Week(comparisonRange, config, accessToken, fetchImpl);
      sources.ga4 = {
        state: "real",
        property_id: config.ga4PropertyId,
        property_display_name: ga4Property.displayName || null,
        property_timezone: ga4Property.timeZone,
        host_filter: config.ga4HostName,
        data_state: ga4Weeks.every(w => w.data_state === "no_rows") ? "no_rows" : "rows_returned"
      };
    } catch (error) {
      sources.ga4 = sourceError(error);
      ga4Weeks = ranges.map(() => ({}));
    }
  }

  let searchWeeks = ranges.map(() => ({}));
  let searchComparison = {};
  const gscMissing = [
    !config.gscSiteUrl && "GSC_SITE_URL",
    !hasGoogleCredentials && "GOOGLE_SERVICE_ACCOUNT"
  ].filter(Boolean);
  if (gscMissing.length) {
    sources.search_console = missingConfiguration(gscMissing);
  } else if (googleCredentialError || !accessToken) {
    sources.search_console = sourceError();
  } else {
    try {
      config.gscCoverage = await collectSearchConsoleCoverage(ranges, config, accessToken, asOf, fetchImpl);
      searchWeeks = await collectRangeSeries(ranges, (range) => collectSearchConsoleWeek(range, config, accessToken, fetchImpl));
      if (comparisonRange) searchComparison = await collectSearchConsoleWeek(comparisonRange, config, accessToken, fetchImpl);
      sources.search_console = {
        state: "real",
        property: config.gscSiteUrl,
        timezone: SEARCH_CONSOLE_TIME_ZONE,
        data_state: searchWeeks.every(w => !w.actual_data_end) ? "no_rows" : "rows_returned"
      };
    } catch (error) {
      sources.search_console = sourceError(error);
      searchWeeks = ranges.map(() => ({}));
    }
  }

  const databaseMissing = [
    !config.supabaseUrl && "SUPABASE_URL",
    !config.supabaseServiceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"
  ].filter(Boolean);
  let sponsorWeeks = ranges.map(() => ({}));
  let diagnosisWeeks = ranges.map(() => ({}));
  let sponsorComparison = {};
  let diagnosisComparison = {};
  if (databaseMissing.length) {
    sources.sponsor_db = missingConfiguration(databaseMissing);
    sources.diagnosis_db = missingConfiguration(databaseMissing);
  } else {
    try {
      const sponsors = await supabaseSelect("sponsors", {
        select: "sponsor_id,sponsor_key,clinic_name,status"
      }, config, fetchImpl);
      sponsorWeeks = await collectRangeSeries(ranges, (range) => collectSponsorWeek(range, config, sponsors, fetchImpl));
      if (comparisonRange) sponsorComparison = await collectSponsorWeek(comparisonRange, config, sponsors, fetchImpl);
      sources.sponsor_db = { state: "real", sponsor_count: sponsors.length };
    } catch {
      sources.sponsor_db = sourceError();
      sponsorWeeks = ranges.map(() => ({}));
    }
    try {
      diagnosisWeeks = await collectRangeSeries(ranges, (range) => collectDiagnosisWeek(range, config, fetchImpl));
      if (comparisonRange) diagnosisComparison = await collectDiagnosisWeek(comparisonRange, config, fetchImpl);
      sources.diagnosis_db = {
        state: "real",
        events_table: config.diagnosisEventsTable,
        anonymous_records_table: config.anonymousRecordsTable
      };
    } catch {
      sources.diagnosis_db = sourceError();
      diagnosisWeeks = ranges.map(() => ({}));
    }
  }

  for (const source of Object.values(sources)) { source.attempted_at = attemptedAt; source.fetched_at = source.state === "real" ? new Date().toISOString() : null; }
  return {
    generated_at: new Date().toISOString(),
    site: { origin: config.siteOrigin, host_name: config.ga4HostName || SITE_HOST_NAME },
    source_audit: {
      mode: reportMode(sources),
      read_only: true,
      sources
    },
    articles,
    weeks: ranges.map((range, index) => ({
      week_start: range.start_date,
      data_end_date: range.data_end_date,
      data_end_at_exclusive: range.data_end_at_exclusive,
      is_current: range.is_current,
      ga4: ga4Weeks[index],
      search_console: searchWeeks[index],
      sponsor: sponsorWeeks[index],
      diagnosis: diagnosisWeeks[index]
    })),
    current_week_comparison: comparisonRange ? {
      week_start: comparisonRange.start_date,
      data_end_date: comparisonRange.data_end_date,
      data_end_at_exclusive: comparisonRange.data_end_at_exclusive,
      ga4: ga4Comparison,
      search_console: searchComparison,
      sponsor: sponsorComparison,
      diagnosis: diagnosisComparison
    } : null,
    current_week_comparison_period: comparisonRange ? {
      start_date: comparisonRange.start_date,
      end_date: comparisonRange.data_end_date
    } : null
  };
}

async function collectLiveInput(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = configFromEnvironment(env);
  assertLiveConfiguration(config);
  const account = loadServiceAccount(env);
  const accessToken = await createGoogleAccessToken(account, { fetchImpl });
  const ga4Property = await getGa4Property(config.ga4PropertyId, accessToken, fetchImpl);
  if (ga4Property.timeZone !== REPORT_TIME_ZONE) {
    throw new Error(`GA4 property timezone is ${ga4Property.timeZone || "unknown"}; expected ${REPORT_TIME_ZONE}.`);
  }
  const asOf = options.asOf || new Date();
  const ranges = reportingWeekRanges(asOf, options.weekCount || 8);
  config.gscCoverage = await collectSearchConsoleCoverage(ranges, config, accessToken, asOf, fetchImpl);
  const comparisonRange = previousSameWeekdayRange(asOf);
  const sponsors = await supabaseSelect("sponsors", {
    select: "sponsor_id,sponsor_key,clinic_name,status"
  }, config, fetchImpl);
  const articles = await fetchPublishedArticles(config, fetchImpl);
  const weeks = [];
  for (const range of ranges) {
    const [ga4, searchConsole, database] = await Promise.all([
      collectGa4Week(range, config, accessToken, fetchImpl),
      collectSearchConsoleWeek(range, config, accessToken, fetchImpl),
      collectSupabaseWeek(range, config, sponsors, fetchImpl)
    ]);
    weeks.push({
      week_start: range.start_date,
      data_end_date: range.data_end_date,
      data_end_at_exclusive: range.data_end_at_exclusive,
      is_current: range.is_current,
      ga4,
      search_console: searchConsole,
      ...database
    });
  }
  const [comparisonGa4, comparisonSearchConsole, comparisonDatabase] = await Promise.all([
    collectGa4Week(comparisonRange, config, accessToken, fetchImpl),
    collectSearchConsoleWeek(comparisonRange, config, accessToken, fetchImpl),
    collectSupabaseWeek(comparisonRange, config, sponsors, fetchImpl)
  ]);
  return {
    generated_at: new Date().toISOString(),
    site: { origin: config.siteOrigin, host_name: config.ga4HostName },
    source_audit: {
      ga4_property_id: config.ga4PropertyId,
      ga4_property_display_name: ga4Property.displayName || null,
      ga4_property_timezone: ga4Property.timeZone,
      ga4_host_filter: config.ga4HostName,
      search_console_property: config.gscSiteUrl,
      search_console_timezone: SEARCH_CONSOLE_TIME_ZONE,
      mode: "read_only_live"
    },
    articles,
    weeks,
    current_week_comparison: {
      week_start: comparisonRange.start_date,
      data_end_date: comparisonRange.data_end_date,
      data_end_at_exclusive: comparisonRange.data_end_at_exclusive,
      ga4: comparisonGa4,
      search_console: comparisonSearchConsole,
      ...comparisonDatabase
    },
    current_week_comparison_period: {
      start_date: comparisonRange.start_date,
      end_date: comparisonRange.data_end_date
    }
  };
}

async function collectLiveReport(options = {}) {
  return buildWeeklyReport(await collectLiveInput(options), options);
}

async function collectAvailableLiveReport(options = {}) {
  return buildWeeklyReport(await collectAvailableLiveInput(options), options);
}

module.exports = {
  GA4_ADMIN_ROOT,
  GA4_DATA_ROOT,
  GOOGLE_READ_SCOPES,
  SEARCH_CONSOLE_ROOT,
  assertLiveConfiguration,
  collectAvailableLiveInput,
  collectAvailableLiveReport,
  collectDiagnosisWeek,
  collectGa4Week,
  collectLiveInput,
  collectLiveReport,
  collectSearchConsoleRows,
  collectSearchConsoleCoverage,
  ga4MeasurementSource,
  collectSearchConsoleWeek,
  collectSponsorWeek,
  collectSupabaseWeek,
  configFromEnvironment,
  createGoogleAccessToken,
  fetchPublishedArticles,
  ga4HostFilter,
  getGa4Property,
  healthCheckGa4Request,
  loadServiceAccount,
  parseGa4Rows,
  runGa4Report,
  searchConsoleRequestBody,
  supabaseSelect,
  timeRangeParams
};
