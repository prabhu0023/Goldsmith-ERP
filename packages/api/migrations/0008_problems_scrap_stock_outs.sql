-- 0008 Problems, scrap requests and stock-outs (EP-02-S10).
-- A problem points at exactly one parcel, job or piece, through the column of its kind.
-- A stock-out records the invoice number only; the amount stays a money socket.

create table problems (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  target_kind text not null check (target_kind in ('parcel', 'job', 'piece')),
  piece_id uuid references pieces(id) deferrable initially immediate,
  parcel_id uuid references parcels(id) deferrable initially immediate,
  job_id uuid references karigar_jobs(id) deferrable initially immediate,
  text text,
  raised_by_name text,
  raised_by_role text check (raised_by_role in ('owner', 'staff', 'karigar')),
  raised_at timestamptz,
  status text not null default 'open' check (status in ('open', 'cleared')),
  cleared_by_name text,
  cleared_at timestamptz,
  unique (shop_id, code),
  constraint problems_one_target check (
    (target_kind = 'piece' and piece_id is not null and parcel_id is null and job_id is null)
    or (target_kind = 'parcel' and parcel_id is not null and piece_id is null and job_id is null)
    or (target_kind = 'job' and job_id is not null and piece_id is null and parcel_id is null)
  )
);

create table scrap_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  reason text,
  requested_by_name text,
  requested_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'scrapped', 'declined')),
  decided_at timestamptz,
  unique (shop_id, code)
);

create table stock_outs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  seller_id uuid references staff_members(id) deferrable initially immediate,
  seller_name text,
  -- Reference from the billing book.
  billing_ref text,
  invoice_no text not null,
  at timestamptz,
  -- Money socket: the app never holds the amount while pricing is off.
  amount_inr numeric(14,2),
  unique (shop_id, code)
);

create table stock_out_pieces (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  stock_out_id uuid not null references stock_outs(id) deferrable initially immediate,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  position integer not null,
  -- A piece leaves stock once.
  unique (piece_id),
  unique (stock_out_id, position)
);

alter table pieces
  add constraint pieces_stock_out_id_fkey
    foreign key (stock_out_id) references stock_outs(id) deferrable initially immediate;
