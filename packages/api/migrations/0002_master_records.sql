-- 0002 Master records: scales, karigars, staff and customers (EP-02-S4).
-- Weights are integers of 0.0001 g. Prototype ids (SC-BENCH, KG-01, ST-01, CU-01) go in `code`,
-- unique per shop (D7).

create table scales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  -- No default: the data layer sets the shop's location (S4 AC6).
  location_id uuid not null references locations(id) deferrable initially immediate,
  code text not null,
  name text not null,
  readability_units bigint not null,
  capacity_units bigint not null,
  unique (shop_id, code)
);
comment on column scales.readability_units is 'units of 0.0001 g';
comment on column scales.capacity_units is 'units of 0.0001 g';

create table karigars (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  name text not null,
  phone text,
  specialty text,
  language text,
  wastage_pct numeric(6,2),
  metal_loss_pct numeric(6,2),
  late_days numeric(6,2),
  rating numeric(6,2),
  finished_jobs integer,
  open_since date,
  unique (shop_id, code)
);
comment on column karigars.name is 'personal data (DPDP)';
comment on column karigars.phone is 'personal data (DPDP)';

-- Gold gap on recent parcels, oldest first.
create table karigar_gap_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  karigar_id uuid not null references karigars(id) deferrable initially immediate,
  position integer not null,
  gap_units bigint not null,
  unique (karigar_id, position)
);
comment on column karigar_gap_history.gap_units is 'units of 0.0001 g';

create table staff_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  login text,
  phone text,
  sales_count integer,
  unique (shop_id, code)
);
comment on column staff_members.name is 'personal data (DPDP)';
comment on column staff_members.phone is 'personal data (DPDP)';

create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  name text not null,
  phone text not null,
  city text,
  customer_group text not null
    check (customer_group in ('VIP Bridal', 'High net worth', 'Regular', 'Wholesale')),
  dob date,
  anniversary date,
  opted_in boolean not null default false,
  notes text,
  -- Money sockets: unused while pricing is off.
  budget_inr numeric(14,2),
  spent_inr numeric(14,2),
  unique (shop_id, code),
  unique (shop_id, phone)
);
comment on column customers.name is 'personal data (DPDP)';
comment on column customers.phone is 'personal data (DPDP)';
comment on column customers.city is 'personal data (DPDP)';
comment on column customers.dob is 'personal data (DPDP)';
comment on column customers.anniversary is 'personal data (DPDP)';
comment on column customers.notes is 'personal data (DPDP)';

create table customer_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  customer_id uuid not null references customers(id) deferrable initially immediate,
  position integer not null,
  code text,
  name text,
  tag_no text,
  pure_units bigint,
  on_at timestamptz,
  unique (customer_id, position)
);
comment on column customer_history.pure_units is 'units of 0.0001 g';

alter table users
  add constraint users_karigar_id_fkey
    foreign key (karigar_id) references karigars(id) deferrable initially immediate,
  -- A karigar user points at their karigar record; nobody else does.
  add constraint users_karigar_matches_role check ((role = 'karigar') = (karigar_id is not null));
