-- 0006 Order copies and karigar jobs (EP-02-S8).
-- Job ids (MO-2026-118) and order copy ids are unique per shop. A job and its order copy point
-- at each other; the foreign keys are deferrable so both rows can be written in one transaction.

create table karigar_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  -- Foreign key to order_copies is added below.
  order_copy_id uuid,
  title text,
  style text,
  qty integer,
  purity text,
  karigar_id uuid not null references karigars(id) deferrable initially immediate,
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'on_bench', 'ready', 'handed_over')),
  sent_at timestamptz,
  due_date timestamptz,
  -- Date the karigar confirmed on accepting.
  confirmed_date timestamptz,
  target_gross_units bigint not null,
  target_net_units bigint not null,
  tolerance_units bigint not null,
  gold_issued_units bigint not null,
  note text,
  ref_image_key text,
  stopped boolean not null default false,
  parcel_id uuid references parcels(id) deferrable initially immediate,
  bench_note text,
  settled_at timestamptz,
  version integer not null default 1 check (version >= 1),
  unique (shop_id, code)
);
comment on column karigar_jobs.target_gross_units is 'units of 0.0001 g';
comment on column karigar_jobs.target_net_units is 'units of 0.0001 g';
comment on column karigar_jobs.tolerance_units is 'units of 0.0001 g';
comment on column karigar_jobs.gold_issued_units is 'units of 0.0001 g';
create trigger karigar_jobs_bump_version before update on karigar_jobs
  for each row execute function bump_version();

create table order_copies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  lead_id uuid references leads(id) deferrable initially immediate,
  lead_item_id uuid references lead_items(id) deferrable initially immediate,
  job_id uuid not null references karigar_jobs(id) deferrable initially immediate,
  brief text,
  qty integer,
  purity text,
  target_gross_units bigint not null,
  target_net_units bigint not null,
  tolerance_units bigint not null,
  gold_issued_units bigint not null,
  karigar_id uuid not null references karigars(id) deferrable initially immediate,
  due_date timestamptz,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (shop_id, code)
);
comment on column order_copies.target_gross_units is 'units of 0.0001 g';
comment on column order_copies.target_net_units is 'units of 0.0001 g';
comment on column order_copies.tolerance_units is 'units of 0.0001 g';
comment on column order_copies.gold_issued_units is 'units of 0.0001 g';

create table order_copy_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  order_copy_id uuid not null references order_copies(id) deferrable initially immediate,
  position integer not null,
  storage_key text not null,
  unique (order_copy_id, position)
);

alter table karigar_jobs
  add constraint karigar_jobs_order_copy_id_fkey
    foreign key (order_copy_id) references order_copies(id) deferrable initially immediate;
alter table parcels
  add constraint parcels_job_id_fkey
    foreign key (job_id) references karigar_jobs(id) deferrable initially immediate;
alter table pieces
  add constraint pieces_job_id_fkey
    foreign key (job_id) references karigar_jobs(id) deferrable initially immediate;
alter table lead_items
  add constraint lead_items_route_job_id_fkey
    foreign key (route_job_id) references karigar_jobs(id) deferrable initially immediate;
