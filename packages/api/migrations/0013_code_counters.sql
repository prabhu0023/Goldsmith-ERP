-- 0013 Per-shop counters for human-readable codes (EP-03-S7).
--
-- Id strategy: every table keeps its uuid primary key for joins and composite keys; the uuid is
-- internal and never sent to the client. The API's `id` for a record is its per-shop code
-- (LD-2026-214, BATCH-2026-045), already unique (shop_id, code). nextCode() in
-- src/db/codes.ts takes the next number for a prefix with one atomic upsert on this table, so
-- parallel creates can never get the same code. The first use of a prefix starts after the
-- highest existing code with that prefix (seeded or older rows).
create table code_counters (
  shop_id uuid not null references shops(id) deferrable initially immediate,
  prefix text not null,
  last_value integer not null check (last_value >= 1),
  primary key (shop_id, prefix)
);
