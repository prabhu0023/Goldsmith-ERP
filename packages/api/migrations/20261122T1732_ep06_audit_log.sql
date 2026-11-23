-- 20261122T1732 Audit log (EP-06-S1, S4, S7, S9) and the application role (FU-001).
--
--   * audit_entries gains entity_type, entity_id, reason and token_reference (S1). Every new
--     entry names its entity (audit_entries_entity_present, NOT VALID: rows written before this
--     migration keep nulls and are never updated). "invoice" is not an entity type.
--   * audit_entries accept the 25 kinds of EP-06-S7 (packages/shared/src/domain/audit-log.ts
--     AUDIT_ACTIONS; a test compares the check with that list).
--   * Indexes for the owner's log: by entity, by actor and by kind, newest first (S9, S10).
--   * Role goldsmith_app (FU-001): the api connects as it. It may read and write every table but
--     only SELECT and INSERT audit_entries, and it owns nothing, so it cannot drop or disable the
--     append-only triggers. Migrations, seed and reset keep the owner connection (DATABASE_URL).
--     The role is created NOLOGIN; `npm run db:create` (development) and the test setup give it
--     LOGIN with the local password; a deployed environment sets its own (FU-008).
--
-- Order-safe: other lanes may widen audit_entries_kind_check or audit_entries_entity_type_check
-- in a migration that sorts before or after this one, and the runner applies a file that sorts
-- before an applied one. So neither check is written from a fixed list: each block reads the
-- values the current constraint allows (if any), adds this file's and recreates it as
-- `col in ('a', 'b', ...)`. Default privileges cover tables any later migration creates.
alter table audit_entries
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists reason text,
  add column if not exists token_reference text;
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
      select unnest(array[
        'piece', 'parcel', 'lead', 'job', 'edit', 'problem', 'scrap_request', 'stock_out', 'setting',
        'user', 'scale', 'karigar', 'customer', 'broadcast', 'wish', 'session', 'job_run'
      ])
    ) all_types;
  alter table audit_entries drop constraint if exists audit_entries_entity_type_check;
  execute format('alter table audit_entries add constraint audit_entries_entity_type_check check (entity_type in (%s))', types);
end;
$$;
alter table audit_entries drop constraint if exists audit_entries_entity_present;
alter table audit_entries add constraint audit_entries_entity_present
  check (entity_type is not null and entity_id is not null) not valid;
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
        'lead_created', 'lead_confirmed', 'lead_work_started', 'lead_lost', 'lead_item_routed_to_stock',
        'order_copy_job_created', 'job_accepted', 'job_started', 'job_marked_ready', 'job_handed_over',
        'parcel_arrived', 'tag_saved', 'qc_ticked', 'parcel_released', 'tag_recheck_requested',
        'problem_raised', 'edit_proposed', 'edit_agreed', 'scrap_requested', 'customer_onboarded',
        'karigar_onboarded', 'staff_onboarded', 'wishes_sent', 'broadcast_sent', 'scale_upserted'
      ])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
create index if not exists audit_entries_shop_entity on audit_entries (shop_id, entity_type, entity_id);
create index if not exists audit_entries_shop_entity_id on audit_entries (shop_id, entity_id);
create index if not exists audit_entries_shop_actor_at on audit_entries (shop_id, actor_id, at);
create index if not exists audit_entries_shop_kind_at on audit_entries (shop_id, kind, at);
-- Roles are cluster-wide: another database (or lane) may have created it already.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'goldsmith_app') then
    create role goldsmith_app nologin;
  end if;
exception
  when duplicate_object or unique_violation then null;
end;
$$;
grant usage on schema public to goldsmith_app;
grant select, insert, update, delete on all tables in schema public to goldsmith_app;
grant usage, select on all sequences in schema public to goldsmith_app;
revoke all on schema_migrations from goldsmith_app;
revoke update, delete, truncate on audit_entries from goldsmith_app;
alter default privileges in schema public grant select, insert, update, delete on tables to goldsmith_app;
alter default privileges in schema public grant usage, select on sequences to goldsmith_app;
