# EP-32: Owner Decisions home · stories

Epic document: [EP-32 Owner Decisions home](../epics/EP-32-owner-decisions-home.md)

Role note: stories where the server builds, counts or computes on its own use "System". The owner lands on `decisions`; staff and karigars never see it and every read here refuses them. The screen itself only reads; actions taken from a card (clear, apply, decide, chase) write their audit entries and emit their events through their own epics, and the rules panel writes through EP-13. No amount is read or shown. Weights are integers in units of 0.0001 g and shown to 4 decimals, so mockup figures such as "196.4 g", "612 g" and "447.162 g vs 447.300 g" are shown as "196.4000 g", "612.0000 g" and "447.1620 g vs 447.3000 g"; parcel gaps are shown in mg as on the mockups ("138 mg short"). The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff), and the karigars Mahesh Soni · KG-02, Lakshmi Devi · KG-01 and Vijay Kumar · KG-04. The worked example is BATCH-2026-044 from Mahesh Soni, stopped 138 mg short with 12 pieces held back. Routes `broadcast` (EP-34) and the wishes count (EP-33) belong to higher-numbered epics, so the stories here hide or zero what depends on them until those epics ship.

---

## EP-32-S1: System can build the owner's exception queue on the server

- **Story ID:** EP-32-S1
- **Status:** Not started
- **Title:** System can build the owner's exception queue on the server
- **As a:** System
- **I want:** one Read Owner exception queue operation that returns, in one call, the "blocking" cards (mismatched parcels, open raised problems, one edits card, one scrap card) and the "running late" cards (one late-leads card, one overdue-jobs card), each with a stable key, a kind, a block, a title, a detail line and one action (label, route id and parameters), plus the counts per block and the total
- **So that:** Decisions is built from the server in one call instead of from `ownerQueues` in the browser, and the owner sees only what nobody else may do (FR-32-2, FR-32-3, FR-32-7, BR-32-1, BR-32-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is `stopped` with verdict `mismatch` and no open problem, PR-101 is open on job MO-2026-118, 2 edit proposals are open, 1 scrap request is pending, 2 leads are past their SLA and 2 jobs are past their agreed date, when Sanjay Seth calls Read Owner exception queue, then one response holds 4 cards in block `blocking`, 2 cards in block `late`, `blockingCount` 4, `lateCount` 2 and `total` 6.
  2. Given each card in the response, when it is inspected, then it has `key`, `kind` (one of `parcel_mismatch`, `problem`, `edits`, `scrap`, `late_leads`, `overdue_jobs`), `block` (`blocking` or `late`), `title`, `detail` and an `action` with a `label` and a route id from `parcel-clear`, `edit-apply`, `scrap-decision`, `leads`, `karigars` or `stock`.
  3. Given BATCH-2026-045 is `stopped` and has an open raised problem, when the queue is built, then it appears once, as a `problem` card, and not as a `parcel_mismatch` card (FR-32-3).
  4. Given BATCH-2026-046 matched exactly and was released by staff, when the queue is built, then no card for it is returned (BR-32-1).
  5. Given the pipeline holds 40 parcels, 60 leads, 30 open jobs and 10 open problems on staging, when Read Owner exception queue is called, then it answers in under 2 seconds on a shop connection.
- **Rules enforced on the server:** Read Owner exception queue is Owner only (EP-05-S2, EP-32-S13). Cards are built on the server from `parcels`, `problems`, `edit_proposals`, `scrap_requests`, `leads` and `karigar_jobs`; the browser does not decide what is waiting. Counting follows the prototype: each mismatched parcel and each open problem counts 1, all edits count 1, all scrap requests count 1, late leads count 1 and overdue jobs count 1. Each card kind is filled by its own story (EP-32-S3 to EP-32-S6); this story owns the response shape, the counts and the single call. No value or price field is returned.
- **Live events emitted / consumed:** None. This story is the read; live refresh is EP-32-S12.
- **Audit entry written:** No. Reading the queue is not audited (epic section 13).
- **Data changes:** None in the product database. Adds Read Owner exception queue and the card shape to the shared contract. Ports `ownerQueues(s, now)` and its `blocking` and `late` counts from `src/store/selectors.ts` to the server.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("NOTHING MOVES UNTIL YOU ANSWER · 4", "RUNNING LATE · 2"), route `decisions`.
- **Non-functional checks:** Performance: one aggregated read, under 2 seconds (epic section 13). Security: Owner only on the server. D7 is decided: one shop, no branches; the queue covers the shop.
- **Depends on:** EP-03-S1, EP-03-S2, EP-03-S3, EP-05-S2, EP-23-S2, EP-23-S7, EP-24-S1, EP-24-S8, EP-25-S1, EP-25-S4, EP-27-S1, EP-27-S5, EP-28-S8, EP-28-S9, EP-19-S9, EP-19-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S2: Owner can land on Decisions after sign-in

- **Story ID:** EP-32-S2
- **Status:** Not started
- **Title:** Owner can land on Decisions after sign-in
- **As a:** Owner
- **I want:** to arrive on `decisions` straight after signing in, with a header that counts what is waiting ("Six things are waiting on you"), the line "Only what nobody else may do. A parcel that matches never appears on this screen." and the date in Asia/Kolkata, loaded from the EP-08 data layer
- **So that:** my day starts on the exceptions only, and I am pulled in only where nobody else may act (FR-32-1, BR-32-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth (Owner) signs in, when the session is created, then the app opens route `decisions` (EP-04-S6), while Rajesh Verma (Staff) still lands on `today` and a karigar on `k-jobs`.
  2. Given the queue `total` is 6, when `decisions` loads, then the header reads "Six things are waiting on you"; given `total` is 1, then it reads "One thing is waiting on you"; given `total` is 0, then it reads "Nothing needs you".
  3. Given it is 08:35 on 1 November 2026 in Asia/Kolkata and the server clock is 03:05 UTC, when `decisions` loads, then the date line reads "Sunday, 1 November 2026".
  4. Given Read Owner exception queue has not answered, when the screen is shown, then a loading state appears (EP-08-S3); given the read fails, then the error and "Try again" appear (EP-08-S4), not the empty state.
  5. Given the connection drops while `decisions` is open, when it is down, then "Reconnecting…" shows (EP-08-S10) and card actions that write are disabled (EP-08-S11).
- **Rules enforced on the server:** The landing route comes from the role in the session (EP-04-S6), not from the browser. The header count is `total` from Read Owner exception queue, not counted in the browser. "Today" uses Asia/Kolkata (EP-10-S10).
- **Live events emitted / consumed:** None. Landing reads only.
- **Audit entry written:** No. Sign-in is audited by EP-04-S14; opening a screen is not audited.
- **Data changes:** None in the product database. Moves `src/components/home/OwnerDecisions.tsx` off `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("Six things are waiting on you", "Only what nobody else may do. A parcel that matches never appears on this screen."), `docs/ux/mockups/08-owner-home.svg` ("Three things need you, Sanjay", "Sunday, 1 November 2026"), route `decisions`. The mockups' "Owner · switch" is replaced by the account menu (EP-08-S14).
- **Non-functional checks:** Performance: `decisions` loads under 2 seconds on a shop connection. Time: date in Asia/Kolkata. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Security: the route is offered to the Owner only (EP-08-S13).
- **Depends on:** EP-04-S6, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S12, EP-08-S13, EP-08-S17, EP-10-S10, EP-32-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S3: Owner can see mismatched parcels with the karigar's recent average

- **Story ID:** EP-32-S3
- **Status:** Not started
- **Title:** Owner can see mismatched parcels with the karigar's recent average
- **As a:** Owner
- **I want:** one blocking card per parcel stopped with verdict `mismatch` and no open raised problem, showing the parcel, karigar, gap in mg, pieces held back, measured against expected pure gold, the stop time and the karigar's average gap over his last six parcels, with "Open it" to `parcel-clear`
- **So that:** I can judge in one look whether this parcel is unusual for this karigar before I open it (FR-32-4, FR-32-7, epic acceptance criterion 1)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 from Mahesh Soni is `stopped` with verdict `mismatch`, a pure gold gap of −1380 units, 12 tagged pieces, measured pure gold 4471620 units against 4473000 expected and `stoppedAt` 09:12 Asia/Kolkata, when Sanjay Seth opens `decisions`, then a card reads "BATCH-2026-044 will not weigh up · 138 mg short" with detail "Mahesh Soni · 12 pieces frozen · 447.1620 g vs 447.3000 g expected · submitted 09:12" (epic acceptance criterion 1).
  2. Given Mahesh Soni's last six released parcels had gold gaps averaging 310 units, when the card is built, then it adds the line "His last six parcels averaged 31 mg. Staff cannot release this one, only you can."
  3. Given a karigar has only 2 released parcels, when the card is built, then the line reads "His last 2 parcels averaged …"; given he has none, then the line is left out.
  4. Given the card is shown, when Sanjay presses "Open it", then `parcel-clear` opens for BATCH-2026-044, and the badge counts this card as 1.
  5. Given Sanjay sends BATCH-2026-044 back, re-checks a tag or accepts the loss (EP-23-S9 to EP-23-S11), when the queue is read again, then no card for it is returned.
- **Rules enforced on the server:** A mismatch card is built only for `status = stopped`, verdict `mismatch`, no resolution and no open problem on the parcel. Gap, measured and expected pure gold come from the stored EP-23 verdict, never recomputed in the browser. The average comes from the EP-16-S10 last six gaps through Read Karigar recent gaps (EP-23-S13), as an integer mean rounded half up to whole mg. Release, send back and accept loss are not offered on the card; they stay on `parcel-clear`.
- **Live events emitted / consumed:** None in this story; EP-32-S12 consumes "Parcel stopped (mismatch or raised problem)" to add this card.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Builds the `parcel_mismatch` card inside Read Owner exception queue; replaces `Karigar.gapsMg` seed data with the server read of released parcel gaps.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("BATCH-2026-044 will not weigh up · 138 mg short", "Mahesh Soni · 12 pieces frozen · 447.162 g vs 447.300 g expected · submitted 09:12", "His last six parcels averaged 31 mg.", "Open it"), `docs/ux/mockups/08-owner-home.svg` ("PARCEL DOES NOT MATCH", "His last 6 parcels averaged 31 mg loss. This one is four times that."), route `decisions`. The mockup 08 buttons "Release to the floor" and "Send it back" stay on `parcel-clear`; the card offers "Open it" only.
- **Non-functional checks:** Precision: gap, measured and expected pure gold are integers in units of 0.0001 g; the gap and average are shown in mg and weights to 4 decimals. Time: "submitted 09:12" is the server `stoppedAt` in UTC shown in Asia/Kolkata. Security: the karigar's gap history is Owner only.
- **Depends on:** EP-32-S1, EP-23-S2, EP-23-S7, EP-23-S9, EP-23-S10, EP-23-S11, EP-23-S13, EP-16-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S4: Owner can see raised problems and clear them from the card

- **Story ID:** EP-32-S4
- **Status:** Not started
- **Title:** Owner can see raised problems and clear them from the card
- **As a:** Owner
- **I want:** one blocking card per open raised problem, oldest first, saying who stopped which parcel, job or piece, with their text quoted and the time raised, and a "Clear it and start again" button that clears it through EP-24
- **So that:** a stop raised by anyone, including a karigar at the bench, reaches me with the reason and I can restart the work in one tap (FR-32-2, FR-32-3, FR-32-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given PR-101 was raised by Vijay Kumar on MO-2026-118 at 08:40 Asia/Kolkata with text "Two kemp stones cracked while setting. I need a replacement before I can finish.", when Sanjay Seth opens `decisions`, then a card reads "Vijay Kumar stopped his own job MO-2026-118" with that text in quotes and "Raised from the bench 08:40 · due today · a karigar can stop the line too".
  2. Given Deepak Rao raised a problem on BATCH-2026-045, when the queue is built, then a card reads "Deepak Rao stopped parcel BATCH-2026-045" and there is no mismatch card for that parcel.
  3. Given the card for PR-101, when Sanjay presses "Clear it and start again", then Update Clear problem (EP-24-S9) runs, PR-101 is `cleared` and the card is gone after the refetch (EP-08-S7).
  4. Given PR-101 was cleared on another device a moment earlier, when Sanjay presses "Clear it and start again", then clearing is a no-op and the card is gone after the refetch, with no error shown.
  5. Given a parcel problem card, when Sanjay presses "Open it" instead, then `parcel-clear` opens for that parcel; for a piece problem `stock` opens with `pieceId`.
- **Rules enforced on the server:** Problem cards come from List Open problems (EP-24-S8), oldest first. Clearing is Update Clear problem, Owner only, which restores the target only when no other open problem remains (EP-24-S9, EP-24-S10). The card holds no rule of its own; staff calling clear are refused by EP-24-S9.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Problem raised on a job or piece", "Problem cleared" (proposed, G26). Emitted: none here; the clear emits through EP-24-S12.
- **Audit entry written:** No by this story. The clear is audited by EP-24-S13 with actor, time, problem, target, before and after state.
- **Data changes:** None in the product database by this story; the clear updates `problems` and the target as EP-24-S9 states. Builds the `problem` card inside Read Owner exception queue and moves `ProblemCard` in `OwnerDecisions.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("Vijay Kumar stopped his own job MO-2026-118", "Raised from the bench 08:40 · due today · a karigar can stop the line too", "Open it"), route `decisions`. The "Clear it and start again" button follows the prototype and is not drawn on the mockup.
- **Non-functional checks:** Concurrency: two owner devices clearing the same problem change it once (EP-24-S9). Time: "08:40" is the server `raisedAt` shown in Asia/Kolkata. Security: clear is Owner only on the server.
- **Depends on:** EP-32-S1, EP-24-S8, EP-24-S9, EP-24-S10, EP-24-S12, EP-24-S13, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S5: Owner can see open edit proposals and scrap requests as one card each

- **Story ID:** EP-32-S5
- **Status:** Not started
- **Title:** Owner can see open edit proposals and scrap requests as one card each
- **As a:** Owner
- **I want:** one blocking card for all open edit proposals that names up to 3 of them, and one blocking card for all pending scrap requests, with "Read them" opening `edit-apply` and "Decide" opening `scrap-decision`
- **So that:** routine requests from staff do not crowd the screen, and each kind still waits for my answer (FR-32-5, FR-32-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma proposed 40 mg off TAG-8841 and Deepak Rao proposed a stone count change on TAG-9012, when Sanjay Seth opens `decisions`, then one card reads "2 edits proposed on tags in stock" with detail "Rajesh wants 40 mg off TAG-8841 · Deepak wants the stone count changed on TAG-9012" and the line "You read the change, a token comes to your WhatsApp, and you apply it. Staff never touch the field."
  2. Given 5 proposals are open, when the card is built, then it reads "5 edits proposed on tags in stock", names the 3 oldest and ends "and 2 more", and the badge counts the card as 1.
  3. Given Rajesh asked for scrap on the Temple Nakshi Haram, 108 days unsold, with 784000 units of pure gold, when the queue is built, then one card reads "1 piece to be marked as scrap" with detail "Temple Nakshi Haram · 108 days unsold · 78.4000 g pure gold · asked by Rajesh" and the line "Marking it scrap closes the piece and puts its gold back in the metal pool to issue again."
  4. Given the edits card, when Sanjay presses "Read them", then `edit-apply` opens; given the scrap card, when he presses "Decide", then `scrap-decision` opens.
  5. Given the last proposal is applied or refused and the last scrap request is decided, when the queue is read, then neither card is returned.
- **Rules enforced on the server:** The edits card lists proposals in state `proposed` or `token_sent` from EP-25-S4, oldest first, at most 3 named. A proposal voided by a sale or scrap (EP-25-S11) is not counted. The scrap card lists `requested` scrap requests from EP-27-S5, with days in stock in Asia/Kolkata calendar days. Each card counts 1 in `blockingCount` regardless of how many items it holds.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Edit proposed / token sent", "Edit applied"; proposed (G26): "Scrap requested", "Piece scrapped". Emitted: none.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Builds the `edits` and `scrap` cards inside Read Owner exception queue, replacing `pendingEdits` and `pendingScrap` from `ownerQueues`.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("2 edits proposed on tags in stock", "Read them", "1 piece to be marked as scrap", "Temple Nakshi Haram · 108 days unsold · 78.400 g pure gold · asked by Rajesh", "Decide"), `docs/ux/mockups/08-owner-home.svg` ("STAFF WANTS A CODE", "Rajesh wants to shave 40 mg off TAG-2026-8841"), route `decisions`. The mockup 08 "Send the code" and "Refuse" buttons stay on `edit-apply`.
- **Non-functional checks:** Precision: pure gold on the scrap card is an integer in units of 0.0001 g shown to 4 decimals; the edit weight change is shown in mg. Time: days in stock use Asia/Kolkata calendar days.
- **Depends on:** EP-32-S1, EP-25-S4, EP-25-S11, EP-27-S4, EP-27-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S6: Owner can see late leads and overdue jobs under Running late

- **Story ID:** EP-32-S6
- **Status:** Not started
- **Title:** Owner can see late leads and overdue jobs under Running late
- **As a:** Owner
- **I want:** a "RUNNING LATE · THE CLOCK TOLD ME, NOT A PERSON" block with one card for leads past their SLA, naming each lead and hours waiting with "See leads", and one card for karigar jobs past their agreed date, naming each karigar and days over with "See tracker"
- **So that:** I see what the clock has flagged without anyone having to tell me (FR-32-6, BR-32-3, BR-32-6, BR-32-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the lead SLA is 8 hours and the "Sharma wedding enquiry" has waited 11 hours and the "bulk chain order from Erode" 9 hours without being opened, when Sanjay Seth opens `decisions`, then a card reads "2 leads nobody has opened for over 8 hours" with detail "Sharma wedding enquiry (11 h) · bulk chain order from Erode (9 h)" and "See leads" opens `leads`.
  2. Given Mahesh Soni's job is 3 days past its agreed date and Lakshmi Devi's 1 day, both reminded today, when the queue is built, then a card reads "2 karigar jobs past their agreed date" with detail "Mahesh Soni 3 days over · Lakshmi Devi 1 day over · both reminded automatically" and "See tracker" opens `karigars` (EP-19-S10).
  3. Given a job has `confirmedDate` 28 October and `dueDate` 25 October, when today is 1 November in Asia/Kolkata, then it is 4 days over, using the confirmed date before the due date (BR-32-8).
  4. Given the owner changes the SLA from 8 to 6 hours (EP-13-S4), when the queue is read, then the card text says "over 6 hours" and a lead waiting 7 hours is now listed.
  5. Given no lead is past its SLA and no job is past its date, when the queue is built, then the block heading reads "RUNNING LATE · 0" and neither card is returned.
- **Rules enforced on the server:** Late leads come from the server SLA computation (EP-28-S8, EP-28-S9) with the SLA hours from settings (EP-13-S4); `converted` and `lost` leads are never listed. Overdue jobs come from Read Overdue jobs summary (EP-19-S10), worst first. Each card counts 1 in `lateCount`. Whether hours are shop hours or clock hours is decided by EP-28-S8 (A2).
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Lead arrived / passed its SLA", "Karigar job status changed", "Setting changed" and "Job passed its agreed date" (proposed, G26). Emitted: none.
- **Audit entry written:** No. Reads are not audited. Marking a lead late is audited by EP-10-S12.
- **Data changes:** None in the product database. Builds the `late_leads` and `overdue_jobs` cards inside Read Owner exception queue, replacing `lateLeads` and `overdueJobs` from `ownerQueues`.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("RUNNING LATE · 2 · THE CLOCK TOLD ME, NOT A PERSON", "2 leads nobody has opened for over 8 hours", "See leads", "2 karigar jobs past their agreed date", "See tracker"), route `decisions`.
- **Non-functional checks:** Time: hours waiting from the server clock; days over in Asia/Kolkata calendar days. Open decision A2: whether the SLA counts shop hours or clock hours; the card shows whatever EP-28-S8 returns. Open decision A3: who hears first and how long before the owner; this card shows every lead past the SLA regardless of who was told first.
- **Depends on:** EP-32-S1, EP-28-S8, EP-28-S9, EP-19-S9, EP-19-S10, EP-13-S4, EP-10-S5, EP-10-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S7: Owner can see what went through without him today

- **Story ID:** EP-32-S7
- **Status:** Not started
- **Title:** Owner can see what went through without him today
- **As a:** Owner
- **I want:** one Read Went through today operation and a "WENT THROUGH WITHOUT YOU TODAY · NO BUTTONS HERE" block that lists the parcels released today without a loss, their piece count and pure gold, the pieces out today and the wishes sent today, with no actions
- **So that:** I can see the system working without me, and notice when this block is short while the first one is long (FR-32-8, BR-32-4, epic acceptance criterion 2)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-046 matched and was released by Rajesh Verma at 10:15 today, when Sanjay Seth opens `decisions`, then it appears only in this block and has no button, and no card for it is in the other blocks (epic acceptance criterion 2).
  2. Given 3 parcels were released today with no loss, holding 35 pieces and 12840000 units of pure gold, when the block is shown, then it reads "3 parcels went live this morning without you" with "35 pieces · 1,284.0000 g pure gold · all three matched, so the staff who tagged them released them".
  3. Given 11 pieces were stocked out since midnight Asia/Kolkata, when the block is shown, then it reads "11 pieces went out · 0 wishes sent" until EP-33 records sent wishes, and "11 pieces went out · 4 wishes sent" once it does.
  4. Given a parcel was released yesterday at 23:50 Asia/Kolkata, or released today with an accepted loss (EP-23-S11), when the block is read, then that parcel is not counted.
  5. Given the block is shown, when it is read, then it ends with the note "This block should be the long one. If it is ever short while the first block is long, something upstream is wrong, not your rule."
- **Rules enforced on the server:** Read Went through today is Owner only (EP-05-S2). A parcel counts when it was released between midnight and now Asia/Kolkata with no loss accepted (the prototype's `lossG === null`). Pure gold is an integer sum on the server. Pieces out today come from the stock-outs of EP-26-S13. Wishes sent today come from the EP-33 sent-wish records and are 0 until those exist. No action is returned.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Piece billed by one staff member" and "Parcel released into stock" (proposed, G26). Emitted: none.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Went through today to the shared contract, replacing the released-today filter and the pieces-out and wishes-sent counts in `OwnerDecisions.tsx`.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("WENT THROUGH WITHOUT YOU TODAY · NO BUTTONS HERE", "3 parcels went live this morning without you", "35 pieces · 1,284 g pure gold", "11 pieces went out · 4 wishes sent", "This block should be the long one."), route `decisions`.
- **Non-functional checks:** Precision: pure gold is an integer sum in units of 0.0001 g, shown to 4 decimals. Time: "today" starts at midnight Asia/Kolkata (EP-10-S10); "this morning" is used before 12:00 and "today" after. Performance: under 2 seconds with the queue.
- **Depends on:** EP-32-S1, EP-23-S4, EP-23-S5, EP-23-S8, EP-23-S11, EP-26-S13, EP-10-S10, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S8: Owner can change the alert rules from the rules panel

- **Story ID:** EP-32-S8
- **Status:** Not started
- **Title:** Owner can change the alert rules from the rules panel
- **As a:** Owner
- **I want:** a "THE RULES BEHIND THESE ALERTS" panel on `decisions` that shows and changes the lead SLA hours, who hears about a late lead ("Staff first, then me" or "Only me"), how it reaches me (WhatsApp, In the app, Email) and the "Code before a tag edit" rule, saving through the EP-13 settings operations, plus the fixed line "A parcel comes to me when it does not match exactly · Nothing for you to set"
- **So that:** I can tune the alerts where I see them, and only I can (FR-32-9, BR-32-5, BR-32-9, epic acceptance criterion 4)
- **Acceptance criteria (Given / When / Then):**
  1. Given `leadSlaHours` is 8, when Sanjay Seth changes "A lead is late after" to 6 and saves, then Update Setting (EP-13-S4) stores 6, the panel shows 6, and the late-leads card is rebuilt with 6 hours.
  2. Given Rajesh Verma (Staff) calls the settings update for `leadSlaHours` directly, when it reaches the server, then it is refused through EP-13-S2 and the value stays 8 (epic acceptance criterion 4).
  3. Given `lateLeadAudience` is "staff_first", when Sanjay picks "Only me" and saves, then the stored value changes and the audit entry reads the old and new value (EP-13-S3, EP-13-S5).
  4. Given Sanjay turns Email off and leaves WhatsApp and In the app on, when he saves, then `notifyChannels` holds WhatsApp and in-app only (EP-13-S6); given he tries to turn all three off, then the server's sentence from EP-13-S6 is shown (EP-08-S5).
  5. Given the panel is shown, when the match rule line is read, then it says "Nothing for you to set. Every item tagged, and gross, stone and net all agree, or I see it." and has no control.
- **Rules enforced on the server:** Every change is an EP-13 settings update, Owner only (EP-13-S2), validated and audited there (EP-13-S3). `setSetting` without an owner check (G12) is removed. The match rule has no stored setting (BR-32-5). The edit-token switch accepts only the values G18 allows (EP-13-S10). A stale save, made against an older settings version, is refused as a conflict (EP-03-S5).
- **Live events emitted / consumed:** Consumed: "Setting changed" (proposed, G26), so the panel refreshes when the owner changes a rule on another device. Emitted: none here; "Setting changed" is emitted by EP-13-S14.
- **Audit entry written:** No by this story. Each change is audited by EP-13-S3 with actor, time, setting, before and after.
- **Data changes:** None in the product database by this story; updates `settings.leadSlaHours`, `lateLeadAudience`, `notifyChannels` and `requireEditToken` through EP-13. Moves `RulesPanel` in `OwnerDecisions.tsx` off `setSetting` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("THE RULES BEHIND THESE ALERTS", "A lead is late after 8 hours", "shop hours, not clock hours", "A parcel comes to me when it does not match exactly", "Who hears about a late lead · Staff first, then me · Only me", "How it reaches me · WhatsApp · In the app · Email"), `docs/ux/mockups/08-owner-home.svg` ("YOUR RULE · Code before a tag edit · Staff must get your WhatsApp code first. · On"), route `decisions`.
- **Non-functional checks:** Security: owner check on the server for every rule (BR-32-9, G12). Audit: every change audited by EP-13. Concurrency: version check on save. Open decision A2: the "shop hours, not clock hours" choice is shown only after A2 is decided and EP-13-S11 stores shop hours; until then the panel shows hours only. Open decision G18: whether the edit-token switch can be turned off.
- **Depends on:** EP-32-S2, EP-13-S2, EP-13-S3, EP-13-S4, EP-13-S5, EP-13-S6, EP-13-S10, EP-13-S11, EP-13-S14, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S9: Owner can see where the gold is right now

- **Story ID:** EP-32-S9
- **Status:** Not started
- **Title:** Owner can see where the gold is right now
- **As a:** Owner
- **I want:** one Read Gold locations operation and a "WHERE THE GOLD IS RIGHT NOW" block showing gold on the floor with its piece count, gold with karigars with open and past-date job counts, the metal pool balance and pieces out today, all as grams from integer sums
- **So that:** I know where every gram is without opening the ledger (FR-32-10, BR-32-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given 42 `in_stock` pieces whose pure gold sums to 18472000 units, when Sanjay Seth opens `decisions`, then "Gold on the floor" reads "1,847.2000 g" with "42 pieces, ready to sell".
  2. Given 7 open jobs with gold issued less returned summing to 6120000 units, 2 of them past their agreed date, when the block is shown, then "Gold with karigars" reads "612.0000 g" with "7 open jobs · 2 past their date".
  3. Given the metal pool balance is 12505000 units (EP-18-S1), when the block is shown, then "Metal pool" reads "1,250.5000 g"; and "Pieces out today" equals the count from EP-26-S13 since midnight Asia/Kolkata.
  4. Given the response is inspected, when its fields are read, then it holds only counts and integer weights in units of 0.0001 g, and no rupee value.
  5. Given "Metal lost this month" has no agreed definition, when the block is shown, then that figure is not shown; and "Pieces that went out in October" is not shown here (EP-35).
- **Rules enforced on the server:** Read Gold locations is Owner only (EP-05-S2). Gold on the floor comes from EP-22-S10, gold with karigars from the custody summary (EP-18-S11), past-date counts from EP-19-S10, the pool balance from EP-18-S1, pieces out today from EP-26-S13. All sums are integer sums on the server. No value field is returned.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Piece billed by one staff member", "Karigar job status changed", "Metal pool changed" and "Parcel released into stock" (proposed, G26). Emitted: none.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Gold locations to the shared contract, replacing `pureGoldOnFloor`, the gold-with-karigars sum, the pool balance and `piecesOutToday` selectors used by `OwnerDecisions.tsx`.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg` ("WHERE THE GOLD IS RIGHT NOW", "Gold on the floor 1,847 g · 42 pieces, ready to sell", "Gold with karigars 612 g · 7 open jobs · 2 past their date", "Metal lost this month 0.71% · 4.3 g across all jobs · under your 0.8% allowance"), route `decisions`. The metal pool balance tile is not drawn; it uses the same tile.
- **Non-functional checks:** Precision: every weight is an integer sum in units of 0.0001 g, formatted to 4 decimals only for display. Time: "today" starts at midnight Asia/Kolkata. Performance: returns in under 2 seconds. Open question: how "Metal lost this month" is defined (mockup 08: 0.71%, 4.3 g across all jobs); the tile is added once it is answered. D7 is decided: the figures are for the shop.
- **Depends on:** EP-32-S2, EP-22-S10, EP-18-S1, EP-18-S11, EP-19-S10, EP-26-S13, EP-10-S10, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S10: Owner can see karigars worst first (G4)

- **Story ID:** EP-32-S10
- **Status:** Not started
- **Title:** Owner can see karigars worst first (G4)
- **As a:** Owner
- **I want:** a "KARIGARS, WORST FIRST" block listing karigars over their wastage allowance first, each with code, specialties, open jobs, metal loss, days late and rating, with "Open ledger", and the karigars inside their allowance summarised in one line
- **So that:** I chase the karigar who is losing metal or running late, and skip the ones who are fine (FR-32-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Mahesh Soni · KG-02 has metal loss 142 basis points against an allowance of 80, 3 open jobs and +3.2 days late, when Sanjay Seth opens `decisions`, then a row reads "Mahesh Soni · KG-02 · Kundan and Polki · 3 open jobs" with "Metal loss 1.42%" and "Delivers +3.2 days late".
  2. Given Lakshmi Devi and Vijay Kumar are both inside their allowance, when the block is shown, then one line reads "Lakshmi Devi and Vijay Kumar are both inside their allowance. Nothing to do there."
  3. Given two karigars are over their allowance, when the block is shown, then they are ordered by loss minus allowance from highest to lowest, as on `karigars` (EP-16-S9).
  4. Given the G4 rating formula is not decided, when a row is shown, then the "Rating" figure is left out; once EP-16-S10 returns a rating, it shows as "3.4 / 5".
  5. Given the row for Mahesh, when Sanjay presses "Open ledger", then `karigars` opens with Mahesh's scorecard (EP-16-S11); and "All 9" opens the full directory.
- **Rules enforced on the server:** List Karigars worst first is Owner only (EP-05-S2). Loss, days late and rating come only from the EP-16-S10 computation on stored rows; seed numbers are not used. Ordering uses integer basis points. A deactivated karigar with no open jobs is not listed.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Karigar job status changed" and "Parcel released into stock" (proposed, G26), which change loss and lateness. Emitted: none.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds List Karigars worst first to the shared contract, replacing the `metalLossPct > wastagePct` filter and seed `rating` and `lateDays` in `OwnerDecisions.tsx`.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg` ("KARIGARS, WORST FIRST", "All 9", "Mahesh Soni · KG-02", "Kundan and Polki · 3 open jobs", "Metal loss 1.42%", "Delivers +3.2 days late", "Rating 3.4 / 5", "Open ledger", "Lakshmi Devi and Vijay Kumar are both inside their allowance. Nothing to do there."), route `decisions`.
- **Non-functional checks:** Precision: loss in integer basis points shown to 2 decimals; days late from the EP-16-S10 computation. Open decision G4: how the rating is computed and what period loss and lateness cover; the rating stays hidden until it is decided (epic section 16).
- **Depends on:** EP-32-S2, EP-16-S9, EP-16-S10, EP-16-S11, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S11: Owner can see gold sitting too long and act on it (G5)

- **Story ID:** EP-32-S11
- **Status:** Not started
- **Title:** Owner can see gold sitting too long and act on it (G5)
- **As a:** Owner
- **I want:** one Read Ageing alert operation and a "GOLD SITTING TOO LONG" card that, when `in_stock` pieces have not moved for `ageingThresholdDays`, shows their total pure gold, piece count, main style and the oldest age, with "Push on WhatsApp" and "Melt and remake"
- **So that:** gold tied up on the floor is pushed to customers or remade instead of sitting unnoticed (FR-32-12, FR-32-13, BR-32-11, epic acceptance criterion 5)
- **Acceptance criteria (Given / When / Then):**
  1. Given `ageingThresholdDays` is 90 and 6 `in_stock` pieces, mostly Temple style, with pure gold summing to 1964000 units have been in stock longer, the oldest 108 days, when Sanjay Seth opens `decisions`, then the card reads "196.4000 g of gold has not moved in 90 days" with "6 pieces, mostly Temple style · tied up on the floor · oldest is 108 days" (epic acceptance criterion 5).
  2. Given the card, when Sanjay presses "Melt and remake", then the aged-pieces pick list of EP-27-S9 opens with those 6 pieces oldest first.
  3. Given the `broadcast` route (EP-34) is not yet shipped, when the card is shown, then "Push on WhatsApp" is hidden; once it ships, the button opens `broadcast` with the 6 piece ids.
  4. Given `ageingThresholdDays` is empty (EP-13-S8), or no `in_stock` piece is older than it, when `decisions` loads, then no ageing card is shown.
  5. Given a piece is sold or scrapped, when the alert is read again, then it is no longer counted and the total falls by its pure gold.
- **Rules enforced on the server:** Read Ageing alert is Owner only (EP-05-S2). Days in stock are counted on the server in Asia/Kolkata calendar days from the time the piece entered `in_stock` (EP-22-S1, EP-22-S11). Only `in_stock` pieces count. The total is an integer sum. The threshold is the EP-13-S8 setting; no default is assumed. "Mostly <style>" names the style held by the most aged pieces. The alert does not count in the badge or `blockingCount`.
- **Live events emitted / consumed:** Consumed in EP-32-S12: "Piece billed by one staff member", "Setting changed" and "Piece scrapped" (proposed, G26). Emitted: none.
- **Audit entry written:** No. Reads are not audited. Scrap requests started from the card are audited by EP-27-S11.
- **Data changes:** None in the product database. Adds Read Ageing alert to the shared contract; the prototype has no ageing alert.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg` ("GOLD SITTING TOO LONG", "196.4 g of gold has not moved in 90 days", "6 pieces, mostly Temple style · tied up on the floor · oldest is 108 days", "Push on WhatsApp", "Melt and remake"), route `decisions`.
- **Non-functional checks:** Precision: total pure gold is an integer sum in units of 0.0001 g, shown to 4 decimals. Time: ageing days in Asia/Kolkata calendar days. Performance: the ageing read is part of the under 2 second load. Open decision G5: the threshold value and whether it is per style or global; the card stays off until the owner sets `ageingThresholdDays`.
- **Depends on:** EP-32-S2, EP-13-S8, EP-22-S1, EP-22-S11, EP-27-S9, EP-10-S10, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S12: Owner can see the badge and cards update live

- **Story ID:** EP-32-S12
- **Status:** Not started
- **Title:** Owner can see the badge and cards update live
- **As a:** Owner
- **I want:** the Decisions rail badge to show the queue `total`, and the cards, the "went through" block, the gold locations, the karigars and the ageing card to refetch within about 1 second when a relevant live event arrives, and to catch up after a dropped connection
- **So that:** a new exception reaches me while the screen is open, without a reload (FR-32-14, epic acceptance criterion 3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is on `decisions` with the badge at 3, when Rajesh Verma proposes an edit and "Edit proposed / token sent" arrives, then the edits card appears and the badge shows 4 within about 1 second (epic acceptance criterion 3).
  2. Given BATCH-2026-044 is stopped, when "Parcel stopped (mismatch or raised problem)" arrives, then its mismatch card appears and the badge rises by 1; given a problem is cleared, when "Problem cleared" arrives, then its card goes and the badge falls by 1.
  3. Given Deepak Rao stocks out a piece with 41.5900 g of pure gold, when "Piece billed by one staff member" arrives, then "Gold on the floor" falls by 41.5900 g and "11 pieces went out" becomes "12 pieces went out".
  4. Given the owner is on another screen, when a lead passes its SLA, then the Decisions badge on the rail updates from the server badge-count read (EP-08-S16).
  5. Given the connection drops for 2 minutes and a parcel is stopped meanwhile, when it returns, then "Reconnecting…" shows while down, and on return the queue and badge are refetched so the new card is there (EP-07-S7, EP-08-S10).
- **Rules enforced on the server:** Events reach the owner only through the EP-07-S5 permission filter. The Decisions badge is `total` from Read Owner exception queue, served through the badge-count read (EP-07-S9); the browser never adds to it. On each event the client refetches the affected reads; cards are never patched from the event payload alone.
- **Live events emitted / consumed:** Consumed: "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Edit applied", "Lead arrived / passed its SLA", "Karigar job status changed", "Metal pool changed", "Piece billed by one staff member"; proposed (G26): "Problem raised on a job or piece", "Problem cleared", "Scrap requested", "Piece scrapped", "Parcel released into stock", "Job passed its agreed date", "Setting changed". Emitted: none.
- **Audit entry written:** No. This screen only reads.
- **Data changes:** None in the product database. Adds the `decisions` reads to the event-to-read map in the EP-08 data layer (EP-08-S8) and moves the Decisions count in `railBadges` to the server badge-count read.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` (rail "Decisions 6"), `docs/ux/mockups/08-owner-home.svg` (rail "Decisions 3"), route `decisions`.
- **Non-functional checks:** Performance: a new exception appears within about 1 second (epic section 13); a burst of events is coalesced into one refetch per short interval. Availability: "Reconnecting…" and catch-up from the last sequence number (EP-07-S7, EP-08-S10). Concurrency: two owner devices show the same badge after the same event. Open question G21: whether Decisions is the owner's notification centre; this story keeps the badge to cards on this screen only.
- **Depends on:** EP-32-S1, EP-32-S7, EP-32-S9, EP-32-S10, EP-32-S11, EP-07-S5, EP-07-S7, EP-07-S9, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10, EP-08-S16, EP-23-S7, EP-24-S11, EP-24-S12, EP-25-S5, EP-26-S11, EP-27-S10, EP-28-S13, EP-18-S12, EP-19-S7, EP-13-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-32-S13: System can refuse the Decisions queue to any role but owner

- **Story ID:** EP-32-S13
- **Status:** Not started
- **Title:** System can refuse the Decisions queue to any role but owner
- **As a:** System
- **I want:** every Decisions read (Owner exception queue, Went through today, Gold locations, Karigars worst first, Ageing alert, the Decisions badge count and the Decisions updates subscription) to refuse any caller whose role is not Owner, and the `decisions` route not to be offered to them
- **So that:** staff and karigars cannot see the owner's queue, the karigar figures or the gold totals, even by calling the server directly (FR-32-16, BR-32-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff) calls Read Owner exception queue directly, when it reaches the server, then it is refused through EP-05-S2 with the refusal format of EP-03-S4 and no card is returned.
  2. Given Vijay Kumar (Karigar) calls Read Gold locations or List Karigars worst first, when it reaches the server, then it is refused and no figure is returned.
  3. Given Rajesh types the `decisions` route, when the app opens it, then the route is not offered and he is sent to `today` (EP-08-S13).
  4. Given Rajesh's live connection, when a "Parcel stopped (mismatch or raised problem)" event is published, then he does not receive the Decisions badge count, and his rail shows no Decisions item (EP-07-S5, EP-07-S9).
  5. Given Sanjay Seth's role is changed from Owner to Staff while `decisions` is open (EP-05-S6), when the next read is made, then it is refused and his sessions are ended as EP-04-S13 states.
- **Rules enforced on the server:** All Decisions reads and the subscription are in the Owner-only list of the fixed permission table (EP-05-S1) and checked on every call (EP-05-S2). The role comes from the session, never from the request. Refusals use the shared error format.
- **Live events emitted / consumed:** None emitted. The subscription filter of EP-07-S5 drops Decisions updates for non-owners.
- **Audit entry written:** No. Refused reads are not audited; reading the queue is not audited (epic section 13).
- **Data changes:** None in the product database. Adds the Decisions operations to the Owner-only entries of the permission list in the shared package.
- **UI reference:** No screen. The refusal happens on the server; route hiding uses the shell of EP-08-S13.
- **Non-functional checks:** Security: owner-only on the server for every read and the subscription (epic section 13); tests call each operation as Staff and as Karigar and expect refusal.
- **Depends on:** EP-05-S1, EP-05-S2, EP-05-S6, EP-03-S4, EP-04-S13, EP-07-S5, EP-07-S9, EP-08-S13, EP-32-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- G5: what ageing threshold marks gold as sitting too long (mockup 08 shows 90 days), and is it per style or global? (EP-32-S11)
- G4: how is a karigar's rating computed, and what period do loss and lateness cover? (EP-32-S10)
- D7 is decided: one shop, no branches; "All branches" on mockup 08 shows the shop name and there is no branch filter (EP-32-S1, S9).
- A2: is the lead SLA in shop hours or clock hours? (EP-32-S6, S8)
- A3: who hears about a late lead first, and how long before the owner? (EP-32-S6)
- G18: does the rules panel keep a switch for the edit token? (EP-32-S8)
- G21: where is the owner's notification centre, and is Decisions it? (EP-32-S12)
- How is "Metal lost this month" defined (mockup 08 0.71%, 4.3 g across all jobs)? (EP-32-S9)
