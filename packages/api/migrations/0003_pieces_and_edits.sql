-- 0003 Pieces, piece photos and piece edits (EP-02-S5).
-- The tag number (TAG-8841) is unique per shop (D7); net weight is not stored (gross - stone).
-- The prototype's heldForLeadId is not carried over. The version column is raised only by
-- the bump_version trigger.

create table pieces (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  -- No default: the data layer sets the shop's location.
  location_id uuid not null references locations(id) deferrable initially immediate,
  tag_no text not null,
  name text not null,
  kind text,
  collection text,
  style text,
  purity text,
  huid text,
  gross_units bigint not null,
  stone_units bigint not null,
  stone_count integer,
  size text,
  scale_id uuid references scales(id) deferrable initially immediate,
  status text not null
    check (status in ('draft', 'with_owner', 'stopped', 'in_stock', 'billed', 'scrapped')),
  prev_status text
    check (prev_status in ('draft', 'with_owner', 'stopped', 'in_stock', 'billed', 'scrapped')),
  -- Foreign keys added in 0004 (parcels), 0006 (karigar_jobs) and 0008 (stock_outs).
  parcel_id uuid,
  job_id uuid,
  stock_out_id uuid,
  made_by_id uuid references karigars(id) deferrable initially immediate,
  tagged_by_name text,
  tagged_at timestamptz,
  in_stock_at timestamptz,
  sold_at timestamptz,
  note text,
  -- Money socket: unused while pricing is off.
  value_inr numeric(14,2),
  version integer not null default 1 check (version >= 1),
  unique (shop_id, tag_no)
);
comment on column pieces.gross_units is 'units of 0.0001 g';
comment on column pieces.stone_units is 'units of 0.0001 g';
create unique index pieces_shop_huid on pieces (shop_id, huid) where huid is not null;
create trigger pieces_bump_version before update on pieces
  for each row execute function bump_version();

create table piece_photos (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  position integer not null,
  storage_key text not null,
  unique (piece_id, position)
);

-- A change to a tagged piece, waiting for the owner's edit token (S5, owner edit flow).
create table piece_edits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  field text not null check (field in ('grossG', 'stoneG', 'stoneCount', 'purity', 'huid', 'name')),
  before_units bigint,
  after_units bigint,
  before_text text,
  after_text text,
  reason text,
  status text not null default 'proposed'
    check (status in ('proposed', 'token_sent', 'applied', 'refused', 'void')),
  -- Reference to the one-time code, never the code itself.
  token_ref text,
  token_issued_at timestamptz,
  proposed_by_name text,
  proposed_at timestamptz,
  decided_at timestamptz,
  version integer not null default 1 check (version >= 1),
  unique (shop_id, code),
  -- Weight fields keep integer units; every other field keeps text.
  constraint piece_edits_value_columns check (
    (field in ('grossG', 'stoneG')
      and before_units is not null and after_units is not null
      and before_text is null and after_text is null)
    or (field not in ('grossG', 'stoneG')
      and before_text is not null and after_text is not null
      and before_units is null and after_units is null)
  )
);
comment on column piece_edits.before_units is 'units of 0.0001 g';
comment on column piece_edits.after_units is 'units of 0.0001 g';
create trigger piece_edits_bump_version before update on piece_edits
  for each row execute function bump_version();
