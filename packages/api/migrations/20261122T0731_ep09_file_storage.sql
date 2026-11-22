-- EP-09 File storage: stored files (bytes live in object storage under a random key), attachments
-- of a file to a piece, order copy, karigar job or lead, and the file audit kinds. The old string
-- lists (piece_photos, order_copy_images, karigar_jobs.ref_image_key) only ever held seed file
-- names; attachments replace them and the seed re-creates them as real files.

create table stored_files (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  storage_key text not null unique,
  original_name text not null,
  content_type text not null
    check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0),
  width integer,
  height integer,
  thumbnail_key text,
  display_key text,
  resize_failed boolean not null default false,
  -- Null for a file the system stored (intake, seed); the name says who ("System (WhatsApp intake)").
  uploaded_by uuid,
  uploaded_by_name text not null,
  uploaded_at timestamptz not null,
  retention_class text not null check (retention_class in ('standard', 'po')),
  -- '<channel>:<message key>' of the intake message the file came from, so a repeat is not stored twice.
  inbound_key text,
  removed_at timestamptz,
  unique (shop_id, code),
  unique (shop_id, id),
  unique (shop_id, inbound_key),
  foreign key (shop_id, uploaded_by) references users (shop_id, id) deferrable initially immediate
);
comment on column stored_files.original_name is
  'personal data (DPDP): a purchase-order file name can carry a customer name';

create table attachments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  file_id uuid not null,
  owner_type text not null check (owner_type in ('piece', 'order_copy', 'job', 'lead')),
  piece_id uuid,
  order_copy_id uuid,
  job_id uuid,
  lead_id uuid,
  role text not null check (role in ('photo', 'reference', 'po', 'bench')),
  position integer not null check (position >= 1),
  attached_by uuid,
  attached_by_name text not null,
  attached_at timestamptz not null,
  unique (shop_id, code),
  -- Exactly the owner column that matches owner_type is set.
  constraint attachments_one_owner check (
    (piece_id is not null)::int + (order_copy_id is not null)::int + (job_id is not null)::int
      + (lead_id is not null)::int = 1
    and case owner_type
      when 'piece' then piece_id is not null
      when 'order_copy' then order_copy_id is not null
      when 'job' then job_id is not null
      when 'lead' then lead_id is not null
    end
  ),
  constraint attachments_owner_role check (
    (owner_type = 'piece' and role = 'photo')
    or (owner_type = 'order_copy' and role = 'reference')
    or (owner_type = 'job' and role in ('bench', 'reference'))
    or (owner_type = 'lead' and role in ('po', 'reference'))
  ),
  foreign key (shop_id, file_id) references stored_files (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, piece_id) references pieces (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, order_copy_id) references order_copies (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, job_id) references karigar_jobs (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, lead_id) references leads (shop_id, id) deferrable initially immediate,
  foreign key (shop_id, attached_by) references users (shop_id, id) deferrable initially immediate
);
create index attachments_shop_file on attachments (shop_id, file_id);
create unique index attachments_piece_position on attachments (piece_id, role, position) where piece_id is not null;
create unique index attachments_order_copy_position on attachments (order_copy_id, role, position)
  where order_copy_id is not null;
create unique index attachments_job_position on attachments (job_id, role, position) where job_id is not null;
create unique index attachments_lead_position on attachments (lead_id, role, position) where lead_id is not null;
-- One file is attached to one owner in one role at most once.
create unique index attachments_file_owner_role
  on attachments (file_id, owner_type, (coalesce(piece_id, order_copy_id, job_id, lead_id)), role);

drop table piece_photos;
drop table order_copy_images;
alter table karigar_jobs drop column ref_image_key;

-- File audit kinds, order-safe: keep every kind the current check allows (whichever other lane's
-- migration ran first) and add the four file kinds, instead of rewriting a fixed list.
do $$
declare
  def text;
  kinds text[];
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.audit_entries'::regclass and conname = 'audit_entries_kind_check';
  select coalesce(array_agg(distinct m[1]), '{}') into kinds
    from regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') as m;
  kinds := array(
    select distinct k from unnest(kinds || array[
      'file_attached', 'file_detached', 'po_attachment_stored', 'file_removed_by_retention'
    ]) as k order by k
  );
  alter table audit_entries drop constraint if exists audit_entries_kind_check;
  -- Same `kind in ('…', …)` form as before, so a later migration can read the list the same way.
  execute format(
    'alter table audit_entries add constraint audit_entries_kind_check check (kind in (%s))',
    (select string_agg(quote_literal(k), ', ') from unnest(kinds) as k)
  );
end
$$;
