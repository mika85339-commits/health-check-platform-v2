# Anonymous body platform foundation

## Scope

This foundation keeps diagnosis results independent from future sponsorship. It adds local history and comparison, a canonical anonymous diagnosis record, aggregate-ready fields, and a sponsor context contract. It does not add authentication, profiles tied to a person, sponsor selection, sponsor display, billing, or ad ranking.

## Data flow

1. The existing body-check logic produces a result.
2. `body-platform.js` normalizes that result without changing ranking or scoring.
3. The browser upserts the result in `health_check_lab_records` for device-local history.
4. `/.netlify/functions/save-diagnosis-record` sanitizes and upserts the anonymous server record.
5. Aggregate views can describe Health Check Lab usage only. They must not be described as Japanese population statistics.

No name, email address, phone number, street address, or account identifier is accepted by the save function. Age band, sex, broad region, life impact, and duration are optional.

## Supabase rollout

Run `supabase-body-platform.sql` once in the production Supabase project, then confirm that the Netlify Function has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The optional `ANONYMOUS_DIAGNOSIS_RECORDS_TABLE` value defaults to `anonymous_diagnosis_records`.

Until the migration exists, automatic saves first try the existing `community_insights` table. If Supabase is unavailable, the modern Netlify Function stores one durable Blob per diagnosis ID. Re-saving the same diagnosis replaces that Blob instead of creating a duplicate. Supabase remains the long-term aggregate database; Blob storage is a data-loss prevention fallback that can later be migrated.

## Sponsor separation

`sponsorContext(record)` returns only `body_part`, `joint`, broad `region`, placement, and disclosure label. It is called after diagnosis and has no dependency in the scoring tables or candidate-muscle ranking. Future sponsor lookup must consume this context in a separate service and must render after results, explanation, local comparison, self-care, and related content.

The reserved `sponsors`, `sponsor_impressions`, and `sponsor_clicks` tables have no public client access. Sponsor availability or priority must never alter a diagnosis result.

## Measurement

GA4 receives only event names and technical journey fields for body-check events. Detailed symptoms, scores, answers, body parts, and muscle names remain in the anonymous first-party storage flow and are not included in the new GA4 parameters.

Reserved events: `diagnosis_start`, `diagnosis_complete`, `diagnosis_save_click`, `diagnosis_save_complete`, `diagnosis_history_view`, `diagnosis_compare_view`, `diagnosis_retry_click`, `population_insight_view`, `sponsor_impression`, and `sponsor_click`.
