-- Health Check Lab weekly analytics production migration.
-- Additive and idempotent: existing diagnosis and sponsor rows are not modified.

begin;

create table if not exists public.analytics_event_exclusions (
  exclusion_id bigint generated always as identity primary key,
  source text not null check (source in ('sponsor_db', 'diagnosis_db', 'ga4', 'search_console')),
  source_table text not null,
  event_id text not null,
  reason text not null,
  excluded_from_reporting_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_table, event_id)
);

comment on table public.analytics_event_exclusions is
  'Reporting-only exclusions. Source events remain intact and are never deleted by this table.';

insert into public.analytics_event_exclusions (source, source_table, event_id, reason)
values
  (
    'sponsor_db',
    'sponsor_impressions',
    'sponsor_view_5b7d7efe-ca03-442f-9e5a-f3b7569cc855:sponsor_banner_impression:result_top:hariplus_result_top_v1',
    'Phase 1 production verification by an administrator on 2026-09-26'
  ),
  (
    'sponsor_db',
    'sponsor_clicks',
    'sponsor_view_5b7d7efe-ca03-442f-9e5a-f3b7569cc855:sponsor_banner_click:result_top:hariplus_result_top_v1',
    'Phase 1 production verification by an administrator on 2026-09-26'
  )
on conflict (source_table, event_id) do nothing;

create table if not exists public.weekly_metric_snapshots (
  snapshot_id bigint generated always as identity primary key,
  week_start date not null,
  week_end date not null,
  generated_at timestamptz not null,
  schema_version integer not null default 2,
  report_timezone text not null default 'Asia/Tokyo',
  data_state text not null default 'partial_sources',
  users bigint,
  sessions bigint,
  views bigint,
  organic_sessions bigint,
  search_impressions bigint,
  search_clicks bigint,
  search_ctr numeric,
  search_position numeric,
  search_actual_start date,
  search_actual_end date,
  diagnosis_start_events bigint,
  diagnosis_start_unique_sessions bigint,
  diagnosis_start_unique_users_equivalent bigint,
  diagnosis_complete_events bigint,
  diagnosis_complete_unique_sessions bigint,
  diagnosis_complete_unique_users_equivalent bigint,
  diagnosis_event_completion_rate numeric,
  diagnosis_unique_session_completion_rate numeric,
  records bigint,
  retry_count bigint,
  ad_impressions bigint,
  ad_clicks bigint,
  ad_ctr numeric,
  ad_data_state text not null default 'unavailable',
  top_articles jsonb not null default '[]'::jsonb,
  top_body_parts jsonb not null default '[]'::jsonb,
  top_regions jsonb not null default '[]'::jsonb,
  sponsor_breakdown jsonb not null default '[]'::jsonb,
  source_periods jsonb not null default '{}'::jsonb,
  source_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, week_end)
);

-- These additions also make the migration safe if an earlier proposal was applied.
alter table public.weekly_metric_snapshots
  add column if not exists schema_version integer not null default 2,
  add column if not exists data_state text not null default 'partial_sources',
  add column if not exists search_ctr numeric,
  add column if not exists search_position numeric,
  add column if not exists search_actual_start date,
  add column if not exists search_actual_end date,
  add column if not exists diagnosis_start_unique_sessions bigint,
  add column if not exists diagnosis_start_unique_users_equivalent bigint,
  add column if not exists diagnosis_complete_unique_sessions bigint,
  add column if not exists diagnosis_complete_unique_users_equivalent bigint,
  add column if not exists diagnosis_event_completion_rate numeric,
  add column if not exists diagnosis_unique_session_completion_rate numeric,
  add column if not exists retry_count bigint,
  add column if not exists ad_data_state text not null default 'unavailable',
  add column if not exists sponsor_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

comment on table public.weekly_metric_snapshots is
  'One aggregate-only row per completed JST week. Raw events, answers, IDs, and personal information are not stored.';
comment on column public.weekly_metric_snapshots.diagnosis_start_unique_sessions is
  'Count of distinct anonymous diagnosis sessions; raw session identifiers are never retained.';
comment on column public.weekly_metric_snapshots.diagnosis_start_unique_users_equivalent is
  'Optional GA4 event-level user estimate. Null means unavailable and must not be displayed as zero.';
comment on column public.weekly_metric_snapshots.source_periods is
  'Requested and actual source date ranges. Search Console lag remains explicit instead of being zero-filled.';
comment on column public.weekly_metric_snapshots.source_status is
  'Per-source availability state such as real, missing_configuration, or error.';

create index if not exists weekly_metric_snapshots_week_idx
  on public.weekly_metric_snapshots (week_start desc);
create index if not exists analytics_event_exclusions_source_idx
  on public.analytics_event_exclusions (source, source_table);

alter table public.analytics_event_exclusions enable row level security;
alter table public.weekly_metric_snapshots enable row level security;
revoke all on public.analytics_event_exclusions, public.weekly_metric_snapshots from public, anon, authenticated;

commit;
