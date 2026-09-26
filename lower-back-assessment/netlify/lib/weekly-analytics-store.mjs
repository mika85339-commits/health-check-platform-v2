import weeklyAnalytics from "../../scripts/weekly-analytics.js";
import weeklySources from "../../scripts/weekly-analytics-sources.js";

const {
  DEFAULT_ADMIN_TEST_EVENT_IDS,
  REPORT_TIME_ZONE,
  SITE_HOST_NAME,
  SITE_ORIGIN,
  buildWeeklySnapshot,
  completedWeekRanges
} = weeklyAnalytics;
const { collectAvailableLiveReport } = weeklySources;

const SNAPSHOT_TABLE = "weekly_metric_snapshots";
const EXCLUSION_TABLE = "analytics_event_exclusions";

function databaseConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Weekly analytics database configuration is incomplete.");
  return { supabaseUrl, serviceRoleKey };
}

async function supabaseJson(path, options = {}, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const { supabaseUrl, serviceRoleKey } = databaseConfig(env);
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Weekly analytics database request failed (${response.status}).`);
  return text ? JSON.parse(text) : null;
}

async function listEventExclusions(deps = {}) {
  try {
    const rows = await supabaseJson(`${EXCLUSION_TABLE}?select=event_id&source=eq.sponsor_db`, { method: "GET" }, deps);
    const ids = (rows || []).map((row) => String(row.event_id || "")).filter(Boolean);
    return ids.length ? ids : [...DEFAULT_ADMIN_TEST_EVENT_IDS];
  } catch {
    return [...DEFAULT_ADMIN_TEST_EVENT_IDS];
  }
}

function snapshotQuery(options = {}) {
  const params = new URLSearchParams({ select: "*", order: "week_start.desc" });
  if (options.weekStart) params.set("week_start", `eq.${options.weekStart}`);
  params.set("limit", String(Math.max(1, Math.min(8, Number(options.limit) || 8))));
  return `${SNAPSHOT_TABLE}?${params}`;
}

async function listSnapshots(options = {}, deps = {}) {
  return await supabaseJson(snapshotQuery(options), { method: "GET" }, deps) || [];
}

async function upsertSnapshot(snapshot, deps = {}) {
  const row = { ...snapshot, updated_at: new Date().toISOString() };
  const rows = await supabaseJson(`${SNAPSHOT_TABLE}?on_conflict=week_start,week_end`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([row])
  }, deps);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Snapshot upsert did not return exactly one row.");
  return rows[0];
}

function snapshotToWeek(snapshot) {
  const sourcePeriods = snapshot.source_periods || {};
  const articles = (snapshot.top_articles || []).map((article) => ({
    title: article.title || "",
    path: article.path || "/",
    url: new URL(article.path || "/", `${SITE_ORIGIN}/`).href,
    views: article.views ?? null,
    users: article.users ?? null,
    organic_search_sessions: article.organic_search_sessions ?? null,
    search_console_impressions: article.search_impressions ?? null,
    search_console_clicks: article.search_clicks ?? null,
    search_console_ctr: article.search_ctr ?? null,
    search_console_position: article.search_position ?? null,
    article_to_diagnosis: article.diagnosis_referrals ?? null
  }));
  const bodyParts = Object.fromEntries((snapshot.top_body_parts || []).map((row) => [row.body_part, Number(row.count || 0)]));
  return {
    week: {
      start_date: snapshot.week_start,
      end_date: snapshot.week_end,
      data_end_date: snapshot.week_end,
      is_current: false,
      timezone: snapshot.report_timezone || REPORT_TIME_ZONE
    },
    ga4: {
      users: snapshot.users ?? null,
      sessions: snapshot.sessions ?? null,
      views: snapshot.views ?? null,
      organic_search_sessions: snapshot.organic_sessions ?? null,
      events: null,
      event_sessions: null,
      event_users: null,
      source_timezone: REPORT_TIME_ZONE,
      filtered_host_name: SITE_HOST_NAME
    },
    search_console: {
      impressions: snapshot.search_impressions ?? null,
      clicks: snapshot.search_clicks ?? null,
      ctr: snapshot.search_ctr ?? null,
      position: snapshot.search_position ?? null,
      rows: [],
      page_rows: [],
      query_rows: [],
      page_query_rows: [],
      requested_start: sourcePeriods.search_console?.requested_start || snapshot.week_start,
      requested_end: sourcePeriods.search_console?.requested_end || snapshot.week_end,
      actual_data_start: snapshot.search_actual_start ?? sourcePeriods.search_console?.actual_start ?? null,
      actual_data_end: snapshot.search_actual_end ?? sourcePeriods.search_console?.actual_end ?? null,
      data_state: snapshot.data_state || "complete",
      source_timezone: sourcePeriods.search_console?.timezone || "America/Los_Angeles"
    },
    sponsor: {
      impressions: snapshot.ad_impressions ?? null,
      clicks: snapshot.ad_clicks ?? null,
      ctr: snapshot.ad_ctr ?? null,
      excluded_admin_tests: {},
      by_day: [],
      breakdown: snapshot.sponsor_breakdown || []
    },
    diagnosis: {
      primary_source: "weekly_metric_snapshots",
      starts: snapshot.diagnosis_start_events ?? null,
      completions: snapshot.diagnosis_complete_events ?? null,
      completion_rate: snapshot.diagnosis_event_completion_rate ?? null,
      start_events: snapshot.diagnosis_start_events ?? null,
      start_unique_sessions: snapshot.diagnosis_start_unique_sessions ?? null,
      start_unique_users: snapshot.diagnosis_start_unique_users_equivalent ?? null,
      complete_events: snapshot.diagnosis_complete_events ?? null,
      complete_unique_sessions: snapshot.diagnosis_complete_unique_sessions ?? null,
      complete_unique_users: snapshot.diagnosis_complete_unique_users_equivalent ?? null,
      event_completion_rate: snapshot.diagnosis_event_completion_rate ?? null,
      unique_completion_rate: snapshot.diagnosis_unique_session_completion_rate ?? null,
      anonymous_records: snapshot.records ?? null,
      body_parts: bodyParts,
      ga4_events: { diagnosis_retry_click: snapshot.retry_count ?? null }
    },
    articles,
    reconciliation: [],
    snapshot: {
      data_state: snapshot.data_state,
      generated_at: snapshot.generated_at,
      schema_version: snapshot.schema_version
    }
  };
}

function mergeSnapshotsWithCurrent(liveReport, snapshots) {
  const current = (liveReport.weeks || []).find((week) => week.week?.is_current) || liveReport.weeks?.at(-1);
  const prior = [...(snapshots || [])]
    .filter((snapshot) => snapshot.week_start !== current?.week?.start_date)
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map(snapshotToWeek);
  return {
    ...liveReport,
    schema_version: 2,
    snapshot_policy: "completed_weeks_prefer_snapshot",
    weeks: [...prior.slice(-7), ...(current ? [current] : [])]
  };
}

async function collectDashboardReport(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const excludedEventIds = await listEventExclusions({ env, fetchImpl });
  const [liveReport, snapshots] = await Promise.all([
    collectAvailableLiveReport({ env, fetchImpl, weekCount: 1, excludedEventIds }),
    listSnapshots({ limit: 7 }, { env, fetchImpl })
  ]);
  return mergeSnapshotsWithCurrent(liveReport, snapshots);
}

async function generateCompletedWeekSnapshot(options = {}, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const asOf = options.asOf || new Date();
  const [range] = completedWeekRanges(asOf, 1);
  const excludedEventIds = await listEventExclusions({ env, fetchImpl });
  const report = await collectAvailableLiveReport({
    env,
    fetchImpl,
    asOf,
    ranges: [range],
    includeComparison: false,
    excludedEventIds
  });
  const snapshot = buildWeeklySnapshot(report, { weekStart: range.start_date });
  if (options.dryRun) return { snapshot, stored: false };
  const stored = await upsertSnapshot(snapshot, { env, fetchImpl });
  return { snapshot: stored, stored: true };
}

function publicSnapshot(row) {
  const allowed = [
    "week_start", "week_end", "generated_at", "schema_version", "report_timezone", "data_state",
    "users", "sessions", "views", "organic_sessions", "search_impressions", "search_clicks",
    "search_ctr", "search_position", "search_actual_start", "search_actual_end",
    "diagnosis_start_events", "diagnosis_start_unique_sessions", "diagnosis_start_unique_users_equivalent",
    "diagnosis_complete_events", "diagnosis_complete_unique_sessions", "diagnosis_complete_unique_users_equivalent",
    "diagnosis_event_completion_rate", "diagnosis_unique_session_completion_rate", "records", "retry_count",
    "ad_impressions", "ad_clicks", "ad_ctr", "ad_data_state", "top_articles", "top_body_parts", "top_regions",
    "source_periods", "source_status"
  ];
  return Object.fromEntries(allowed.map((key) => [key, row?.[key] ?? null]));
}

export {
  EXCLUSION_TABLE,
  SNAPSHOT_TABLE,
  collectDashboardReport,
  databaseConfig,
  generateCompletedWeekSnapshot,
  listEventExclusions,
  listSnapshots,
  mergeSnapshotsWithCurrent,
  publicSnapshot,
  snapshotToWeek,
  supabaseJson,
  upsertSnapshot
};
