-- 0005 Leads with items and parsed fields (EP-02-S7).
-- Lead ids (LD-2026-208) are unique per shop. No hold column: a piece is not reserved for a lead.

create table leads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  code text not null,
  title text,
  source text not null check (source in ('whatsapp', 'email', 'counter')),
  state text not null default 'needs_glance'
    check (state in ('needs_glance', 'opened', 'being_worked', 'converted', 'lost')),
  confidence text not null default 'clean' check (confidence in ('clean', 'unsure', 'unreadable')),
  arrived_at timestamptz,
  customer_name text,
  phone text,
  message text,
  needed_by timestamptz,
  taken_by_name text,
  note text,
  version integer not null default 1 check (version >= 1),
  unique (shop_id, code)
);
comment on column leads.customer_name is 'personal data (DPDP)';
comment on column leads.phone is 'personal data (DPDP)';
comment on column leads.message is 'personal data (DPDP)';
create trigger leads_bump_version before update on leads
  for each row execute function bump_version();

create table lead_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  lead_id uuid not null references leads(id) deferrable initially immediate,
  position integer not null,
  code text,
  name text,
  style text,
  qty integer,
  approx_weight_units bigint,
  -- Where the item goes: a piece in stock, or a job to make it.
  route_kind text check (route_kind in ('stock', 'make')),
  route_piece_id uuid references pieces(id) deferrable initially immediate,
  -- Foreign key to karigar_jobs is added in 0006.
  route_job_id uuid,
  version integer not null default 1 check (version >= 1),
  unique (lead_id, position),
  constraint lead_items_route check (
    (route_kind is null and route_piece_id is null and route_job_id is null)
    or (route_kind = 'stock' and route_piece_id is not null and route_job_id is null)
    or (route_kind = 'make' and route_job_id is not null and route_piece_id is null)
  )
);
comment on column lead_items.approx_weight_units is 'units of 0.0001 g';
create trigger lead_items_bump_version before update on lead_items
  for each row execute function bump_version();

-- Fields read out of the message, shown beside it; flagged = the reader was unsure.
create table lead_fields (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) deferrable initially immediate,
  lead_id uuid not null references leads(id) deferrable initially immediate,
  position integer not null,
  field_key text not null,
  label text,
  value text,
  flagged boolean not null default false,
  unique (lead_id, position)
);
comment on column lead_fields.value is 'personal data (DPDP)';
