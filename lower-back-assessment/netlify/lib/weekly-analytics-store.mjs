import weeklyAnalytics from "../../scripts/weekly-analytics.js";
import weeklySources from "../../scripts/weekly-analytics-sources.js";
import dashboardModel from "../../admin/weekly-analytics/dashboard-model.js";

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
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CONNECTION_KEYS = ["ga4", "search_console", "diagnosis_db", "sponsor_db"];

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
  const source = dashboardModel.ga4Identity(snapshotToWeek(snapshot));
  if (["cutover_pending", "pre_cutover"].includes(source.state)) throw new Error("Snapshot write held until the actual GA4 cutover is recorded and the target period reaches it.");
  const existing = await listSnapshots({ weekStart: snapshot.week_start, limit: 1 }, deps);
  if (existing.length) {
    const before = dashboardModel.ga4Key(snapshotToWeek(existing[0]));
    const after = dashboardModel.ga4Key(snapshotToWeek(snapshot));
    if (!before || !after || before !== after) throw new Error("Snapshot GA4 source conflict: preserve the stored history and review the migration boundary.");
  }
  const row = { ...snapshot, updated_at: new Date().toISOString() };
  // Preserve history even if two requests race across an environment switch.
  const params = new URLSearchParams(existing.length ? {
    week_start: `eq.${snapshot.week_start}`, week_end: `eq.${snapshot.week_end}`,
    source_periods: existing[0].source_periods == null ? "is.null" : `eq.${JSON.stringify(existing[0].source_periods)}`
  } : { on_conflict: "week_start,week_end" });
  const rows = await supabaseJson(`${SNAPSHOT_TABLE}?${params}`, {
    method: existing.length ? "PATCH" : "POST",
    headers: { Prefer: existing.length ? "return=representation" : "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(existing.length ? row : [row])
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
      measurement_source: sourcePeriods.ga4?.measurement_source || { property_id: null, measurement_id: null, host_name: null, cutover_at: null, state: "legacy_unknown" },
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
      coverage: sourcePeriods.search_console?.coverage || null,
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

function scheduleWindow(asOf = new Date()) {
  const reference = new Date(asOf);
  if (Number.isNaN(reference.getTime())) throw new Error(`Invalid schedule reference: ${asOf}`);
  const daysSinceMonday = (reference.getUTCDay() + 6) % 7;
  const thisWeekMondayUtc = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate() - daysSinceMonday
  );
  const lastScheduledAt = new Date(thisWeekMondayUtc);
  const nextScheduledAt = new Date(thisWeekMondayUtc + WEEK_MS);
  return {
    last_scheduled_at: lastScheduledAt.toISOString(),
    next_scheduled_at: nextScheduledAt.toISOString()
  };
}

function buildOperationalStatus(liveReport, snapshots, options = {}) {
  const asOf = new Date(options.asOf || liveReport?.generated_at || Date.now());
  const schedule = scheduleWindow(asOf);
  const [expected] = completedWeekRanges(new Date(schedule.last_scheduled_at), 1);
  const history = [...(snapshots || [])]
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map((snapshot) => ({
      week_start: snapshot.week_start,
      week_end: snapshot.week_end,
      generated_at: snapshot.generated_at,
      data_state: snapshot.data_state || "unknown"
    }));
  const latest = history[0] || null;
  const scheduleIsCurrent = Boolean(
    latest
      && latest.week_start === expected.start_date
      && latest.week_end === expected.end_date
  );
  const sources = liveReport?.source_audit?.sources || {};
  const connections = Object.fromEntries(CONNECTION_KEYS.map((key) => {
    const state = sources[key]?.state || "unknown";
    return [key, {
      state,
      health: state === "real" ? "normal" : "needs_attention"
    }];
  }));
  return {
    timezone: REPORT_TIME_ZONE,
    schedule_state: scheduleIsCurrent ? "normal" : "needs_attention",
    last_scheduled_at: schedule.last_scheduled_at,
    next_scheduled_at: schedule.next_scheduled_at,
    latest_successful_snapshot: latest,
    expected_latest_snapshot: {
      week_start: expected.start_date,
      week_end: expected.end_date
    },
    connections,
    snapshot_history: history
  };
}

function mergeSnapshotsWithCurrent(liveReport, snapshots, options = {}) {
  const current =
    (liveReport.weeks || []).find((week) => week.week?.is_current) ||
    liveReport.weeks?.at(-1);
  const snapshotRows = [...(snapshots || [])];
  const prior = snapshotRows
    .filter((snapshot) => snapshot.week_start !== current?.week?.start_date)
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((snapshot) => {
      const week = snapshotToWeek(snapshot);
      // A saved week is a single immutable observation, never enriched with a later read.
      return { ...week, growth: null, provenance: {
        kind: "snapshot", saved_at: snapshot.generated_at || null,
        fetched_at: null, sources: snapshot.source_status || {}
      } };
    });
  return {
    ...liveReport,
    schema_version: 2,
    snapshot_policy: "completed_weeks_prefer_snapshot",
    refreshed_weeks: (liveReport.weeks || []).map((week) => ({ ...week,
      provenance: { kind: "refreshed", saved_at: null,
        fetched_at: liveReport.generated_at || null,
        sources: liveReport.source_audit?.sources || {} }
    })),
    operational_status: buildOperationalStatus(
      liveReport,
      snapshotRows,
      options,
    ),
    weeks: [
      ...(liveReport.weeks || []).filter(
        (w) =>
          !w.week.is_current &&
          !prior.some((p) => p.week.start_date === w.week.start_date),
      ),
      ...prior,
      ...(current ? [{ ...current, provenance: { kind: "refreshed", saved_at: null,
        fetched_at: liveReport.generated_at || null, sources: liveReport.source_audit?.sources || {} } }] : []),
    ]
      .sort((a, b) => a.week.start_date.localeCompare(b.week.start_date))
      .slice(-8),
  };
}

async function collectDashboardReport(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const excludedEventIds = await listEventExclusions({ env, fetchImpl });
  const [liveReport, snapshots] = await Promise.all([
    collectAvailableLiveReport({ env, fetchImpl, weekCount: 3, excludedEventIds }),
    listSnapshots({ limit: 7 }, { env, fetchImpl }).catch(() => [])
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
  buildOperationalStatus,
  collectDashboardReport,
  databaseConfig,
  generateCompletedWeekSnapshot,
  listEventExclusions,
  listSnapshots,
  mergeSnapshotsWithCurrent,
  publicSnapshot,
  scheduleWindow,
  snapshotToWeek,
  supabaseJson,
  upsertSnapshot
};
