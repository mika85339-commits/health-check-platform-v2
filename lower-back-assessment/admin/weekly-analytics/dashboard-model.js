(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HclWeeklyDashboardModel = api;
})(typeof window !== "undefined" ? window : null, function () {
  const PERIODS = Object.freeze({
    current: Object.freeze({ label: "今週", count: 1, offset: 0 }),
    previous: Object.freeze({ label: "先週", count: 1, offset: 1 }),
    four: Object.freeze({ label: "4週間", count: 4, offset: 0 }),
    eight: Object.freeze({ label: "8週間", count: 8, offset: 0 })
  });
  const BODY_PARTS = Object.freeze([
    ["neck", "首"], ["shoulder", "肩"], ["elbow", "肘"], ["wrist", "手首"],
    ["back", "背中"], ["lowback", "腰"], ["buttock", "お尻"], ["thigh", "太もも"],
    ["knee", "膝"], ["lowerleg", "すね・ふくらはぎ"], ["ankle", "足首"],
    ["sole", "足裏"], ["hip", "股関節"]
  ]);
  const REGION_LABELS = Object.freeze({
    "JP-01": "北海道", "JP-13": "東京都", "JP-23": "愛知県", "JP-27": "大阪府"
  });

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function sum(values) {
    const available = values.map(finite).filter((value) => value !== null);
    return available.length ? available.reduce((total, value) => total + value, 0) : null;
  }

  function ratio(numerator, denominator) {
    const top = finite(numerator);
    const bottom = finite(denominator);
    return top !== null && bottom !== null && bottom > 0 ? top / bottom : null;
  }

  function round(value, digits = 4) {
    if (value === null || !Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function firstAndLast(items) {
    return items.length ? [items[0], items[items.length - 1]] : [null, null];
  }

  function periodSlices(report, key = "current") {
    const period = PERIODS[key] || PERIODS.current;
    const weeks = report?.weeks || [];
    const end = Math.max(0, weeks.length - period.offset);
    const start = Math.max(0, end - period.count);
    const selected = weeks.slice(start, end);
    const compareEnd = start;
    const compareStart = Math.max(0, compareEnd - period.count);
    const standardPrevious = compareEnd - compareStart === period.count ? weeks.slice(compareStart, compareEnd) : [];
    const previous = key === "current" && report?.current_week_comparison
      ? [report.current_week_comparison]
      : standardPrevious;
    const [first, last] = firstAndLast(selected);
    const comparisonPeriod = key === "current" && report?.current_week_comparison_period
      ? report.current_week_comparison_period
      : {
        start_date: previous[0]?.week?.start_date || null,
        end_date: previous.at(-1)?.week?.end_date || null
      };
    const inProgress = selected.some((week) => Boolean(week.week?.is_current));
    return {
      key,
      label: period.label,
      selected,
      previous,
      start_date: first?.week?.start_date || null,
      end_date: last?.week?.end_date || null,
      data_end_date: last?.week?.data_end_date || last?.week?.end_date || null,
      in_progress: inProgress,
      comparison_start_date: comparisonPeriod.start_date,
      comparison_end_date: comparisonPeriod.end_date,
      comparison_label: key === "current" && inProgress ? "先週同曜日" : key === "previous" ? "前週" : "前期間"
    };
  }

  function eventTotal(weeks, eventName) {
    return sum(weeks.map((week) => week.diagnosis?.ga4_events?.[eventName]));
  }

  function sourceStates(report) {
    if (report?.source_audit?.sources) return report.source_audit.sources;
    const state = report?.source_audit?.mode === "fixture" ? "fixture" : report?.source_audit?.mode === "read_only_live" ? "real" : "unknown";
    return {
      ga4: { state }, search_console: { state }, diagnosis_db: { state }, sponsor_db: { state }, sanity: { state }
    };
  }

  function sourceAvailable(states, key) {
    return ["real", "fixture"].includes(states?.[key]?.state);
  }

  function weightedPosition(weeks) {
    const rows = weeks.map((week) => ({
      impressions: finite(week.search_console?.impressions),
      position: finite(week.search_console?.position)
    })).filter((row) => row.impressions !== null && row.position !== null && row.impressions > 0);
    const impressions = rows.reduce((total, row) => total + row.impressions, 0);
    return impressions ? rows.reduce((total, row) => total + row.position * row.impressions, 0) / impressions : null;
  }

  function aggregatePeriod(weeks) {
    const summary = {
      users: sum(weeks.map((week) => week.ga4?.users)),
      sessions: sum(weeks.map((week) => week.ga4?.sessions)),
      views: sum(weeks.map((week) => week.ga4?.views)),
      organic_search_sessions: sum(weeks.map((week) => week.ga4?.organic_search_sessions)),
      diagnosis_start_events: sum(weeks.map((week) => week.diagnosis?.start_events ?? week.diagnosis?.starts)),
      diagnosis_start_unique: sum(weeks.map((week) => week.diagnosis?.start_unique_sessions)),
      diagnosis_start_unique_users: weeks.length === 1 ? finite(weeks[0]?.diagnosis?.start_unique_users) : null,
      diagnosis_complete_events: sum(weeks.map((week) => week.diagnosis?.complete_events ?? week.diagnosis?.completions)),
      diagnosis_complete_unique: sum(weeks.map((week) => week.diagnosis?.complete_unique_sessions)),
      diagnosis_complete_unique_users: weeks.length === 1 ? finite(weeks[0]?.diagnosis?.complete_unique_users) : null,
      diagnosis_saves: eventTotal(weeks, "diagnosis_save_complete"),
      diagnosis_retries: eventTotal(weeks, "diagnosis_retry_click"),
      sponsor_impressions: sum(weeks.map((week) => week.sponsor?.impressions)),
      sponsor_clicks: sum(weeks.map((week) => week.sponsor?.clicks)),
      search_impressions: sum(weeks.map((week) => week.search_console?.impressions)),
      search_clicks: sum(weeks.map((week) => week.search_console?.clicks)),
      search_position: weightedPosition(weeks)
    };
    summary.diagnosis_starts = summary.diagnosis_start_events;
    summary.diagnosis_completions = summary.diagnosis_complete_events;
    summary.diagnosis_event_completion_rate = ratio(summary.diagnosis_complete_events, summary.diagnosis_start_events);
    summary.diagnosis_unique_completion_rate = ratio(summary.diagnosis_complete_unique, summary.diagnosis_start_unique);
    summary.diagnosis_completion_rate = summary.diagnosis_event_completion_rate;
    summary.sponsor_ctr = ratio(summary.sponsor_clicks, summary.sponsor_impressions);
    summary.search_ctr = ratio(summary.search_clicks, summary.search_impressions);
    return summary;
  }

  function compare(current, previous, rate = false) {
    const now = finite(current);
    const before = finite(previous);
    if (now === null) return { status: "no_data", current: null, previous: before, delta: null };
    if (before === null) return { status: "no_previous", current: now, previous: null, delta: null };
    const delta = now - before;
    if (rate) return { status: delta > 0 ? "increase" : delta < 0 ? "decrease" : "unchanged", current: now, previous: before, delta: round(delta * 100, 1), unit: "point" };
    if (before === 0) return { status: now === 0 ? "unchanged_zero" : "new", current: now, previous: before, delta: now, percent_change: null };
    return {
      status: delta > 0 ? "increase" : delta < 0 ? "decrease" : "unchanged",
      current: now,
      previous: before,
      delta,
      percent_change: round((delta / before) * 100, 1)
    };
  }

  function summaryCards(current, previous) {
    const cards = [
      ["users", "サイトユーザー"], ["sessions", "セッション"], ["views", "ページビュー"],
      ["organic_search_sessions", "Google自然検索流入"], ["diagnosis_start_events", "診断開始イベント"],
      ["diagnosis_start_unique", "開始ユニークセッション"], ["diagnosis_start_unique_users", "開始ユニーク利用者相当"],
      ["diagnosis_complete_events", "診断完了イベント"], ["diagnosis_complete_unique", "完了ユニークセッション"],
      ["diagnosis_complete_unique_users", "完了ユニーク利用者相当"],
      ["diagnosis_event_completion_rate", "イベント完了率", true],
      ["diagnosis_unique_completion_rate", "ユニーク完了率", true],
      ["diagnosis_saves", "記録数"], ["sponsor_impressions", "広告表示"],
      ["sponsor_clicks", "広告クリック"], ["sponsor_ctr", "広告CTR", true]
    ];
    return cards.map(([key, label, rate]) => {
      let note = "";
      if (key === "diagnosis_start_unique_users" || key === "diagnosis_complete_unique_users") {
        note = "GA4のイベント別ユーザー数";
      }
      if (key === "diagnosis_event_completion_rate") {
        note = `完了 ${current.diagnosis_complete_events ?? "—"} ÷ 開始 ${current.diagnosis_start_events ?? "—"}`;
      }
      if (key === "diagnosis_unique_completion_rate") {
        note = `完了 ${current.diagnosis_complete_unique ?? "—"} ÷ 開始 ${current.diagnosis_start_unique ?? "—"}`;
      }
      return {
        key,
        label,
        value: current[key],
        rate: Boolean(rate),
        note,
        comparison: compare(current[key], previous?.[key], Boolean(rate))
      };
    });
  }

  function aggregateBodyParts(weeks, available = true) {
    const totals = new Map(BODY_PARTS.map(([id, label]) => [id, { id, label, count: available ? 0 : null }]));
    if (!available) return Array.from(totals.values());
    weeks.forEach((week) => Object.entries(week.diagnosis?.body_parts || {}).forEach(([id, count]) => {
      if (!totals.has(id)) totals.set(id, { id, label: id, count: 0 });
      totals.get(id).count += finite(count) || 0;
    }));
    return Array.from(totals.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"));
  }

  function aggregateArticles(weeks) {
    const articles = new Map();
    weeks.forEach((week) => (week.articles || []).forEach((article) => {
      const key = article.path || article.url;
      const current = articles.get(key) || {
        title: article.title,
        url: article.url,
        path: article.path,
        views: null,
        users: null,
        organic_search_sessions: null,
        search_console_impressions: null,
        search_console_clicks: null,
        position_weight: null,
        article_to_diagnosis: null
      };
      ["views", "users", "organic_search_sessions", "search_console_impressions", "search_console_clicks", "article_to_diagnosis"].forEach((key) => {
        const value = finite(article[key]);
        if (value !== null) current[key] = (current[key] || 0) + value;
      });
      const impressions = finite(article.search_console_impressions);
      const position = finite(article.search_console_position);
      if (impressions !== null && position !== null) current.position_weight = (current.position_weight || 0) + impressions * position;
      articles.set(key, current);
    }));
    return Array.from(articles.values()).map((article) => ({
      ...article,
      search_console_ctr: ratio(article.search_console_clicks, article.search_console_impressions),
      search_console_position: article.search_console_impressions && article.position_weight !== null ? article.position_weight / article.search_console_impressions : null,
      diagnosis_referral_rate: ratio(article.article_to_diagnosis, article.users)
    }));
  }

  function sponsorRows(weeks, filters = {}) {
    return weeks.flatMap((week) => (week.sponsor?.breakdown || []).map((row) => ({ ...row, week_start: week.week.start_date })))
      .filter((row) => !filters.sponsor_id || row.sponsor_id === filters.sponsor_id)
      .filter((row) => !filters.creative_id || row.creative_id === filters.creative_id)
      .filter((row) => !filters.placement_id || row.placement_id === filters.placement_id);
  }

  function sponsorFilters(report) {
    const rows = sponsorRows(report?.weeks || []);
    const values = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
    return {
      sponsors: values("sponsor_id"),
      creatives: values("creative_id"),
      placements: values("placement_id")
    };
  }

  function groupSponsor(rows, keys) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = keys.map((field) => row[field] || "unknown").join("|");
      const current = groups.get(key) || Object.fromEntries(keys.map((field) => [field, row[field] || "unknown"]));
      current.impressions = (current.impressions || 0) + (finite(row.impressions) || 0);
      current.clicks = (current.clicks || 0) + (finite(row.clicks) || 0);
      groups.set(key, current);
    });
    return Array.from(groups.values()).map((row) => ({ ...row, ctr: ratio(row.clicks, row.impressions) }))
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
  }

  function smallCell(row, enabled = true, threshold = 10) {
    const suppressed = Boolean(enabled && finite(row.impressions) !== null && row.impressions < threshold);
    return { ...row, suppressed, display_impressions: suppressed ? `<${threshold}` : row.impressions, display_clicks: suppressed ? `<${threshold}` : row.clicks, display_ctr: suppressed ? null : row.ctr };
  }

  function sourcePeriods(weeks, states = {}) {
    const [first, last] = firstAndLast(weeks);
    const actualStarts = weeks.map((week) => week.search_console?.actual_data_start).filter(Boolean).sort();
    const actualEnds = weeks.map((week) => week.search_console?.actual_data_end).filter(Boolean).sort();
    return {
      ga4: { start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", ...states.ga4 },
      search_console: {
        requested_start: first?.search_console?.requested_start || first?.week?.start_date || null,
        requested_end: last?.search_console?.requested_end || last?.week?.end_date || null,
        actual_start: actualStarts[0] || null,
        actual_end: actualEnds.at(-1) || null,
        timezone: last?.search_console?.source_timezone || "America/Los_Angeles",
        data_state: last?.search_console?.data_state || "unknown",
        ...states.search_console
      },
      sponsor_db: { start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", ...states.sponsor_db },
      diagnosis_db: { start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", ...states.diagnosis_db },
      sanity: { ...states.sanity }
    };
  }

  function trendWeeks(report) {
    return (report?.weeks || []).map((week) => ({
      start_date: week.week.start_date,
      end_date: week.week.end_date,
      in_progress: Boolean(week.week.is_current),
      label: `${week.week.start_date.slice(5).replace("-", "/")}週`,
      users: finite(week.ga4?.users),
      sessions: finite(week.ga4?.sessions),
      views: finite(week.ga4?.views),
      organic_search_sessions: finite(week.ga4?.organic_search_sessions),
      search_impressions: finite(week.search_console?.impressions),
      search_clicks: finite(week.search_console?.clicks),
      search_ctr: finite(week.search_console?.ctr),
      search_position: finite(week.search_console?.position),
      sponsor_impressions: finite(week.sponsor?.impressions),
      sponsor_clicks: finite(week.sponsor?.clicks),
      sponsor_ctr: finite(week.sponsor?.ctr)
    }));
  }

  function buildView(report, options = {}) {
    const states = sourceStates(report);
    const period = periodSlices(report, options.period || "current");
    const current = aggregatePeriod(period.selected);
    const previous = period.previous.length ? aggregatePeriod(period.previous) : null;
    const filteredSponsorRows = sponsorRows(period.selected, options.filters || {});
    const articles = aggregateArticles(period.selected);
    return {
      mode: report?.source_audit?.mode || "unknown",
      source_states: states,
      generated_at: report?.generated_at || null,
      period,
      current,
      previous,
      summary_cards: summaryCards(current, previous),
      trends: trendWeeks(report),
      source_periods: sourcePeriods(period.selected, states),
      body_parts: aggregateBodyParts(period.selected, sourceAvailable(states, "diagnosis_db")),
      articles_access: [...articles].sort((a, b) => b.views - a.views || b.users - a.users || b.organic_search_sessions - a.organic_search_sessions).slice(0, 10),
      articles_diagnosis: [...articles].sort((a, b) => b.article_to_diagnosis - a.article_to_diagnosis || (b.diagnosis_referral_rate || 0) - (a.diagnosis_referral_rate || 0)).slice(0, 10),
      sponsor: {
        available: sourceAvailable(states, "sponsor_db"),
        rows: filteredSponsorRows,
        by_body_part: groupSponsor(filteredSponsorRows, ["body_part"]),
        by_region: groupSponsor(filteredSponsorRows, ["country_code", "region_code", "region_name"]),
        by_body_region: groupSponsor(filteredSponsorRows, ["body_part", "country_code", "region_code", "region_name"]),
        filters: sponsorFilters(report)
      }
    };
  }

  function regionLabel(row) {
    return REGION_LABELS[row.region_code] || row.region_name || row.region_code || "不明";
  }

  return Object.freeze({
    BODY_PARTS,
    PERIODS,
    aggregateArticles,
    aggregateBodyParts,
    aggregatePeriod,
    buildView,
    compare,
    finite,
    groupSponsor,
    periodSlices,
    ratio,
    regionLabel,
    smallCell,
    sponsorFilters,
    sponsorRows,
    sourcePeriods,
    sourceStates,
    summaryCards,
    trendWeeks
  });
});
