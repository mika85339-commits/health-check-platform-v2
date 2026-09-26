const EVENT_CLASSIFICATION = Object.freeze({
  CURRENT_EMITTER: "A_current_ui_emitter",
  HISTORICAL_ONLY: "B_historical_ga4_no_current_emitter",
  NAME_ONLY: "C_name_only_or_unused"
});

const EVENT_AUDIT = Object.freeze([
  Object.freeze({
    event_name: "muscle_check_start",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The current diagnosis UI emits diagnosis_started; analytics.js mirrors it once per run."
  }),
  Object.freeze({
    event_name: "muscle_check_complete",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The current diagnosis UI emits diagnosis_completed; analytics.js mirrors it once per run."
  }),
  Object.freeze({
    event_name: "diagnosis_save_click",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The user presses the device-record button."
  }),
  Object.freeze({
    event_name: "diagnosis_save_complete",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The device record finishes; counted once per diagnosis run."
  }),
  Object.freeze({
    event_name: "diagnosis_history_view",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The user opens the diagnosis-history panel."
  }),
  Object.freeze({
    event_name: "diagnosis_compare_view",
    classification: EVENT_CLASSIFICATION.HISTORICAL_ONLY,
    report_source: "unavailable_current_ui",
    trigger: "Historical GA4 data exists, but the current UI has no comparison control or emitter."
  }),
  Object.freeze({
    event_name: "diagnosis_retry_click",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "The user presses the retry button."
  }),
  Object.freeze({
    event_name: "article_to_diagnosis",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "ga4",
    trigger: "A user follows an internal article link to a supported body-check destination."
  }),
  Object.freeze({
    event_name: "sponsor_banner_impression",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "sponsor_db",
    ga4_classification: EVENT_CLASSIFICATION.NAME_ONLY,
    trigger: "The sponsor banner is at least 50% visible for one second; it is sent to the sponsor endpoint, not GA4."
  }),
  Object.freeze({
    event_name: "sponsor_banner_click",
    classification: EVENT_CLASSIFICATION.CURRENT_EMITTER,
    report_source: "sponsor_db",
    ga4_classification: EVENT_CLASSIFICATION.NAME_ONLY,
    trigger: "The user presses the sponsor CTA; it is sent to the sponsor endpoint, not GA4."
  })
]);

const INTERACTION_EVENT_MAP = Object.freeze([
  Object.freeze({ action: "record_button_press", label: "今回を記録", event_name: "diagnosis_save_click", availability: "current" }),
  Object.freeze({ action: "record_complete", label: "記録完了", event_name: "diagnosis_save_complete", availability: "current" }),
  Object.freeze({ action: "history_panel_open", label: "診断履歴を見る", event_name: "diagnosis_history_view", availability: "current" }),
  Object.freeze({ action: "comparison_open", label: "前回比較を見る", event_name: null, historical_event_name: "diagnosis_compare_view", availability: "not_in_current_ui" }),
  Object.freeze({ action: "retry_button_press", label: "もう一度診断する", event_name: "diagnosis_retry_click", availability: "current" })
]);

const SOURCE_OF_TRUTH = Object.freeze([
  Object.freeze({ metric: "site_users_sessions_views_and_organic_sessions", source: "ga4", rule: "GA4_PROPERTY_ID plus exact GA4_HOST_NAME filter" }),
  Object.freeze({ metric: "google_search_queries_pages_clicks_impressions_ctr_position", source: "search_console", rule: "Search Console final data with its own returned date range" }),
  Object.freeze({ metric: "sponsor_impressions_clicks_and_ctr", source: "sponsor_db", rule: "Sponsor tables after exact event_id exclusions" }),
  Object.freeze({ metric: "diagnosis_start_complete_events_unique_sessions_and_body_parts", source: "diagnosis_db", rule: "muscle_diagnosis_events; count distinct anonymous_session_id without retaining identifiers" }),
  Object.freeze({ metric: "device_save_history_and_retry_actions", source: "ga4", rule: "Current explicit UI events" }),
  Object.freeze({ metric: "comparison_actions", source: "unavailable_current_ui", rule: "Do not infer from history opens or historical GA4 rows" }),
  Object.freeze({ metric: "article_to_self_check_actions", source: "ga4", rule: "article_to_diagnosis joined by normalized article path" }),
  Object.freeze({ metric: "anonymous_completed_records", source: "diagnosis_db", rule: "anonymous_diagnosis_records; not an explicit save-button metric" })
]);

module.exports = {
  EVENT_AUDIT,
  EVENT_CLASSIFICATION,
  INTERACTION_EVENT_MAP,
  SOURCE_OF_TRUTH
};
