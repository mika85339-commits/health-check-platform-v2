# Anonymous body platform foundation

## Scope

This foundation keeps diagnosis results independent from future sponsorship. It adds local history and comparison, a canonical anonymous diagnosis record, aggregate-ready fields, and a sponsor context contract. It does not add authentication, profiles tied to a person, sponsor selection, sponsor display, billing, or ad ranking.

## Data flow

1. The existing body-check logic produces a result.
2. `body-platform.js` normalizes that result without changing ranking or scoring.
3. The browser upserts the result in `health_check_lab_records` for device-local history.
4. `/.netlify/functions/save-diagnosis-record` sanitizes and upserts the anonymous server record with the server-only service role.
5. Supabase updates daily rollups in the same transaction. `/.netlify/functions/diagnosis-insights` returns only cells with 10 or more diagnoses and caches the aggregate.
6. Aggregate views describe Health Check Lab usage only. They must not be described as Japanese population statistics.

No name, email address, phone number, street address, or account identifier is accepted by the save function. Age band, sex, broad region, life impact, and duration are optional.

The My Body history and comparison data remain only in browser storage. They are not copied wholesale to the server. The anonymous device ID rotates after 90 days, the anonymous session ID lives in session storage, and neither ID is sent as a GA4 `user_id` or used for advertising.

## Supabase rollout

The former project ref `uebrtbflpgccbyysiyrh` currently returns NXDOMAIN and is not a usable production database. Do not recreate or guess that project. A project owner must either restore the original project in Supabase or create/select the approved replacement.

For an approved, active project:

1. Run `supabase-body-platform.sql` once in the Supabase SQL editor and confirm the transaction completed.
2. Set the project API URL as Netlify `SUPABASE_URL`.
3. Set the server-only service-role key as Netlify `SUPABASE_SERVICE_ROLE_KEY`. Never put it in browser code or a public build variable.
4. Keep `ANONYMOUS_DIAGNOSIS_RECORDS_TABLE=anonymous_diagnosis_records`.
5. Set a long random Netlify-only `DIAGNOSIS_SYNC_SECRET`.
6. Redeploy, submit one explicitly marked test diagnosis, resend the same diagnosis ID, and confirm there is still one row.
7. Invoke `/.netlify/functions/sync-diagnosis-records` with `Authorization: Bearer <DIAGNOSIS_SYNC_SECRET>` until `has_more` is false.

If Supabase is unavailable, the save function stores one durable Blob per diagnosis ID. Re-saving the same diagnosis replaces that Blob instead of creating a duplicate. The protected sync function upserts each Blob into Supabase and deletes it only after a successful database write. Failed records remain in Blobs for a later retry.

The browser no longer contains a Supabase project URL or anon key and never reads raw diagnosis rows. The legacy `community_insights` table is not used for new writes.

## Aggregate and scale model

`anonymous_diagnosis_daily_rollups` stores daily counts and score sums for body part, joint, age band, broad region, sex, side, movement, duration, life impact, and repeat visit. Insert, update, and delete triggers keep the rollups idempotent when `diagnosis_id` is upserted.

`health_check_lab_insights` reads rollups rather than scanning raw diagnoses. It returns body, joint, age, region, sex, movement, daily, weekly, and monthly aggregates. The minimum cell size is enforced at 10 even if an environment variable requests a smaller value. Netlify caches the result for 15 minutes and can serve the last aggregate during a temporary Supabase outage.

At substantially larger scale, keep the public API on rollups and cache. Add date partitioning to the raw table only after production row growth and query plans justify it; partitioning is intentionally not part of the initial migration. Archive or expire raw pseudonymous records under an approved retention policy without deleting the aggregate series.

## Sponsor separation

`sponsorContext(record)` returns only canonical `body_part`, `joint`, `placement_id`, and disclosure label. Geographic context is derived separately on the server and never from diagnosis answers. It is called after diagnosis and has no dependency in the scoring tables or candidate-muscle ranking.

The reserved `sponsors`, `sponsor_impressions`, and `sponsor_clicks` tables have no public client access. Sponsor matching consumes only a separate `body_part` / `joint` context plus server-derived prefecture-level region. Sponsor availability or priority must never alter a diagnosis result.

## Measurement

GA4 receives only event names and technical journey fields for body-check events. Detailed symptoms, scores, answers, body parts, and muscle names remain in the anonymous first-party storage flow and are not included in the new GA4 parameters.

Reserved events: `diagnosis_start`, `diagnosis_complete`, `diagnosis_save_click`, `diagnosis_save_complete`, `diagnosis_history_view`, `diagnosis_compare_view`, `diagnosis_retry_click`, `population_insight_view`, `sponsor_banner_impression`, and `sponsor_banner_click`.
