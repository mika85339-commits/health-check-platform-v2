-- Health Check Lab sponsor experiment Phase 1 production migration.
-- Approved on 2026-09-26. The statements are idempotent and preserve legacy rows.

begin;

alter table public.sponsors
  add column if not exists sponsor_key text;

create unique index if not exists sponsors_sponsor_key_uidx
  on public.sponsors (sponsor_key)
  where sponsor_key is not null;

-- New creatives use the explicit Japanese advertising disclosure. Legacy rows keep their value,
-- except for the selected Hariplus record updated below.
alter table public.sponsors
  alter column disclosure_label set default '広告';

alter table public.sponsor_impressions
  add column if not exists event_id text,
  add column if not exists creative_id text,
  add column if not exists placement_id text,
  add column if not exists country_code text,
  add column if not exists region_code text,
  add column if not exists region_name text;

alter table public.sponsor_clicks
  add column if not exists event_id text,
  add column if not exists creative_id text,
  add column if not exists placement_id text,
  add column if not exists country_code text,
  add column if not exists region_code text,
  add column if not exists region_name text;

update public.sponsor_impressions
set
  event_id = coalesce(event_id, 'legacy-impression-' || id::text),
  creative_id = coalesce(creative_id, 'legacy'),
  placement_id = coalesce(placement_id, placement),
  country_code = coalesce(country_code, 'unknown'),
  region_code = coalesce(region_code, 'unknown'),
  region_name = coalesce(region_name, region, 'unknown')
where event_id is null
   or creative_id is null
   or placement_id is null
   or country_code is null
   or region_code is null
   or region_name is null;

update public.sponsor_clicks
set
  event_id = coalesce(event_id, 'legacy-click-' || id::text),
  creative_id = coalesce(creative_id, 'legacy'),
  placement_id = coalesce(placement_id, placement),
  country_code = coalesce(country_code, 'unknown'),
  region_code = coalesce(region_code, 'unknown'),
  region_name = coalesce(region_name, region, 'unknown')
where event_id is null
   or creative_id is null
   or placement_id is null
   or country_code is null
   or region_code is null
   or region_name is null;

alter table public.sponsor_impressions
  alter column event_id set not null,
  alter column creative_id set not null,
  alter column placement_id set not null,
  alter column country_code set not null,
  alter column region_code set not null,
  alter column region_name set not null;

alter table public.sponsor_clicks
  alter column event_id set not null,
  alter column creative_id set not null,
  alter column placement_id set not null,
  alter column country_code set not null,
  alter column region_code set not null,
  alter column region_name set not null;

create unique index if not exists sponsor_impressions_event_id_uidx
  on public.sponsor_impressions (event_id);

create unique index if not exists sponsor_clicks_event_id_uidx
  on public.sponsor_clicks (event_id);

create index if not exists sponsor_impressions_phase1_reporting_idx
  on public.sponsor_impressions (occurred_at desc, placement_id, creative_id, body_part, region_code);

create index if not exists sponsor_clicks_phase1_reporting_idx
  on public.sponsor_clicks (occurred_at desc, placement_id, creative_id, body_part, region_code);

comment on column public.sponsors.sponsor_key is
  'Stable public sponsor identifier. Phase 1 uses hariplus; sponsor_id remains the internal UUID.';
comment on column public.sponsor_impressions.event_id is
  'Opaque ad-view event key used only for impression deduplication; not a diagnosis ID.';
comment on column public.sponsor_clicks.event_id is
  'Opaque ad-view event key used only for click deduplication; not a diagnosis ID.';

-- Reuse one existing Hariplus record when present. No existing sponsor is deleted,
-- and unrelated campaign dates or contact fields are not overwritten.
do $$
declare
  hariplus_sponsor_id uuid;
begin
  select sponsor_id
    into hariplus_sponsor_id
  from public.sponsors
  where sponsor_key = 'hariplus'
     or regexp_replace(lower(trim(website_url)), '/+$', '') = 'https://hariplus-nagoya.com'
     or clinic_name = 'ハリプラス鍼灸院'
  order by
    case when sponsor_key = 'hariplus' then 0 else 1 end,
    created_at asc,
    sponsor_id asc
  limit 1;

  if hariplus_sponsor_id is null then
    hariplus_sponsor_id := 'd685ab5b-efb3-4a40-9ecf-9695a9b1a5b6';
    insert into public.sponsors (
      sponsor_id,
      sponsor_key,
      clinic_name,
      region,
      city,
      supported_body_parts,
      website_url,
      start_date,
      end_date,
      priority,
      status,
      disclosure_label
    ) values (
      hariplus_sponsor_id,
      'hariplus',
      'ハリプラス鍼灸院',
      'Aichi',
      null,
      array['neck','shoulder','elbow','wrist','back','lowback','hip','buttock','thigh','knee','lowerleg','ankle','sole'],
      'https://hariplus-nagoya.com/',
      date '2026-09-26',
      date '2027-09-25',
      10,
      'active',
      '広告'
    );
  else
    update public.sponsors
    set
      sponsor_key = 'hariplus',
      supported_body_parts = array['neck','shoulder','elbow','wrist','back','lowback','hip','buttock','thigh','knee','lowerleg','ankle','sole'],
      start_date = least(start_date, date '2026-09-26'),
      end_date = greatest(end_date, date '2027-09-25'),
      priority = greatest(priority, 10),
      status = 'active',
      disclosure_label = '広告'
    where sponsor_id = hariplus_sponsor_id;
  end if;
end
$$;

commit;
