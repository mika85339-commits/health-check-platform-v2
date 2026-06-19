create table if not exists public.community_insights (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('首肩', '腰臀部', '下肢')),
  result_type text not null,
  burden_score integer not null default 0,
  main_tendency text not null,
  pain_score integer not null default 0,
  mobility_score integer not null default 0,
  stiffness_score integer not null default 0,
  duration text not null,
  lifestyle_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.community_insights enable row level security;

drop policy if exists "anon can insert community insight" on public.community_insights;
create policy "anon can insert community insight"
on public.community_insights
for insert
to anon
with check (
  area in ('首肩', '腰臀部', '下肢')
  and result_type <> ''
  and main_tendency <> ''
);

drop policy if exists "anon can read aggregate source" on public.community_insights;
create policy "anon can read aggregate source"
on public.community_insights
for select
to anon
using (true);

create index if not exists community_insights_created_at_idx
on public.community_insights (created_at desc);

create index if not exists community_insights_area_idx
on public.community_insights (area);

create index if not exists community_insights_result_type_idx
on public.community_insights (result_type);
