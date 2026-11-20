-- 0007 Metal pool balance and ledger entries (EP-02-S9).
-- One pool per shop. The balance is kept next to the ledger; the data layer keeps them equal
-- (ledger sum = balance is checked on the seeded data).

create table metal_pools (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references shops(id) deferrable initially immediate,
  balance_units bigint not null default 0,
  version integer not null default 1 check (version >= 1)
);
comment on column metal_pools.balance_units is 'units of 0.0001 g';
create trigger metal_pools_bump_version before update on metal_pools
  for each row execute function bump_version();

create table pool_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  location_id uuid not null references locations(id) deferrable initially immediate,
  metal_pool_id uuid not null references metal_pools(id) deferrable initially immediate,
  code text not null,
  at timestamptz not null,
  kind text not null check (kind in ('opening', 'issued', 'recovered')),
  -- Signed: issued gold is negative.
  delta_units bigint not null,
  note text,
  reference text,
  unique (shop_id, code)
);
comment on column pool_entries.delta_units is 'units of 0.0001 g';
