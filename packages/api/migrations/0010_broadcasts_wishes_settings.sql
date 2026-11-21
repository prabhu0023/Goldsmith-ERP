-- 0010 Broadcasts, wishes and settings (EP-02-S12).
-- Settings: one row per shop with the prototype defaults. The story asks the migration to insert
-- the default row, but settings.shop_id is not null and no shop exists when migrations run, so
-- the row is created with the shop (create_shop_defaults) and backfilled for existing shops.

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  at timestamptz,
  audience text not null
    check (audience in ('VIP Bridal', 'High net worth', 'Regular', 'Wholesale', 'All')),
  message text,
  sent_by_name text,
  unique (shop_id, code)
);

create table broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  broadcast_id uuid not null references broadcasts(id) deferrable initially immediate,
  customer_id uuid not null references customers(id) deferrable initially immediate,
  unique (broadcast_id, customer_id)
);

create table broadcast_pieces (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  broadcast_id uuid not null references broadcasts(id) deferrable initially immediate,
  piece_id uuid not null references pieces(id) deferrable initially immediate,
  position integer not null,
  unique (broadcast_id, position)
);

create table wishes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  at timestamptz,
  customer_id uuid not null references customers(id) deferrable initially immediate,
  kind text not null check (kind in ('birthday', 'anniversary')),
  sender_name text,
  unique (shop_id, code)
);

create table settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references shops(id) deferrable initially immediate,
  pricing_enabled boolean not null default false,
  lead_sla_hours integer not null default 8 check (lead_sla_hours > 0),
  require_edit_token boolean not null default true,
  notify_whatsapp boolean not null default true,
  notify_app boolean not null default true,
  notify_email boolean not null default false,
  late_lead_audience text not null default 'staff_then_owner'
    check (late_lead_audience in ('staff_then_owner', 'owner_only')),
  auto_send_wishes boolean not null default false
);

create or replace function create_shop_defaults() returns trigger
language plpgsql as $$
begin
  insert into locations (shop_id, name) values (new.id, 'Main shop');
  insert into settings (shop_id) values (new.id);
  return null;
end;
$$;

insert into settings (shop_id) select id from shops on conflict do nothing;
