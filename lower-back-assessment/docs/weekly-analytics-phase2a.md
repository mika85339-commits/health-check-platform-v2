# Weekly analytics Phase 2-A and Phase 2-B preparation

This document records the read-only foundation, approved dashboard, and production runtime for Weekly Analytics.

The production runtime keeps the same metric definitions: exact GA4 host filtering, Search Console requested/actual periods, event and unique-session diagnosis counts, explicit administrator event exclusions, and missing values that remain distinct from zero.

## Audit snapshot (2026-09-26 JST)

### GA4

- Account: `hariplus.com - GA4` (`140914864`)
- Property: `411472877`
- Property timezone: `Asia/Tokyo`
- Health Check Lab uses measurement ID `G-CV0J8DWSVF` in the shared `hariplus-nagoya.com - GA4` stream.
- Every Data API request therefore requires `hostName = health-check-platform-v2.netlify.app`. Property-wide totals are not Health Check Lab totals.
- GA4 has received the relevant events, including `muscle_check_start`, `muscle_check_complete`, `diagnosis_save_click`, `diagnosis_save_complete`, `diagnosis_retry_click`, `diagnosis_compare_view`, and `article_to_diagnosis`. `diagnosis_compare_view` is visible historically, but the current UI source has no active emitter, so future zeroes must not be interpreted as a reporting failure.
- The repository and current local environment do not contain automated Data API credentials.

### Search Console

- Property: `https://health-check-platform-v2.netlify.app/`
- Authenticated browser access is available, but API credentials are not configured locally.
- Search Analytics dates are interpreted in `America/Los_Angeles`, not JST. The report stores the requested range, actual last returned date, data state, and source timezone separately.
- `dataState=final` is used. Page totals, query totals, and page-query associations are requested separately so anonymized low-volume query rows do not silently replace page totals. Search Console can lag and may return only top rows, so an empty response is not automatically treated as zero demand.
- Each result preserves `requested_start`, `requested_end`, `actual_data_start`, `actual_data_end`, `source_timezone`, and `data_state`. An empty response keeps both actual dates `null`; it is not converted into zero search demand.

### Sponsor database

Read-only production inspection found `3` impressions and `2` clicks at the audit time. The known Phase 1 administrator verification is identified by its exact impression and click `event_id`; only those two records are excluded. Later low-volume events are not guessed to be tests.

Available dimensions are sponsor, creative, placement, body part, country, region code, region name, and occurrence time. This supports daily, weekly, and `body_part x region` reporting without joining diagnosis answers.

### Diagnosis database

Read-only production inspection found the following at the audit time:

- `muscle_diagnosis_events`: 651 events; 128 starts and 28 completions.
- `anonymous_diagnosis_records`: 30 completed anonymous records across all 13 body parts.
- The diagnosis event table is the source for starts and completions.
- GA4 is the source for explicit device-save, history, and retry UI actions. Comparison has no current UI action and is not reported as a current metric.
- Anonymous completed records are not counted as explicit save-button actions.

No production row was inserted, updated, or deleted during this audit.

## Current event audit

| Event | Classification | Current reporting source |
| --- | --- | --- |
| `muscle_check_start` | A: current emitter | GA4 |
| `muscle_check_complete` | A: current emitter | GA4 |
| `diagnosis_save_click` | A: current emitter | GA4 |
| `diagnosis_save_complete` | A: current emitter | GA4 |
| `diagnosis_history_view` | A: current emitter | GA4 |
| `diagnosis_compare_view` | B: historical GA4, no current emitter | Unavailable until a comparison action is restored |
| `diagnosis_retry_click` | A: current emitter | GA4 |
| `article_to_diagnosis` | A: current emitter | GA4 |
| `sponsor_banner_impression` | A: current emitter | Sponsor database; the GA4 allowlist name is unused |
| `sponsor_banner_click` | A: current emitter | Sponsor database; the GA4 allowlist name is unused |

The current result UI was checked in a real local browser. Saving, opening history, and retrying are present and operational. There is no `前回比較を見る` control. No `diagnosis_compare_view` emitter was added: emitting it on page view or relabelling a history open as comparison would make the metric false.

| User action | Event |
| --- | --- |
| Press record | `diagnosis_save_click` |
| Record completes | `diagnosis_save_complete` |
| Open history | `diagnosis_history_view` |
| Open previous comparison | Not available in the current UI; historical name is `diagnosis_compare_view` |
| Press retry | `diagnosis_retry_click` |

## Source-of-truth model

| Metric | Source | Notes |
| --- | --- | --- |
| Users, sessions, views, organic sessions | GA4 Data API | Exact Health Check Lab hostname filter required |
| Landing page and article traffic | GA4 Data API | Joined by normalized canonical path |
| Search query/page/click/impression/position | Search Console API | Final data, Pacific Time, independent data-through date |
| Diagnosis start/completion/body part | `muscle_diagnosis_events` | Server-side diagnosis events |
| Explicit save/history/retry | GA4 events | Kept separate from anonymous diagnosis records |
| Previous comparison | Unavailable in current UI | Do not infer it from history opens or old GA4 rows |
| Anonymous completed record count | `anonymous_diagnosis_records` | Supporting completion record, not an explicit save action |
| Sponsor impression/click/CTR | Sponsor tables | No diagnosis answers or health details are selected |

## Week boundaries and comparison

- Report week: Monday 00:00 through the following Monday 00:00, `Asia/Tokyo`.
- Database filters use the equivalent half-open UTC range. For example, a Monday JST week starts Sunday 15:00 UTC.
- GA4 dates use the property timezone, verified as JST.
- Search Console uses the same calendar labels but its source timezone remains Pacific Time and is recorded separately.
- Previous-week percentage is `null` when the prior value is missing or zero. A change from zero is marked `new`; `0 -> 0` is marked `unchanged_zero`.

The fixture produces eight ordered weekly objects. Each object contains `ga4`, `search_console`, `sponsor`, `diagnosis`, `articles`, and `comparison` sections.

## Article join

Published article metadata comes from `/data/sanity-articles/index.json`. GA4 `pagePath`, GA4 landing path, GA4 `article_to_diagnosis`, and Search Console page URL are normalized to one trailing-slash path before joining. Each article row can therefore expose:

- title and canonical URL
- views and users
- organic landing sessions
- Search Console impressions, clicks, CTR, and average position
- article-to-self-check clicks

## Required Google setup

1. Enable Google Analytics Data API, Google Analytics Admin API, and Search Console API in one Google Cloud project.
2. Create a service account for read-only reporting. Keep its key outside Git.
3. Add the service-account email as a Viewer on GA4 property `411472877`.
4. Add the same email to the Health Check Lab Search Console property with permission to read performance data.
5. Configure either a credentials-file path locally or a base64-encoded credential value in the future runtime. Never paste the private key into chat or source control.

### Authentication choice

- Future Netlify/serverless production runtime: `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
- Local development only: `GOOGLE_APPLICATION_CREDENTIALS`, pointing to an absolute credentials-file path outside the repository.

The environment-variable approach is selected for production because a deploy runtime must not depend on a developer-machine file path. The decoded JSON and private key must never be printed to logs. No credential has been requested or configured in this phase.

The current confirmed state is that browser access to GA4 and Search Console exists, but automated API credentials are absent. API enablement and service-account permissions cannot be proven until the Google-side setup is completed:

1. Select or create one Google Cloud project dedicated to reporting access.
2. Enable Google Analytics Data API, Google Analytics Admin API, and Search Console API.
3. Create a service account; do not send its key in chat.
4. Add its email as Viewer on GA4 property `411472877`.
5. Add the same email as a user with read access on Search Console property `https://health-check-platform-v2.netlify.app/`.
6. Store the base64-encoded service-account JSON only in the future protected production environment variable.

Required environment names are documented in `.env.example`. They are not set or changed by this phase.

## Local commands

```powershell
npm run analytics:weekly:audit
npm run analytics:weekly:test
npm run analytics:weekly:fixture
```

`analytics:weekly:fixture` performs no network access. Live read-only collection is intentionally explicit:

```powershell
node scripts/weekly-analytics-cli.js --live --summary
```

The live command fails closed when credentials or required identifiers are missing. Supabase collection uses only `GET`; Google report APIs use read-only report queries.

## Optional snapshot proposal

`supabase-weekly-analytics-phase2a.sql` is an unapplied proposal. Raw APIs remain the source of truth, while `weekly_metric_snapshots` would provide one aggregate-only row per JST week. The wide row contains access, search, diagnosis event and unique-session counts, records, sponsor totals, and JSON arrays for the top articles, body parts, and regions. It also retains source status plus requested and actual source periods so that a delayed Search Console response stays `null`/unavailable instead of being rewritten as zero.

The snapshot deliberately excludes diagnosis answers, candidate muscles, scores, anonymous session IDs, diagnosis IDs, sponsor event IDs, and personal information. `diagnosis_start_unique` and `diagnosis_complete_unique` are counts computed from `anonymous_session_id`; the identifiers themselves never leave the collector. Optional `*_unique_users` values are GA4 event-level user estimates and remain distinct from database session counts.

`buildWeeklySnapshot()` creates the exact aggregate payload expected by the proposal without writing to the database. A future writer can upsert by `(week_start, week_end)` only after every available source has been collected. `analytics_event_exclusions` preserves, but omits from reports, only exact known administrator verification events.

The proposal is useful once a weekly scheduled collector is approved. It is not necessary for fixture validation and has not been applied to production.

## Scheduled collection design (not activated)

The future Netlify Scheduled Function should run at `0 0 * * 1` UTC, which is Monday 09:00 JST. It should process the completed Monday-Sunday JST week, not the newly started partial week:

1. Obtain GA4 and Search Console read-only credentials from protected runtime variables.
2. Read GA4 with the exact Health Check Lab hostname filter.
3. Read Search Console and retain both requested and actual returned dates.
4. Read diagnosis and sponsor tables independently with server-only credentials.
5. Apply only exact audited event exclusions.
6. Build one aggregate snapshot and upsert it idempotently by week.
7. Make the completed snapshot available to the protected dashboard/report endpoint.
8. Generate the weekly report only after the snapshot write succeeds.

Search Console can still lag on Monday. Missing trailing days remain absent and are described in `source_periods`; they are never zero-filled. The Scheduled Function, its cron declaration, the snapshot writer, and notifications are not enabled in this phase.

## Protected weekly report API design (not implemented)

The dashboard HTML and the machine-readable weekly report endpoint are separate security boundaries:

- Human dashboard: require an authenticated administrator role and validate the session server-side before returning HTML or data.
- Machine-to-machine report endpoint: prefer a short-lived OIDC/JWT access token with a `weekly:read` scope. Verify issuer, audience, expiry, and scope in the Netlify Function.
- If the notification client cannot issue short-lived tokens, use a dedicated read-only bearer token stored only in the caller's secret store and a Netlify secret variable. Send it in the `Authorization` header, rotate it, and compare it server-side; never place it in a URL, static JavaScript, or report JSON.
- Return only columns from `weekly_metric_snapshots`. Do not expose raw source rows, event IDs, session IDs, credentials, diagnosis records, or source API responses.
- Keep non-secret selectors such as `week_start` in the query string; reject arbitrary table/column parameters.

## Administrator test separation

The two Phase 1 sponsor verification events continue to be excluded only by their exact `event_id`. No diagnosis event is currently removed because there is no verified production marker that distinguishes an administrator test from real use.

Future tests should use a separate staging project whenever possible. If a production smoke test is unavoidable, an authenticated server-side test route should assign a generated `test_run_id` and `event_context = 'admin_test'`; the browser must not be allowed to self-declare arbitrary events as tests. Reporting can then exclude only those audited IDs/contexts. Historical diagnosis rows must not be guessed or retroactively removed.

## Phase 2-B local dashboard

The internal dashboard is available locally at `/admin/weekly-analytics/`. It reads the same normalized eight-week report used by the CLI and clearly labels fixture output as `ローカル確認用データ`.

It provides:

- current week, previous week, four-week, and eight-week views
- previous-period comparisons that distinguish zero from missing data
- GA4 access trends and Search Console impressions, clicks, CTR, position, and actual returned dates
- diagnosis funnel, body-part usage, article access, and article-to-diagnosis referral rate
- sponsor filters for sponsor, creative, and placement
- sponsor totals, weekly trends, body-part, region, and body-part-by-region breakdowns
- default suppression of cells with fewer than ten sponsor impressions

The dashboard source is intentionally absent from the folder allowlist in `scripts/netlify-build.js`. A hostname check in the browser is a development guard only; it is not production authentication.

### Required protection before production use

Do not copy `admin/` or its JSON into `dist` until an authenticated server-side path is approved. The recommended implementation boundary is:

1. Authenticate owner or manager access before returning either the dashboard HTML or its data.
2. Serve report data from a protected same-origin function; never publish production analytics as a static JSON asset.
3. Enforce the role again inside the data function instead of relying on hidden navigation or client-side checks.
4. Keep Google and Supabase credentials server-side and return only aggregated metrics.
5. Add explicit protected rewrites for `/admin/weekly-analytics/` only after the access test is in place.

A future implementation can live in `netlify/functions/weekly-analytics-dashboard.mjs` and `netlify/functions/weekly-analytics-data.mjs`, with the protected route added explicitly to `_redirects` and the build allowlist. No production authentication, route, or function was added in Phase 2-B.

## Phase 2-C local real-data connection

Phase 2-C keeps the approved dashboard layout and adds a source-aware local report generator. Each source is collected independently and is labelled as `real`, `fixture`, `missing_configuration`, or `error`. Missing sources remain `null` and render as `—`; they are never converted to a real zero.

The local command reads `.env.local` when it exists. That file is already excluded by the repository-level `.gitignore` and must remain outside source control.

```powershell
npm run analytics:dashboard:live
```

The generated browser JSON contains only aggregated metrics, published article metadata, non-secret source identifiers, and source status. Google credentials and the Supabase service-role key remain in the CLI process and are not written to HTML, JavaScript, or report JSON.

### Current connection snapshot (2026-09-26 JST)

- Published article metadata: real, read from the production public article index; 27 articles were returned.
- GA4: not collected because automated Google credentials and local environment variables are absent.
- Search Console: not collected for the same reason.
- Sponsor database: not collected because `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are absent locally.
- Diagnosis database: not collected for the same reason.

The dashboard therefore shows a mixed state: real article titles and URLs, with access, search, diagnosis, and sponsor metrics shown as unavailable rather than zero.

## Production runtime

The approved production runtime uses two additive Supabase tables:

- `weekly_metric_snapshots`: one aggregate-only row per completed Monday-Sunday JST week, upserted by `(week_start, week_end)`.
- `analytics_event_exclusions`: reporting-only exact event IDs. Source events are not deleted.

`weekly-analytics-scheduled.mjs` runs with Netlify Scheduled Functions at `0 0 * * 1` UTC, which is Monday 09:00 JST. It collects only the most recently completed week. The current in-progress week stays live and is never saved as a final snapshot.

The dashboard route `/admin/weekly-analytics/` is served by a Netlify Function only after a signed, one-hour `HttpOnly; Secure; SameSite=Strict` session is verified. Production analytics JSON is returned by a separate same-origin authenticated function and is never written into `dist`.

The machine-readable `/api/weekly-report` endpoint returns only allowlisted snapshot fields. It accepts a dedicated read-only bearer token in the `Authorization` header; tokens in URLs, query strings, HTML, or browser JavaScript are rejected by design. The current notification environment does not provide an OIDC issuer, so this endpoint uses the documented fallback until short-lived `weekly:read` JWT issuance is available.

The public build copies only the dashboard CSS and JavaScript assets. The HTML route and analytics data remain server-side. Google and Supabase credentials are Netlify secrets and are unavailable to browser bundles.

Future production diagnosis smoke tests should use a server-assigned `test_run_id` and `event_context = 'admin_test'`, or a staging environment. Historical diagnosis rows are not inferred to be tests and are not removed.

### Minimal Google setup still required

1. In one Google Cloud project, enable Google Analytics Data API, Google Analytics Admin API, and Search Console API.
2. Create a service account for read-only reporting; keep its JSON key outside the repository.
3. Add the service-account email as Viewer on GA4 property `411472877`.
4. Add the same email as a read-capable user on Search Console property `https://health-check-platform-v2.netlify.app/`.
5. Set the following in local `.env.local`; do not paste the credential contents into chat:

```dotenv
GA4_PROPERTY_ID=411472877
GA4_HOST_NAME=health-check-platform-v2.netlify.app
GSC_SITE_URL=https://health-check-platform-v2.netlify.app/
GOOGLE_APPLICATION_CREDENTIALS=C:\absolute\path\outside\the\repository\service-account.json
```

`GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` remains the preferred future protected-runtime alternative to `GOOGLE_APPLICATION_CREDENTIALS`.

### Minimal database setup still required

Set the existing project URL and a read-capable server-side key in local `.env.local`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=stored-locally-only
```

The collector uses only HTTP `GET` requests. It reads sponsor and diagnosis tables separately and never joins advertising rows to health data. The exact two Phase 1 administrator event IDs remain the only sponsor-event exclusions.

After the settings are present, rerun `npm run analytics:dashboard:live`, then open `/admin/weekly-analytics/`. The report includes per-week reconciliation rows for GA4 users/sessions/views, Search Console impressions/clicks, diagnosis starts/completions, and sponsor impressions/clicks.
