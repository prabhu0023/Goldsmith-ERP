-- 20261128T1130 Metal pool ledger (EP-18).
--
-- 0007 made the pool and its ledger. This adds what the posting functions need: the fifth kind
-- (adjustment), a typed reference (job or piece), who posted the entry, a balance that cannot go
-- below zero, an append-only ledger, one recovery per piece, indexes for the read screens, and
-- the audit kinds and entity type for the pool operations.

-- (a) Five kinds.
alter table pool_entries drop constraint pool_entries_kind_check;
alter table pool_entries
  add constraint pool_entries_kind_check check (kind in ('opening', 'issued', 'returned', 'recovered', 'adjustment'));

-- (b) A typed reference. `reference` becomes `ref_id`; the prototype's value POOL (opening) and
-- any empty value mean "no reference". Both columns are set, or neither.
alter table pool_entries add column ref_type text check (ref_type in ('job', 'piece'));
alter table pool_entries rename column reference to ref_id;
update pool_entries
   set ref_type = case when kind in ('issued', 'returned') then 'job' when kind = 'recovered' then 'piece' end
 where ref_id is not null and ref_id <> 'POOL';
update pool_entries set ref_id = null where ref_type is null;
alter table pool_entries add constraint pool_entries_ref_both_or_neither check ((ref_type is null) = (ref_id is null));

-- (c) Who posted the entry. Null actor_id and 'System' for entries nobody signed in for. The
-- foreign key matches shop_id, as 0011 requires for every key between shop-scoped tables.
alter table pool_entries add column actor_id uuid;
alter table pool_entries
  add constraint pool_entries_actor_id_fkey foreign key (shop_id, actor_id) references users (shop_id, id) deferrable initially immediate;
alter table pool_entries add column actor_name text not null default 'System';

-- (d) The balance never goes below zero.
alter table metal_pools add constraint metal_pools_balance_not_negative check (balance_units >= 0);

-- (e) Append-only, as audit_entries (0009): update, delete and truncate raise.
create function reject_pool_entry_change() returns trigger
language plpgsql as $$
begin
  raise exception 'pool_entries is append-only';
end;
$$;
create trigger pool_entries_no_change
  before update or delete on pool_entries
  for each row execute function reject_pool_entry_change();
create trigger pool_entries_no_truncate
  before truncate on pool_entries
  for each statement execute function reject_pool_entry_change();

-- (f) A piece's gold is recovered into the pool once.
create unique index pool_entries_one_recovery_per_piece on pool_entries (shop_id, ref_id) where kind = 'recovered';

-- (g) Indexes for the ledger list and the custody figures.
create index pool_entries_shop_at_id on pool_entries (shop_id, at desc, id desc);
create index pool_entries_shop_kind_at on pool_entries (shop_id, kind, at);
create index pool_entries_shop_ref on pool_entries (shop_id, ref_type, ref_id);

-- (h) Audit kinds and entity type, order-safe as in 20261122T1825: each block reads the values
-- the current constraint allows and adds this file's.
do $$
declare
  types text;
begin
  select string_agg(quote_literal(t), ', ' order by t) into types
    from (
      select m[1] as t
        from pg_constraint c,
             lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m
       where c.conrelid = 'audit_entries'::regclass and c.conname = 'audit_entries_entity_type_check'
      union
      select unnest(array['metal_pool'])
    ) all_types;
  alter table audit_entries drop constraint if exists audit_entries_entity_type_check;
  execute format('alter table audit_entries add constraint audit_entries_entity_type_check check (entity_type in (%s))', types);
end;
$$;
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
      select unnest(array['pool_opening_recorded', 'pool_return_recorded', 'pool_adjusted'])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
