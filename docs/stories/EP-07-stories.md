# EP-07: Live channel · stories

Epic document: [EP-07 Live channel](../epics/EP-07-live-channel.md)

Role note: stories where the server publishes, filters, buffers or closes connections on its own use "System". The two-browser test harness story uses "Developer". Stories about what a person sees use Owner, Staff or Karigar, or "User" in the candidate title where every role is meant; the "As a" field then names the role used in the example.

---

## EP-07-S1: System can publish an event only after its operation's transaction commits

- **Story ID:** EP-07-S1
- **Title:** System can publish an event only after its operation's transaction commits
- **As a:** System
- **I want:** service functions to record each event they cause in an outbox row inside the operation's transaction, and a publisher to send the event to the live channel only once that transaction has committed
- **So that:** no screen ever shows a change that was rolled back, such as a piece shown as billed when the stock-out failed (FR-07-2, BR-07-6, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given the reference `markLeadLost` operation from EP-03-S12 is extended to cause a test event, when the transaction commits, then exactly one event is published to the live channel after the commit and none before it.
  2. Given a test that forces the same operation to fail after the outbox row is inserted, when the transaction rolls back, then the outbox row is gone and no event is published.
  3. Given an operation refused by a rule, a permission check or a version conflict (EP-02-S14), when it ends, then no event is published.
  4. Given the publisher process is stopped while 3 operations commit, when it is restarted, then the 3 events are published in commit order and none is lost or sent twice.
  5. Given a service function that calls the live channel's publish directly instead of writing to the outbox, when the CI check runs, then it fails and names the function.
- **Rules enforced on the server:** Publish is internal and callable only from service functions through the outbox, never from a client request (epic section 10). The outbox row and the business change share the one transaction from EP-03-S6. Each outbox row is marked sent once published, so a restart does not resend it.
- **Live events emitted / consumed:** None of its own. This story builds the publish path that every catalogue event in PRODUCTION-SCOPE §1 uses.
- **Audit entry written:** No. The audit entry belongs to the operation that caused the event (EP-06-S2); publishing changes no business record.
- **Data changes:** Migration adds an `event_outbox` table: id, event name, entity type, entity id, entity version, audience, created at (UTC), sent at. The publisher reads unsent rows in id order.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: events leave only after commit, so a client never sees a rolled-back change (epic section 13). Availability: unsent rows survive a publisher crash or redeploy. Time: created at is server UTC. D1 is decided (Option C): the outbox and the publisher run in the Node API, which is the live push service. Open decision D3: the transport the publisher writes to is not chosen; the criteria hold for WebSocket or Server-Sent Events.
- **Depends on:** EP-02-S1, EP-03-S6, EP-03-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S2: System can stamp each event with a sequence number, entity id and version

- **Story ID:** EP-07-S2
- **Title:** System can stamp each event with a sequence number, entity id and version
- **As a:** System
- **I want:** every published event to carry one envelope: sequence number, event name, entity type, entity id, entity version, emitted at (UTC) and audience, and no business values
- **So that:** clients can order events, detect gaps, ignore stale ones, and refetch the real record through a permission-checked read (FR-07-3, FR-07-4, BR-07-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an edit is applied to TAG-8841 and the piece moves from version 6 to version 7, when the event is published, then its envelope has name "Edit applied", entity type `piece`, entity id TAG-8841, entity version 7, emitted at in UTC and a sequence number one higher than the previous event on that stream.
  2. Given two events published on the same stream, when a client receives them, then their sequence numbers are strictly increasing with no duplicates.
  3. Given the envelope of any catalogue event, when it is inspected, then it contains no weight, no money, no customer name and no phone number (epic section 13 Personal data).
  4. Given a client holds TAG-8841 at version 7, when an event for TAG-8841 with version 6 arrives late, then the client does not refetch and keeps version 7.
  5. Given a client receives "Edit applied" for TAG-8841, when it updates the `stock` screen, then it shows the gross weight from the refetched piece, for example 48.6100 g, and never a value from the event (FR-07-4).
- **Rules enforced on the server:** The sequence number is assigned by the server at publish time, per stream, from a counter that never goes backwards. Entity version comes from the row's version column (EP-02-S14). The envelope schema is defined once in the shared package (EP-03-S1) and the publisher rejects an envelope with extra fields.
- **Live events emitted / consumed:** None of its own. Defines the envelope used by all 10 catalogue events.
- **Audit entry written:** No. The envelope is transport data, not a state change.
- **Data changes:** Adds sequence number and audience to `event_outbox` (EP-07-S1). Adds the envelope type to the shared package. Weights are never carried; clients refetch pieces whose weights are integers in units of 0.0001 g.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: events are ordered by sequence number per stream (epic section 13). Personal data: envelopes carry ids only. Precision: no weight is sent in an event, so no rounding can happen in transit. Time: emitted at is server UTC. Open decision D7: if branches are chosen, the envelope gains a branch key.
- **Depends on:** EP-07-S1, EP-02-S14, EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S3: User can open an authenticated live connection

- **Story ID:** EP-07-S3
- **Title:** User can open an authenticated live connection
- **As a:** Staff
- **I want:** my browser to open one live connection when I sign in, authenticated with my session, and keep it open while any screen is open
- **So that:** changes made by others reach my screen without a refresh, and nobody without a session can listen (FR-07-1, BR-07-1, BR-07-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when the app shell loads on route `today`, then exactly one live connection opens and the server records it with his user id and role `staff`.
  2. Given a connection attempt with no session or with an expired session (EP-04-S12), when it reaches the server, then it is refused as `unauthenticated` and no subscription is created.
  3. Given Rajesh opens a second tab, when it loads, then that tab opens its own connection, and both are listed against his user id.
  4. Given Rajesh signs out (EP-04-S11), when the sign-out commits, then his connections close within about 1 second.
  5. Given the owner Sanjay Seth on a phone and Lakshmi Devi on the karigar app at route `k-jobs`, when each signs in, then each opens one connection with their own role.
- **Rules enforced on the server:** The connection is checked against the session store on open, the same check as an API request. The user id and role come from the session, never from the client. A connection whose session ends is closed by the server.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Opening a connection changes no business record; sign-in itself is audited by EP-04-S14.
- **Data changes:** None in the product database. The Node API holds a connection record in memory: connection id, user id, role, opened at.
- **UI reference:** No screen. The connection starts from the app shell for every route; the shell's states are built in EP-08.
- **Non-functional checks:** Security: an unauthenticated connection is refused (FR-07-1). Performance: the connection is open within 2 seconds of the shell loading on a shop connection. Open decision D3: WebSocket or Server-Sent Events; presence (EP-07-S8) needs two-way, which rules out plain Server-Sent Events unless presence uses API calls. D1 is decided (Option C): the connection is served by the Node API on the shop's own domain. Open decision D4: the session comes from whichever sign-in method is chosen; the connection only checks that the Node API session is valid.
- **Depends on:** EP-04-S5, EP-04-S11, EP-04-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S4: System can subscribe a connection to its user and role channels

- **Story ID:** EP-07-S4
- **Title:** System can subscribe a connection to its user and role channels
- **As a:** System
- **I want:** each new connection to join its user channel and its role channel automatically, and to join or leave an entity channel (for example one parcel) when the client asks
- **So that:** each event goes only to the streams that need it, matching the audiences in PRODUCTION-SCOPE §1 (FR-07-5, BR-07-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's connection opens, when the server sets it up, then it joins `user:<Rajesh's id>` and `role:staff` and no other channel.
  2. Given Sanjay Seth's connection opens, when it is set up, then it joins `user:<Sanjay's id>` and `role:owner`.
  3. Given Rajesh opens route `parcel-tag` for BATCH-2026-044, when the client subscribes to `parcel:BATCH-2026-044`, then the server adds that channel to his connection after the EP-05 read check passes.
  4. Given Rajesh leaves `parcel-tag`, when the client unsubscribes, then the channel is removed and he receives no more events for BATCH-2026-044 unless his role channel carries them.
  5. Given a client asks to subscribe to `role:owner` while signed in as Staff, when the request arrives, then it is refused as `forbidden` and the connection stays on its own channels.
- **Rules enforced on the server:** User and role channels are assigned by the server from the session; the client cannot choose them. Entity channels are joined only after the EP-05 permission check for reading that entity (EP-05-S2). The list of channel kinds is fixed: user, role, entity.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Joining a channel changes no business record.
- **Data changes:** None in the product database. Subscription record per connection: connection id, user id, role, channels joined.
- **UI reference:** No screen. Entity subscriptions are opened by `parcel-tag` and `parcel-match` (`docs/ux/mockups/21-tag-one-item.svg`, `docs/ux/mockups/04-parcel-match.svg`).
- **Non-functional checks:** Security: every subscription is checked against EP-05 permissions (epic section 13). Open decision D7: if branches are chosen, role channels become per branch, for example `role:staff:<branch>`.
- **Depends on:** EP-07-S3, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S5: System can filter every event by the receiver's permissions

- **Story ID:** EP-07-S5
- **Title:** System can filter every event by the receiver's permissions
- **As a:** System
- **I want:** the channel to check, for each event and each subscribed connection, that the receiving user may read the entity under EP-05 before delivering it
- **So that:** a wrong audience on an event, or a channel joined in error, cannot leak that a lead, customer or piece exists to someone who may not read it (FR-07-5, BR-07-4, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given a "Lead arrived / passed its SLA" event for LD-2026-213 addressed to staff and the owner, when it is delivered, then Rajesh Verma (Staff) and Sanjay Seth (Owner) receive it and Lakshmi Devi (Karigar) does not.
  2. Given a test that publishes a "Piece billed by one staff member" event with the karigar role wrongly in its audience, when it is delivered, then no karigar connection receives it, because karigars may not read pieces in stock.
  3. Given a user whose role changed from Staff to Karigar in the same second as an event, when the event is delivered, then the filter uses the role stored on the server at delivery time, not the role the connection opened with.
  4. Given 10 open connections and one event, when it is delivered, then each connection is checked once and the event still arrives within about 1 second of commit.
- **Rules enforced on the server:** The filter calls the same permission check as the read API (EP-05-S2) for the event's entity type and id. An event that fails the check for a connection is dropped silently for that connection. Payloads hold ids only, so even a delivered event reveals nothing beyond the id; the client still refetches through a checked read.
- **Live events emitted / consumed:** None of its own. Applies to every catalogue event.
- **Audit entry written:** No. A dropped delivery changes no business record. Repeated drops for one user are counted by EP-37.
- **Data changes:** None in the product database.
- **UI reference:** No screen
- **Non-functional checks:** Security: every event is filtered by EP-05 permissions (epic section 13). Performance: filtering keeps delivery within about 1 second of commit (BR-07-2). Personal data: envelopes carry ids, not names or phones.
- **Depends on:** EP-07-S2, EP-07-S4, EP-05-S2, EP-05-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S6: Karigar can receive only events about their own jobs

- **Story ID:** EP-07-S6
- **Title:** Karigar can receive only events about their own jobs
- **As a:** Karigar
- **I want:** my phone to get live updates only for jobs issued to me and for my own account
- **So that:** my job list stays current without a refresh, and I never learn about other karigars' work, customers, leads, stock or prices (FR-07-6, BR-07-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi's phone is connected on route `k-jobs`, when a job assigned to Mahesh Soni changes status, then her phone receives nothing (epic acceptance criterion 2).
  2. Given a job assigned to Lakshmi Devi, when staff change its status, then her phone receives "Karigar job status changed" for that job within about 1 second and the job card refetches its status.
  3. Given any "Piece billed by one staff member", "Lead arrived / passed its SLA", "Edit proposed / token sent" or "Metal pool changed" event, when it is published, then no karigar connection receives it.
  4. Given the owner changes Lakshmi Devi's role, when "User deactivated or role changed" is published for her, then her phone receives it on her user channel.
  5. Given a karigar user with no linked karigar record (EP-05-S13), when the phone connects, then it receives only events on its user channel and no job events.
- **Rules enforced on the server:** A karigar connection joins only its user channel and the job channels for jobs whose karigar id equals the karigar record linked to the user (EP-05-S3, EP-05-S13). It never joins `role:staff` or `role:owner`. The EP-07-S5 filter applies on top as a second check.
- **Live events emitted / consumed:** consumed: "Karigar job status changed" (own jobs only), "User deactivated or role changed" (own account only).
- **Audit entry written:** No. Receiving events changes no business record.
- **Data changes:** None in the product database. Reads the user to karigar link from EP-05-S13.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Security: a karigar receives only own-job and own-account events (FR-07-6). Performance: own-job events arrive within about 1 second on a normal connection. Open decision D6: behaviour for a phone offline for hours is not fixed; this story covers a connected phone, and catch-up after a long gap falls back to "refetch everything" (EP-07-S7). Open decision D5: the karigar client is a PWA by recommendation; the criteria hold for either client.
- **Depends on:** EP-07-S4, EP-07-S5, EP-05-S3, EP-05-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S7: User can reconnect and catch up from the last sequence number

- **Story ID:** EP-07-S7
- **Title:** User can reconnect and catch up from the last sequence number
- **As a:** Staff
- **I want:** my browser to reconnect on its own after the connection drops, send the last sequence number it received, and get every event it missed in order
- **So that:** a short drop on the shop Wi-Fi does not leave me looking at a piece that someone else already sold (FR-07-8, epic section 13 Availability)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's browser on `stock` loses its connection for 30 seconds while 4 events are published to his channels, when it reconnects, then it receives all 4 events in sequence order and no others (epic acceptance criterion 3).
  2. Given the client's last sequence number is older than the replay buffer holds, when it resumes, then the server sends a single "refetch everything" signal and the client reloads its open screen's data from the API.
  3. Given the client already received event 1042 before the drop, when it resumes from 1042, then event 1042 is not sent again.
  4. Given the connection drops, when the client tries to reconnect, then it retries with growing delays up to a fixed maximum and never stops trying while a screen is open.
  5. Given a resume request whose session has expired during the drop, when it arrives, then it is refused as `unauthenticated` and the client goes to sign-in.
- **Rules enforced on the server:** Resume checks the session like a new connection (EP-07-S3). Replayed events go through the same permission filter as live ones (EP-07-S5), using the user's current role. The replay buffer keeps events for a fixed window; older gaps get "refetch everything".
- **Live events emitted / consumed:** None of its own. Replays any catalogue event the client missed.
- **Audit entry written:** No. Reconnecting changes no business record.
- **Data changes:** Replay buffer: recent events with sequence number, kept as sent rows in `event_outbox` for the retention window. A cleanup removes rows older than the window.
- **UI reference:** No screen of its own. The "Reconnecting" state shown in the shell is built in EP-08.
- **Non-functional checks:** Availability: reconnect is automatic and catches up without a full reload when the gap is short (epic section 13). Concurrency: replayed events arrive in sequence order. Security: replay is filtered by the current permissions. Open question: the replay buffer length is not decided; the criteria use "the retention window" and a test value of 5 minutes until it is. Open decision D6: a karigar phone offline for hours will always exceed the buffer and refetch.
- **Depends on:** EP-07-S2, EP-07-S3, EP-07-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S8: Staff can see who else is working on the same parcel

- **Story ID:** EP-07-S8
- **Title:** Staff can see who else is working on the same parcel
- **As a:** Staff
- **I want:** to see the names of the other staff who have the same parcel open on `parcel-tag` or `parcel-match`, updated live as they join and leave
- **So that:** two of us tagging BATCH-2026-044 can split the items and not tag the same one twice (FR-07-9, BR-07-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma and Deepak Rao both open `parcel-tag` for BATCH-2026-044, when both are present, then Rajesh sees "Deepak Rao" and Deepak sees "Rajesh Verma" in the parcel's presence list (epic acceptance criterion 4).
  2. Given Deepak closes the tab without leaving, when no heartbeat arrives from his connection for the timeout, then his name disappears from Rajesh's list within that timeout plus about 1 second.
  3. Given Deepak navigates from BATCH-2026-044 to another parcel, when he leaves, then his name disappears from the BATCH-2026-044 list within about 1 second.
  4. Given Lakshmi Devi signed in as Karigar, when she tries to join presence on BATCH-2026-044, then the server refuses it as `forbidden`.
  5. Given a user's own entry, when the list is shown, then their own name is not listed among the others.
- **Rules enforced on the server:** Join and Leave are allowed for roles `staff` and `owner` only (epic section 10). The user name shown comes from the server's user record, not the client. Entries expire after a heartbeat timeout. The server is the only source of the presence list.
- **Live events emitted / consumed:** None from the catalogue. Presence join and leave updates travel on the `parcel:<id>` entity channel and are not business events.
- **Audit entry written:** No. Presence changes no business record.
- **Data changes:** None in the product database. Presence record kept by the channel: parcel id, user id, user name, joined at, last seen.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg` (THIS PARCEL panel for BATCH-2026-044), route `parcel-tag`; `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match`. Where the presence names sit on the screen is not yet designed.
- **Non-functional checks:** Performance: join and leave reach others within about 1 second. Availability: stale entries expire by heartbeat timeout (epic section 16 risk). Open question: whether presence means "has the parcel open" or "is tagging an item now"; the criteria use "has the parcel open" until it is decided. Open decision D3: presence needs a two-way transport. Open decision D7: if branches are chosen, presence is per branch parcel.
- **Depends on:** EP-07-S4, EP-07-S5, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S9: User can see rail badge counts update live

- **Story ID:** EP-07-S9
- **Title:** User can see rail badge counts update live
- **As a:** Owner
- **I want:** the counts on the rail items (Decisions, Leads, Parcels in, Showroom stock) to change within about a second of a relevant event, recomputed from server data
- **So that:** I see "Decisions 3" become "Decisions 4" when a parcel is stopped, without refreshing (FR-07-11, BR-07-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `decisions` with the Decisions badge at 3, when a "Parcel stopped (mismatch or raised problem)" event arrives for BATCH-2026-044, then the badge shows 4 within about 1 second.
  2. Given Rajesh Verma on `today` with the Showroom stock badge at 42, when Deepak Rao bills a piece and "Piece billed by one staff member" arrives, then Rajesh's badge shows 41 within about 1 second.
  3. Given the owner's rail, when a lead passes its 8-hour SLA and "Lead arrived / passed its SLA" arrives, then the owner's Leads badge counts late leads and goes up by 1; given a staff rail, then the staff Leads badge counts leads needing a glance.
  4. Given Lakshmi Devi on the karigar app, when any event arrives, then no rail badge is shown, matching `railBadges` returning none for karigar.
  5. Given a burst of 5 events in one second, when they arrive, then the client fetches the counts once after the burst, not 5 times.
- **Rules enforced on the server:** Counts come from a permission-checked read of badge counts on the server, using the same rules as `railBadges`: owner gets decisions total, late leads, open parcels and in-stock count; staff get leads needing a glance, open parcels and in-stock count; karigar gets none. The event only triggers the refetch.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member", "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Edit applied", "Lead arrived / passed its SLA", "Parcel handed over by karigar". Proposed (README gap G26), once accepted: "Parcel released into stock", "Problem cleared", "Scrap requested", "Piece scrapped".
- **Audit entry written:** No. Reading counts changes nothing.
- **Data changes:** None in the product database. Adds a badge-count read operation to the shared contract; the `railBadges` selector rules move to the server.
- **UI reference:** Rail on `docs/ux/mockups/08-owner-home.svg` (Decisions 3) and `docs/ux/mockups/13-notifications-escalation.svg` (Decisions 6, Leads 2), route `decisions`; rail on `docs/ux/mockups/02-staff-home.svg` (Showroom stock 42, Parcels in 2), route `today`.
- **Non-functional checks:** Performance: badges change within about 1 second of the event (FR-07-11); the count read answers in under 2 seconds. Security: counts are computed on the server per role. Open decision D7: the owner rail says "All branches"; per-branch counts depend on D7.
- **Depends on:** EP-07-S4, EP-07-S5, EP-07-S11, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S10: System can close a user's connections when they are deactivated or re-roled

- **Story ID:** EP-07-S10
- **Title:** System can close a user's connections when they are deactivated or re-roled
- **As a:** System
- **I want:** the channel to consume "User deactivated or role changed", deliver it to that user's open connections, then close them and drop their subscriptions and presence
- **So that:** a deactivated user stops seeing live data within about a second, and a re-roled user cannot keep the old role's channels (FR-07-10, BR-07-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar is signed in on two devices, when Sanjay Seth deactivates him (EP-05-S7), then both connections receive the event and are closed by the server within about 1 second (epic acceptance criterion 5).
  2. Given Deepak Rao is on `parcel-tag` for BATCH-2026-044 with presence, when his role changes from Staff to Karigar, then his connection closes, his name leaves the presence list, and on reconnect he joins only `user:<id>` and karigar job channels.
  3. Given a deactivated user's client tries to reconnect, when the resume arrives, then it is refused as `unauthenticated` because EP-05-S10 ended the sessions.
  4. Given the event is published, when it reaches other users, then only the affected user's connections receive it.
- **Rules enforced on the server:** Only the server closes connections (epic section 10, Close: System only). The close happens on the event, not on the next request. The event carries only the user id, the reason (`deactivated` or `role_changed`) and the new role, as set by EP-05-S10.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed" (emitted by EP-05). Delivered to that user's open sessions before closing.
- **Audit entry written:** No. The deactivation or role change is audited by EP-05-S14; closing connections adds no entry.
- **Data changes:** None in the product database. Removes the user's connection, subscription and presence records from the channel.
- **UI reference:** No screen. The client's return to sign-in is covered by EP-04-S13.
- **Non-functional checks:** Security: access ends within about 1 second of deactivation (epic section 13). Concurrency: a connection that opens in the same moment as the deactivation is refused by the session check in EP-07-S3.
- **Depends on:** EP-07-S3, EP-07-S4, EP-07-S8, EP-05-S10, EP-04-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S11: System can carry each of the 10 catalogue events to its audience

- **Story ID:** EP-07-S11
- **Title:** System can carry each of the 10 catalogue events to its audience
- **As a:** System
- **I want:** the 10 catalogue events registered in the shared package with their entity type and audience channels, so that an emitting epic only names the event and the channel routes it
- **So that:** each event reaches exactly the people PRODUCTION-SCOPE §1 says must see it, and the emitting epics do not each invent routing (BR-07-3, FR-07-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the shared event list, when it is compared with PRODUCTION-SCOPE §1, then it has exactly these 10 names and audiences: "Piece billed by one staff member" to `role:staff` except the billing user; "Parcel stopped (mismatch or raised problem)" to `role:owner`; "Edit proposed / token sent" to `role:owner`; "Edit applied" to the proposing staff member's user channel and `role:staff`; "Lead arrived / passed its SLA" to `role:staff` and `role:owner`; "Karigar job status changed" to `role:staff`, `role:owner` and the owning karigar's user channel; "Parcel handed over by karigar" to `role:staff`; "Tag saved on a shared parcel" to `parcel:<id>` except the saving user; "Metal pool changed" to `role:staff` and `role:owner`; "User deactivated or role changed" to that user's channel.
  2. Given a test that emits each of the 10 events once from a stub service function, when it runs against two staff, the owner and two karigars, then each connection receives exactly the events listed for it in criterion 1 and no others.
  3. Given an emitting function that names an event not in the list, when it runs, then the publisher refuses it and the CI test fails.
  4. Given "Piece billed by one staff member" for TAG-8841 billed by Deepak Rao, when it is delivered, then Rajesh Verma's `stock` screen stops showing TAG-8841 as available within about 1 second and Deepak's own screen gets its result from the API response, not the event.
  5. Given a proposed event from README gap G26 such as "Parcel released into stock", when it is accepted into the catalogue later, then it is added to the shared list with its audience and needs no change to the transport.
- **Rules enforced on the server:** The audience is set by the registry, not by the emitting function or the client. The EP-07-S5 permission filter still applies after routing. "Metal pool changed" goes to the roles allowed to open `order-copy`; karigars are excluded.
- **Live events emitted / consumed:** None of its own. Transports: "Piece billed by one staff member" (EP-26), "Parcel stopped (mismatch or raised problem)" (EP-23, EP-24), "Edit proposed / token sent" (EP-25), "Edit applied" (EP-25), "Lead arrived / passed its SLA" (EP-28, EP-29, EP-10), "Karigar job status changed" (EP-19, EP-20), "Parcel handed over by karigar" (EP-20), "Tag saved on a shared parcel" (EP-21), "Metal pool changed" (EP-18), "User deactivated or role changed" (EP-05).
- **Audit entry written:** No. Each emitting operation writes its own entry.
- **Data changes:** None in the product database. Adds the event registry (name, entity type, audience rule) to the shared package.
- **UI reference:** No screen of its own. Screens that react: `today`, `decisions`, `leads`, `stock`, `parcels`, `parcel-tag`, `parcel-match`, `order-copy` and `k-jobs` (epic section 12).
- **Non-functional checks:** Performance: each event reaches its audience within about 1 second of commit under normal shop load (FR-07-7). Security: audiences match PRODUCTION-SCOPE §1 and karigars receive only their own job and account events. Open question G26: which proposed events are added to the catalogue; this story fixes the 10 and leaves room for more. Open decision D7: role channels may be per branch.
- **Depends on:** EP-07-S1, EP-07-S2, EP-07-S4, EP-07-S5, EP-07-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-07-S12: Developer can test two browsers receiving each other's events

- **Story ID:** EP-07-S12
- **Title:** Developer can test two browsers receiving each other's events
- **As a:** Developer
- **I want:** an automated test that signs in two browsers as different staff on staging, makes a change in one and checks the other receives the event and refetches, plus a short manual demo script
- **So that:** the M1 milestone demo "two browsers receive each other's events live" is proven on every run, not only once (epic acceptance criterion 6, PRODUCTION-SCOPE §7)
- **Acceptance criteria (Given / When / Then):**
  1. Given two browsers signed in as Rajesh Verma and Deepak Rao on `stock`, when Deepak's browser triggers a "Piece billed by one staff member" test event for TAG-8841, then Rajesh's browser receives it and stops showing TAG-8841 as available within 1 second (epic acceptance criterion 1).
  2. Given the same two browsers, when Rajesh's browser is cut off from the network for 30 seconds while 3 events are published, then after reconnect it has received all 3 in order (epic acceptance criterion 3).
  3. Given both browsers open `parcel-tag` for BATCH-2026-044, when the test runs, then each sees the other's name (epic acceptance criterion 4).
  4. Given a karigar test browser signed in as Lakshmi Devi, when a job of Mahesh Soni changes status, then it receives nothing; and when the owner deactivates the second staff user, then that browser's connection closes within about 1 second (epic acceptance criteria 2 and 5).
  5. Given the test is part of the CI suite (EP-01-S8), when it fails, then the run fails and names which criterion failed.
- **Rules enforced on the server:** The test uses real sign-in and real sessions; no test-only bypass of authentication exists in staging. Test events are emitted through the outbox (EP-07-S1) by a stub service function available only in test and staging builds.
- **Live events emitted / consumed:** emitted (by the test stub): "Piece billed by one staff member", "Karigar job status changed", "User deactivated or role changed". consumed: the same, by the test browsers.
- **Audit entry written:** No for the stub test events. Yes for the deactivation step, written by EP-05-S14: actor, time, entity user, action, before, after.
- **Data changes:** None in the product database schema. The test seeds users Rajesh Verma, Deepak Rao, Lakshmi Devi and Mahesh Soni, piece TAG-8841 and parcel BATCH-2026-044 in staging through EP-02-S13.
- **UI reference:** No screen. The test drives routes `stock`, `parcel-tag` and `k-jobs`.
- **Non-functional checks:** Performance: the test asserts the 1-second delivery bound (BR-07-2). Security: the stub emitter is absent from production builds. Availability: the reconnect case proves catch-up.
- **Depends on:** EP-07-S7, EP-07-S8, EP-07-S10, EP-07-S11, EP-01-S8, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D3: WebSocket or Server-Sent Events? Presence needs two-way. Either way it is built in the Node API (D1, Option C), not taken from a platform. (EP-07-S1, S3, S8)
- D6: how does the live channel behave for a karigar phone that is offline for hours? (EP-07-S6, S7)
- D7: are channels scoped per branch? (EP-07-S2, S4, S8, S9, S11)
- What does presence mean exactly: "has the parcel open", or "is tagging an item now"? (EP-07-S8)
- How long is the replay buffer kept before a client must refetch everything? (EP-07-S7)
- G26: which proposed events (for example "Parcel released into stock", "Problem cleared", "Setting changed") are added to the catalogue? (EP-07-S9, S11)
