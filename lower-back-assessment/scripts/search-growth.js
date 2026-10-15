// Aggregate-only additions to the existing weekly report. No publishing or API calls.
const { searchWeekReady, ga4Comparable } = require("../admin/weekly-analytics/dashboard-model");
const number = (value) =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const total = (values) =>
  values.length && values.every((v) => number(v) !== null)
    ? values.reduce((s, v) => s + Number(v), 0)
    : null;
function pagePath(value, origin) {
  if (!value || value === "(not set)") return null;
  try {
    const u = new URL(value, origin);
    return u.origin === origin
      ? decodeURI(u.pathname).replace(/\/+$/, "") + "/"
      : null;
  } catch {
    return null;
  }
}
function buildGrowthWeek(ga4 = {}, search = {}, sources = {}, origin) {
  const available =
    sources.ga4?.state === "real" || sources.ga4?.state === "fixture";
  const searchAvailable = ["real", "fixture"].includes(
    sources.search_console?.state,
  );
  const groups = new Map();
  const row = (value) => {
    const p = pagePath(value, origin);
    if (!p) return null;
    if (!groups.has(p))
      groups.set(p, {
        path: p,
        url: new URL(origin + p).href,
        organic_sessions: null,
        start_events: null,
        complete_events: null,
        article_transitions: null,
        impressions: null,
        clicks: null,
        ctr: null,
        position: null,
      });
    return groups.get(p);
  };
  if (available)
    for (const landing of ga4.landings || []) {
      const r = row(landing.path);
      if (r) r.organic_sessions = number(landing.organic_search_sessions);
    }
  if (available && ga4.growth_events?.state === "real")
    for (const event of ga4.growth_events.rows || []) {
      const r = row(event.landingPagePlusQueryString);
      const field = {
        muscle_check_start: "start_events",
        muscle_check_complete: "complete_events",
        article_to_diagnosis: "article_transitions",
      }[event.eventName];
      if (r && field && number(event.eventCount) !== null)
        r[field] = (r[field] ?? 0) + Number(event.eventCount);
    }
  // Search Analytics is not exhaustive: absence is never filled with zero.
  if (searchAvailable)
    for (const s of search.page_rows || search.rows || []) {
      const r = row(s.page);
      if (!r) continue;
      r.impressions = (r.impressions ?? 0) + Number(s.impressions || 0);
      r.clicks = (r.clicks ?? 0) + Number(s.clicks || 0);
      r._weight =
        (r._weight || 0) + Number(s.impressions || 0) * Number(s.position || 0);
    }
  const pages = [...groups.values()].map(({ _weight, ...r }) => ({
    ...r,
    ctr: r.impressions > 0 ? r.clicks / r.impressions : null,
    position: r.impressions > 0 ? _weight / r.impressions : null,
  }));
  return {
    organic_users: available ? number(ga4.organic_search_users) : null,
    article_transitions: available
      ? total((ga4.article_to_diagnosis || []).map((r) => r.count))
      : null,
    events_state: ga4.growth_events?.state || "unavailable",
    events_reason: ga4.growth_events?.reason || null,
    pages,
    scope:
      "Organic Search landing cohort; article_transitions total is all-channel article clicks; absent event rows remain unknown",
    data_quality: ga4.growth_events?.data_quality || {},
  };
}
function findGrowthOpportunities(report) {
  const completed = [...(report.weeks || [])].filter(w => !w.week.is_current);
  const week = [...completed].reverse().find(searchWeekReady) || [...completed]
    .reverse()
    .find((w) => !w.week.is_current);
  const result = {
    state: "insufficient_data",
    week_start: week?.week.start_date || null,
    week_end: week?.week.end_date || null,
    candidates: [],
    needs: [],
    policy: {
      min_impressions: 100,
      min_organic_sessions: 30,
      max_candidates: 3,
      ranking: [
        "search_exposure",
        "self_check_reach",
        "change_cost",
        "medical_risk",
      ],
    },
  };
  if (!week) {
    result.needs.push("完了した週のデータが必要です");
    return result;
  }
  const states = report.source_audit?.sources || {};
  const searchReady =
    states.search_console?.state === "real" &&
    searchWeekReady(week);
  const gaReady =
    states.ga4?.state === "real" &&
    week.ga4?.data_state !== "no_rows" &&
    (!week.ga4?.measurement_source || ga4Comparable([week])) &&
    week.growth?.events_state === "real" &&
    !Object.values(week.growth.data_quality || {}).some(Boolean);
  if (!searchReady)
    result.needs.push(
      "GSCの完了週・確定期間の実データが必要です（空応答・遅延・fixtureは順位付けしません）",
    );
  if (!gaReady)
    result.needs.push(
      "GA4自然検索ランディング別イベントの取得・受信確認が必要です",
    );
  for (const p of week.growth?.pages || []) {
    const reasons = [],
      metrics = [],
      actions = [];
    if (
      searchReady &&
      p.impressions >= 100 &&
      p.position >= 1 &&
      p.position <= 10 &&
      p.ctr < 0.02
    ) {
      reasons.push(
        `表示${p.impressions}回、クリック${p.clicks}回、CTR ${(p.ctr * 100).toFixed(2)}%、平均順位${p.position.toFixed(1)}`,
      );
      metrics.push("検索CTR・検索クリック数");
      actions.push(
        "本文の主張を変えず、検索意図とタイトル・説明文の一致を人が確認",
      );
    }
    if (
      searchReady &&
      p.impressions >= 100 &&
      p.position > 10 &&
      p.position <= 20
    ) {
      reasons.push(
        `表示${p.impressions}回、平均順位${p.position.toFixed(1)}で検索流入の改善候補`,
      );
      metrics.push("平均掲載順位・検索クリック数");
      actions.push("既存記事からの関連リンクと検索意図への回答位置を確認");
    }
    // A missing event row is not proof of zero conversions.
    if (
      gaReady &&
      p.organic_sessions >= 30 &&
      p.start_events !== null &&
      p.complete_events !== null &&
      p.start_events / p.organic_sessions < 0.1
    ) {
      reasons.push(
        `自然検索${p.organic_sessions}セッション、開始${p.start_events}回、完了${p.complete_events}回`,
      );
      metrics.push("自然検索からのセルフチェック開始数・完了数");
      actions.push(
        "症状に合う既存セルフチェックへの導線を確認（クリックと実開始を区別）",
      );
    }
    if (!reasons.length) continue;
    result.candidates.push({
      url: p.url,
      reasons,
      expected_metrics: metrics,
      proposal: actions,
      search_exposure: searchReady ? p.impressions : null,
      self_check_reach: gaReady ? p.organic_sessions : null,
      change_cost: 1,
      medical_risk: 1,
      medical_review:
        "医学的な主張は変更しない。本文変更が必要なら根拠確認・承認後に別PR",
      source_period: { start: week.week.start_date, end: week.week.end_date },
      sources: [
        ...(searchReady ? ["search_console"] : []),
        ...(gaReady ? ["ga4"] : []),
      ],
    });
  }
  result.candidates.sort(
    (a, b) =>
      (b.search_exposure ?? -1) - (a.search_exposure ?? -1) ||
      (b.self_check_reach ?? -1) - (a.self_check_reach ?? -1) ||
      a.change_cost - b.change_cost ||
      a.medical_risk - b.medical_risk ||
      a.url.localeCompare(b.url),
  );
  result.candidates = result.candidates.slice(0, 3);
  result.state = result.candidates.length
    ? "ready"
    : searchReady && gaReady
      ? "no_qualifying_candidates"
      : "insufficient_data";
  return result;
}
module.exports = { buildGrowthWeek, findGrowthOpportunities, pagePath };
