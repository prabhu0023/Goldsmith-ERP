-- 0001 Shops, locations, users, sessions and password links (EP-02-S3).
--
-- D7 (docs/decisions/tenancy-and-branches.md): one owner runs one shop, and there are no
-- branches. Even so:
--   * every business table carries shop_id (not null, foreign key to shops);
--   * human references (tag numbers, batch numbers, phone numbers) are unique per shop, not
--     globally;
--   * gold records (scales, pieces, parcels, parcel weighings, pool entries) carry location_id;
--     v1 has exactly one location per shop, "Main shop", created with the shop;
--   * the server sets shop_id and location_id from the signed-in user's shop, never from
--     client input.
-- A second shop or branch later means adding rows, not reshaping tables.

-- Shared by every versioned table: only the database raises the version.
create function bump_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  gstin text,
  logo_key text,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  name text not null,
  -- v1: one location per shop (D7).
  unique (shop_id)
);

-- Rows every new shop needs. Later migrations replace this function to add more.
create function create_shop_defaults() returns trigger
language plpgsql as $$
begin
  insert into locations (shop_id, name) values (new.id, 'Main shop');
  return null;
end;
$$;

create trigger shops_create_defaults
  after insert on shops
  for each row execute function create_shop_defaults();

create table users (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  name text not null,
  phone text not null,
  email text not null,
  role text not null check (role in ('owner', 'staff', 'karigar')),
  -- Foreign key to karigars is added in 0002.
  karigar_id uuid,
  status text not null default 'pending_activation'
    check (status in ('pending_activation', 'active', 'deactivated')),
  -- Stored only; EP-04 writes it.
  password_hash text,
  created_at timestamptz not null default now()
);
comment on column users.name is 'personal data (DPDP)';
comment on column users.phone is 'personal data (DPDP)';
comment on column users.email is 'personal data (DPDP)';

-- A phone number signs in one live user per shop; a deactivated user's number can be reused.
create unique index users_shop_phone_live on users (shop_id, phone) where status <> 'deactivated';

create table sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  user_id uuid not null references users(id) deferrable initially immediate,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create table password_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  user_id uuid not null references users(id) deferrable initially immediate,
  purpose text not null check (purpose in ('activation', 'reset')),
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
