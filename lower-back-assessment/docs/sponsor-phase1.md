# Sponsor experiment Phase 1

This phase keeps advertising selection and measurement outside diagnosis scoring, result wording, local history, and anonymous diagnosis storage.

## Existing implementation audit

| Area | Existing behavior | Phase 1 behavior |
| --- | --- | --- |
| `body-platform.js` | `sponsorContext()` returned diagnosis profile `region`, `placement: post_result_after_care`, and `disclosure_label: PR` | Returns only canonical `body_part`, joint, `placement_id: result_top`, and `disclosure_label: 広告`; geographic data never comes from diagnosis answers |
| `analytics.js` | Reserved `sponsor_impression` and `sponsor_click` names | Sponsor module owns `sponsor_banner_impression` and `sponsor_banner_click`; no GA4 connection is enabled in this local phase |
| `sponsors` | Internal UUID, clinic fields, supported body parts, campaign dates, status, default `PR` | Reused; the production migration adds a stable public `sponsor_key`, changes only the default for future rows to `広告`, and reuses an existing Hariplus row when present |
| `sponsor_impressions` / `sponsor_clicks` | `sponsor_id`, generic `placement`, `body_part`, generic `region`, timestamp, optional anonymous session | Reused; the production migration adds `event_id`, `creative_id`, `placement_id`, `country_code`, `region_code`, and `region_name` while retaining legacy columns |

## Phase 1 creative

- Sponsor key: `hariplus`
- Creative: `hariplus_result_top_v1`
- Placement: `result_top`
- Disclosure: `広告`
- Destination: `https://hariplus-nagoya.com/`
- Eligible parts: all 13 canonical Health Check Lab body parts

Future creative selection can use sponsor status, supported body parts, server-derived region, priority, and the existing start/end dates. Phase 1 intentionally contains one confirmed creative and does not implement a management screen or billing.

## Measurement contract

An impression is recorded after at least 50% of the banner remains visible for at least one second. One result-view token, placement, and creative combination can emit only one impression. DOM replacement, scrolling, muscle switching, history, and comparison do not reset that token.

A click is recorded only from the banner CTA. Tracking is fire-and-forget and never cancels navigation. One result-view token, placement, and creative combination can emit only one click.

The event allowlist is:

- `event_type`
- opaque `event_id` for deduplication (not a diagnosis ID)
- `sponsor_id`
- `creative_id`
- `placement_id`
- canonical `body_part`
- server-derived `country_code`, `region_code`, and `region_name`
- `occurred_at`

The sponsor event does not accept symptom details, answers, candidate muscles, scores, result text, demographic profile, contact information, address, city, postal code, raw IP, latitude, longitude, or diagnosis ID.

For local preview only, `sponsor_region=JP-23`, `JP-13`, or `JP-27` supplies Aichi, Tokyo, or Osaka to the in-memory `window.__HCL_LOCAL_SPONSOR_EVENTS__` log. In production, the Netlify function derives prefecture-level fields from server Geo and writes only the allowlisted advertising event fields after the production migration has been applied.
