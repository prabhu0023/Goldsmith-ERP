# Live channel (EP-07)

The live channel pushes committed changes to every signed-in screen that may see them, within about a second (PRODUCTION-SCOPE section 5). It is built inside the Node api (D1): no managed realtime service, no Redis.

## Transport: D3 decided by the owner: Server-Sent Events over HTTP; no WebSocket

The server pushes on one long-lived `GET /api/live` response (`text/event-stream`). The browser talks back with ordinary contract operations through `POST /api/ops/<operation>`, so entity subscriptions and parcel presence get the same session check, permission list and transaction as any other call. Presence (S8), which needs a way back to the server, uses those calls as its heartbeat.

No library is needed. Express writes the stream on its response object, the browser uses its built-in `EventSource`, and Node clients (tests, the demo script) read the body with `fetch`. Nothing was added to `package.json`.

The transport sits behind one interface on each side, so it can change without touching feature code:

| Side | Interface | File | Implementation |
| --- | --- | --- | --- |
| Server | `LiveTransport { router(handlers) }`, a stream is a `LiveSink { send(msg), end(), onClose(cb), closed }` | `packages/api/src/live/transport.ts` | `sse-transport.ts` |
| Client | `LiveStreamSource { open(since, { onOpen, onMessage, onError('refused' \| 'dropped') }) }`, driven by the shared `LiveClient` | `packages/shared/src/live/live-client.ts` | web `packages/web/src/live/browser-stream.ts` (EventSource); tests and demo `packages/api/test/live/node-live-stream.ts` (fetch) |
| Feature code | `useLiveChannel()` (status, `onEvent`, `onRefetchAll`, `subscribe`, `unsubscribe`) and `useParcelPresence(parcelId)` | `packages/web/src/live/use-live.ts` | `LiveProvider.tsx` creates one `LiveClient` per signed-in user |

## The stream

- **Endpoint:** `GET /api/live`. The `gs_session` cookie authenticates it through the same `SessionResolver` as an API request; no token is ever put in the URL. Same origin through the Vite `/api` proxy, so `vite.config.ts` needed no change.
- **Refusals** (before any stream opens, JSON body like every error): no session, or an ended or expired one, answers 401 `unauthenticated`; an `Origin` header other than `APP_URL`'s origin answers 403 `forbidden`.
- **Resume:** `Last-Event-ID: <seq>` (what EventSource sends on its own reconnect), else `?since=<seq>`. Anything but a whole number means "from now".
- **Frames:** `event: <type>`, `data: <JSON>`, and `id: <seq>` on every message that moves the stream position. A `: ping` comment every 15 s keeps proxies open; `retry: 1000` sets EventSource's own reconnect delay.
- **Messages** (`liveServerMessageSchema`, `packages/shared/src/live/live-protocol.ts`):

  | Type | Body | Meaning |
  | --- | --- | --- |
  | `hello` | `connectionId, userId, role, channels, seq` | The stream is open; `connectionId` names it in the live operations. `seq` is `since` on a resume, else the shop's current position. |
  | `event` | `event` (the envelope) | One catalogue event. |
  | `refetch_all` | `seq` | Too far behind (or ahead) to replay: reload the open screen's data, then continue from `seq`. |
  | `replayed` | `seq` | The missed events have been replayed up to `seq`. |
  | `presence` | `parcelId, others: [{ userId, name }]` | Who else has the parcel open (never the receiver). |
  | `closed` | `reason` | The last message before the server ends the stream: `session_ended` (signed out, expired), `access_changed` (deactivated or re-roled), `going_away` (server stopping; reconnect). |

- **Envelope** (`liveEnvelopeSchema`, strict, exactly 7 keys): `seq, name, entityType, entityId, entityVersion, emittedAt` (UTC ISO), `audience { channels, exceptUserId? }`. No weight, money, name or phone; the client refetches the record through a permission-checked read.

## Live operations

All have the rule `shopFloor` (staff and owner), so a karigar is refused `forbidden`. A `connectionId` of another user's stream, or of a stream not open on this server, answers `not_found`. The browser makes these calls on its own, so all of them are declared `extendsSession: false`: the router checks and row-locks the session but does not extend its idle expiry, and an unattended tab still signs out after the idle time (EP-04-S12). The stream itself never extends the session either.

| Operation | Input | Effect |
| --- | --- | --- |
| `subscribeLiveChannel` | `connectionId, channel` | Joins `parcel:<code>` or `karigar_job:<code>` after the entity read check; at most 50 channels per stream. User and role channels come from the session and cannot be asked for. |
| `unsubscribeLiveChannel` | `connectionId, channel` | Leaves an entity channel (and that parcel's presence). |
| `joinParcelPresence` | `connectionId, parcelId` | Shows the caller on the parcel (and subscribes `parcel:<code>`); answers `{ ok, others }`. Repeat it as the heartbeat: the client repeats it every 10 s while the screen is open. |
| `leaveParcelPresence` | `connectionId, parcelId` | Leaves the parcel's presence list. |
| `readRailBadges` | `{}` | `{ ok, badges: { decisions?, leads?, parcels?, stock? } }` for the caller's role (S9), by the shared `railBadgeCounts` rule. |

## Channels and the catalogue

Each stream joins `user:<userId>` and `role:<role>` (owner, staff, karigar). The audience comes from the shared registry `LIVE_CATALOGUE` (`packages/shared/src/live/live-catalogue.ts`), never from the emitting code or the client. An emitting service calls `emitLiveEvent(tx, shop, topic, { entityId, entityVersion, at, ...audience params })` inside its transaction (`packages/api/src/live/emit-live-event.ts`).

| Topic | Name | Entity | Audience | Badge refresh |
| --- | --- | --- | --- | --- |
| `piece.billed` | Piece billed by one staff member | piece | `role:staff` except the actor | yes |
| `parcel.stopped` | Parcel stopped (mismatch or raised problem) | parcel | `role:owner` | yes |
| `edit.proposed` | Edit proposed / token sent | piece_edit | `role:owner` | yes |
| `edit.applied` | Edit applied | piece | `user:<proposer>` + `role:staff` | yes |
| `lead.alert` | Lead arrived / passed its SLA | lead | `role:staff` + `role:owner` | yes |
| `karigar_job.status_changed` | Karigar job status changed | karigar_job | `role:staff` + `role:owner` + `user:<karigar user>` | no |
| `parcel.handed_over` | Parcel handed over by karigar | parcel | `role:staff` | yes |
| `tag.saved` | Tag saved on a shared parcel | piece | `parcel:<code>` except the actor | no |
| `metal_pool.changed` | Metal pool changed | metal_pool (id `metal-pool`) | `role:staff` + `role:owner` | no |
| `user.access_changed` | User deactivated or role changed | user | `user:<id>` | no |

Holds were removed from v1, so there is no "piece held" event. A G26 event is one more entry in the registry; the transport does not change (S11 AC5).

**Permission filter (S5).** After routing, every receiver is checked against the one permission list (`OPERATION_RULES`) through `ENTITY_READ_PERMISSIONS` and `roleMay`, with the role, status and karigar link read from the database once per delivery batch:

| Entity | Operations that grant it |
| --- | --- |
| piece | `stockOut` |
| parcel | `saveTag` |
| piece_edit | `proposeEdit` |
| lead | `markLeadLost` |
| karigar_job | `createOrderCopyAndJob`, or `readMyJob` for the karigar's own job only (`users.karigar_id = karigar_jobs.karigar_id`) |
| metal_pool | `createOrderCopyAndJob` (the roles that open `order-copy`) |
| user | the user themself only |

## Publishing, sequence and replay

- **Source:** EP-10's `outbox_events` table. A live row is an outbox row with `entity_type` set (migration `20261122T1710_ep07_live_channel.sql` adds `insert_order`, `entity_type`, `entity_id`, `entity_version`, `audience`, `live_seq` and table `live_streams`). A rolled-back operation leaves no row, so nothing is ever published for it (S1).
- **Stamp:** the publisher selects unsent rows of known topics in commit order (`for update skip locked`), raises the shop's `live_streams.last_seq` and gives each row its `live_seq`, and sets `published_at`. The counter never goes backwards, so sequences are strictly increasing per shop (S2). A receiver sees gaps where the filter dropped events.
- **Wake-up:** a commit that recorded a live event wakes the loop at once; a 500 ms poll covers commits made by other processes.
- **Replay window:** sent rows can be replayed for 5 minutes (the story's test value; the real length is an open question). Pruning then clears the row's live columns (`live_seq`, entity columns, `audience`) and raises `pruned_through`; the outbox row, its topic and payload stay for the outbox's other consumers (EP-11, audit). A resume whose `since` is older than `live_streams.pruned_through`, newer than `last_seq`, or more than 1000 events behind gets one `refetch_all` instead.
- **Closing (S3 AC4, S10):** a session sweep every 1 s closes streams whose session was signed out or expired (`closed session_ended`). Deactivating or re-roling a user delivers `user.access_changed` to that user's streams and then closes them (`closed access_changed`), so the event always arrives first.

## Presence (S8)

Presence lives in memory in the api process, keyed by stream and parcel. Joining shows the user to everyone else on the parcel; an entry without a heartbeat for 30 s expires; closing the stream removes it at once; a user's own entry is never shown to them. A heartbeat does not extend the session (`extendsSession: false`). A join is broadcast only when it changes someone's list, so the client also shows the `others` of its own join answer: a user's second tab on a parcel sees who is there at once.

## The client

`createLiveClient` (`packages/shared/src/live/live-client.ts`) is shared by the web app and the api tests:

- exactly one stream at a time; `hello` records the `connectionId`, re-sends the entity subscriptions and parcel joins for the new stream;
- a join (not a heartbeat) reports the answer's `others` through `onPresence`, unless a `presence` message for that parcel arrived while the join was on its way;
- an event whose `seq` is not above the last one received is dropped, so a resumed stream never delivers an event twice;
- a dropped stream reopens with `since` = the last seq after 0.5, 1, 2, 4, 8, then 15 s (capped) for as long as the screen is open;
- a refused open, or `closed` with `session_ended` / `access_changed`, asks the server for the session (`readCurrentSession`); when it is gone the status becomes `signed_out` and the web goes to sign-in (`AuthGate`'s recheck). An unreachable server keeps the client retrying.

`createLiveEntityCache` (`live-entity-cache.ts`) keeps records current: an event for a version the client already holds, or an older one, does nothing; a newer one refetches the record once and stores what the read returned, never a value from the event.

**Rail badges (S9).** `useLiveRailBadges(role)` (`packages/web/src/live/rail-badges-live.ts`) reads `readRailBadges` on mount, after `refetch_all`, and once 300 ms after the last event of a burst whose catalogue entry has `refreshesBadges`. A karigar has no rail: nothing is fetched. A badge is shown from the server only once its web screen reads server data, and none does yet, so `SERVER_BACKED_BADGES` is empty and every badge keeps its in-memory value until EP-08 (FU-012); while it is empty the hook reads nothing. Leads is not server-backed either: the web Leads screen and its actions (`LeadReview`, `ConvertLead`) still run on the in-memory store and judge lateness by the demo clock, so a server Leads count would disagree with the screen. Pieces, parcels, edits, problems and scrap have no server write path yet. The server read (`readRailBadges`), the debounce and the karigar rule are in place and tested; a screen epic adds its badge key to the list. The web selector `railBadges` and the server use the same `railBadgeCounts` rule (`packages/shared/src/domain/rail-badge-rules.ts`).

## Timings

Constants in `packages/api/src/live/live-channel.ts`; tests override them through `createLiveChannel` options. No environment variables.

| Setting | Value |
| --- | --- |
| Publish poll | 500 ms (a local commit wakes it at once) |
| Session sweep | 1 s |
| Keep-alive comment | 15 s |
| Presence timeout / client heartbeat | 30 s / 10 s |
| Replay window / prune interval | 5 min / 1 min |
| Client reconnect backoff | 500 ms × 2, capped at 15 s |
| Badge refresh debounce | 300 ms |

## More than one api process

Every process tails `outbox_events` on its own, so events fan out to every process's streams without LISTEN/NOTIFY or Redis; a commit in another process is seen within one poll (500 ms). Presence is per process: two users connected to different processes do not see each other. Both are follow-ups for deployment (see `docs/followups.md`). Locally a single api process is assumed.

## Test-event stub and demo (S12)

`POST /api/dev/live/emit { event, entityId }` (`packages/api/src/live/dev-emit-router.ts`) records a catalogue event for an existing record through the outbox, exactly as a service function would. It is mounted only when `APP_ENV` is not `production`, needs a real session, refuses a karigar, and checks the entity read permission. `edit.applied` and `user.access_changed` come only from real operations.

Demo with two signed-in clients (lane a: api on 4001, database `goldsmith_dev_a`):

```bash
npm run db:reset && npm run db:seed
npm run db:dev-password -- "Rajesh Verma" counter-2026
npm run db:dev-password -- "Deepak Rao" counter-2026
npm run dev -w @goldsmith/api          # in another terminal; LANE=a serves on 4001
npm run live:demo -w @goldsmith/api -- --phone1 "+91 98410 22222" --password1 counter-2026 \
  --phone2 "+91 98410 11111" --password2 counter-2026
```

Client 1 (Deepak) triggers "Piece billed" for TAG-8841; client 2 (Rajesh, the shared `LiveClient` on a fetch stream) prints the envelope and the latency. Then client 2 is cut off for 2 s, client 1 triggers 2 more, and client 2 reconnects with `Last-Event-ID` and prints the catch-up. Stop the api with Ctrl-C.

## Open items

- **D5** (karigar app form) and **D6** (a karigar phone offline for hours) stay open. Reconnect and catch-up work; there is no offline queue, and a gap longer than the replay window ends in `refetch_all`.
- **Replay window** length is not decided (5 minutes until it is).
- **Screens:** `stock` and the other screens still read the in-memory store, so they do not consume live events yet (EP-08); no piece read operation exists for the refetch (EP-22). The tests drive the entity cache with a stand-in read.
- **Multi-process:** presence per process; an optional LISTEN/NOTIFY wake-up would cut cross-process latency below the 500 ms poll.
- **Stream admission:** `GET /api/live` and the dev emit stub do not go through the rate limiter, and there is no cap on streams per session (FU-016).

## Acceptance criteria map (S1–S12)

API test paths are under `packages/api/test/live/`, shared ones under `packages/shared/test/` (`shared/`), web ones under `packages/web/src/live/` (`web/`). Each test title starts with its "Sn ACm" label.

| Story | AC | Code | Test |
| --- | --- | --- | --- |
| S1 | 1 published after commit only | `emit-live-event.ts`, `publisher.ts` stamp | `outbox-publish.test.ts` "S1 AC1" |
| S1 | 2 rollback: no row, no event | outbox insert inside the operation's `tx` | `outbox-publish.test.ts` "S1 AC2" |
| S1 | 3 rule refusal, forbidden, conflict publish nothing | pipeline rollback, permission check before the transaction | `outbox-publish.test.ts` "S1 AC3" |
| S1 | 4 restart: commit order, once | `insert_order`, `published_at`, `live_seq` | `outbox-publish.test.ts` "S1 AC4" |
| S1 | 5 CI names the function | boundary scanner | `publish-boundary.test.ts` "S1 AC5" |
| S2 | 1 Edit applied TAG-8841 v7, seq + 1 | `toEnvelope`, `live_streams` | `outbox-publish.test.ts` "S2 AC1" |
| S2 | 2 strictly increasing, no duplicates | stamping serialized per shop; client drops seq ≤ last | `outbox-publish.test.ts` "S2 AC2"; `shared/live-client.test.ts` "S2 AC2" |
| S2 | 3 no weight, money, name or phone | strict 7-key envelope | `shared/live-catalogue.test.ts` "S2 AC3"; `catalogue-delivery.test.ts` "S2 AC3" |
| S2 | 4 late v6 after v7: no refetch | `live-entity-cache.ts` | `shared/live-entity-cache.test.ts` "S2 AC4" |
| S2 | 5 weight from the refetched piece, 48.6100 g | `live-entity-cache.ts` | `shared/live-entity-cache.test.ts` "S2 AC5" |
| S3 | 1 one connection, user id and role recorded | hub, `LiveClient` | `connection.test.ts` "S3 AC1"; `shared/live-client.test.ts` "S3 AC1" |
| S3 | 2 no or expired session refused | `authenticate-stream.ts` 401 | `connection.test.ts` "S3 AC2" |
| S3 | 3 two tabs, two connections | hub | `connection.test.ts` "S3 AC3" |
| S3 | 4 sign-out closes within about 1 s | `session-sweep.ts` | `connection.test.ts` "S3 AC4" |
| S3 | 5 owner and karigar own roles | `channels.ts` | `connection.test.ts` "S3 AC5" |
| S4 | 1–2 user and role channels | `channels.ts` | `channels.test.ts` "S4 AC1", "S4 AC2" |
| S4 | 3–4 parcel subscribe, unsubscribe | `live-operations.ts`, hub | `channels.test.ts` "S4 AC3", "S4 AC4" |
| S4 | 5 `role:owner` as staff refused | `live-operations.ts` | `channels.test.ts` "S4 AC5" |
| S5 | 1–4 permission filter, role at delivery, one check per receiver | `receiver-filter.ts` | `receiver-filter.test.ts` "S5 AC1"…"S5 AC4" |
| S6 | 1–5 karigar gets own jobs only | `channels.ts`, filter own-job check | `karigar-events.test.ts` "S6 AC1"…"S6 AC5" |
| S7 | 1 4 missed events, in order | hub resume | `reconnect-replay.test.ts` "S7 AC1" |
| S7 | 2 too old → refetch_all | `pruned_through` | `reconnect-replay.test.ts` "S7 AC2" |
| S7 | 3 1042 not resent | `since` exclusive; client dedupe | `reconnect-replay.test.ts` "S7 AC3"; `shared/live-client.test.ts` "S7 AC3" |
| S7 | 4 growing backoff, never stops | `LiveClient` | `shared/live-client.test.ts` "S7 AC4" |
| S7 | 5 expired session on resume → sign-in | 401, `checkSession`, `AuthGate` recheck | `reconnect-replay.test.ts` "S7 AC5"; `shared/live-client.test.ts` "S7 AC5" |
| S8 | 1–5 presence shows, expires, moves, karigar refused | `presence.ts`, `live-operations.ts`, client heartbeat | `presence.test.ts` "S8 AC1"…"S8 AC5"; `shared/live-client.test.ts` "S8" |
| S9 | 1 Decisions 3 → 4 after Parcel stopped | `read-rail-badges.ts`, `rail-badge-rules.ts` | `rail-badges.test.ts` "S9 AC1"; `shared/rail-badge-rules.test.ts` |
| S9 | 2 stock 42 → 41 after Piece billed | `read-rail-badges.ts` | `rail-badges.test.ts` "S9 AC2" |
| S9 | 3 owner late leads + 1, staff needing a glance | `read-rail-badges.ts` (`slaState`) | `rail-badges.test.ts` "S9 AC3" |
| S9 | 4 karigar: no badges, no read | `startLiveRailBadges`, rule `shopFloor` | `web/rail-badges-live.test.ts` "S9 AC4"; `rail-badges.test.ts` karigar refused |
| S9 | 5 burst of 5 → one read | `createBadgeRefresher` | `web/rail-badges-live.test.ts` "S9 AC5" |
| S10 | 1 two devices get the event, then close | live channel access close | `access-close.test.ts` "S10 AC1" |
| S10 | 2 re-role: presence gone, karigar channels | hub, presence | `access-close.test.ts` "S10 AC2" |
| S10 | 3 deactivated reconnect refused | 401 | `access-close.test.ts` "S10 AC3" |
| S10 | 4 only that user | `user:` audience | `access-close.test.ts` "S10 AC4" |
| S11 | 1 the 10 names and audiences | `LIVE_CATALOGUE` | `shared/live-catalogue.test.ts` "S11 AC1" |
| S11 | 2 each event × 2 staff, owner, 2 karigars | full path | `catalogue-delivery.test.ts` "S11 AC2" |
| S11 | 3 unknown name refused | `emitLiveEvent`, stamp topic filter | `outbox-publish.test.ts` "S11 AC3" |
| S11 | 4 billed piece leaves Rajesh's list | entity cache, envelope | `shared/live-entity-cache.test.ts` "S11 AC4"; `two-clients.test.ts` "S12 AC1" |
| S11 | 5 a G26 event is one entry | `catalogue` option | `shared/live-catalogue.test.ts` "S11 AC5"; `catalogue-delivery.test.ts` "S11 AC5" |
| S12 | 1 Deepak bills TAG-8841, Rajesh drops it within 1 s | stub, `LiveClient`, entity cache, `readRailBadges` | `two-clients.test.ts` "S12 AC1" |
| S12 | 2 cut off, 3 events, all 3 in order after reconnect (scaled from 30 s to 600 ms) | `LiveClient` resume with Last-Event-ID | `two-clients.test.ts` "S12 AC2" |
| S12 | 3 both see each other on BATCH-2026-044 | presence operations and heartbeat | `two-clients.test.ts` "S12 AC3" |
| S12 | 4 karigar gets nothing for another's job; deactivation closes within about 1 s | filter, access close | `two-clients.test.ts` "S12 AC4" |
| S12 | 5 a failure names the criterion | test titles | `two-clients.test.ts` titles "S12 AC1"…"S12 AC4", run by the CI Test check |
| S12 | rule: stub absent in production | `app.ts` mounts it outside production | `dev-emit.test.ts` |
