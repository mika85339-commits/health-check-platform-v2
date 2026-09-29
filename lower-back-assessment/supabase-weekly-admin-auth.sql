-- Health Check Lab weekly analytics administrator authentication.
-- Additive and private: service-role access only, with no public policies.

begin;

create table if not exists public.weekly_analytics_admin_auth (
  admin_id text primary key default 'primary' check (admin_id = 'primary'),
  password_hash text not null,
  totp_secret_ciphertext text not null,
  totp_secret_iv text not null,
  totp_secret_tag text not null,
  recovery_code_hashes jsonb not null default '[]'::jsonb,
  auth_version integer not null default 1 check (auth_version > 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(recovery_code_hashes) = 'array')
);

comment on table public.weekly_analytics_admin_auth is
  'Private administrator authentication state for the weekly analytics dashboard. Passwords, TOTP secrets, and recovery codes are never stored in plaintext.';

create table if not exists public.weekly_analytics_admin_setup_tokens (
  token_hash text primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  pending_password_hash text,
  pending_totp_ciphertext text,
  pending_totp_iv text,
  pending_totp_tag text,
  pending_recovery_ciphertext text,
  pending_recovery_iv text,
  pending_recovery_tag text,
  pending_recovery_hashes jsonb,
  created_at timestamptz not null default now(),
  check (pending_recovery_hashes is null or jsonb_typeof(pending_recovery_hashes) = 'array')
);

comment on table public.weekly_analytics_admin_setup_tokens is
  'Short-lived, single-use administrator enrollment tickets. Raw ticket values and plaintext credentials are never stored.';

create index if not exists weekly_analytics_admin_setup_expiry_idx
  on public.weekly_analytics_admin_setup_tokens (expires_at)
  where consumed_at is null;

alter table public.weekly_analytics_admin_auth enable row level security;
alter table public.weekly_analytics_admin_setup_tokens enable row level security;

revoke all on public.weekly_analytics_admin_auth,
  public.weekly_analytics_admin_setup_tokens
  from public, anon, authenticated;

commit;
