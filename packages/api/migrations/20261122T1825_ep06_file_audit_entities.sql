-- 20261122T1825 File audit entries name their owner (EP-06 with EP-09).
--
-- EP-09's attach, detach, intake and retention entries now go through the one audit writer and
-- name the file's owner as their entity: a piece, job or lead (already entity types) or an order
-- copy, added here. The four file kinds are already in audit_entries_kind_check
-- (20261122T0731_ep09_file_storage.sql); this block keeps them and every other kind there.
--
-- Order-safe, as in 20261122T1732_ep06_audit_log.sql: each block reads the values the current
-- constraint allows, adds this file's and recreates it as `col in ('a', 'b', ...)`.
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
      select unnest(array['order_copy'])
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
      select unnest(array['file_attached', 'file_detached', 'po_attachment_stored', 'file_removed_by_retention'])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
