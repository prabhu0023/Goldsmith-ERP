-- 0004 Parcels with weighings, manifest rows and QC ticks (EP-02-S6).
-- Batch numbers (BATCH-2026-044) are unique per shop. Parcels and their weighings are gold
-- records, so they carry location_id (set by the data layer, no default).

create table parcels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  location_id uuid not null references locations(id) deferrable initially immediate,
  code text not null,
  karigar_id uuid not null references karigars(id) deferrable initially immediate,
  -- Foreign key to karigar_jobs is added in 0006.
  job_id uuid,
  po_ref text,
  arrived_at timestamptz,
  -- 1 = weigh, 2 = tag, 3 = match.
  stage integer not null default 1 check (stage between 1 and 3),
  status text not null default 'open' check (status in ('open', 'stopped', 'released')),
  resolution text check (resolution in ('sent_back', 'rechecking', 'loss_accepted')),
  recheck_piece_id uuid references pieces(id) deferrable initially immediate,
  verdict text not null default 'incomplete'
    check (verdict in ('incomplete', 'exact', 'last_digit', 'mismatch')),
  gap_net_units bigint,
  loss_units bigint,
  loss_reason text,
  released_at timestamptz,
  released_by_name text,
  stopped_at timestamptz,
  version integer not null default 1 check (version >= 1),
  unique (shop_id, code)
);
comment on column parcels.gap_net_units is 'units of 0.0001 g';
comment on column parcels.loss_units is 'units of 0.0001 g';
create trigger parcels_bump_version before update on parcels
  for each row execute function bump_version();

-- One reading for the whole parcel, or one per tray, in order.
create table parcel_weighings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  location_id uuid not null references locations(id) deferrable initially immediate,
  parcel_id uuid not null references parcels(id) deferrable initially immediate,
  position integer not null,
  code text,
  label text not null,
  scale_id uuid references scales(id) deferrable initially immediate,
  gross_units bigint not null,
  stone_units bigint not null,
  unique (parcel_id, position)
);
comment on column parcel_weighings.gross_units is 'units of 0.0001 g';
comment on column parcel_weighings.stone_units is 'units of 0.0001 g';

create table parcel_manifest_rows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  parcel_id uuid not null references parcels(id) deferrable initially immediate,
  position integer not null,
  code text,
  kind text not null,
  item_count integer not null check (item_count >= 1),
  unique (parcel_id, position)
);

-- Pieces staff have checked (scale, hallmark, deductions) for this parcel.
create table parcel_qc_ticks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  parcel_id uuid not null references parcels(id) deferrable initially immediate,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  position integer not null,
  unique (parcel_id, piece_id),
  unique (parcel_id, position)
);

alter table pieces
  add constraint pieces_parcel_id_fkey
    foreign key (parcel_id) references parcels(id) deferrable initially immediate;
