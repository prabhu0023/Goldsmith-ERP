-- 0009 Append-only audit entries (EP-02-S11).
-- Rows can be inserted and read, never changed or removed: UPDATE, DELETE and TRUNCATE raise
-- an error. (The story leaves append-only to EP-06; this task requires it now. EP-06 keeps the
-- rule that every transition writes an entry.)

create function reject_audit_change() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_entries is append-only';
end;
$$;

create table audit_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text,
  at timestamptz not null default now(),
  actor_id uuid not null references users(id) deferrable initially immediate,
  actor_name text not null,
  actor_role text not null check (actor_role in ('owner', 'staff', 'karigar')),
  kind text not null check (kind in (
    'edit_applied', 'edit_refused', 'loss_accepted', 'parcel_sent_back', 'parcel_last_digit',
    'problem_cleared', 'scrap_marked', 'scrap_declined', 'stock_out', 'setting_changed'
  )),
  summary text,
  detail text,
  -- The tag, batch or job it concerns.
  reference text
);
create index audit_entries_shop_at on audit_entries (shop_id, at);
create index audit_entries_shop_reference on audit_entries (shop_id, reference);

create trigger audit_entries_no_change
  before update or delete on audit_entries
  for each row execute function reject_audit_change();
create trigger audit_entries_no_truncate
  before truncate on audit_entries
  for each statement execute function reject_audit_change();
