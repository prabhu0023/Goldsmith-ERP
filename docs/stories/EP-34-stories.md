# EP-34: Broadcast and catalogue share · stories

Epic document: [EP-34 Broadcast and catalogue share](../epics/EP-34-broadcast-and-catalogue-share.md)

Role note: stories where the server stores, resolves, sends, tracks or serves on its own use "System". Stories on the `broadcast` and `catalogue` screens use "Staff", because staff do this work and the owner can do everything staff can; EP-34-S15 is Owner only because it starts from `decisions`. Karigars are refused every broadcast and showcase operation. No price, rupee amount or value appears in any message, showcase or public page (BR-34-4); the piece card keeps an empty value socket for EP-42. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff); the seed customers include Priya Malhotra (CU-002, VIP Bridal, opted in) and Meera (VIP Bridal, opted in), as in mockup 27 and epic acceptance criterion 3. There is no hold or reserve in v1, so no broadcast or showcase sets a piece aside.

---

## EP-34-S1: System can store broadcasts, recipients and showcases

- **Story ID:** EP-34-S1
- **Title:** System can store broadcasts, recipients and showcases
- **As a:** System
- **I want:** the `broadcasts`, `broadcast_recipients` and `broadcast_pieces` tables from EP-02-S12 extended with status, template, schedule, counts and per-recipient tracking, a `broadcast_templates` table for "Festive preview", "New arrivals" and "Blank", and new `showcases` and `showcase_pieces` tables with a hashed public link token
- **So that:** drafts, sends, schedules, delivery tracking and shared showcases survive a reload and can be audited, instead of living in the in-memory `Broadcast` record (FR-34-10, FR-34-11, FR-34-13, FR-34-15, epic section 9)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty database, when migrations run, then `broadcasts` has columns id, created by, audience group (one of the customer groups or `All`), audience filters (structured, empty by default), message text, template id, status (`draft`, `scheduled`, `sending`, `sent`, `failed`), scheduled for (nullable), sent at, recipient count, skipped count and version.
  2. Given migrations have run, when `broadcast_recipients` is read, then each row has broadcast id, customer id, provider message id, send status, delivered at, opened at, replied at and lead id (nullable), with a unique key on (broadcast id, customer id).
  3. Given migrations have run, when `broadcast_templates` is read, then it holds `festive` ("Festive preview"), `new` ("New arrivals") and `blank` ("Blank") with their text, provider template name and approval status, and the `new` text is "Namaste {name}, new pieces have just arrived at Jai Gulab Dev. Come and see them whenever you are free."
  4. Given migrations have run, when `showcases` is read, then it has id, created by, created at, audience group or one customer id, public link token hash, link expires at and revoked at, and `showcase_pieces` links a showcase to piece ids; no column holds the raw token.
  5. Given a row is written with broadcast status `paused`, a recipient whose customer id does not exist, or a showcase piece that does not exist, when it is written, then the database refuses it.
- **Rules enforced on the server:** Enum checks on status and audience group. Foreign keys from recipients to `customers`, from broadcast and showcase pieces to `pieces`, and from recipients to `leads`. The server sets id, created by, created at, version, counts and sent at; no client value sets them. The public token is stored only as a hash. No price, amount or value column on any of these tables; pure gold is read from `pieces`, not copied.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Creating tables writes no entry; sends, schedules and links are audited by EP-34-S7, EP-34-S10, EP-34-S13 and EP-34-S14a.
- **Data changes:** Migration on `broadcasts` (EP-02-S12) adds created by, audience filters, template id, status, scheduled for, sent at, recipient count, skipped count, version. Migration on `broadcast_recipients` adds provider message id, send status, delivered at, opened at, replied at, lead id and the unique key. Migration creates `broadcast_templates` (seeded with the three prototype templates), `showcases` and `showcase_pieces`. Adds audit kinds `broadcast_sent`, `broadcast_scheduled`, `showcase_sent`, `showcase_link_created` and `showcase_link_revoked` to the `audit_entries` kind list. Each table has the shop ID (EP-02-S3, D7).
- **UI reference:** No screen.
- **Non-functional checks:** Personal data: message text and recipient rows are personal data, covered by the retention and erasure rules (EP-17-S13). Time: all times stored in UTC. Security: the public token is hashed at rest. Open decision G17: scheduled for, delivered at, opened at and replied at stay null until G17 is decided. Open decision G9: the link columns stay unused until G9 is decided.
- **Depends on:** EP-02-S1, EP-02-S12, EP-02-S14, EP-17-S1, EP-22-S1, EP-28-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S2: System can resolve an audience to opted-in customers with a skipped count

- **Story ID:** EP-34-S2
- **Title:** System can resolve an audience to opted-in customers with a skipped count
- **As a:** System
- **I want:** a Read Audience count operation, and one server function used by it and by every send, that turns a customer group or `All` (plus any agreed filters) into the list of active customers whose current consent is opted in, with the count of those skipped because they are not
- **So that:** only customers who agreed are counted and messaged, and the count on screen is the same rule the send uses (FR-34-1, FR-34-2, FR-34-7, BR-34-1, BR-34-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given 90 active VIP Bridal customers of whom 86 are opted in, when Read Audience count is called for `VIP Bridal`, then it returns 86 reachable and 4 skipped.
  2. Given audience `All`, when the count is read, then every active customer of every group is counted once, opted-in ones as reachable and the rest as skipped.
  3. Given a VIP Bridal customer with `status` `erased` (EP-17-S13), when the audience is resolved, then they are neither reachable nor skipped.
  4. Given Meera opted out at the counter a minute ago (EP-17-S7), when the count is read again, then reachable falls by 1 and skipped rises by 1.
  5. Given 5,000 customers on staging, when Read Audience count is called for `All`, then it answers in under 2 seconds.
- **Rules enforced on the server:** Read Audience count is Staff and Owner only; karigars are refused (EP-05-S2). Consent is the customer's latest consent event (EP-17-S2), read on the server. Group values come from the customer record (EP-17-S1); a group outside the agreed list is refused as a validation error (EP-03-S5). Filters other than group are refused until G19 is decided. The same resolve function is called at send time (EP-34-S7), not reused from an earlier count.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds an index on customer group and consent state if the query plan needs it. Adds Read Audience count to the shared contract (EP-03-S1), replacing `reachable` in `src/components/marketing/util.tsx` as the source of truth.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("86 customers · all opted in to WhatsApp", "Only customers who opted in are counted.").
- **Non-functional checks:** Performance: audience counts under 2 seconds (epic section 13). Personal data: the count read returns numbers only, never names or phones; recipient lists are not written to logs. Open decision G19: which groups and filters exist ("Collectors", "Festive collector", "Bought in last 6 months" versus VIP Bridal, High net worth, Regular, Wholesale); this story supports the four stored groups and `All` until it is answered. Open decision G13: "Bought in last 6 months" needs a customer on each stock-out.
- **Depends on:** EP-17-S1, EP-17-S2, EP-17-S7, EP-17-S13, EP-05-S2, EP-03-S1, EP-03-S5, EP-34-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S3: Staff can choose an audience by group and see the counts

- **Story ID:** EP-34-S3
- **Title:** Staff can choose an audience by group and see the counts
- **As a:** Staff
- **I want:** "WHO HEARS IT" on `broadcast` to show one chip per customer group and one for everyone, each with its opted-in count from the server, and a line under them with the reachable and skipped numbers for the chip I pick
- **So that:** I know exactly how many people will get the message before I write it (FR-34-1, FR-34-2, BR-34-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given 86 opted-in VIP Bridal and 142 opted-in High net worth customers, when Rajesh Verma opens `broadcast`, then the chips read "VIP Bridal · 86" and "High net worth · 142", plus chips for the other stored groups and everyone.
  2. Given Rajesh picks "VIP Bridal" and all its active customers are opted in, when the count returns, then the line reads "86 customers · all opted in to WhatsApp".
  3. Given Rajesh picks a group with 140 opted-in and 2 not opted in, when the count returns, then the line reads "140 customers opted in · 2 skipped, not opted in" (proposed wording).
  4. Given Read Audience count has not answered or fails, when the chips are shown, then each shows the loading state (EP-08-S3) or the error with "Try again" (EP-08-S4), not a zero.
  5. Given G19 has not been decided, when the screen is shown, then "Collectors · 210", "Bought in last 6 months" and "+ add a filter" are not shown.
- **Rules enforced on the server:** The counts are those of EP-34-S2; the browser does not compute consent. The chip list is the stored group list from the server, so a new agreed group appears without a client release.
- **Live events emitted / consumed:** None. Counts are read on load and when the chip changes.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Moves `src/components/marketing/Broadcast.tsx` audience chips off `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("WHO HEARS IT", "VIP Bridal · 86", "High net worth · 142", "Collectors · 210", "Bought in last 6 months", "+ add a filter", "86 customers · all opted in to WhatsApp"). The skipped line follows the prototype and is not drawn on the mockup.
- **Non-functional checks:** Performance: chip counts load under 2 seconds on a shop connection. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Open decision G19: the chips "Collectors", "Bought in last 6 months" and "+ add a filter" wait for the agreed groups and filters.
- **Depends on:** EP-34-S2, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S4: Staff can start from a template and fill {name} per person

- **Story ID:** EP-34-S4
- **Title:** Staff can start from a template and fill {name} per person
- **As a:** Staff
- **I want:** to pick "Festive preview", "New arrivals" or "Blank" under "Start from a template", edit the text in the message box, and have the server replace {name} with each recipient's first name when it sends
- **So that:** I write the message once and every customer reads their own name (FR-34-3, FR-34-9, BR-34-6, BR-34-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma opens `broadcast`, when List Message templates returns, then the three choices "Festive preview", "New arrivals" and "Blank" are shown and "Festive preview" fills the message box with its stored text.
  2. Given Rajesh picks "New arrivals", when the box fills, then it reads "Namaste {name}, new pieces have just arrived at Jai Gulab Dev. Come and see them whenever you are free."
  3. Given the message is sent to Meera and Priya Malhotra, when the server fills each copy, then Meera's reads "Namaste Meera, …" and Priya's reads "Namaste Priya, …".
  4. Given Rajesh picks "Blank" and sends with an empty box, when it reaches the server, then it is refused with "Write the message." (EP-34-S7).
  5. Given a template whose provider approval is pending (EP-12-S2), when the list is shown, then it is marked "Waiting for WhatsApp approval" and cannot be sent.
- **Rules enforced on the server:** List Message templates is Staff and Owner only (EP-05-S2). {name} is the only placeholder; any other `{…}` is refused. The first name is taken from the stored customer name at send time with the same function as EP-33-S11, so preview and message match. No price or rupee placeholder is allowed (BR-34-4). The text is English in v1. A send uses only an approved provider template (EP-12-S3).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Picking and editing a draft writes nothing; the sent text is recorded by EP-34-S7.
- **Data changes:** None beyond EP-34-S1. Adds List Message templates to the shared contract; moves `TEMPLATES` from `src/components/marketing/Broadcast.tsx` into `broadcast_templates`, and `fillName` into the shared package.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("WHAT YOU SEND", "Start from a template", "Festive preview", "New arrivals", "Blank", "Message · {name} is filled in per person"). The approval mark is not yet designed.
- **Non-functional checks:** Security: the server fills {name}; the client never sends per-recipient text. Open decision D8: which templates are approved and whether edited text needs approval; how "Blank" maps to an approved template is decided there. Note: the mockup's festive line "Shall we keep some aside for you to see?" promises a hold, which v1 does not have; the seeded festive text needs wording without it, agreed with the owner before approval.
- **Depends on:** EP-34-S1, EP-12-S2, EP-12-S3, EP-33-S11, EP-05-S2, EP-03-S1, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S5: Staff can attach in-stock pieces to a broadcast

- **Story ID:** EP-34-S5
- **Title:** Staff can attach in-stock pieces to a broadcast
- **As a:** Staff
- **I want:** "Attach pieces from the catalogue" to open a picker of in-stock pieces with photo, name, tag, purity and pure gold, and to save my choice on the broadcast draft, with the server refusing any piece not in stock
- **So that:** customers see the actual pieces, and nothing sold or scrapped ever goes out (FR-34-4, BR-34-3, BR-34-4, BR-34-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 Kundan Choker, TAG-8802 Polki Bangles and TAG-7521 Temple Haram are `in_stock`, when Rajesh Verma presses "pick pieces" and chooses them, then the draft stores the 3 piece ids and the screen reads "3 attached".
  2. Given the picker is open, when List Shareable pieces returns, then each piece shows its photo thumbnail, name, tag, purity and pure gold to 4 decimals, such as "41.5900 g", and no price.
  3. Given TAG-9040 was sold a moment ago, when Rajesh tries to attach it, then the server refuses with "TAG-9040 is not in stock, so it cannot be shown." and the draft keeps its other pieces.
  4. Given a piece is `stopped` or `scrapped`, when the picker lists pieces, then it does not appear.
  5. Given two staff save the same draft, when the second save carries an older version, then it is refused as a conflict (EP-02-S14) and nothing is overwritten.
- **Rules enforced on the server:** List Shareable pieces and Update Broadcast draft are Staff and Owner only (EP-05-S2). Only pieces in state `in_stock` (EP-22-S2) may be attached. Pure gold is read from the piece as an integer in units of 0.0001 g. The draft is versioned. Attaching a piece does not hold it; it stays sellable (no hold in v1).
- **Live events emitted / consumed:** None here. Dropping pieces sold after they were attached is EP-34-S8.
- **Audit entry written:** No. Draft edits are not audited; the pieces sent are recorded by EP-34-S7.
- **Data changes:** Writes `broadcast_pieces` rows and the draft `broadcasts` row with status `draft`. Adds List Shareable pieces, Create Broadcast draft and Update Broadcast draft to the shared contract.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("Attach pieces from the catalogue", "pick pieces", "3 attached"). The picker itself follows `docs/ux/mockups/28-catalogue-share.svg` ("PICK FROM WHAT IS IN STOCK").
- **Non-functional checks:** Precision: pure gold shown from integer units to 4 decimals. Concurrency: attach-time check is advisory; the send-time check in EP-34-S7 is the guard (epic section 13). Performance: the picker list loads under 2 seconds and is paged with a cursor (EP-03-S9). Security: photos are served through signed, expiring links (EP-09-S5).
- **Depends on:** EP-34-S1, EP-22-S1, EP-22-S2, EP-22-S3, EP-09-S5, EP-09-S7, EP-02-S14, EP-03-S9, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S6: Staff can preview a broadcast as it lands on a phone

- **Story ID:** EP-34-S6
- **Title:** Staff can preview a broadcast as it lands on a phone
- **As a:** Staff
- **I want:** "HOW IT LANDS ON THEIR PHONE" to show a phone frame with the shop's business account name, the message filled in for one real recipient from the audience, and a "See the pieces" button when pieces are attached
- **So that:** I can check what the customer will read before I send it (FR-34-6, BR-34-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the audience is VIP Bridal and its first opted-in recipient is Meera, when Rajesh Verma views the preview, then it shows "Jai Gulab Dev Jewellers · business account" and "Namaste Meera, our Deepavali bridal collection is now in the showroom…".
  2. Given 3 pieces are attached, when the preview is shown, then a "See the pieces" button appears under the message; given none are attached, it does not.
  3. Given Rajesh edits the message box, when he stops typing, then the preview updates with the new text, filled by the server function used for sending.
  4. Given the audience has nobody opted in, when the preview is shown, then it uses the placeholder name "Customer" and says nobody will receive it.
  5. Given a preview is shown, when Rajesh leaves the screen, then nothing is sent and no recipient row is written.
- **Rules enforced on the server:** Read Broadcast preview is Staff and Owner only (EP-05-S2). The sample recipient is chosen only from opted-in customers in the resolved audience (EP-34-S2). The server fills the text with the send function (EP-34-S4).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A preview changes nothing.
- **Data changes:** None in the product database. Adds Read Broadcast preview to the shared contract; keeps `PhonePreview` from `src/components/marketing/util.tsx` as the frame.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("HOW IT LANDS ON THEIR PHONE", "Jai Gulab Dev Jewellers", "business account", "Namaste Meera, our Deepavali bridal collection is now in the showroom…", "See the pieces", "{name} shows as their real name").
- **Non-functional checks:** Personal data: the preview returns one first name only, not a phone or a list. Performance: the preview updates within 1 second of the user stopping typing. Open decision G9: what "See the pieces" opens depends on whether a public showcase link exists (EP-34-S14b); until then the button is shown in the preview only as the template's button.
- **Depends on:** EP-34-S2, EP-34-S4, EP-34-S5, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S7: Staff can send a broadcast to opted-in customers

- **Story ID:** EP-34-S7
- **Title:** Staff can send a broadcast to opted-in customers
- **As a:** Staff
- **I want:** to press "Send" on a draft so the server checks the message and pieces, resolves the audience to opted-in customers at that moment, writes one recipient row each, and hands one approved template message per recipient to the WhatsApp integration through a job queue
- **So that:** the whole group gets the message with their own name, and nobody who has not agreed gets anything (FR-34-7, FR-34-8, FR-34-9, FR-34-18, BR-34-1, BR-34-3, BR-34-7, epic acceptance criterion 1)
- **Acceptance criteria (Given / When / Then):**
  1. Given 86 opted-in VIP Bridal customers and 3 `in_stock` pieces attached, when Rajesh Verma presses "Send" on the festive message, then 86 `broadcast_recipients` rows are written, 86 messages go out each with the first name filled in, and customers not opted in get nothing (epic acceptance criterion 1).
  2. Given the message box is empty, when "Send" is pressed, then the server refuses with "Write the message." and nothing is sent.
  3. Given everyone in the chosen audience has opted out, when "Send" is pressed, then the server refuses with "Nobody opted-in is in that audience."
  4. Given the network drops after Rajesh presses "Send" and he retries with the same idempotency key, when the retry reaches the server, then no second broadcast is created and no customer gets two messages (EP-08-S6, EP-03-S8).
  5. Given the send commits, when it is read, then status is `sending` until all recipient messages are handed over and then `sent`, recipient count is 86, skipped count is the not-opted-in number, and the screen reads "Going to 86 opted-in VIP Bridal customers" before and the latest broadcast after.
- **Rules enforced on the server:** Create Broadcast is Staff and Owner only (EP-05-S2), unless the open question on who may send restricts it to the owner. Message must not be blank. Every attached piece must be `in_stock` at send time (EP-34-S8 explains refusals). The audience is resolved inside the send transaction (EP-34-S2); EP-12-S5 checks consent again per message. Each message goes through EP-12-S3 with an approved template and idempotency key "broadcast" plus broadcast id and customer id. Large audiences are sent through EP-10 jobs so provider rate limits are respected. The audit entry is written in the same transaction (EP-06-S2).
- **Live events emitted / consumed:** None emitted. Broadcasts are not in the PRODUCTION-SCOPE §1 catalogue (epic section 11). The sender's own screen refetches after the send (EP-08-S7).
- **Audit entry written:** Yes: actor, time, entity (broadcast id), action `broadcast_sent`, audience group, recipient count, skipped count, piece ids, template id. No phone numbers or message bodies per recipient.
- **Data changes:** Updates the `broadcasts` row to `sending` then `sent` with sent at and counts; inserts `broadcast_recipients` rows; EP-12-S3 inserts OutboundMessage rows with the broadcast id as source; EP-10 job rows for the send batches. Adds Create Broadcast to the shared contract, replacing `sendBroadcast` in `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("Going to 86 opted-in VIP Bridal customers", "Send", "Later").
- **Non-functional checks:** Personal data: consent checked at the moment of sending; recipient lists are not exported in logs (epic section 13). Concurrency: a piece sold between attach and send is refused, not sent. Audit: every send appended. Availability: a provider failure on some recipients marks those rows failed (EP-12-S12) without stopping the rest. Open decision D8: provider and approved templates. Open question: whether any staff member or only the owner may send.
- **Depends on:** EP-34-S2, EP-34-S4, EP-34-S5, EP-12-S3, EP-12-S5, EP-12-S12, EP-10-S1, EP-10-S3, EP-10-S4, EP-03-S4, EP-03-S6, EP-03-S8, EP-05-S2, EP-06-S2, EP-08-S5, EP-08-S6, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S8: System can drop sold pieces from drafts live

- **Story ID:** EP-34-S8
- **Title:** System can drop sold pieces from drafts live
- **As a:** System
- **I want:** when a piece is billed or scrapped, to remove it from every unsent broadcast draft, scheduled broadcast and showcase draft, and to tell any open `broadcast` or `catalogue` screen which piece went; and at send time, to refuse any attached piece that is no longer in stock and name it
- **So that:** a sold piece never goes out to customers, and the person writing the broadcast knows why it vanished (FR-34-5, BR-34-3, BR-34-9, epic acceptance criterion 2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's draft has TAG-8841 attached and Deepak Rao sells TAG-8841 (EP-26-S2), when "Piece billed by one staff member" arrives, then within about 1 second TAG-8841 leaves the draft, the count reads "2 attached" and a line reads "TAG-8841 was sold just now and was taken off this broadcast." (proposed wording).
  2. Given the event was missed and Rajesh presses "Send", when the server checks the pieces, then it refuses with "TAG-8841 is not in stock, so it cannot be shown." and sends nothing (epic acceptance criterion 2).
  3. Given a scheduled broadcast has TAG-8802 attached and TAG-8802 is scrapped, when "Piece scrapped" (proposed, G26) arrives, then TAG-8802 is removed from the scheduled broadcast before it runs.
  4. Given the picker is open on `catalogue`, when the event arrives, then the sold piece leaves the list and the showcase total pure gold falls by its pure gold.
  5. Given Rajesh's connection drops while the sale commits, when it returns, then after catch-up the piece is gone from his draft (EP-08-S10).
- **Rules enforced on the server:** The server removes the piece from `broadcast_pieces` and `showcase_pieces` of unsent rows only, in a System action after the sale or scrap commits; sent broadcasts keep their record of what was sent. The send-time `in_stock` check is the guard; the live removal is a convenience. Events reach Staff and Owner only (EP-07-S5).
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" (emitted by EP-26-S2); "Piece scrapped" (proposed, G26, emitted by EP-27). Emitted: none.
- **Audit entry written:** No. Removing a piece from an unsent draft changes no business record; the sale or scrap itself is audited by EP-26-S12 or EP-27.
- **Data changes:** Deletes `broadcast_pieces` and `showcase_pieces` rows for unsent drafts and scheduled broadcasts; bumps the draft version.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("3 attached"); `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("Only in-stock pieces can be shared, so nothing sold or scrapped ever goes out."). The removal line is not yet designed.
- **Non-functional checks:** Concurrency: a piece sold between attach and send is refused at send (epic section 13). Performance: the removal shows within about 1 second of the sale commit. Availability: reconnect catch-up applies the missed removal (EP-07-S7).
- **Depends on:** EP-34-S5, EP-34-S7, EP-26-S2, EP-26-S11, EP-07-S1, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S9: System can turn a broadcast reply into a lead

- **Story ID:** EP-34-S9
- **Title:** System can turn a broadcast reply into a lead
- **As a:** System
- **I want:** when EP-29-S11 creates a lead from a reply to a broadcast or a showcase, to set replied at and the lead id on that customer's `broadcast_recipients` row, and to let staff filter the inbox by broadcast
- **So that:** nothing a customer sends is lost, and the shop can see which broadcast brought which leads (FR-34-12, BR-34-2, epic acceptance criterion 3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera received the Deepavali VIP Bridal broadcast, when she replies "Yes please", then a lead in `needs_glance` appears in the inbox linked to that broadcast and to Meera, and her recipient row gets replied at and the lead id (epic acceptance criterion 3).
  2. Given Meera replies a second time, when the reply arrives, then EP-29-S12 links it to the first lead and the recipient row keeps the first replied at.
  3. Given a showcase was sent to Priya Malhotra "To one person", when she replies, then the lead is linked to the showcase and to Priya.
  4. Given Meera replies "STOP", when it is handled, then EP-12-S10 switches her consent off, no lead is created and replied at stays empty.
  5. Given 16 replies came in for one broadcast, when Rajesh Verma filters `leads` by that broadcast, then the 16 leads are listed.
- **Rules enforced on the server:** Only the System actor writes replied at and lead id, from the replied-to provider message id (EP-12-S7); a broadcast id sent by a client is ignored. The recipient row is found by (broadcast id, customer id). The prototype "Simulate a customer reply" is removed from production builds (EP-08-S19).
- **Live events emitted / consumed:** Emitted through EP-29-S11: "Lead arrived / passed its SLA" (arrived). Consumed: none.
- **Audit entry written:** Yes, through EP-29-S14: actor System (WhatsApp intake), time, entity (lead id), action `lead_created`, after (broadcast id, customer id). The recipient row update writes no separate entry.
- **Data changes:** Updates `broadcast_recipients` replied at and lead id. Adds a showcase id to `leads` beside `broadcastId` if showcases are tracked separately. Adds a broadcast filter to List Leads (EP-28-S7).
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("AFTER YOU SEND", "replies become leads", "A reply lands in the lead inbox (16), so nothing a customer sends is lost."); `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("Replies land in the lead inbox as new leads"); `docs/ux/mockups/16-lead-inbox.svg`, route `leads`. The broadcast filter is not yet designed.
- **Non-functional checks:** Personal data: an opt-out reply is honoured at once (epic section 13). Performance: the reply lead appears in the inbox within about 1 second of the webhook being accepted. Open decision D8: whether the provider supplies a replied-to id. Open decision G17: whether replies are counted per recipient for EP-34-S11.
- **Depends on:** EP-34-S7, EP-29-S11, EP-29-S12, EP-29-S14, EP-12-S7, EP-12-S10, EP-28-S7, EP-28-S13, EP-08-S19
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S10: Staff can schedule a broadcast for later (G17)

- **Story ID:** EP-34-S10
- **Title:** Staff can schedule a broadcast for later (G17)
- **As a:** Staff
- **I want:** "Later" to let me pick a date and time in Asia/Kolkata, store the broadcast as `scheduled`, and have a delayed job send it at that time to the audience as resolved at that moment; and to cancel it before it runs
- **So that:** I can prepare the Deepavali eve message in advance and it goes out on time without me (FR-34-10, epic acceptance criterion 6)
- **Acceptance criteria (Given / When / Then):**
  1. Given a draft to VIP Bridal, when Rajesh Verma presses "Later" and picks 31 October 2026 18:00 Asia/Kolkata, then the broadcast is stored with status `scheduled` and scheduled for 2026-10-31 12:30 UTC, and the screen shows the time in Asia/Kolkata.
  2. Given the scheduled time arrives, when the job runs, then the broadcast is sent through the EP-34-S7 path to the audience as resolved at that moment, so a customer who opted out in between gets nothing (epic acceptance criterion 6).
  3. Given Rajesh picks a time in the past, when he saves, then the server refuses with "Pick a time in the future." (proposed wording).
  4. Given the broadcast is `scheduled`, when Rajesh cancels it, then the job is cancelled and status returns to `draft`; given it is already `sending`, cancel is refused.
  5. Given the server is down at 18:00 and restarts at 18:20, when missed jobs run (EP-10-S11), then the broadcast is sent once, not twice.
- **Rules enforced on the server:** Create Scheduled broadcast is Staff and Owner only (EP-05-S2). The time is stored in UTC and must be later than the server clock. The send at run time repeats every EP-34-S7 check (message, `in_stock` pieces, consent) with the System actor "Scheduler" and keeps the creator as created by. The job key is "broadcast" plus broadcast id (EP-10-S4). Only `scheduled` broadcasts can be cancelled.
- **Live events emitted / consumed:** None. The job is started by the scheduler.
- **Audit entry written:** Yes: on scheduling, actor, time, entity (broadcast id), action `broadcast_scheduled`, scheduled for, audience group, piece ids; on cancel, the same kind with before `scheduled` and after `draft`; at send, `broadcast_sent` with actor System "Scheduler" (EP-06-S6).
- **Data changes:** Sets `broadcasts.scheduled for` and status; inserts an EP-10 delayed job row; at run time the EP-34-S7 writes. Adds Create Scheduled broadcast and Cancel Scheduled broadcast to the shared contract.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("Send now, or schedule for Deepavali eve", "Later"). The date and time picker and the scheduled list are not yet designed.
- **Non-functional checks:** Time: schedules stored in UTC and chosen in Asia/Kolkata (EP-10-S10). Availability: a missed run sends once after restart. Concurrency: cancel and the job start cannot both win; the status check is in one transaction. Audit: every schedule appended. Open decision G17: whether scheduling is in scope for v1; this story is built only if G17 says yes, and "Later" stays hidden until then.
- **Depends on:** EP-34-S7, EP-10-S1, EP-10-S3, EP-10-S4, EP-10-S10, EP-10-S11, EP-10-S12, EP-06-S2, EP-06-S6, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S11: Staff can see delivered, opened and replied counts (G17)

- **Story ID:** EP-34-S11
- **Title:** Staff can see delivered, opened and replied counts (G17)
- **As a:** Staff
- **I want:** each sent broadcast to show how many messages were delivered, opened and replied to, from per-recipient times copied from WhatsApp receipts and reply leads, and to open the list of recipients who replied
- **So that:** I can see whether a broadcast reached people and follow up with those who answered (FR-34-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given a broadcast to 86 recipients, when the provider reports 84 delivered and 61 read through EP-12-S9, then Read Broadcast status returns 84 delivered and 61 opened, and the broadcast shows "84 delivered · 61 opened" (proposed wording).
  2. Given 16 recipients replied (EP-34-S9), when the status is read, then it shows "16 replied" and the reply list names each customer with a link to their lead.
  3. Given a recipient's message failed with "recipient not on WhatsApp", when the status is read, then it counts under failed with that reason, not under delivered.
  4. Given a read receipt arrives before the delivered receipt, when both are stored, then delivered at is set too, and the counts never go backwards.
  5. Given Rajesh Verma has the broadcast open, when he presses refresh or returns to it, then the counts reflect receipts stored so far.
- **Rules enforced on the server:** Read Broadcast status is Staff and Owner only (EP-05-S2). Recipient delivered at and opened at are copied from OutboundMessage receipts (EP-12-S9) and only move forward. Opened means the provider's read receipt. Totals are computed on the server.
- **Live events emitted / consumed:** None. Receipts come through EP-12 provider callbacks, not a catalogue event; the screen shows stored counts on load and refresh (EP-08-S7).
- **Audit entry written:** No. Receipts are provider status, stored on the recipient and OutboundMessage rows; the send itself is audited by EP-34-S7.
- **Data changes:** Updates `broadcast_recipients` send status, delivered at and opened at from OutboundMessage receipts. Adds Read Broadcast status to the shared contract.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("AFTER YOU SEND", "Delivered, opened, and who replied are tracked — replies become leads."). The counts and reply list are not yet designed.
- **Non-functional checks:** Time: receipt times stored in UTC and shown in Asia/Kolkata. Personal data: the reply list shows names to Staff and Owner only and is not written to logs. Performance: status reads under 2 seconds for a broadcast of 5,000 recipients. Open decision G17: whether per-recipient tracking is in scope; until decided only the reply count from EP-34-S9 is shown. Open decision D8: whether the chosen provider returns read receipts.
- **Depends on:** EP-34-S7, EP-34-S9, EP-12-S9, EP-12-S12, EP-05-S2, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S12: Staff can build a catalogue showcase with no price shown

- **Story ID:** EP-34-S12
- **Title:** Staff can build a catalogue showcase with no price shown
- **As a:** Staff
- **I want:** on `catalogue`, to filter in-stock pieces by style, collection, weight and tag, choose some, see "A showcase of N pieces" with their total pure gold and "no price shown", and see each piece card as the customer will, with an empty value socket
- **So that:** I can put together a small product file of real stock that shows photos and weights but never a price (FR-34-13, BR-34-3, BR-34-4, BR-34-5, BR-34-10, epic acceptance criterion 4)
- **Acceptance criteria (Given / When / Then):**
  1. Given 4 chosen `in_stock` pieces whose pure gold sums to 1727800 units, when Rajesh Verma views "HOW TO SEND IT", then it reads "A showcase of 4 pieces" and "172.7800 g of pure gold across them · no price shown", and no price appears anywhere (epic acceptance criterion 4).
  2. Given Rajesh types "Kundan" in "filter by style, collection, weight…", when List Shareable pieces returns, then only `in_stock` pieces with Kundan style or collection are listed, and the heading reads "PICK FROM WHAT IS IN STOCK · 4 CHOSEN" with his count.
  3. Given TAG-8841 is chosen, when "WHAT A PIECE LOOKS LIKE TO THEM" is shown, then it reads "Antique Kundan Choker", "22K · Kundan · Festive Bridal" and "Pure gold 41.5900 g", with the empty slot "price added here once pricing is on".
  4. Given `pricingEnabled` is true (EP-13-S9), when the card is shown, then the value socket still stays empty until EP-42 fills it.
  5. Given a weight filter of 20 to 50 g, when the list returns, then only pieces whose pure gold is between 200000 and 500000 units are shown.
- **Rules enforced on the server:** List Shareable pieces and Create Showcase draft are Staff and Owner only (EP-05-S2). Only `in_stock` pieces are listed or saved (EP-22-S2). The total is an integer sum on the server. The response carries no price, value or rupee field (BR-34-4). Choosing a piece does not hold it.
- **Live events emitted / consumed:** Consumed through EP-34-S8: "Piece billed by one staff member" drops a sold piece from the picker and total. Emitted: none.
- **Audit entry written:** No. Building a draft showcase changes no business record; sending it and creating a link are audited by EP-34-S13 and EP-34-S14a.
- **Data changes:** Inserts a `showcases` row and `showcase_pieces` rows for the draft. Adds Create Showcase draft and filters on List Shareable pieces to the shared contract. Moves `src/components/marketing/CatalogueShare.tsx` off `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("Share a set of pieces", "PICK FROM WHAT IS IN STOCK · 4 CHOSEN", "filter by style, collection, weight…", "A showcase of 4 pieces", "172.780 g of pure gold across them · no price shown", "WHAT A PIECE LOOKS LIKE TO THEM", "price added here once pricing is on"). The mockup shows 3 decimals; the product shows 4.
- **Non-functional checks:** Precision: total pure gold is an integer sum in units of 0.0001 g, shown to 4 decimals (epic section 13). Performance: the list loads under 2 seconds and is paged (EP-03-S9). Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Security: photos through signed links (EP-09-S5).
- **Depends on:** EP-34-S1, EP-34-S5, EP-34-S8, EP-22-S1, EP-22-S2, EP-13-S9, EP-09-S5, EP-03-S9, EP-05-S2, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S13: Staff can send a showcase to one person

- **Story ID:** EP-34-S13
- **Title:** Staff can send a showcase to one person
- **As a:** Staff
- **I want:** to send a showcase either "To one person", by picking one opted-in customer, or "Send to a broadcast audience" through the same audience picker, so the server sends the chosen in-stock pieces with photos and pure gold through WhatsApp; and to reach "To one person" from the piece drawer's "Share" on `stock`
- **So that:** I can send a customer exactly the pieces they asked about, with the same consent and stock checks as a broadcast (FR-34-14, BR-34-1, BR-34-3, BR-34-4, FR-34-18)
- **Acceptance criteria (Given / When / Then):**
  1. Given a showcase of 4 `in_stock` pieces and Priya Malhotra (CU-002) is opted in, when Rajesh Verma presses "To one person", picks Priya and sends, then one message goes to her with the 4 pieces' photos, names and pure gold, no price, and the showcase records her customer id.
  2. Given Rajesh picks a customer who is not opted in, when he sends, then the server refuses with "<name> is not opted in to WhatsApp, so nothing was sent." (proposed wording) and nothing is sent.
  3. Given Rajesh presses "Send to a broadcast audience" and picks "VIP Bridal · 86", when he sends, then the showcase goes out through the EP-34-S7 path to the 86 opted-in customers.
  4. Given one of the 4 pieces was sold before sending, when the server checks, then it refuses with "<tag> is not in stock, so it cannot be shown." and sends nothing.
  5. Given Rajesh opens TAG-8841 on `stock` and presses "Share", when the share opens, then it starts a one-piece showcase with "To one person" selected.
- **Rules enforced on the server:** Create Showcase send is Staff and Owner only (EP-05-S2). Every piece must be `in_stock` at send time. One-person sends check the customer's current consent (EP-17-S2) and again at EP-12-S5. If the customer has an open conversation window, EP-12-S4 may send a session message; otherwise an approved template is used (EP-12-S3). Idempotency key "showcase" plus showcase id and customer id. The audit entry is written in the same transaction.
- **Live events emitted / consumed:** None emitted. Consumed through EP-34-S8: "Piece billed by one staff member".
- **Audit entry written:** Yes: actor, time, entity (showcase id), action `showcase_sent`, audience group or one customer id, recipient count, piece ids. No phone numbers.
- **Data changes:** Updates the `showcases` row with the audience or customer id and sent at; for an audience send, creates a `broadcasts` row with the showcase pieces and `broadcast_recipients` rows; EP-12 inserts OutboundMessage rows. Adds Create Showcase send to the shared contract, replacing the fixed-message `sendBroadcast` call in `CatalogueShare.tsx`.
- **UI reference:** `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("HOW TO SEND IT", "Send to a broadcast audience", "reuses the audience picker from Broadcast", "To one person"); `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Share"). The customer picker for "To one person" is not yet designed.
- **Non-functional checks:** Personal data: consent checked at send time; only opted-in customers are offered in the picker. Concurrency: a piece sold between choose and send is refused. Audit: every send appended. Open decision D8: whether a showcase with several photos fits an approved template or needs a session message.
- **Depends on:** EP-34-S7, EP-34-S12, EP-17-S2, EP-17-S8, EP-12-S3, EP-12-S4, EP-12-S5, EP-22-S5, EP-03-S8, EP-05-S2, EP-06-S2, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S14a: Staff can create and revoke a public showcase link (G9) (part 1: create and revoke)

Split note: EP-34-S14 was split into S14a and S14b because creating and revoking the link is a signed-in staff action, while serving the page to anyone with the link is a new public surface with its own security, caching and performance checks.

- **Story ID:** EP-34-S14a
- **Title:** Staff can create and revoke a public showcase link (G9)
- **As a:** Staff
- **I want:** "Copy a link" to create an unguessable link for the current showcase with an expiry, copy it to the clipboard, and let me revoke it later from the showcase
- **So that:** I can share a showcase with someone outside WhatsApp, and stop it working when it should no longer be seen (FR-34-15, FR-34-18)
- **Acceptance criteria (Given / When / Then):**
  1. Given a showcase of 4 `in_stock` pieces, when Rajesh Verma presses "Copy a link", then the server creates a token of at least 128 random bits, stores only its hash with link expires at, returns the full link once, and the screen says "Link copied" (proposed wording).
  2. Given the link was created, when the database is read, then no column holds the raw token and the audit entry holds only a token reference (EP-06-S4).
  3. Given the link, when Rajesh presses "Revoke link", then revoked at is set and the link stops working at once (EP-34-S14b).
  4. Given the showcase has no `in_stock` pieces left, when "Copy a link" is pressed, then the server refuses with "None of these pieces are in stock now." (proposed wording).
  5. Given Deepak Rao calls Create Public showcase link many times a minute, when the rate limit in EP-03-S11 is reached, then further calls are refused.
- **Rules enforced on the server:** Create and Delete Public showcase link are Staff and Owner only (EP-05-S2). The token is generated on the server from a secure random source and never logged (EP-12-S11 rule applied here). Expiry is set by the server from the G9 decision, never from the client. Revoke is allowed on any active link by Staff or Owner. The prototype's made-up link `https://jaigulabdev.example/showcase/{ids}` is removed.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: on create, actor, time, entity (showcase id), action `showcase_link_created`, piece ids, link expires at, token reference; on revoke, action `showcase_link_revoked`, before (active) and after (revoked at).
- **Data changes:** Sets `showcases.public link token hash`, link expires at and revoked at. Adds Create Public showcase link and Delete Public showcase link to the shared contract.
- **UI reference:** `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("Copy a link"). "Revoke link" and the expiry display are not yet designed.
- **Non-functional checks:** Security: unguessable token, hashed at rest, expiry and revoke, reviewed in the EP-39 security review before release (epic section 13). Audit: every link creation appended. Open decision G9: whether a public link exists at all, how long it lasts and what it may show; this story ships only if G9 says yes, and "Copy a link" stays hidden until then.
- **Depends on:** EP-34-S12, EP-06-S2, EP-06-S4, EP-03-S11, EP-05-S2, EP-12-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S14b: Staff can create and revoke a public showcase link (G9) (part 2: public showcase page)

Split note: EP-34-S14 was split into S14a and S14b because creating and revoking the link is a signed-in staff action, while serving the page to anyone with the link is a new public surface with its own security, caching and performance checks.

- **Story ID:** EP-34-S14b
- **Title:** Staff can create and revoke a public showcase link (G9)
- **As a:** System
- **I want:** a Read Public showcase operation and page that anyone with a valid link can open without signing in, showing only the chosen pieces that are still `in_stock`, with photo, name, purity, style and pure gold, and no price, tag history or customer data
- **So that:** a customer can browse the pieces on their phone, and a sold or scrapped piece never shows (FR-34-15, FR-34-16, BR-34-3, BR-34-4, epic acceptance criterion 5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a valid link to 4 pieces, when a customer opens it on a phone without signing in, then the page shows the 4 pieces with photo, name, purity and style, and pure gold such as "41.5900 g", and no price.
  2. Given TAG-8841 on the link is sold, when the link is opened again, then TAG-8841 no longer shows and the others still do (epic acceptance criterion 5).
  3. Given the link is past link expires at or has revoked at set, when it is opened, then the page says "This showcase is no longer available." (proposed wording) and shows no pieces.
  4. Given a made-up or altered token, when it is opened, then the same "no longer available" page is shown, with no hint whether the token ever existed.
  5. Given a mobile connection on staging, when the page is opened, then it loads in under 2 seconds.
- **Rules enforced on the server:** Read Public showcase needs no session; the token is hashed and looked up, and expired, revoked and unknown tokens get the same answer. Only pieces in state `in_stock` at read time are returned. The response carries no customer id, name, phone, staff name, price, value, supplier or karigar. Photos are served through short-lived signed links (EP-09-S5) scoped to these pieces. Requests are rate-limited per address (EP-03-S11). The page is read-only.
- **Live events emitted / consumed:** None pushed to the public page. "Piece billed by one staff member" is reflected because each open reads the current state.
- **Audit entry written:** No. Public reads are not audited; they are counted in the request log without the token value.
- **Data changes:** None in the product database. Adds Read Public showcase to the shared contract as the only operation reachable without a session.
- **UI reference:** Not yet designed. The piece card follows `docs/ux/mockups/28-catalogue-share.svg` ("WHAT A PIECE LOOKS LIKE TO THEM", "Antique Kundan Choker", "22K · Kundan · Festive Bridal", "Pure gold", "41.590 g") without the price slot label.
- **Non-functional checks:** Security: no customer data, unguessable token, uniform answer for invalid tokens, rate limit, and the EP-39 security review before release. Performance: under 2 seconds on a mobile connection (epic section 13). Precision: pure gold from integer units shown to 4 decimals. Personal data: no personal data on the page. Open decision G9: whether the link exists, its lifetime and what it may show; this story ships only if G9 says yes.
- **Depends on:** EP-34-S14a, EP-22-S1, EP-26-S2, EP-09-S5, EP-09-S6, EP-03-S2, EP-03-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-34-S15: Owner can push aged pieces from the ageing alert into a broadcast

- **Story ID:** EP-34-S15
- **Title:** Owner can push aged pieces from the ageing alert into a broadcast
- **As a:** Owner
- **I want:** "Push on WhatsApp" on the "GOLD SITTING TOO LONG" card to open `broadcast` with a new draft that already has the aged pieces attached, so I only pick the audience and the message
- **So that:** gold tied up on the floor is shown to customers in two taps instead of sitting unnoticed (FR-34-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given the card reads "196.4000 g of gold has not moved in 90 days" for 6 `in_stock` pieces, when Sanjay Seth presses "Push on WhatsApp", then `broadcast` opens with a draft that has the 6 piece ids attached, oldest first, and reads "6 attached".
  2. Given one of the 6 was sold after the card loaded, when the draft is created, then the server attaches only the 5 still `in_stock` and the screen says which tag was left out.
  3. Given the draft is open, when Sanjay picks "High net worth · 142" and a template and presses "Send", then it goes through the EP-34-S7 path with every check.
  4. Given Rajesh Verma (Staff) calls Create Broadcast from ageing alert directly, when it reaches the server, then it is refused, because the ageing alert is Owner only (EP-32-S11).
  5. Given no audience has been picked, when the draft opens, then no audience is preselected and "Send" stays disabled until one is chosen.
- **Rules enforced on the server:** Create Broadcast from ageing alert is Owner only (EP-05-S2). The server takes the piece ids from Read Ageing alert (EP-32-S11), not from the client, and attaches only `in_stock` pieces. The draft then follows EP-34-S5 and EP-34-S7 rules.
- **Live events emitted / consumed:** Consumed through EP-34-S8: "Piece billed by one staff member" drops a sold aged piece from the draft. Emitted: none.
- **Audit entry written:** No for creating the draft. The send is audited by EP-34-S7 as `broadcast_sent` with the piece ids.
- **Data changes:** Inserts a `broadcasts` draft row and `broadcast_pieces` rows. Adds Create Broadcast from ageing alert to the shared contract.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("GOLD SITTING TOO LONG", "196.4 g of gold has not moved in 90 days", "6 pieces, mostly Temple style · tied up on the floor · oldest is 108 days", "Push on WhatsApp"); `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("Attach pieces from the catalogue", "3 attached").
- **Non-functional checks:** Security: owner check on the server. Precision: the alert total stays an integer sum in units of 0.0001 g, shown to 4 decimals. Open decision G5: the ageing threshold; the button exists only when the card is shown.
- **Depends on:** EP-32-S11, EP-34-S5, EP-34-S7, EP-34-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- G9: should a public catalogue link exist, how long does it last, and what may it show? (EP-34-S1, S6, S14a, S14b)
- G17: is scheduling in scope, and are delivered, opened and replied tracked per recipient? (EP-34-S1, S9, S10, S11)
- G19: which audience groups and filters exist ("Collectors", "Festive collector", "Bought in last 6 months" versus VIP Bridal, High net worth, Regular, Wholesale)? (EP-34-S2, S3)
- D8: which provider sends broadcasts, and which templates are approved? (EP-34-S4, S7, S9, S11, S13)
- Who may send a broadcast: any staff member, or only the owner? (EP-34-S7)
- Is there a limit on how often one customer can receive broadcasts? (EP-34-S2, S7)
- G13: "Bought in last 6 months" needs purchase history; does a stock-out record the customer? (EP-34-S2)
