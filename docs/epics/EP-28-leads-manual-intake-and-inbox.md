# EP-28: Leads: manual intake and inbox

## 1. Summary

A lead is a customer's request for jewellery that the shop has not yet met. Leads arrive two ways: automatically from
a purchase order by email or WhatsApp (EP-29), or typed by staff at the counter for a walk-in or a phone call. This
epic covers the hand-typed lead, the shared inbox that lists both kinds, the lead states, and the 8-hour clock that
runs from arrival until a person works the lead. When the clock passes its limit, staff and then the owner are told.
The business needs this so that nothing a customer asks for is ever dropped, and slow replies show up before they cost
a sale.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M5 Front door
- Prototype status: Partial. `createLead`, `startWorkingLead`, `markLeadLost`, `slaState`, the `leads` inbox with tabs and the `lead-create` form work on mock data; the SLA runs in clock hours in the browser, nothing escalates on a schedule, and leads are not linked to customer records.

## 3. Roles involved

- Staff: types a lead at the counter; works leads from the inbox; starts working a lead; marks a lead lost with a reason.
- Owner: sees late leads on Decisions and in the inbox; can do everything staff can; sets the SLA hours and audience (EP-13).
- Karigar: not involved.
- System: stamps arrival time, computes the SLA in shop hours (pending A2), runs the breach check on a schedule (EP-10), notifies staff then the owner (EP-11), and pushes inbox changes live.

## 4. In scope

- Manual lead: customer name (required), phone, items (at least one line: name, style, quantity, approximate weight), needed-by date, note, optional photo.
- Manual leads enter at `opened`; automatic ones enter at `needs_glance` (created by EP-29).
- Lead states: needs_glance, opened, being_worked, converted, lost.
- Source: whatsapp, email, counter, shown on every row.
- Inbox tabs: "Needs a glance", "Being worked", "All", oldest first, with counts.
- SLA clock from arrival until the lead is being worked; phases running, late, met; labels "within time · 6 h left" and "8 h limit passed · owner told".
- SLA hours from settings (default 8, at least 1).
- Breach detection by a scheduled job and notification to staff first, then the owner (audience setting).
- Start working a lead (claims it with `takenBy`).
- Mark a lead lost with a reason. v1 has no holds, so marking a lead lost changes no piece.
- Linking a lead to a known customer by phone, with "known customer" shown on the form (G7, with EP-17 and EP-29).
- An expiry rule for "Lost or expired" (G25): the system supports a decided rule; the rule itself is open.
- Live inbox updates for every staff screen.

## 5. Out of scope

- Reading POs from email or WhatsApp, the parser and the review screen (EP-29).
- Routing items to stock or to a karigar and the "converted" rule (EP-30).
- The schedule runner (EP-10).
- Notification delivery and channels (EP-11, EP-12).
- The SLA hours, shop hours calendar and audience settings (EP-13).
- Customer records and their de-duplication (EP-17).
- Lead reports (EP-35).
- Photo storage (EP-09).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `LeadSource = 'whatsapp' | 'email' | 'counter'`; `LeadState = 'needs_glance' | 'opened' | 'being_worked' | 'converted' | 'lost'`; `LeadConfidence`; `LeadItem { id, name, style, qty, approxWeightG, route }`; `Lead { id, title, source, state, confidence, arrivedAt, customerName, phone, message, fields, items, neededBy, takenBy, note }`. No customer id on a lead.
- `src/store/transitions.ts`:
  - `createLead` requires a name ("Add the customer name.") and at least one item ("Add at least one item."); ids `LD-2026-NNN`; state `opened`, source default `counter`, confidence `clean`, `takenBy` the creator.
  - `startWorkingLead` refuses `needs_glance` ("Check and keep this lead first.") and moves `opened` to `being_worked`.
  - `markLeadLost` refuses a converted lead ("A converted lead cannot be marked lost.") and clears `heldForLeadId` on every piece held for it. Production v1 has no holds, so the clearing step is not carried over.
  - None of these are audited.
- `src/domain/leads.ts`: `slaRunning` (needs_glance or opened), `slaState(lead, now, slaHours)` in clock hours; `isFullyRouted`.
- Selectors: `lateLeads`, `leadsNeedingGlance`; rail badge `leads` (staff: needs a glance; owner: late).
- Settings: `leadSlaHours` 8 (`setSetting` refuses below 1: "The lead timer must be at least 1 hour."), `lateLeadAudience` `staff_then_owner`.
- Components: `src/components/leads/LeadInbox.tsx` (route `leads`, tabs glance, worked, all), `src/components/leads/LeadCreate.tsx` (route `lead-create`), `src/components/leads/ItemsEditor.tsx`, `src/components/leads/util.ts`.
- `LeadCreate.tsx` already matches the typed name against `state.customers` (line 17, trimmed, case-insensitive exact match). It offers customer names in a `known-customers` datalist, shows a "known customer" label on a match, and copies the customer's phone into the phone field when that field is empty. It does not store a customer id on the lead, so the lead stays unlinked. This is a name match; FR-28-4, G7 and EP-17 specify a phone match.
- The "owner told" label is text only; nothing is sent.
- Reusable: the state list, SLA phases and labels, sentences, the inbox and form, and the "known customer" hint and phone fill in `LeadCreate.tsx`.
- Must be rebuilt server-side: lead storage, the SLA in shop hours, the breach job and its notifications, customer linking, audit of state changes, and live inbox push.

## 7. Functional requirements

- FR-28-1. A staff member can create a lead with a customer name, phone, at least one item line, an optional needed-by date, an optional note and an optional photo.
- FR-28-2. The server refuses a lead without a customer name or without an item line, with the prototype sentences.
- FR-28-3. A manual lead enters in state opened with source counter and arrival time set by the server.
- FR-28-4. When the phone matches a known customer, the form shows "known customer" and the lead is linked to that customer record (G7).
- FR-28-5. The inbox lists leads from every source, oldest first, with source, state, arrival age and SLA label.
- FR-28-6. The inbox has tabs "Needs a glance", "Being worked" and "All", each with a count.
- FR-28-7. The server computes the SLA from arrival until the lead is being worked, using the configured hours (default 8) and the shop-hours rule once A2 is decided.
- FR-28-8. A scheduled job marks a lead late when its SLA passes and notifies the configured audience: staff first, then the owner, or the owner only.
- FR-28-9. A staff member can start working an opened lead; the server records who took it.
- FR-28-10. The server refuses to start working a lead that still needs a glance.
- FR-28-11. A staff member can mark a lead lost with a reason; no piece changes, because v1 has no holds and a linked piece was never reserved (EP-30).
- FR-28-12. The server refuses to mark a converted lead lost.
- FR-28-13. The system supports a decided expiry rule that moves an unworked lead to lost or expired (G25).
- FR-28-14. Every state change on a lead writes an audit entry.
- FR-28-15. New leads and state changes appear on every staff inbox within about 1 second.

## 8. Business rules

- BR-28-1. Every lead arrives one of two ways, automatic or by hand; both end as the same lead. [SCOPE-ANALYSIS App. H; mockup 16]
- BR-28-2. A manual lead has no message to read, so it enters at Opened. [SCOPE-ANALYSIS App. H; src/store/transitions.ts createLead]
- BR-28-3. Nothing a customer sends is ever dropped. [mockup 16]
- BR-28-4. The 8-hour timer runs from arrival regardless of source. [SCOPE-ANALYSIS App. H; mockup 17 "starts the same 8-hour clock"]
- BR-28-5. The timer counts shop hours, not clock hours (assumption pending confirmation). [SCOPE-ANALYSIS App. A A2; PRODUCTION-SCOPE §5 Time; mockup 13]
- BR-28-6. Staff are warned about a late lead before the owner is (assumption pending confirmation). [SCOPE-ANALYSIS App. A A3; mockup 13 "Staff first, then me"]
- BR-28-7. The SLA hours are a setting of at least 1 hour. [src/store/transitions.ts setSetting]
- BR-28-8. The clock stops once a person works the lead. [src/domain/leads.ts slaRunning]
- BR-28-9. No holds in v1: a lost lead has no hold to release; mockup 18 "If they walk away, the hold is released" is out of scope for v1. [owner decision, gap G6 resolved]
- BR-28-10. A converted lead cannot be marked lost. [src/store/transitions.ts markLeadLost]
- BR-28-11. Store UTC, display Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- Lead: id, title, source (`whatsapp`, `email`, `counter`), state, confidence, arrived at (UTC), customer id (nullable, G7), customer name, phone, message (empty for manual), needed by (nullable), taken by (user id, nullable), note, lost reason, late at (nullable), shop ID (D7).
- LeadItem: id, lead id, name, style, quantity, approximate weight (nullable integer, units of 0.0001 g), route (set by EP-30).
- LeadAttachment: lead id, file id from EP-09 (optional photo).
- SLA fields: limit hours at creation, breached at, notified audience.
- Audit entries: `lead_created`, `lead_started`, `lead_lost`, `lead_late` (new kinds).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Lead (manual) | Type a walk-in or phone lead | Staff, Owner |
| List | Leads | Inbox by tab, with SLA phase | Staff, Owner |
| Read | Lead | One lead with items | Staff, Owner |
| Update | Start working | Move opened to being worked | Staff, Owner |
| Update | Mark lost | Close with a reason | Staff, Owner |
| Read | Customer by phone | Find a known customer for the form | Staff, Owner |
| Run | SLA breach check | Mark late leads and notify | System (EP-10) |

## 11. Live events

- Emits: "Lead arrived / passed its SLA" — when a manual lead is created, and when the breach job marks any lead late, for the staff inbox and the owner.
- Consumes: "Lead arrived / passed its SLA" — so every open inbox adds new leads and moves late ones without a refresh.
- Consumes (proposed, not in catalogue): "Setting changed" — when the owner changes the SLA hours or audience, so SLA labels recompute (gap G26; emitted by EP-13).

## 12. Screens and UX references

- Route ids: `leads` (LeadInbox), `lead-create` (LeadCreate with ItemsEditor), `today` (lead cards near or past the limit), `decisions` (late leads card).
- Mockups: `16-lead-inbox.svg` (tabs "Needs a glance · 3 / Being worked · 4 / All · 11", "8 h limit passed · owner told", "within time · 6 h left", "typed at the counter", "Nothing a customer sends is ever dropped"), `17-lead-create.svg` right side (Mrs Nair "known customer", "Attach a photo (optional)", "starts the same 8-hour clock"), `12-state-lifecycles.svg` (lead rail, "Lost or expired"), `13-notifications-escalation.svg` ("2 leads nobody has opened for over 8 hours", rules panel).

## 13. Non-functional requirements

- Time: arrival and breach times stored in UTC; SLA computed in shop hours in Asia/Kolkata once A2 is decided.
- Performance: the inbox loads under 2 seconds on a shop connection; a new lead appears on other inboxes within about 1 second.
- Concurrency: two staff starting the same lead at once: one records `takenBy`, the other sees who took it.
- Audit: every state change, including lost with its reason, is appended.
- Personal data: customer name and phone on a lead are personal data under the DPDP Act 2023; a lead linked to a customer follows that customer's deletion request.
- Security: staff and owner only; karigars never see leads (mockup 11).

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-17, EP-10, EP-08
- Downstream: EP-29, EP-30, EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a walk-in, when Rajesh creates a lead for Mrs Nair with one item, then it appears in the inbox at opened, source counter, with "within time · 8 h left".
2. Given Mrs Nair's phone is on a customer record, when Rajesh types it, then the form shows "known customer" and the lead links to that record.
3. Given a lead arrived 8 shop hours ago and nobody worked it, when the breach job runs, then the lead is late, staff are told, and the owner is told as the audience setting says.
4. Given a lead is being worked, when time passes the limit, then it is not marked late.
5. Given a lead with TAG-8841 linked to one of its lines, when staff mark it lost with "bought elsewhere", then the lead is lost and TAG-8841 is unchanged in stock.
6. Given another staff member has the inbox open, when a lead is created, then it appears there within about 1 second.

## 16. Risks

- Risk: shop hours are not decided and the SLA fires at night. Mitigation: settle A2 and the shop-hours calendar in EP-13 before the breach job.
- Risk: leads are duplicated for one customer. Mitigation: phone match to a known customer (G7).
- Risk: the inbox fills with old opened leads nobody closes. Mitigation: decide G25 expiry.
- Risk: the owner is told too often. Mitigation: A3 audience setting and one late-leads card, not one per lead.

## 17. Open decisions and questions

- A2: does the 8-hour timer count shop hours or clock hours, and what are the shop hours?
- A3: are staff warned before the owner, by which channel, and how long before?
- G7: how is a known customer matched (exact phone, normalised phone), and what if two records match?
- G7: the prototype matches by name (`LeadCreate.tsx`), while FR-28-4, G7 and EP-17 match by phone. Should production match by phone only, by name only, or by both?
- G25: when does an unworked lead become "Lost or expired", and is that automatic?
- Can a lead be assigned to, or claimed by, one staff member, and can another take it over (`takenBy`)?
- Does the clock stop at "being worked", or only when the customer gets a reply?
- D7 is decided: one shop, no branches ([decision record](../decisions/tenancy-and-branches.md)); there is one inbox for the shop.

## 18. Candidate stories

1. EP-28-S1: System can store leads, items and their states
2. EP-28-S2: Staff can create a lead by hand at the counter
3. EP-28-S3: Staff can add item lines with style, quantity and approximate weight
4. EP-28-S4: Staff can attach an optional photo to a manual lead
5. EP-28-S5: Staff can see a known customer matched by phone (G7)
6. EP-28-S6: Staff can see every lead in one inbox with source and SLA
7. EP-28-S7: Staff can filter the inbox by Needs a glance, Being worked and All
8. EP-28-S8: System can compute the SLA in shop hours on the server
9. EP-28-S9: System can mark a lead late and notify staff then the owner
10. EP-28-S10: Staff can start working a lead
11. EP-28-S11: Staff can mark a lead lost with a reason
12. EP-28-S12: System can expire an unworked lead under the decided rule (G25)
13. EP-28-S13: Staff can see new and late leads arrive live
14. EP-28-S14: System can audit every lead state change
