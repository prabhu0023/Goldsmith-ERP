-- 20261122T0720 Users, roles and permissions (EP-05-S4 to S14).
--
--   * users.version (raised by bump_version) so owner edits are versioned writes (EP-02-S14).
--   * users.deactivated_at: when the owner deactivated the user (UTC), cleared on reactivate.
--   * users.code: the prototype reference (ST-01, KG-01), unique per shop when set.
--   * users_one_live_owner: one shop has exactly one owner that is not deactivated (S9, D7).
--   * users_karigar_live: one karigar record has at most one live user (S13).
--   * audit_entries accept the six user lifecycle kinds (S14).
--
-- Order-safe: other lanes (e.g. EP-09) may widen audit_entries_kind_check in a migration that
-- sorts before or after this one, and the runner applies a file that sorts before an applied
-- one. So the kind check is not rewritten from a fixed list: the block below reads the kinds the
-- current constraint allows, adds the six new ones and recreates it as `kind in ('a', 'b', ...)`.
-- Whatever another lane added is kept, and a later block of the same kind can parse the result.
alter table users
  add column version integer not null default 1,
  add column deactivated_at timestamptz,
  add column code text;

create trigger users_bump_version
  before update on users
  for each row execute function bump_version();

create unique index users_shop_code on users (shop_id, code) where code is not null;
create unique index users_one_live_owner on users (shop_id) where role = 'owner' and status <> 'deactivated';
create unique index users_karigar_live on users (shop_id, karigar_id)
  where karigar_id is not null and status <> 'deactivated';

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
        'user_added', 'user_edited', 'role_changed', 'user_deactivated', 'user_reactivated', 'karigar_linked'
      ])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
