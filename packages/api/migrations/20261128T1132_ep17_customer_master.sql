-- 20261128T1132 Customer master (EP-17-S1, S2, S14).
--
--   * customers: address, status (active | erased), created_at, created_by, version (raised by
--     bump_version, EP-02-S14). phone becomes nullable: an erased customer holds no phone, and
--     unique (shop_id, phone) ignores nulls, so many erased rows can coexist. The name may not be
--     blank. There is no phone-format check: callers normalise (normaliseCustomerPhone in shared).
--   * Stored phones are rewritten to "+<country><number>", the same rule as normaliseCustomerPhone.
--     A phone that rule refuses (under 10 or over 15 digits) is left as it was.
--   * consent_events: one row per opt-in or opt-out, append-only like audit_entries (0009).
--     customers.opted_in stays as the copy that sends read. Every opted-in customer gets one
--     opt_in / import event now.
--   * Indexes for the directory order and the group filter.
--   * audit_entries accept the five customer kinds (S14).
--
-- Order-safe: the kind check is not rewritten from a fixed list. The block at the end reads the kinds
-- the current constraint allows, adds the five new ones and recreates it (see 20261122T0720).
alter table customers
  add column address text,
  add column status text not null default 'active' check (status in ('active', 'erased')),
  add column created_at timestamptz not null default now(),
  add column created_by uuid,
  add column version integer not null default 1,
  alter column phone drop not null,
  add constraint customers_name_not_blank check (btrim(name) <> ''),
  add constraint customers_created_by_fkey
    foreign key (shop_id, created_by) references users (shop_id, id) deferrable initially immediate;
comment on column customers.address is 'personal data (DPDP)';
-- Rewrite phones before the version trigger exists, so the rewrite does not raise any version.
update customers c
   set phone = case
         when length(d.digits) = 10 then '+91' || d.digits
         when length(d.digits) = 11 and left(d.digits, 1) = '0' then '+91' || right(d.digits, 10)
         else '+' || d.digits
       end
  from (
    select id, regexp_replace(phone, '[^0-9]', '', 'g') as digits
      from customers
     where phone is not null
  ) d
 where d.id = c.id
   and length(d.digits) between 10 and 15;
create trigger customers_bump_version
  before update on customers
  for each row execute function bump_version();
create index customers_shop_name_id on customers (shop_id, name, id);
create index customers_shop_group on customers (shop_id, customer_group);
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  customer_id uuid not null,
  kind text not null check (kind in ('opt_in', 'opt_out')),
  source text not null check (source in ('counter', 'whatsapp_reply', 'form', 'import')),
  -- Null = System (a job, the WhatsApp reply handler, the import).
  recorded_by uuid,
  at timestamptz not null default now(),
  -- Events at the same instant are ordered by seq, so "latest" is always one row.
  seq bigint generated always as identity,
  constraint consent_events_customer_id_fkey
    foreign key (shop_id, customer_id) references customers (shop_id, id) deferrable initially immediate,
  constraint consent_events_recorded_by_fkey
    foreign key (shop_id, recorded_by) references users (shop_id, id) deferrable initially immediate
);
create index consent_events_customer_at on consent_events (shop_id, customer_id, at, seq);
create function reject_consent_change() returns trigger
language plpgsql as $$
begin
  raise exception 'consent_events is append-only';
end;
$$;
create trigger consent_events_no_change
  before update or delete on consent_events
  for each row execute function reject_consent_change();
create trigger consent_events_no_truncate
  before truncate on consent_events
  for each statement execute function reject_consent_change();
insert into consent_events (shop_id, customer_id, kind, source, recorded_by)
select shop_id, id, 'opt_in', 'import', null
  from customers
 where opted_in;
do $$
declare
  kinds text;
begin
  select string_agg(quote_literal(k), ', ' order by k) into kinds
    from (
      select m[1] as k
        from pg_constraint c,
             lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m
       where c.conrelid = 'audit_entries'::regclass and c.conname = 'audit_entries_kind_check'
      union
      select unnest(array[
        'customer_added', 'customer_edited', 'customer_consent_recorded', 'customer_opted_out', 'customer_erased'
      ])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
