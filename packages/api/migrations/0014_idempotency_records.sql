-- 0014 Idempotency records for create operations (EP-03-S8).
--
-- A create request that carries an Idempotency-Key header claims (key, operation, user_id) here
-- in the same transaction as the record it creates, and stores the created record's id. A retry
-- with the same key returns that id instead of creating a second record. Only successful
-- results are stored: a refused or failed request rolls the claim back with everything else.
-- Rows expire after IDEMPOTENCY_RETENTION_HOURS (default 24); deleteExpiredIdempotencyRecords()
-- in src/pipeline/idempotency.ts removes them, and scheduling that cleanup is EP-10.
create table idempotency_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  key text not null,
  operation text not null,
  user_id uuid not null,
  -- The created record's id as the API returns it (e.g. LD-2026-214).
  result_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (key, operation, user_id),
  constraint idempotency_records_user_id_fkey foreign key (shop_id, user_id)
    references users (shop_id, id) deferrable initially immediate
);

create index idempotency_records_expires_at on idempotency_records (expires_at);
