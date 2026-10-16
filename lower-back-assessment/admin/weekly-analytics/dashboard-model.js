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

  function normalizeDiagnosisPart(value) {
    const key = String(value || "").trim().toLowerCase();
    const known = BODY_PARTS.find(([id, label]) => key === id || key === label);
    const aliases = { scapula: "shoulder", "肩甲骨": "shoulder", "lower-back": "lowback", lower_back: "lowback", lumbar: "lowback", glute: "buttock", glutes: "buttock", calf: "lowerleg", shin: "lowerleg", foot: "sole" };
    return known?.[0] || (Object.hasOwn(aliases, key) ? aliases[key] : "unknown");
  }

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

  // Shared with the collectors/store: unknown historical sources are never inferred.
  function ga4Identity(week) {
    return week?.ga4?.measurement_source || { property_id: null, measurement_id: null, host_name: null, cutover_at: null, state: "legacy_unknown" };
  }

  function ga4Key(week) {
    const s = ga4Identity(week);
    return s.property_id && s.host_name ? [s.property_id, s.measurement_id || "", s.host_name, s.cutover_at || ""].join("|") : null;
  }

  function ga4Comparable(weeks) {
    if (!weeks.length) return false;
    const keys = weeks.map(ga4Key);
    return Boolean(keys[0]) && keys.every(k => k === keys[0]) && weeks.every(w => ga4Identity(w).state === "post_cutover" || ga4Identity(w).state === "identified");
  }

  function searchPeriodReady(week) {
    const s = week?.search_console || {};
    const end = week?.week?.data_end_date || week?.week?.end_date;
    return Boolean(end && (s.coverage ? s.coverage.confirmed_through >= end : s.actual_data_end >= end));
  }

  function searchWeekReady(week) {
    return !week?.week?.is_current && searchPeriodReady(week) && (week.search_console?.impressions != null || week.search_console?.page_rows?.length > 0);
  }

  const GA4_FIELDS = new Set(["users", "sessions", "views", "organic_search_sessions", "organic_users", "article_transitions", "diagnosis_start_unique_users", "diagnosis_complete_unique_users", "diagnosis_retries", "diagnosis_saves"]);
  const SEARCH_FIELDS = new Set(["search_impressions", "search_clicks", "search_ctr", "search_position"]);

  function comparisonAllowed(key, selected, previous) {
    if (!selected.length || !previous.length) return false;
    const starts = [...previous, ...selected].map(w => w.week.start_date);
    if (starts.some((date, i) => i > 0 && Date.parse(date) - Date.parse(starts[i - 1]) !== 604800000)) return false;
    if (GA4_FIELDS.has(key)) return ga4Comparable([...selected, ...previous]);
    if (SEARCH_FIELDS.has(key)) return selected.length > 0 && previous.length > 0 && [...selected, ...previous].every(searchPeriodReady);
    return true;
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
      organic_users: weeks.length === 1 ? finite(weeks[0]?.growth?.organic_users) : null,
      article_transitions: weeks.every((w) => w.growth?.article_transitions != null) ? sum(weeks.map((w) => w.growth.article_transitions)) : null,
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
      ["search_impressions", "検索表示回数"], ["search_clicks", "検索クリック数"], ["organic_users", "自然検索利用者（週内）"], ["article_transitions", "記事から診断への移動"],
      ["users", "サイトユーザー"], ["sessions", "セッション"], ["views", "ページビュー"],
      ["organic_search_sessions", "自然検索セッション"], ["diagnosis_start_events", "診断開始イベント"],
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
    weeks.forEach((week) => Object.entries(week.diagnosis?.body_parts || {}).forEach(([rawId, count]) => {
      const id = normalizeDiagnosisPart(rawId);
      if (!totals.has(id)) totals.set(id, { id, label: "不明（計測値なし・未対応）", count: 0 });
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
      ga4: { ...states.ga4, start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", history: weeks.map(w => ({ start: w.week.start_date, end: w.week.data_end_date || w.week.end_date, ...ga4Identity(w) })) },
      search_console: {
        requested_start: first?.search_console?.requested_start || first?.week?.start_date || null,
        requested_end: last?.search_console?.requested_end || last?.week?.end_date || null,
        actual_start: actualStarts[0] || null,
        actual_end: actualEnds.at(-1) || null,
        timezone: last?.search_console?.source_timezone || "America/Los_Angeles",
        data_state: last?.search_console?.data_state || "unknown",
        ...states.search_console,
        coverage_ready: weeks.length > 0 && weeks.every(searchPeriodReady),
        confirmed_through: last?.search_console?.coverage?.confirmed_through || null,
        coverage_method: last?.search_console?.coverage?.method || "legacy_unknown"
      },
      sponsor_db: { start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", ...states.sponsor_db },
      diagnosis_db: { start: first?.week?.start_date || null, end: last?.week?.data_end_date || last?.week?.end_date || null, timezone: "Asia/Tokyo", ...states.diagnosis_db },
      sanity: { ...states.sanity }
    };
  }

  function trendWeeks(report) {
    return (report?.weeks || []).map((week, index, weeks) => ({
      ga4_break_before: index > 0 && !ga4Comparable([weeks[index - 1], week]),
      ga4_source: ga4Identity(week),
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

  function growthPages(weeks, previous) {
    const aggregate = (list) => {
      const groups = new Map();
      for (const week of list)
        for (const row of week.growth?.pages || []) {
          const items = groups.get(row.url) || [];
          items.push(row);
          groups.set(row.url, items);
        }
      return [...groups].map(([url, items]) => ({
        url,
        ...Object.fromEntries(
          [
            "organic_sessions",
            "start_events",
            "complete_events",
            "article_transitions",
            "impressions",
            "clicks",
          ].map((key) => [
            key,
            items.length === list.length &&
            items.every((i) => finite(i[key]) !== null)
              ? sum(items.map((i) => i[key]))
              : null,
          ]),
        ),
      }));
    };
    const before = new Map(aggregate(previous).map((r) => [r.url, r]));
    return aggregate(weeks)
      .map((row) => ({
        ...row,
        comparison: Object.fromEntries(
          [
            "organic_sessions",
            "start_events",
            "complete_events",
            "article_transitions",
            "impressions",
            "clicks",
          ].map((key) => [key, compare(row[key], before.get(row.url)?.[key])]),
        ),
      }))
      .sort(
        (a, b) =>
          (b.organic_sessions ?? -1) - (a.organic_sessions ?? -1) ||
          a.url.localeCompare(b.url),
      );
  }

  function buildView(report, options = {}) {
    const states = sourceStates(report);
    const period = periodSlices(report, options.period || "current");
    const current = aggregatePeriod(period.selected);
    const previous = period.previous.length ? aggregatePeriod(period.previous) : null;
    // Mixed properties must not produce a single GA4 total. Single legacy weeks remain readable.
    for (const [list, summary] of [[period.selected, current], [period.previous, previous]]) {
      if (summary && list.length > 1 && !ga4Comparable(list)) for (const key of GA4_FIELDS) summary[key] = null;
      if (summary) for (const key of [...GA4_FIELDS, ...SEARCH_FIELDS]) {
        if (list.some(w => aggregatePeriod([w])[key] == null)) summary[key] = null;
      }
    }
    const filteredSponsorRows = sponsorRows(period.selected, options.filters || {});
    const articles = aggregateArticles(period.selected);
    if (period.selected.length > 1 && !ga4Comparable(period.selected)) for (const article of articles) {
      for (const key of ["views", "users", "organic_search_sessions", "article_to_diagnosis", "diagnosis_referral_rate"]) article[key] = null;
    }
    return {
      mode: report?.source_audit?.mode || "unknown",
      source_states: states,
      growth_opportunities: report?.growth_opportunities || null,
      landing_pages: growthPages(period.selected, period.previous).map(row => ({ ...row,
        ...(period.selected.length > 1 && !ga4Comparable(period.selected) ? { organic_sessions: null, start_events: null, complete_events: null, article_transitions: null } : {}),
        comparison: Object.fromEntries(Object.entries(row.comparison).map(([key, value]) => [key, comparisonAllowed(key === "impressions" || key === "clicks" ? "search_impressions" : "sessions", period.selected, period.previous) ? value : { status: "source_boundary" }])) })),
      growth_status: period.selected.map(w => ({week_start:w.week.start_date,state:w.growth?.events_state || 'unavailable',reason:w.growth?.events_reason || null})),
      generated_at: report?.generated_at || null,
      operational_status: report?.operational_status || null,
      period,
      current,
      previous,
      summary_cards: summaryCards(current, previous).map(card => comparisonAllowed(card.key, period.selected, period.previous) ? card : { ...card, comparison: { status: "source_boundary" } }),
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
    normalizeDiagnosisPart,
    GA4_FIELDS,
    comparisonAllowed,
    ga4Identity,
    ga4Key,
    ga4Comparable,
    searchPeriodReady,
    searchWeekReady,
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
