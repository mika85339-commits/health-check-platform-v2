create table if not exists public.muscle_diagnosis_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id text not null,
  diagnosis_run_id text,
  event_name text not null check (
    event_name in (
      'diagnosis_started',
      'step_viewed',
      'option_selected',
      'diagnosis_completed',
      'ai_explanation_clicked',
      'diagnosis_abandoned'
    )
  ),
  event_timestamp timestamptz not null,
  current_step integer,
  selected_region text,
  selected_details jsonb not null default '[]'::jsonb,
  movements jsonb not null default '[]'::jsonb,
  timing jsonb not null default '[]'::jsonb,
  pain_type jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  top_muscle text,
  used_ai_explanation boolean not null default false,
  diagnosis_version text not null,
  created_at timestamptz not null default now()
);

alter table public.muscle_diagnosis_events enable row level security;

drop policy if exists "muscle diagnosis events are server-write only" on public.muscle_diagnosis_events;

create policy "muscle diagnosis events are server-write only"
on public.muscle_diagnosis_events
for all
using (false)
with check (false);

create index if not exists idx_muscle_diagnosis_events_created_at
  on public.muscle_diagnosis_events (created_at desc);

create index if not exists idx_muscle_diagnosis_events_name_version
  on public.muscle_diagnosis_events (event_name, diagnosis_version);

create index if not exists idx_muscle_diagnosis_events_region
  on public.muscle_diagnosis_events (selected_region);

create or replace view public.muscle_diagnosis_daily_summary as
select
  date_trunc('day', created_at) as day,
  diagnosis_version,
  count(*) filter (where event_name = 'diagnosis_started') as started_count,
  count(*) filter (where event_name = 'diagnosis_completed') as completed_count,
  count(*) filter (where event_name = 'diagnosis_abandoned') as abandoned_count,
  count(*) filter (where event_name = 'ai_explanation_clicked') as ai_click_count
from public.muscle_diagnosis_events
group by 1, 2
order by day desc, diagnosis_version;

create or replace view public.muscle_diagnosis_region_summary as
select
  diagnosis_version,
  selected_region,
  count(*) filter (where event_name = 'diagnosis_started') as started_count,
  count(*) filter (where event_name = 'diagnosis_completed') as completed_count
from public.muscle_diagnosis_events
where selected_region is not null and selected_region <> ''
group by 1, 2
order by completed_count desc, started_count desc;

create or replace view public.muscle_diagnosis_top_muscles as
select
  diagnosis_version,
  top_muscle,
  count(*) as completed_count
from public.muscle_diagnosis_events
where event_name = 'diagnosis_completed'
  and top_muscle is not null
  and top_muscle <> ''
group by 1, 2
order by completed_count desc;
