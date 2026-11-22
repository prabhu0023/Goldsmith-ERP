-- 20261122T1710_ep07_live_channel.sql: EP-07 Live channel. EP-10's outbox_events becomes the
-- source of committed live events (EP-07-S1, S2): a live row is an outbox row with its entity
-- columns and audience set, written in the operation's transaction. The publisher stamps it with
-- a per-shop sequence number (live_seq) and sets published_at ("sent at") once, so a restart
-- never resends it. Rows of other topics (notifications, wishes) keep the entity columns null and
-- are never touched by the publisher.
alter table outbox_events
  add column insert_order bigint generated always as identity,
  add column entity_type text,
  add column entity_id text,
  add column entity_version integer check (entity_version >= 1),
  add column audience jsonb,
  add column live_seq bigint check (live_seq >= 1);

alter table outbox_events add constraint outbox_events_live_columns check (
  (
    (entity_type is null and entity_id is null and entity_version is null and audience is null)
    or (entity_type is not null and entity_id is not null and entity_version is not null and audience is not null)
  )
  and (live_seq is null or entity_type is not null)
);

-- One sequence number per event per shop stream (S2 AC2).
create unique index outbox_events_live_seq on outbox_events (shop_id, live_seq) where live_seq is not null;
-- Unsent live rows, in commit order (S1 AC4).
create index outbox_events_live_unsent on outbox_events (insert_order) where live_seq is null and entity_type is not null;

-- One stream per shop: the last sequence number given out, which never goes backwards, and the
-- highest one already pruned (a resume from below it gets refetch_all, S7 AC2).
create table live_streams (
  shop_id uuid primary key references shops(id) deferrable initially immediate,
  last_seq bigint not null default 0 check (last_seq >= 0),
  pruned_through bigint not null default 0 check (pruned_through >= 0)
);
