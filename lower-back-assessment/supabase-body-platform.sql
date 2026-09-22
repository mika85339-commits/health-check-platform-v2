begin;

create table if not exists public.anonymous_diagnosis_records (
  diagnosis_id text primary key,
  anonymous_device_id text not null,
  anonymous_session_id text,
  diagnosis_version text not null,
  diagnosis_date timestamptz not null,
  body_part text not null,
  body_part_group text not null,
  joint_name text not null,
  left_right text not null,
  symptom_score smallint not null check (symptom_score between 0 and 100),
  symptom_duration text not null default 'unknown',
  symptom_timing text not null default 'unknown',
  movements text[] not null default '{}',
  candidate_muscles text[] not null default '{}',
  age_band text not null default 'unknown',
  sex text not null default 'no_answer',
  region text not null default 'no_answer',
  life_impact text not null default 'unknown',
  referral_source text not null default 'direct',
  repeat_visit boolean not null default false,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.anonymous_diagnosis_records enable row level security;
revoke all on public.anonymous_diagnosis_records from public, anon, authenticated;

create index if not exists anonymous_diagnosis_date_idx
on public.anonymous_diagnosis_records (diagnosis_date desc);
create index if not exists anonymous_diagnosis_body_date_idx
on public.anonymous_diagnosis_records (body_part, diagnosis_date desc);
create index if not exists anonymous_diagnosis_joint_date_idx
on public.anonymous_diagnosis_records (joint_name, diagnosis_date desc);
create index if not exists anonymous_diagnosis_region_body_idx
on public.anonymous_diagnosis_records (region, body_part);
create index if not exists anonymous_diagnosis_age_body_idx
on public.anonymous_diagnosis_records (age_band, body_part);
create index if not exists anonymous_diagnosis_sex_date_idx
on public.anonymous_diagnosis_records (sex, diagnosis_date desc);
create index if not exists anonymous_diagnosis_repeat_date_idx
on public.anonymous_diagnosis_records (repeat_visit, diagnosis_date desc);
create index if not exists anonymous_diagnosis_movements_idx
on public.anonymous_diagnosis_records using gin (movements);

create table if not exists public.anonymous_diagnosis_daily_rollups (
  period_start date not null,
  dimension text not null,
  label text not null,
  diagnosis_count bigint not null default 0,
  symptom_score_sum bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (period_start, dimension, label)
);

alter table public.anonymous_diagnosis_daily_rollups enable row level security;
revoke all on public.anonymous_diagnosis_daily_rollups from public, anon, authenticated;
create index if not exists anonymous_rollups_dimension_date_idx
on public.anonymous_diagnosis_daily_rollups (dimension, period_start desc);

create or replace function public.health_check_lab_apply_rollup(
  p_record public.anonymous_diagnosis_records,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
begin
  for item in
    select dimension, label from (
      values
        ('body_part', p_record.body_part),
        ('joint', p_record.joint_name),
        ('age_band', p_record.age_band),
        ('region', p_record.region),
        ('sex', p_record.sex),
        ('left_right', p_record.left_right),
        ('symptom_duration', p_record.symptom_duration),
        ('life_impact', p_record.life_impact),
        ('repeat_visit', case when p_record.repeat_visit then 'repeat' else 'first' end)
    ) as fixed(dimension, label)
    union all
    select 'movement', movement from unnest(p_record.movements) as movement
  loop
    if item.label is null or btrim(item.label) = '' then
      continue;
    end if;
    insert into public.anonymous_diagnosis_daily_rollups (
      period_start, dimension, label, diagnosis_count, symptom_score_sum, updated_at
    ) values (
      p_record.diagnosis_date::date, item.dimension, item.label,
      p_delta, p_delta * p_record.symptom_score, now()
    )
    on conflict (period_start, dimension, label) do update set
      diagnosis_count = public.anonymous_diagnosis_daily_rollups.diagnosis_count + excluded.diagnosis_count,
      symptom_score_sum = public.anonymous_diagnosis_daily_rollups.symptom_score_sum + excluded.symptom_score_sum,
      updated_at = now();
  end loop;
  delete from public.anonymous_diagnosis_daily_rollups where diagnosis_count <= 0;
end;
$$;

create or replace function public.health_check_lab_rollup_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.health_check_lab_apply_rollup(old, -1);
    return old;
  end if;
  if tg_op = 'UPDATE' then
    perform public.health_check_lab_apply_rollup(old, -1);
  end if;
  perform public.health_check_lab_apply_rollup(new, 1);
  return new;
end;
$$;

drop trigger if exists anonymous_diagnosis_rollup_trigger on public.anonymous_diagnosis_records;
truncate table public.anonymous_diagnosis_daily_rollups;

insert into public.anonymous_diagnosis_daily_rollups (
  period_start, dimension, label, diagnosis_count, symptom_score_sum, updated_at
)
select
  source.diagnosis_date::date,
  dimensions.dimension,
  dimensions.label,
  count(*),
  sum(source.symptom_score),
  now()
from public.anonymous_diagnosis_records as source
cross join lateral (
  select dimension, label from (
    values
      ('body_part', source.body_part),
      ('joint', source.joint_name),
      ('age_band', source.age_band),
      ('region', source.region),
      ('sex', source.sex),
      ('left_right', source.left_right),
      ('symptom_duration', source.symptom_duration),
      ('life_impact', source.life_impact),
      ('repeat_visit', case when source.repeat_visit then 'repeat' else 'first' end)
  ) as fixed(dimension, label)
  union all
  select 'movement', movement from unnest(source.movements) as movement
) as dimensions
where dimensions.label is not null and btrim(dimensions.label) <> ''
group by 1, 2, 3;

create trigger anonymous_diagnosis_rollup_trigger
after insert or update or delete on public.anonymous_diagnosis_records
for each row execute function public.health_check_lab_rollup_trigger();

create or replace function public.health_check_lab_dimension_totals(
  p_dimension text,
  p_from timestamptz default (now() - interval '1 year'),
  p_min_cell_size integer default 10
)
returns table (label text, diagnosis_count bigint, average_symptom_score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  threshold integer := greatest(coalesce(p_min_cell_size, 10), 10);
begin
  if p_dimension not in ('body_part', 'joint', 'age_band', 'region', 'sex', 'left_right', 'movement', 'symptom_duration', 'life_impact', 'repeat_visit') then
    raise exception 'unsupported_dimension';
  end if;
  return query
  select
    rollup.label,
    sum(rollup.diagnosis_count)::bigint,
    round(sum(rollup.symptom_score_sum)::numeric / nullif(sum(rollup.diagnosis_count), 0), 1)
  from public.anonymous_diagnosis_daily_rollups as rollup
  where rollup.dimension = p_dimension
    and rollup.period_start >= p_from::date
  group by rollup.label
  having sum(rollup.diagnosis_count) >= threshold
  order by sum(rollup.diagnosis_count) desc, rollup.label;
end;
$$;

create or replace function public.health_check_lab_time_totals(
  p_period text,
  p_from timestamptz default (now() - interval '1 year'),
  p_min_cell_size integer default 10
)
returns table (period_start date, diagnosis_count bigint, average_symptom_score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  threshold integer := greatest(coalesce(p_min_cell_size, 10), 10);
begin
  if p_period not in ('day', 'week', 'month') then
    raise exception 'unsupported_period';
  end if;
  return query
  select
    date_trunc(p_period, rollup.period_start)::date,
    sum(rollup.diagnosis_count)::bigint,
    round(sum(rollup.symptom_score_sum)::numeric / nullif(sum(rollup.diagnosis_count), 0), 1)
  from public.anonymous_diagnosis_daily_rollups as rollup
  where rollup.dimension = 'body_part'
    and rollup.period_start >= p_from::date
  group by 1
  having sum(rollup.diagnosis_count) >= threshold
  order by 1;
end;
$$;

create or replace function public.health_check_lab_insights(
  p_from timestamptz default (now() - interval '1 year'),
  p_min_cell_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  threshold integer := greatest(coalesce(p_min_cell_size, 10), 10);
  total bigint;
begin
  select coalesce(sum(diagnosis_count), 0) into total
  from public.anonymous_diagnosis_daily_rollups
  where dimension = 'body_part' and period_start >= p_from::date;

  return jsonb_build_object(
    'available', total >= threshold,
    'total_count', case when total >= threshold then total else 0 end,
    'min_cell_size', threshold,
    'body_part', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('body_part', p_from, threshold) as items),
    'joint', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('joint', p_from, threshold) as items),
    'age_band', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('age_band', p_from, threshold) as items),
    'region', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('region', p_from, threshold) as items),
    'sex', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('sex', p_from, threshold) as items),
    'movement', (select coalesce(jsonb_agg(to_jsonb(items) order by items.diagnosis_count desc), '[]'::jsonb) from public.health_check_lab_dimension_totals('movement', p_from, threshold) as items),
    'daily', (select coalesce(jsonb_agg(to_jsonb(items) order by items.period_start), '[]'::jsonb) from public.health_check_lab_time_totals('day', p_from, threshold) as items),
    'weekly', (select coalesce(jsonb_agg(to_jsonb(items) order by items.period_start), '[]'::jsonb) from public.health_check_lab_time_totals('week', p_from, threshold) as items),
    'monthly', (select coalesce(jsonb_agg(to_jsonb(items) order by items.period_start), '[]'::jsonb) from public.health_check_lab_time_totals('month', p_from, threshold) as items)
  );
end;
$$;

revoke all on function public.health_check_lab_apply_rollup(public.anonymous_diagnosis_records, integer) from public, anon, authenticated;
revoke all on function public.health_check_lab_rollup_trigger() from public, anon, authenticated;
revoke all on function public.health_check_lab_dimension_totals(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.health_check_lab_time_totals(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.health_check_lab_insights(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.health_check_lab_insights(timestamptz, integer) to service_role;

drop view if exists public.health_check_lab_monthly_trends;
create view public.health_check_lab_monthly_trends
with (security_invoker = true) as
select
  date_trunc('month', period_start)::date as month,
  dimension,
  label,
  sum(diagnosis_count) as diagnosis_count,
  round(sum(symptom_score_sum)::numeric / nullif(sum(diagnosis_count), 0), 1) as average_symptom_score
from public.anonymous_diagnosis_daily_rollups
group by 1, 2, 3
having sum(diagnosis_count) >= 10;

revoke all on public.health_check_lab_monthly_trends from public, anon, authenticated;
comment on view public.health_check_lab_monthly_trends is
'Health Check Lab利用者の匿名集計。日本人全体の統計として使用しない。';

create table if not exists public.sponsors (
  sponsor_id uuid primary key default gen_random_uuid(),
  clinic_name text not null,
  region text not null,
  city text,
  supported_body_parts text[] not null default '{}',
  supported_joints text[] not null default '{}',
  website_url text not null,
  reservation_url text,
  start_date date not null,
  end_date date not null,
  priority integer not null default 0,
  status text not null default 'draft',
  disclosure_label text not null default 'PR',
  created_at timestamptz not null default now()
);

create table if not exists public.sponsor_impressions (
  id bigint generated always as identity primary key,
  sponsor_id uuid not null references public.sponsors(sponsor_id),
  placement text not null,
  body_part text not null,
  region text not null,
  occurred_at timestamptz not null default now(),
  anonymous_session_id text
);

create table if not exists public.sponsor_clicks (
  id bigint generated always as identity primary key,
  sponsor_id uuid not null references public.sponsors(sponsor_id),
  placement text not null,
  body_part text not null,
  region text not null,
  occurred_at timestamptz not null default now(),
  anonymous_session_id text
);

alter table public.sponsors enable row level security;
alter table public.sponsor_impressions enable row level security;
alter table public.sponsor_clicks enable row level security;
revoke all on public.sponsors, public.sponsor_impressions, public.sponsor_clicks from public, anon, authenticated;

comment on table public.anonymous_diagnosis_records is
'匿名診断集計の原本。氏名、メール、電話番号、住所は保存しない。端末内My Body履歴とは別管理。';
comment on table public.anonymous_diagnosis_daily_rollups is
'公開集計API用の日次rollup。少数セルはAPI関数で10件未満を抑制する。';
comment on table public.sponsors is
'将来用。診断ロジックとは接続せず、診断完了後のcontextだけで照合する。';

commit;
