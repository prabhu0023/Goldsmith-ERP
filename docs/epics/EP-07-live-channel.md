# EP-07: Live channel

## 1. Summary

This epic makes a change by one person appear on everyone else's screen within about a second, with no refresh. In
a showroom several staff work at once: if one bills a piece, the others must stop seeing it as available, or two
people sell the same piece. When a parcel is stopped, the owner must know at once because pieces are frozen until he
acts. The prototype has one browser and one in-memory state, so this never comes up. This epic builds the push
connection, per-user and per-role subscriptions, the event catalogue from PRODUCTION-SCOPE section 1, reconnect with
catch-up, and presence on shared parcels.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. There is a single browser state; `StoreProvider` refreshes `now` every 30 seconds with `setInterval` and nothing is pushed between devices.

## 3. Roles involved

- Owner: receives owner-audience events (parcel stopped, edit proposed, lead SLA, job status) on any open screen.
- Staff: receive staff-audience events (piece billed, edit applied, lead arrived, job status, parcel handed over, tag saved on a shared parcel, metal pool changed).
- Karigar: receives only events about their own jobs and their own account.
- System: publishes each event after the operation's transaction commits, filters it by permission, keeps a short replay buffer for catch-up, and tracks presence.

## 4. In scope

- An authenticated push connection from every open web and karigar client to a push service in the team's own Node + TypeScript API (D1, Option C; transport per D3).
- Subscriptions by user, by role, and by entity (for example one parcel), with the permission check from EP-05 applied to every subscription.
- The event catalogue of PRODUCTION-SCOPE section 1 (10 events) with an envelope: event name, entity type, entity id, version, time, sequence number.
- Publishing an event only after the operation's transaction commits.
- Events carry ids and versions; clients refetch authoritative state rather than trusting event payloads.
- Reconnect and catch-up from the last received sequence number after a dropped connection.
- Presence on shared parcels: who else is tagging this parcel now.
- Dropping a user's subscriptions at once on "User deactivated or role changed".
- Live rail badge counts (today computed by `railBadges`).

## 5. Out of scope

- Deciding who gets a notification and on which channel (EP-11).
- WhatsApp and email delivery (EP-12, EP-11).
- The operations that emit each event; each emitting epic owns its event (EP-05, EP-18, EP-19, EP-20, EP-21, EP-23, EP-24, EP-25, EP-26, EP-28, EP-29, EP-30).
- Offline queueing on the karigar phone (EP-20 under D6).
- Front-end live-subscription hooks and the reconnecting and offline states in the shell. Owned by EP-08 Front-end production foundation (was gap G1).
- Monitoring of connection counts and drop rates (EP-37).

## 6. Current state in the prototype

- `src/store/StoreProvider.tsx` holds one `AppState` in React state; every action replaces it and all screens re-render from it. There is no network.
- `now` is refreshed by `window.setInterval(() => setNow(demoNow()), 30_000)`; SLA and overdue displays update on that tick only.
- `src/store/selectors.ts` `railBadges(s, role, now)` computes badge counts for `decisions`, `leads`, `parcels` and `stock` on every render: owner sees decisions total, late leads, open parcels and in-stock count; staff see leads needing a glance, open parcels and in-stock count; karigar sees none.
- Multiple staff tagging one parcel (mockup 20, PRODUCTION-SCOPE EP-21 scope) cannot happen in the prototype because there is one browser.
- Reusable: selectors such as `railBadges`, `ownerQueues` and `openParcels` as the client-side recompute after an event; the entity ids already present in every record.
- Must be rebuilt server-side: the connection, authentication of the connection, subscription filtering, publishing after commit, sequence numbers, replay buffer and presence.

## 7. Functional requirements

- FR-07-1. A signed-in client opens one authenticated push connection; an unauthenticated connection is refused.
- FR-07-2. The server publishes an event only after the operation's transaction commits; a rolled-back operation publishes nothing.
- FR-07-3. Each event carries name, entity type, entity id, entity version, server time and a per-stream sequence number.
- FR-07-4. A client that receives an event refetches the entity (or list) from the API before showing new values.
- FR-07-5. A client receives an event only if its user may read the entity under EP-05 permissions.
- FR-07-6. A karigar client receives only events about jobs assigned to that karigar and about their own account.
- FR-07-7. Events reach subscribed clients within about 1 second of commit under normal shop load.
- FR-07-8. A client that reconnects sends its last sequence number and receives every event it missed, or a "refetch everything" signal if the gap is too old.
- FR-07-9. A client can join presence on a parcel and sees the names of other users present on that parcel.
- FR-07-10. When "User deactivated or role changed" is published for a user, the server closes that user's connections and drops their subscriptions.
- FR-07-11. Rail badge counts update on the client within about 1 second of a relevant event.
- FR-07-12. The server supports at least the number of concurrent connections the shop needs (several staff, the owner and many karigars), with the number to be confirmed.

## 8. Business rules

- BR-07-1. A change by one person appears on everyone else's screen within about a second, with no refresh. [PRODUCTION-SCOPE §1 Live]
- BR-07-2. Live events arrive within about 1 second. [PRODUCTION-SCOPE §5 Performance]
- BR-07-3. The event catalogue and each event's audience are fixed by PRODUCTION-SCOPE section 1. [PRODUCTION-SCOPE §1 live events table]
- BR-07-4. A karigar sees only the jobs issued to him and never prices, customers, leads or stock. [mockup 11]
- BR-07-5. Deactivating a user ends access at once. [PRODUCTION-SCOPE §5 Security; §1 live events]
- BR-07-6. The server is authoritative; the browser only displays. [PRODUCTION-SCOPE §1 Authoritative]
- BR-07-7. Live transport is WebSocket or Server-Sent Events, served by the Node API (D1, Option C), and needs two-way for presence. [PRODUCTION-SCOPE §4 D3]
- BR-07-8. Multiple staff can tag one parcel live. [PRODUCTION-SCOPE §6 EP-21 scope]

## 9. Data

- Event envelope: sequence number, event name, entity type, entity id, entity version, emitted at (UTC), audience (role list, user list or entity channel), branch key (if D7).
- Replay buffer: recent events kept for catch-up, with a retention window to decide.
- Subscription: connection id, user id, role, channels joined.
- Presence: parcel id, user id, user name, joined at, last seen.
- Events carry no weights or money; where an event refers to a weight change (for example "Edit applied"), the client refetches the piece, whose weights are integers in units of 0.0001 g.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Open | Live connection | Start an authenticated push connection | Any signed-in user |
| Subscribe | Channel (user, role, entity) | Join a stream the user may read | Any signed-in user, filtered by EP-05 |
| Unsubscribe | Channel | Leave a stream | Any signed-in user |
| Resume | Live connection | Reconnect and replay from a sequence number | Any signed-in user |
| Join / Leave | Parcel presence | Show who is working on a parcel | Staff, Owner |
| Publish | Event | Push a committed change to subscribers (internal) | System only, from service functions |
| Close | User connections | Drop access at once on deactivation or role change | System only |

## 11. Live events

This epic transports every catalogue event. It emits none of its own. Audiences are from PRODUCTION-SCOPE section 1.

- Transports: "Piece billed by one staff member" — to every other staff screen (emitted by EP-26).
- Transports: "Parcel stopped (mismatch or raised problem)" — to the owner (emitted by EP-23, EP-24).
- Transports: "Edit proposed / token sent" — to the owner (emitted by EP-25).
- Transports: "Edit applied" — to the proposing staff member and stock screens (emitted by EP-25).
- Transports: "Lead arrived / passed its SLA" — to the staff inbox and the owner (emitted by EP-28, EP-29, EP-10).
- Transports: "Karigar job status changed" — to staff and the owner, and to the karigar who owns the job (emitted by EP-19, EP-20).
- Transports: "Parcel handed over by karigar" — to the parcels-in screen (emitted by EP-20).
- Transports: "Tag saved on a shared parcel" — to other staff tagging the same parcel (emitted by EP-21).
- Transports: "Metal pool changed" — to the order-copy screen (emitted by EP-18).
- Transports: "User deactivated or role changed" — to that user's open sessions (emitted by EP-05).
- Consumes: "User deactivated or role changed" — closes that user's connections and drops their subscriptions.
- Proposed events from other epics that are not in the catalogue (G26) would use the same transport once accepted.

## 12. Screens and UX references

No screen of its own. Screens that depend on it: the rail badges on every staff and owner screen; `today`,
`decisions`, `leads`, `stock`, `parcels`, `parcel-tag`, `parcel-match`, `order-copy` and `k-jobs`. Mockups that show
live behaviour: `13-notifications-escalation.svg`, `20-parcel-arrival.svg` and `21-tag-one-item.svg` (several staff
on one parcel), `02-staff-home.svg` and `08-owner-home.svg` (live cards).

## 13. Non-functional requirements

- Performance: events reach clients within about 1 second of commit. [PRODUCTION-SCOPE §5 Performance]
- Security: the connection is authenticated with the session; every event is filtered by EP-05 permissions; deactivation closes connections within about 1 second.
- Concurrency: events are published after commit and ordered by sequence number per stream, so a client never sees a change that was rolled back.
- Availability and recovery: a dropped connection reconnects automatically and catches up without a full reload where the gap is short.
- Personal data: event envelopes carry ids, not customer names or phones.
- Time: event times are server UTC.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05
- Downstream: EP-08, EP-11, EP-20, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given two staff browsers open on `stock`, when one bills a piece, then the other stops showing it as available within about a second.
2. Given a karigar phone connected, when a job assigned to another karigar changes status, then the phone receives nothing.
3. Given a browser that lost its connection for 30 seconds, when it reconnects, then it receives every event it missed in order.
4. Given two staff on `parcel-tag` for BATCH-2026-044, when both are present, then each sees the other's name.
5. Given a signed-in user, when the owner deactivates them, then their connection closes within about a second.
6. Done when the M1 demo works: "two browsers receive each other's events live" (PRODUCTION-SCOPE §7).

## 16. Risks

- Risk: an event is published before commit and clients show a change that is then rolled back. Mitigation: publish from a post-commit hook or outbox only.
- Risk: event payloads leak data to roles that may not read it. Mitigation: envelopes carry ids only; clients refetch through permission-checked reads.
- Risk: karigar phones on weak signal drop often and miss events. Mitigation: catch-up by sequence number, and D6 offline queue in EP-20.
- Risk: presence shows stale users after a tab closes without a goodbye. Mitigation: presence entries expire after a short heartbeat timeout.
- Risk: the front-end subscription hooks are rebuilt per screen. Mitigation: EP-08 builds one shared hook before any feature epic.

## 17. Open decisions and questions

- D3: WebSocket or Server-Sent Events? Presence needs two-way. Either way it is built in the Node API (D1, Option C), not taken from a platform.
- D6: how does the live channel behave for a karigar phone that is offline for hours?
- D7: are channels scoped per branch?
- What does presence mean exactly: "has the parcel open", or "is tagging an item now"?
- How long is the replay buffer kept before a client must refetch everything?
- G26: which proposed events (for example "Parcel released into stock", "Problem cleared", "Setting changed") are added to the catalogue?

## 18. Candidate stories

1. EP-07-S1: System can publish an event only after its operation's transaction commits
2. EP-07-S2: System can stamp each event with a sequence number, entity id and version
3. EP-07-S3: User can open an authenticated live connection
4. EP-07-S4: System can subscribe a connection to its user and role channels
5. EP-07-S5: System can filter every event by the receiver's permissions
6. EP-07-S6: Karigar can receive only events about their own jobs
7. EP-07-S7: User can reconnect and catch up from the last sequence number
8. EP-07-S8: Staff can see who else is working on the same parcel
9. EP-07-S9: User can see rail badge counts update live
10. EP-07-S10: System can close a user's connections when they are deactivated or re-roled
11. EP-07-S11: System can carry each of the 10 catalogue events to its audience
12. EP-07-S12: Developer can test two browsers receiving each other's events
