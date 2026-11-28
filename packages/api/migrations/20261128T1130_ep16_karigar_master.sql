-- 20261128T1130 Karigar master (EP-16-S1).
--
--   * karigars gain email, workshop_location, wastage_bp (integer basis points, 70 = 0.70%),
--     status, deactivated_at and version (raised by bump_version).
--   * language defaults to English; wastage_bp stays between 60 and 120 (0.6% to 1.2%).
--   * one karigar per phone per shop (partial unique index).
--   * karigar_specialties: one row per karigar and specialty name. The old comma / "and" list in
--     karigars.specialty is split into it. EP-15 has no specialties table yet, so the name is text.
--   * the seeded scorecard columns (wastage_pct, metal_loss_pct, late_days, rating, finished_jobs)
--     and karigar_gap_history are dropped: figures are computed from jobs and parcels on read.
--   * audit_entries accept karigar_edited, karigar_wastage_changed, karigar_deactivated and
--     karigar_reactivated.
--
-- Order-safe: the kind check is read from the current constraint and recreated with this file's
-- kinds added, so another lane's migration that sorts before or after this one is kept.
alter table karigars
  add column email text,
  add column workshop_location text,
  add column wastage_bp integer,
  add column status text not null default 'active' check (status in ('active', 'deactivated')),
  add column deactivated_at timestamptz,
  add column version integer not null default 1 check (version >= 1);
create trigger karigars_bump_version before update on karigars
  for each row execute function bump_version();
-- Backfill. A null wastage_pct is left null so that SET NOT NULL below aborts the migration
-- instead of inventing an allowance.
update karigars set
  wastage_bp = round(wastage_pct * 100),
  email = lower(code) || '@example.com',
  language = coalesce(language, 'English'),
  phone = coalesce(
    case
      when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[6-9][0-9]{9}$'
        then '+91' || regexp_replace(phone, '[^0-9]', '', 'g')
      when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^(91|0)[6-9][0-9]{9}$'
        then '+91' || right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
      else null
    end,
    phone
  );
alter table karigars alter column email set not null;
alter table karigars alter column wastage_bp set not null;
alter table karigars alter column language set default 'English';
alter table karigars alter column language set not null;
alter table karigars add constraint karigars_wastage_bp_range check (wastage_bp between 60 and 120);
alter table karigars add constraint karigars_language_check check (language in ('Tamil', 'Hindi', 'English'));
alter table karigars add constraint karigars_name_present check (btrim(name) <> '');
create unique index karigars_shop_phone on karigars (shop_id, phone) where phone is not null;
comment on column karigars.email is 'personal data (DPDP)';
comment on column karigars.workshop_location is 'personal data (DPDP)';
comment on column karigars.wastage_bp is 'basis points: 70 = 0.70% of the gold issued';
create table karigar_specialties (
  shop_id uuid not null references shops(id) deferrable initially immediate,
  karigar_id uuid not null,
  specialty text not null check (btrim(specialty) <> ''),
  position integer not null,
  primary key (karigar_id, specialty),
  foreign key (shop_id, karigar_id) references karigars (shop_id, id) deferrable initially immediate
);
insert into karigar_specialties (shop_id, karigar_id, specialty, position)
  select shop_id, id, name, (min(ord) - 1)::integer
    from (
      select k.shop_id, k.id, btrim(s.name) as name, s.ord
        from karigars k,
             lateral regexp_split_to_table(k.specialty, '\s*,\s*|\s+and\s+', 'i') with ordinality as s(name, ord)
       where k.specialty is not null
    ) parts
   where name <> ''
   group by shop_id, id, name;
alter table karigars
  drop column specialty,
  drop column wastage_pct,
  drop column metal_loss_pct,
  drop column late_days,
  drop column rating,
  drop column finished_jobs;
drop table karigar_gap_history;
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
        'karigar_edited', 'karigar_wastage_changed', 'karigar_deactivated', 'karigar_reactivated'
      ])
    ) all_kinds;
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  execute format('alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))', kinds);
end;
$$;
