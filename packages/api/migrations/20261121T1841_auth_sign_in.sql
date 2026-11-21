-- 20261121T1841 Sign-in, sessions, password links, lockout and rate limits (EP-04-S1 to S14).
--
-- D4 (docs/decisions/D4-sign-in.md): a person signs in with an Indian mobile number and a
-- password. Sessions are opaque random tokens; only their sha256 is stored (token_hash).
--   * users.phone_e164 is the normalised number (+91XXXXXXXXXX), computed by the database with
--     the same rule as shared normaliseIndianMobile, so stored phones such as "+91 98410 11111"
--     are found without a data change. One live user per normalised number per shop (S3).
--   * sessions record the role they were issued for (role_at_issue, S13) and why they ended.
--   * password_links: issuing a new link replaces the earlier unused one (S7, S10).
--   * shop_first_owners marks the one first owner per shop (S1).
--   * sign_in_lockouts count wrong passwords per user, or per hashed phone for unknown numbers (S8).
--   * auth_rate_counters are fixed-window request counters per hashed phone or device (S9).
--   * audit_entries accept the 11 sign-in kinds and system / setup actors with no user (S14).
--     0009's constraints do not allow these, so S14's "no schema change" cannot hold.
alter table users add column password_set_at timestamptz;
alter table users add column phone_e164 text generated always as (
  case
    when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[6-9][0-9]{9}$'
      then '+91' || regexp_replace(phone, '[^0-9]', '', 'g')
    when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^(91|0)[6-9][0-9]{9}$'
      then '+91' || right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
    else null
  end
) stored;
comment on column users.phone_e164 is 'personal data (DPDP)';
-- A normalised number signs in one live user per shop (S3).
create unique index users_shop_phone_e164_live on users (shop_id, phone_e164)
  where status <> 'deactivated' and phone_e164 is not null;
alter table sessions
  add column token_hash text,
  add column role_at_issue text check (role_at_issue in ('owner', 'staff', 'karigar')),
  add column end_reason text
    check (end_reason in ('sign_out', 'expiry', 'deactivated', 'role_changed', 'password_reset')),
  add column device_label text;
create unique index sessions_token_hash on sessions (token_hash) where token_hash is not null;
create index sessions_shop_user_live on sessions (shop_id, user_id) where ended_at is null;
alter table password_links add column replaced_at timestamptz;
create unique index password_links_token_hash on password_links (token_hash);
create index password_links_shop_user_open on password_links (shop_id, user_id, purpose)
  where used_at is null and replaced_at is null;
-- One first owner per shop (S1).
create table shop_first_owners (
  shop_id uuid primary key references shops(id) deferrable initially immediate,
  user_id uuid not null,
  created_at timestamptz not null,
  foreign key (shop_id, user_id) references users (shop_id, id) deferrable initially immediate
);
-- Wrong-password counts (S8): one row per user, or per (shop, phone_hash) for a phone that
-- matches no live user.
create table sign_in_lockouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  user_id uuid,
  phone_hash text,
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  unlocked_by uuid,
  unlocked_at timestamptz,
  foreign key (shop_id, user_id) references users (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, unlocked_by) references users (shop_id, id) deferrable initially immediate,
  check ((user_id is null) <> (phone_hash is null))
);
comment on column sign_in_lockouts.phone_hash is 'personal data (DPDP), hashed: HMAC-SHA256 of the phone number';
create unique index sign_in_lockouts_user on sign_in_lockouts (user_id) where user_id is not null;
create unique index sign_in_lockouts_shop_phone on sign_in_lockouts (shop_id, phone_hash) where phone_hash is not null;
-- Fixed-window request counters (S9). Buckets name the kind and a hashed phone or device.
create table auth_rate_counters (
  shop_id uuid not null references shops(id) deferrable initially immediate,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (shop_id, bucket, window_start)
);
-- Lane B's 20261121T1845_ep10_background_jobs.sql widens the same checks. The runner applies a
-- file that sorts before an applied one, so every statement below is safe whether or not that
-- file ran first, and the kind check is the same union of the base, EP-04 and EP-10 kinds.
alter table audit_entries drop constraint if exists audit_entries_kind_check;
alter table audit_entries add constraint audit_entries_kind_check check (kind in (
  'edit_applied', 'edit_refused', 'loss_accepted', 'parcel_sent_back', 'parcel_last_digit',
  'problem_cleared', 'scrap_marked', 'scrap_declined', 'stock_out', 'setting_changed',
  'first_owner_created', 'activation_link_sent', 'password_set', 'signed_in', 'sign_in_failed',
  'sign_in_locked', 'account_unlocked', 'signed_out', 'sessions_ended', 'password_reset_requested',
  'password_reset',
  'lead_marked_late', 'job_marked_overdue', 'job_reminder_sent', 'edit_token_expired', 'job_run_retried'));
-- System and setup entries have no user behind them.
alter table audit_entries alter column actor_id drop not null;
alter table audit_entries drop constraint if exists audit_entries_actor_role_check;
alter table audit_entries add constraint audit_entries_actor_role_check
  check (actor_role in ('owner', 'staff', 'karigar', 'system', 'setup'));
alter table audit_entries drop constraint if exists audit_entries_actor_present;
alter table audit_entries add constraint audit_entries_actor_present
  check ((actor_id is null) = (actor_role in ('system', 'setup')));
