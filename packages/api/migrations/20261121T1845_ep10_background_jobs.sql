-- EP-10 Background jobs: scheduler tables, job-owned columns, event outbox, System actor on audit entries.
create table job_definitions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  name text not null, label text not null,
  schedule_kind text not null check (schedule_kind in ('delay', 'every', 'daily')),
  schedule text not null,
  max_attempts integer not null check (max_attempts >= 1),
  updated_at timestamptz not null,
  unique (shop_id, name)
);
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null, job_name text not null, idempotency_key text,
  scheduled_at timestamptz not null, started_at timestamptz not null, finished_at timestamptz,
  attempts integer not null check (attempts >= 1),
  result text check (result in ('ok', 'retrying', 'failed')),
  error_text text,
  unique (shop_id, code), unique (shop_id, id)
);
create index job_runs_shop_job_started on job_runs (shop_id, job_name, started_at desc);
create index job_runs_shop_started on job_runs (shop_id, started_at desc, id desc);
create table pending_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  job_name text not null, run_key text not null,
  due_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'cancelled', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null check (max_attempts >= 1),
  next_attempt_at timestamptz, locked_by text, locked_until timestamptz,
  run_id uuid,
  created_at timestamptz not null,
  unique (shop_id, job_name, run_key),
  foreign key (shop_id, run_id) references job_runs (shop_id, id) deferrable initially immediate
);
create index pending_jobs_due on pending_jobs ((coalesce(next_attempt_at, due_at))) where status in ('pending', 'running');
create table job_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  idempotency_key text not null, job_name text not null, claimed_at timestamptz not null,
  unique (shop_id, idempotency_key)
);
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  topic text not null, payload jsonb not null,
  created_at timestamptz not null, published_at timestamptz
);
create index outbox_events_unpublished on outbox_events (shop_id, created_at) where published_at is null;
alter table leads add column sla_breached_at timestamptz,
  add column sla_breach_notified boolean not null default false;
alter table karigar_jobs add column overdue_since timestamptz, add column last_reminder_at timestamptz;
alter table piece_edits add column expired_at timestamptz;
create index piece_edits_token_sweep on piece_edits (shop_id, token_issued_at)
  where status = 'token_sent' and expired_at is null;
-- A2 is open: the SLA counts clock hours. EP-13 widens this check to 'shop_hours' with its calendar.
alter table settings add column lead_sla_counting text not null default 'clock_hours'
  check (lead_sla_counting in ('clock_hours'));
alter table audit_entries add column if not exists actor_kind text not null default 'user'
  check (actor_kind in ('user', 'system'));
alter table audit_entries alter column actor_id drop not null, alter column actor_role drop not null;
alter table audit_entries add constraint audit_entries_actor_shape check (
  (actor_kind = 'user' and actor_id is not null and actor_role is not null)
  or (actor_kind = 'system' and actor_id is null and actor_role is null));
alter table audit_entries add column if not exists before_value jsonb, add column if not exists after_value jsonb;
alter table audit_entries drop constraint audit_entries_kind_check;
alter table audit_entries add constraint audit_entries_kind_check check (kind in (
  'edit_applied', 'edit_refused', 'loss_accepted', 'parcel_sent_back', 'parcel_last_digit',
  'problem_cleared', 'scrap_marked', 'scrap_declined', 'stock_out', 'setting_changed',
  'lead_marked_late', 'job_marked_overdue', 'job_reminder_sent', 'edit_token_expired', 'job_run_retried'));
