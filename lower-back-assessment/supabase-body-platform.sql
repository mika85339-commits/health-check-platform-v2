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
revoke all on public.anonymous_diagnosis_records from anon, authenticated;

create index if not exists anonymous_diagnosis_body_date_idx
on public.anonymous_diagnosis_records (body_part, diagnosis_date desc);

create index if not exists anonymous_diagnosis_region_body_idx
on public.anonymous_diagnosis_records (region, body_part);

create index if not exists anonymous_diagnosis_age_body_idx
on public.anonymous_diagnosis_records (age_band, body_part);

create or replace view public.health_check_lab_monthly_trends
with (security_invoker = true) as
select
  date_trunc('month', diagnosis_date) as month,
  body_part,
  body_part_group,
  age_band,
  sex,
  region,
  count(*) as diagnosis_count,
  round(avg(symptom_score), 1) as average_symptom_score
from public.anonymous_diagnosis_records
group by 1, 2, 3, 4, 5, 6;

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
revoke all on public.sponsors, public.sponsor_impressions, public.sponsor_clicks from anon, authenticated;

comment on table public.sponsors is
'将来用。診断ロジックとは接続せず、診断完了後のcontextだけで照合する。';
