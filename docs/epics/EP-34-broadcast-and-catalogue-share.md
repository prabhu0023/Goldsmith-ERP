# EP-34: Broadcast and catalogue share

## 1. Summary

Broadcast sends one WhatsApp message to a chosen audience of customers, for example the Deepavali bridal collection
to the VIP Bridal group. Staff pick who hears it, start from a template, attach in-stock pieces from the catalogue,
see the message as it will land on the customer's phone, and send it. Only customers who opted in are counted and
messaged. Catalogue share makes a small showcase of in-stock pieces, with photos and weights but never a price, and
sends it to an audience or to one person. Replies from customers become leads in the inbox, so nothing a customer
sends is lost. The business needs this to bring customers in for new and aged stock without breaking consent rules.

## 2. Layer, milestone, status

- Layer: D · Experience
- Milestone: M6 Homes and outreach
- Prototype status: Partial. `sendBroadcast` records a broadcast to an opted-in customer group with in-stock pieces, and the `broadcast` and `catalogue` screens show the audience, templates, preview and a reply simulator; nothing is sent, there is no schedule, no delivery or reply tracking, no "To one person" send, and the shared link is made up.

## 3. Roles involved

- Staff: picks an audience, writes or picks a template, attaches in-stock pieces, previews, sends; makes a catalogue showcase and shares it.
- Owner: does the same; starts a broadcast of aged pieces from the ageing alert ("Push on WhatsApp", EP-32).
- Karigar: not involved.
- System: resolves the audience to opted-in customers, refuses pieces not in stock, sends through EP-12 (scheduled through EP-10 when G17 is decided), records delivered, opened and replied, turns replies into leads through EP-29, and removes sold pieces from drafts.

## 4. In scope

- Audience by customer group, with counts of opted-in customers; "All" customers.
- Audience filters such as "Bought in last 6 months" and "+ add a filter" (G19: the groups and filters are not yet agreed).
- Templates: "Festive preview", "New arrivals", "Blank"; {name} filled with the first name per person.
- Attach in-stock pieces with photo, name, purity and pure gold; refuse pieces not in stock at send time.
- Phone preview "How it lands on their phone".
- Send now to every opted-in customer in the audience; customers not opted in are counted as skipped and never messaged.
- Schedule for later ("Send now, or schedule for Deepavali eve") (G17).
- Tracking per recipient: delivered, opened, replied (G17).
- Replies become leads in needs_glance, linked to the broadcast and the customer (with EP-29).
- Catalogue share: pick in-stock pieces with filters (style, collection, weight, tag), show total pure gold "no price shown", send to a broadcast audience or "To one person".
- "Copy a link": a public showcase link a customer can open without signing in (G9), subject to the EP-39 security review.
- The piece card value socket stays empty while pricing is off.
- Drafts drop pieces that are sold before sending.

## 5. Out of scope

- The WhatsApp provider, template approval and delivery receipts (EP-12).
- The scheduler (EP-10).
- Parsing replies and the review screen (EP-29).
- Customer groups as reference data and customer records (EP-15, EP-17).
- Consent capture, opt-out flow and the security review of the public link (EP-17, EP-39).
- Wishes (EP-33).
- Prices on the piece card (EP-42).
- Outreach reports (EP-35).
- Photo storage and delivery (EP-09).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `Broadcast { id, at, audience: CustomerGroup | 'All', message, pieceIds, recipientIds, sentBy }`; `CustomerGroup = 'VIP Bridal' | 'High net worth' | 'Regular' | 'Wholesale'`.
- `src/store/transitions.ts`:
  - `sendBroadcast` refuses an empty message ("Write the message."), a piece not in stock ("{id} is not in stock, so it cannot be shown."), and an audience with nobody opted in ("Nobody opted-in is in that audience."); creates `BC-` record with recipients. Not audited, sends nothing.
  - `simulateReply` creates a lead in `needs_glance` from a broadcast reply, source `whatsapp`, confidence `unsure`.
- `src/components/marketing/util.tsx`: `GROUPS`, `reachable` (opted in and in group), `fillName`, `PhonePreview`.
- `src/components/marketing/Broadcast.tsx` (route `broadcast`): audience chips for the four groups and Everyone, templates `festive`, `new`, `blank`, attach pieces, "Going to {n} opted-in ...", skipped count, latest broadcast, "Simulate a customer reply".
- `src/components/marketing/CatalogueShare.tsx` (route `catalogue`): filter pieces, choose, total pure gold, "Send to a broadcast audience" through `sendBroadcast` with a fixed message, "Copy a link" copies `https://jaigulabdev.example/showcase/{ids}`.
- Deviations recorded in `.agents/tasks/jgd-redesign/features/FEAT-005.json`: no "Collectors", "Bought in last 6 months" or "+ add a filter"; no schedule; "To one person" not built; made-up link.
- The ageing alert's "Push on WhatsApp" (mockup 08) is not built.
- Reusable: the audience and consent rule, templates, preview, piece picker, reply-to-lead idea, sentences.
- Must be rebuilt server-side: audience resolution, consent check at send, real sending and status tracking, scheduling, reply intake, a signed public link with expiry, audit.

## 7. Functional requirements

- FR-34-1. A staff member can choose an audience by customer group or All and see the count of opted-in customers and how many are skipped.
- FR-34-2. The system supports the audience filters agreed under G19.
- FR-34-3. A staff member can start from a template and edit the message; {name} is replaced per recipient with the first name.
- FR-34-4. A staff member can attach in-stock pieces; the server refuses a piece that is not in stock at send time.
- FR-34-5. Pieces sold after they were attached are removed from the draft and the staff member is told.
- FR-34-6. A staff member can preview the message as it lands on a phone.
- FR-34-7. Sending messages only opted-in customers in the audience, checked at the moment of sending.
- FR-34-8. The server refuses a send with no message or with nobody opted in.
- FR-34-9. Messages go out through approved WhatsApp templates (EP-12).
- FR-34-10. A staff member can schedule a broadcast for a later time; the system sends it then (G17).
- FR-34-11. The system records delivered, opened and replied per recipient and shows totals on the broadcast (G17).
- FR-34-12. A reply to a broadcast becomes a lead in needs_glance linked to the broadcast and the customer.
- FR-34-13. A staff member can build a catalogue showcase from in-stock pieces with filters and see the total pure gold, with no price shown.
- FR-34-14. A staff member can send the showcase to a broadcast audience or to one opted-in person.
- FR-34-15. The system supports a public showcase link that opens without sign-in, shows only the chosen in-stock pieces and expires as decided (G9).
- FR-34-16. A sold or scrapped piece no longer shows on a public link.
- FR-34-17. The owner can start a broadcast pre-filled with the aged pieces from the ageing alert.
- FR-34-18. Every broadcast and every link created writes an audit entry with sender, audience size and pieces.

## 8. Business rules

- BR-34-1. Only customers who opted in are counted and messaged. [mockup 27; src/components/marketing/util.tsx reachable]
- BR-34-2. Replies become leads, so nothing a customer sends is lost. [mockup 27; mockup 28; SCOPE-ANALYSIS App. H]
- BR-34-3. Only in-stock pieces can be shared, so nothing sold or scrapped ever goes out. [mockup 28; src/store/transitions.ts sendBroadcast]
- BR-34-4. Photos and weights go, never a price. [mockup 28]
- BR-34-5. A price can appear later without changing the layout; the slot is already in the piece card. [mockup 28; SCOPE-ANALYSIS App. G]
- BR-34-6. {name} shows as the recipient's real name. [mockup 27]
- BR-34-7. Outbound messages outside a conversation need pre-approved templates. [PRODUCTION-SCOPE §4 D8]
- BR-34-8. Record consent and honour opt-out. [PRODUCTION-SCOPE §5 Personal data]
- BR-34-9. A sold piece disappears from every staff screen at once. [PRODUCTION-SCOPE §1 "Piece billed by one staff member"]
- BR-34-10. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Broadcast: id, created by, audience definition (group, filters), message text, template id, piece ids, status (draft, scheduled, sending, sent, failed), scheduled for (nullable, G17), sent at, recipient count, skipped count.
- BroadcastRecipient: broadcast id, customer id, provider message id, delivered at, opened at, replied at, lead id (nullable).
- Showcase: id, piece ids, created by, created at, audience or one customer id, public link token (hashed), link expires at, revoked at (G9).
- Piece references: pure gold per piece and total (integers, units of 0.0001 g); value socket nullable, unused until EP-42.
- Audit entries: `broadcast_sent`, `broadcast_scheduled`, `showcase_link_created` (new kinds).

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Audience count | Opted-in and skipped counts for a group or filter | Staff, Owner |
| List | Message templates | Festive preview, New arrivals, Blank | Staff, Owner |
| List | Shareable pieces | In-stock pieces with filters | Staff, Owner |
| Create | Broadcast | Send now to an audience | Staff, Owner |
| Create | Scheduled broadcast | Send later (G17) | Staff, Owner |
| Read | Broadcast status | Delivered, opened, replied | Staff, Owner |
| Create | Showcase | Share pieces with an audience or one person | Staff, Owner |
| Create | Public showcase link | Link that opens without sign-in (G9) | Staff, Owner |
| Read | Public showcase | Chosen in-stock pieces, no price | Anyone with a valid link |
| Delete | Public showcase link | Revoke a link | Staff, Owner |

## 11. Live events

- Consumes: "Piece billed by one staff member" — to drop a sold piece from drafts, the picker and public links.
- Emits: none from the catalogue. A reply becomes a lead through EP-29, which emits "Lead arrived / passed its SLA".

## 12. Screens and UX references

- Route ids: `broadcast` (Broadcast), `catalogue` (CatalogueShare), `decisions` ("Push on WhatsApp" on the ageing alert), `stock` (mockup 03 drawer "Share"; not built in the prototype drawer).
- Mockups: `27-broadcast.svg` ("WHO HEARS IT · VIP Bridal · 86 · High net worth · 142 · Collectors · 210 · Bought in last 6 months · + add a filter", templates, "{name} is filled in per person", "Attach pieces from the catalogue", "HOW IT LANDS ON THEIR PHONE", "Delivered, opened, and who replied are tracked — replies become leads", "Send now, or schedule for Deepavali eve" (G17)), `28-catalogue-share.svg` ("Pick from in-stock pieces ... never a price", "A showcase of 4 pieces · 172.780 g of pure gold across them · no price shown", "To one person", "Copy a link" (G9), "price added here once pricing is on"), `08-owner-home.svg` ("Push on WhatsApp").

## 13. Non-functional requirements

- Personal data: only opted-in customers are messaged; consent is checked at send time; opt-out from a reply is honoured at once; recipient lists are not exported in logs.
- Security: a public link carries an unguessable token, shows only chosen in-stock pieces with no customer data, can expire and be revoked, and is reviewed in EP-39 (G9).
- Concurrency: a piece sold between attach and send is refused at send, not sent.
- Performance: audience counts return under 2 seconds; a public link page loads under 2 seconds on a mobile connection.
- Precision: total pure gold is an integer sum in units of 0.0001 g.
- Audit: every send, schedule and link creation is appended.
- Time: schedules stored in UTC and chosen in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-33, EP-22, EP-29, EP-08
- Downstream: EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given 86 opted-in VIP Bridal customers, when Rajesh sends the festive template with 3 in-stock pieces, then 86 messages go out with each first name filled in, and customers not opted in get nothing.
2. Given a piece attached to a draft is sold by another staff member, when Rajesh sends, then the server refuses that piece and tells him which one.
3. Given Meera replies "Yes please" to the broadcast, when the reply arrives, then a lead in needs_glance appears linked to the broadcast and to Meera.
4. Given 4 in-stock pieces totalling 172.780 g, when Rajesh makes a showcase, then the total shows and no price appears.
5. Given a public showcase link, when one of its pieces is sold, then the link no longer shows that piece.
6. Given a scheduled broadcast for Deepavali eve, when the time arrives, then it is sent to the audience as resolved at that moment (G17, once decided).

## 16. Risks

- Risk: messaging customers who did not consent breaks the DPDP Act and WhatsApp rules. Mitigation: consent check at send, template approval under D8, review in EP-39.
- Risk: a public link exposes stock to anyone forever. Mitigation: unguessable token, expiry, revoke, security review (G9).
- Risk: audience groups in the mockups do not exist in the data (G19). Mitigation: agree the groups with EP-15 and EP-17 before build.
- Risk: large broadcasts hit provider rate limits. Mitigation: send through a queue in EP-10 and EP-12.
- Risk: replies flood the inbox after a big broadcast. Mitigation: link replies to the broadcast and let staff filter by it.

## 17. Open decisions and questions

- G9: should a public catalogue link exist, how long does it last, and what may it show?
- G17: is scheduling in scope, and are delivered, opened and replied tracked per recipient?
- G19: which audience groups and filters exist ("Collectors", "Festive collector", "Bought in last 6 months" versus VIP Bridal, High net worth, Regular, Wholesale)?
- D8: which provider sends broadcasts, and which templates are approved?
- Who may send a broadcast: any staff member, or only the owner?
- Is there a limit on how often one customer can receive broadcasts?
- G13: "Bought in last 6 months" needs purchase history; does a stock-out record the customer?

## 18. Candidate stories

1. EP-34-S1: System can store broadcasts, recipients and showcases
2. EP-34-S2: System can resolve an audience to opted-in customers with a skipped count
3. EP-34-S3: Staff can choose an audience by group and see the counts
4. EP-34-S4: Staff can start from a template and fill {name} per person
5. EP-34-S5: Staff can attach in-stock pieces to a broadcast
6. EP-34-S6: Staff can preview a broadcast as it lands on a phone
7. EP-34-S7: Staff can send a broadcast to opted-in customers
8. EP-34-S8: System can drop sold pieces from drafts live
9. EP-34-S9: System can turn a broadcast reply into a lead
10. EP-34-S10: Staff can schedule a broadcast for later (G17)
11. EP-34-S11: Staff can see delivered, opened and replied counts (G17)
12. EP-34-S12: Staff can build a catalogue showcase with no price shown
13. EP-34-S13: Staff can send a showcase to one person
14. EP-34-S14: Staff can create and revoke a public showcase link (G9)
15. EP-34-S15: Owner can push aged pieces from the ageing alert into a broadcast
