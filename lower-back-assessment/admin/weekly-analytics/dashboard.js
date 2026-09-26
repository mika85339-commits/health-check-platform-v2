(function () {
  "use strict";

  const model = window.HclWeeklyDashboardModel;
  const state = {
    report: null,
    period: "current",
    filters: { sponsor_id: "", creative_id: "", placement_id: "" },
    suppressSmallCells: true
  };
  const bodyLabels = Object.fromEntries(model.BODY_PARTS);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—"
      : new Intl.NumberFormat("ja-JP").format(Number(value));
  }

  function decimal(value, digits = 1) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—"
      : Number(value).toFixed(digits);
  }

  function percent(value, digits = 1) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—"
      : `${(Number(value) * 100).toFixed(digits)}%`;
  }

  function dateLabel(value) {
    if (!value) return "未取得";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : String(value);
  }

  function timestampLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function timestampShortLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function comparisonMarkup(comparison, comparisonLabel = "前期間") {
    if (!comparison || comparison.status === "no_data") return ["未取得", "neutral"];
    if (comparison.status === "no_previous") return ["比較期間なし", "neutral"];
    if (comparison.status === "new") return [`${comparisonLabel} 0 → 新規`, "increase"];
    if (comparison.status === "unchanged_zero") return [`${comparisonLabel}も 0`, "neutral"];
    if (comparison.unit === "point") {
      const sign = comparison.delta > 0 ? "+" : "";
      return [`${comparisonLabel}比 ${sign}${decimal(comparison.delta)}pt`, comparison.status];
    }
    const change = comparison.percent_change;
    if (change === null || change === undefined) return [`${comparisonLabel}と比較不可`, "neutral"];
    const sign = change > 0 ? "+" : "";
    return [`${comparisonLabel}比 ${sign}${decimal(change)}%`, comparison.status];
  }

  function metricValue(card) {
    return card.rate ? percent(card.value) : number(card.value);
  }

  function metricCards(cards, comparisonLabel) {
    if (!cards.length) return '<p class="empty-cell">データがありません。</p>';
    return cards.map((card) => {
      const [comparison, tone] = comparisonMarkup(card.comparison, comparisonLabel);
      return `<article class="metric-card">
        <span class="metric-card__label">${escapeHtml(card.label)}</span>
        <strong class="metric-card__value">${metricValue(card)}</strong>
        ${card.note ? `<span class="metric-card__note">${escapeHtml(card.note)}</span>` : ""}
        <span class="metric-card__compare" data-state="${tone}">${escapeHtml(comparison)}</span>
      </article>`;
    }).join("");
  }

  function simpleMetricCards(cards) {
    return cards.map((card) => `<article class="metric-card">
      <span class="metric-card__label">${escapeHtml(card.label)}</span>
      <strong class="metric-card__value">${card.rate ? percent(card.value) : number(card.value)}</strong>
      ${card.note ? `<span class="metric-card__note">${escapeHtml(card.note)}</span>` : ""}
    </article>`).join("");
  }

  function sourceCards(periods) {
    const statusLabel = (source) => {
      if (source.state === "real") return ["実データ", "real"];
      if (source.state === "fixture") return ["ローカル確認用データ", "fixture"];
      if (source.state === "missing_configuration") return ["未取得（設定不足）", "missing"];
      if (source.state === "error") return ["未取得（接続エラー）", "error"];
      return ["未取得", "missing"];
    };
    const available = (source) => ["real", "fixture"].includes(source.state);
    const rows = [
      { name: "GA4", source: periods.ga4, range: `${dateLabel(periods.ga4.start)} - ${dateLabel(periods.ga4.end)}`, note: periods.ga4.timezone },
      {
        name: "Search Console",
        source: periods.search_console,
        range: `${dateLabel(periods.search_console.actual_start)} - ${dateLabel(periods.search_console.actual_end)}`,
        note: `要求: ${dateLabel(periods.search_console.requested_start)} - ${dateLabel(periods.search_console.requested_end)}`,
        lag: available(periods.search_console)
          ? (periods.search_console.actual_end !== periods.search_console.requested_end ? "Google確定データは要求期間より遅れています" : "確定期間まで取得済み")
          : ""
      },
      { name: "診断DB", source: periods.diagnosis_db, range: `${dateLabel(periods.diagnosis_db.start)} - ${dateLabel(periods.diagnosis_db.end)}`, note: periods.diagnosis_db.timezone },
      { name: "スポンサーDB", source: periods.sponsor_db, range: `${dateLabel(periods.sponsor_db.start)} - ${dateLabel(periods.sponsor_db.end)}`, note: periods.sponsor_db.timezone },
      { name: "記事メタデータ", source: periods.sanity, range: `公開記事 ${number(periods.sanity.article_count)}件`, note: "本番公開記事のタイトル・URL" }
    ];
    return rows.map((row) => {
      const [status, tone] = statusLabel(row.source);
      return `<article class="source-card">
      <div class="source-card__heading"><strong>${escapeHtml(row.name)}</strong><span class="source-card__status" data-state="${tone}">${escapeHtml(status)}</span></div>
      <span>${available(row.source) ? escapeHtml(row.range) : "データ未取得"}</span>
      <span>${escapeHtml(row.note)}</span>
      ${row.lag ? `<span class="source-card__lag">${escapeHtml(row.lag)}</span>` : ""}
    </article>`;
    }).join("");
  }

  function lineChart(rows, series, options = {}) {
    const width = 620;
    const height = 250;
    const pad = { top: 18, right: 18, bottom: 42, left: 42 };
    const values = rows.flatMap((row) => series.map((item) => model.finite(row[item.key]))).filter((value) => value !== null);
    if (!rows.length || !values.length) return `<div class="chart-empty">${escapeHtml(options.emptyLabel || "データなし")}</div>`;
    const maxValue = Math.max(...values, options.minimumMax || 1);
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index) => pad.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
    const y = (value) => pad.top + plotHeight - (value / maxValue) * plotHeight;
    const grid = [0, 0.5, 1].map((step) => {
      const yPos = pad.top + plotHeight - step * plotHeight;
      return `<line class="chart-grid" x1="${pad.left}" y1="${yPos}" x2="${width - pad.right}" y2="${yPos}"></line>
        <text class="chart-axis-label" x="${pad.left - 8}" y="${yPos + 4}" text-anchor="end">${escapeHtml(options.percent ? `${Math.round(maxValue * step * 100)}%` : Math.round(maxValue * step))}</text>`;
    }).join("");
    const labels = rows.map((row, index) => row.in_progress
      ? `<text class="chart-axis-label" x="${x(index)}" y="${height - 24}" text-anchor="middle"><tspan x="${x(index)}">${escapeHtml(row.label)}</tspan><tspan class="chart-axis-note" x="${x(index)}" dy="13">途中</tspan></text>`
      : `<text class="chart-axis-label" x="${x(index)}" y="${height - 13}" text-anchor="middle">${escapeHtml(row.label)}</text>`).join("");
    const lines = series.map((item) => {
      const points = rows.map((row, index) => {
        const value = model.finite(row[item.key]);
        return value === null ? null : `${x(index)},${y(value)}`;
      }).filter(Boolean);
      if (!points.length) return "";
      const dots = rows.map((row, index) => {
        const value = model.finite(row[item.key]);
        return value === null ? "" : `<circle class="chart-dot" cx="${x(index)}" cy="${y(value)}" r="4" fill="${item.color}"><title>${escapeHtml(`${row.label} ${item.label}: ${item.rate ? percent(value) : number(value)}`)}</title></circle>`;
      }).join("");
      return `<polyline class="chart-line" stroke="${item.color}" points="${points.join(" ")}"></polyline>${dots}`;
    }).join("");
    const accessibleRows = rows.map((row) => `${row.label}${row.in_progress ? "（途中）" : ""}: ${series.map((item) => `${item.label} ${item.rate ? percent(row[item.key]) : number(row[item.key])}`).join("、")}`).join("。 ");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || accessibleRows)}">${grid}${labels}${lines}</svg>`;
  }

  function funnel(view) {
    const values = [
      ["セッション", view.current.sessions],
      ["開始イベント", view.current.diagnosis_start_events],
      ["開始ユニーク", view.current.diagnosis_start_unique],
      ["完了イベント", view.current.diagnosis_complete_events],
      ["完了ユニーク", view.current.diagnosis_complete_unique],
      ["記録", view.current.diagnosis_saves],
      ["再チェック", view.current.diagnosis_retries]
    ];
    const max = Math.max(...values.map(([, value]) => model.finite(value) || 0), 1);
    const startEvents = model.finite(view.current.diagnosis_start_events);
    const completeEvents = model.finite(view.current.diagnosis_complete_events);
    const startUnique = model.finite(view.current.diagnosis_start_unique);
    const completeUnique = model.finite(view.current.diagnosis_complete_unique);
    const startUsers = model.finite(view.current.diagnosis_start_unique_users);
    const completeUsers = model.finite(view.current.diagnosis_complete_unique_users);
    return `${values.map(([label, value]) => `<div class="funnel-row">
      <span class="funnel-row__label">${escapeHtml(label)}</span>
      <span class="funnel-row__track"><span class="funnel-row__fill" style="width:${Math.max(0, ((model.finite(value) || 0) / max) * 100)}%"></span></span>
      <strong class="funnel-row__value">${number(value)}</strong>
    </div>`).join("")}
    <div class="funnel-notes">
      <p class="funnel-note"><strong>イベント完了率 ${percent(model.ratio(completeEvents, startEvents))}</strong><span>完了 ${number(completeEvents)} ÷ 開始 ${number(startEvents)}</span></p>
      <p class="funnel-note"><strong>ユニーク完了率 ${percent(model.ratio(completeUnique, startUnique))}</strong><span>完了 ${number(completeUnique)} ÷ 開始 ${number(startUnique)}</span></p>
      ${(startUsers !== null || completeUsers !== null) ? `<p class="funnel-note"><strong>GA4利用者相当</strong><span>開始 ${number(startUsers)} / 完了 ${number(completeUsers)}</span></p>` : ""}
    </div>`;
  }

  function bodyPartBars(rows) {
    const max = Math.max(...rows.map((row) => model.finite(row.count) || 0), 1);
    return rows.map((row) => `<div class="bar-row">
      <span class="bar-row__label">${escapeHtml(row.label)}</span>
      <span class="bar-row__track"><span class="bar-row__fill" style="width:${((model.finite(row.count) || 0) / max) * 100}%"></span></span>
      <strong class="bar-row__value">${number(row.count)}</strong>
    </div>`).join("");
  }

  function table(headers, rows) {
    if (!rows.length) return '<p class="empty-cell">この期間のデータはありません。</p>';
    return `<table><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  function articleAccessTable(rows) {
    return table(["記事", "PV", "ユーザー", "自然検索", "検索表示", "クリック", "CTR", "平均順位"], rows.map((article) => `<tr>
      <td class="article-title-cell"><a href="${escapeHtml(article.path || article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></td>
      <td>${number(article.views)}</td><td>${number(article.users)}</td><td>${number(article.organic_search_sessions)}</td>
      <td>${number(article.search_console_impressions)}</td><td>${number(article.search_console_clicks)}</td>
      <td>${percent(article.search_console_ctr)}</td><td>${decimal(article.search_console_position)}</td>
    </tr>`));
  }

  function articleDiagnosisTable(rows) {
    return table(["記事", "遷移", "記事ユーザー", "遷移率"], rows.map((article) => `<tr>
      <td class="article-title-cell"><a href="${escapeHtml(article.path || article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></td>
      <td>${number(article.article_to_diagnosis)}</td><td>${number(article.users)}</td><td>${percent(article.diagnosis_referral_rate)}</td>
    </tr>`));
  }

  function filteredSponsorTrends(report, filters) {
    const available = ["real", "fixture"].includes(model.sourceStates(report).sponsor_db?.state);
    return report.weeks.map((week) => {
      const rows = model.sponsorRows([week], filters);
      const impressions = available ? rows.reduce((total, row) => total + (model.finite(row.impressions) || 0), 0) : null;
      const clicks = available ? rows.reduce((total, row) => total + (model.finite(row.clicks) || 0), 0) : null;
      return {
        label: `${week.week.start_date.slice(5).replace("-", "/")}週`,
        in_progress: Boolean(week.week.is_current),
        sponsor_impressions: impressions,
        sponsor_clicks: clicks,
        sponsor_ctr: model.ratio(clicks, impressions)
      };
    });
  }

  function sponsorTable(rows, kind, available = true) {
    if (!available) return '<p class="empty-cell">スポンサーDBデータは未取得です。</p>';
    const mapped = rows.map((row) => model.smallCell(row, state.suppressSmallCells));
    const labels = {
      body: ["部位", "表示", "クリック", "CTR"],
      region: ["地域", "表示", "クリック", "CTR"],
      cross: ["部位", "地域", "表示", "クリック", "CTR"]
    };
    return table(labels[kind], mapped.map((row) => {
      const values = kind === "body"
        ? [bodyLabels[row.body_part] || row.body_part]
        : kind === "region"
          ? [model.regionLabel(row)]
          : [bodyLabels[row.body_part] || row.body_part, model.regionLabel(row)];
      const metrics = row.suppressed
        ? [row.display_impressions, row.display_clicks, "非表示"]
        : [number(row.impressions), number(row.clicks), percent(row.ctr)];
      return `<tr>${[...values, ...metrics].map((value, index) => `<td${index === 0 ? "" : ""}>${escapeHtml(value)}</td>`).join("")}</tr>`;
    }));
  }

  function sponsorSummary(view) {
    const rows = view.sponsor.rows;
    const impressions = view.sponsor.available ? rows.reduce((total, row) => total + (model.finite(row.impressions) || 0), 0) : null;
    const clicks = view.sponsor.available ? rows.reduce((total, row) => total + (model.finite(row.clicks) || 0), 0) : null;
    const metrics = simpleMetricCards([
      { label: "広告表示", value: impressions },
      { label: "広告クリック", value: clicks },
      { label: "広告CTR", value: model.ratio(clicks, impressions), rate: true }
    ]);
    const sampleNotice = impressions !== null && impressions < 50
      ? '<p class="sample-notice"><strong>参考値・データ蓄積中</strong><span>広告表示が50件未満のため、CTRは性能評価に使用しません。</span></p>'
      : "";
    return `${metrics}${sampleNotice}`;
  }

  function setFilterOptions(select, values) {
    const current = select.value;
    const label = select.options[0]?.textContent || "すべて";
    select.innerHTML = `<option value="">${escapeHtml(label)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = values.includes(current) ? current : "";
  }

  function populateFilters(filters) {
    setFilterOptions(byId("filter-sponsor"), filters.sponsors);
    setFilterOptions(byId("filter-creative"), filters.creatives);
    setFilterOptions(byId("filter-placement"), filters.placements);
  }

  function render() {
    const view = model.buildView(state.report, { period: state.period, filters: state.filters });
    const modeLabel = view.mode === "fixture"
      ? "ローカル確認用データ"
      : view.mode === "real"
        ? "実データ"
        : view.mode === "mixed"
          ? "実データ（一部未取得）"
          : "実データ未取得";
    byId("data-mode").textContent = modeLabel;
    byId("generated-at").textContent = view.generated_at ? `最終集計: ${timestampLabel(view.generated_at)} JST` : "";
    const progressLabel = view.period.in_progress && view.generated_at
      ? `（途中・${timestampShortLabel(view.generated_at)}時点）`
      : "";
    byId("period-label").textContent = `${view.period.label}  ${dateLabel(view.period.start_date)} - ${dateLabel(view.period.end_date)}${progressLabel}`;
    byId("source-periods").innerHTML = sourceCards(view.source_periods);
    byId("summary-cards").innerHTML = metricCards(view.summary_cards, view.period.comparison_label);
    byId("access-chart").innerHTML = lineChart(view.trends, [
      { key: "users", label: "ユーザー", color: "#126a4a" },
      { key: "sessions", label: "セッション", color: "#62b996" }
    ], { label: "8週間のユーザー数とセッション数", emptyLabel: "GA4データ未取得" });
    byId("search-chart").innerHTML = lineChart(view.trends, [
      { key: "search_impressions", label: "表示", color: "#126a4a" },
      { key: "search_clicks", label: "クリック", color: "#bd8b2b" }
    ], { label: "8週間のGoogle検索表示回数とクリック数", emptyLabel: "Search Consoleデータ未取得" });
    byId("search-kpis").innerHTML = [
      ["表示回数", number(view.current.search_impressions)],
      ["CTR", percent(view.current.search_ctr)],
      ["平均掲載順位", decimal(view.current.search_position)]
    ].map(([label, value]) => `<div class="inline-kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
    byId("diagnosis-funnel").innerHTML = funnel(view);
    byId("body-parts").innerHTML = bodyPartBars(view.body_parts);
    const ga4Available = ["real", "fixture"].includes(view.source_states.ga4?.state);
    const searchAvailable = ["real", "fixture"].includes(view.source_states.search_console?.state);
    byId("article-access-table").innerHTML = ga4Available || searchAvailable
      ? articleAccessTable(view.articles_access)
      : '<p class="empty-cell">記事アクセス指標は未取得です。</p>';
    byId("article-diagnosis-table").innerHTML = ga4Available
      ? articleDiagnosisTable(view.articles_diagnosis)
      : '<p class="empty-cell">記事から診断への遷移は未取得です。</p>';
    byId("sponsor-summary").innerHTML = sponsorSummary(view);

    const sponsorTrends = filteredSponsorTrends(state.report, state.filters);
    byId("sponsor-count-chart").innerHTML = lineChart(sponsorTrends, [
      { key: "sponsor_impressions", label: "表示", color: "#126a4a" },
      { key: "sponsor_clicks", label: "クリック", color: "#bd8b2b" }
    ], { label: "8週間のスポンサー広告表示回数とクリック数", emptyLabel: "スポンサーDBデータ未取得" });
    byId("sponsor-ctr-chart").innerHTML = lineChart(sponsorTrends, [
      { key: "sponsor_ctr", label: "CTR", color: "#126a4a", rate: true }
    ], { label: "8週間のスポンサー広告CTR", percent: true, minimumMax: 0.01, emptyLabel: "スポンサーDBデータ未取得" });
    byId("sponsor-body-table").innerHTML = sponsorTable(view.sponsor.by_body_part, "body", view.sponsor.available);
    byId("sponsor-region-table").innerHTML = sponsorTable(view.sponsor.by_region, "region", view.sponsor.available);
    byId("sponsor-cross-table").innerHTML = sponsorTable(view.sponsor.by_body_region, "cross", view.sponsor.available);

    document.querySelectorAll("[data-period]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
      state.period = button.dataset.period;
      render();
    }));
    [
      ["filter-sponsor", "sponsor_id"],
      ["filter-creative", "creative_id"],
      ["filter-placement", "placement_id"]
    ].forEach(([id, key]) => byId(id).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      render();
    }));
    byId("small-cell-toggle").addEventListener("change", (event) => {
      state.suppressSmallCells = event.target.checked;
      render();
    });
  }

  async function init() {
    if (!model) throw new Error("集計モデルを読み込めませんでした。");
    const isLocal = localHosts.has(window.location.hostname);
    byId("local-warning").hidden = !isLocal;
    byId("admin-logout").hidden = isLocal;
    const dataUrl = isLocal ? "./data/weekly-analytics.json" : "/api/admin/weekly-analytics";
    const response = await fetch(dataUrl, { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      window.location.assign("/admin/weekly-analytics/login/");
      return;
    }
    if (!response.ok) throw new Error(`集計データの読込に失敗しました (${response.status})`);
    state.report = await response.json();
    populateFilters(model.sponsorFilters(state.report));
    bindEvents();
    render();
  }

  init().catch((error) => {
    const message = byId("loading-error");
    message.textContent = error.message || "管理画面を表示できませんでした。";
    message.hidden = false;
    byId("period-label").textContent = "表示できませんでした";
  });
})();
