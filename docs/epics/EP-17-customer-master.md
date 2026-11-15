# EP-17: Customer master

## 1. Summary

The customer master is the shop's directory of buyers: name, phone (which is also their WhatsApp number), city,
optional address, group, birthday, anniversary, whether they agreed to WhatsApp messages, and the pieces they have taken
home, listed by tag and grams. Wishes, broadcasts and leads all start from this record. The business needs it on the
server for three reasons. Customer names, phones and dates are personal data under India's Digital Personal Data
Protection Act, 2023, so consent must be recorded with its time and source, opt-out must be honoured, and deletion must
be possible. Leads and POs must recognise a known customer by phone instead of creating a duplicate (gap G7). And the
record must keep empty sockets for budget and spend that light up only when pricing is switched on later (EP-42).

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Partial. `onboardCustomer` (name and phone required, no role check), the `customers` directory with search, group filter and a detail drawer, and the `customer-new` form exist; consent is a plain `optedIn` boolean with no time or source, there is no edit, no deletion, no duplicate check, and the piece history is seeded.

## 3. Roles involved

- Owner: everything staff can do, plus handling deletion requests (with EP-39) and, per decision, managing groups.
- Staff: adds a customer at the counter, edits details, records or withdraws consent on the customer's word, searches the directory, reads piece history. Mockup 11 lists "Add a customer and send wishes" for staff.
- Karigar: not involved; a karigar never sees customers (mockup 11).
- System: checks phone format and duplicates, stores consent events, matches incoming leads to customers by phone, and keeps value fields null until pricing is on.

## 4. In scope

- Customer record: name, phone (= WhatsApp), city, address (optional), group, birthday, anniversary, notes.
- Staff add a customer; name and a phone with at least 10 digits are required.
- Staff edit a customer's details.
- Consent for WhatsApp messages recorded as an event with time, source (counter, WhatsApp reply, form) and the staff member who recorded it.
- Withdrawing consent (opt-out), effective at once for wishes and broadcasts.
- Directory with search by name, phone or city and a filter by group.
- Customer detail with piece history by weight: tag, piece name, pure gold grams, date; total grams taken home.
- Duplicate detection by phone on add and edit.
- Customer matching by phone (G7): when a manual lead or a PO arrives, the system finds the known customer by phone and links the lead to them instead of creating a new record. This epic provides the match; EP-28 and EP-29 call it.
- Customer groups (the set is open, G19).
- Budget and spend as nullable value sockets, shown through `ValueSlot` only, dark until EP-42.
- Deletion request handling on the record side (erase or anonymise personal fields), driven by the EP-39 flow.

## 5. Out of scope

- Sending wishes and the daily queue (EP-33).
- Broadcast audience filters and sending (EP-34).
- Creating leads from the counter, email or WhatsApp (EP-28, EP-29); this epic only answers "who is this phone".
- Recording which customer took which piece at stock-out (EP-26; the missing link is gap G13).
- Budget, spend and any price logic (EP-42).
- The legal consent and deletion process, access review and the conflict with the append-only audit log (EP-39, EP-06; gap G22).
- Loading existing customers at launch (EP-41).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Customer {id, name, phone, city, group: CustomerGroup, dob, anniversary (ISO YYYY-MM-DD or null), optedIn: boolean, history: HistoryRow[], notes, budgetINR: null, spentINR: null}`; `HistoryRow {id, name, tag, pureG, on}`; `CustomerGroup = 'VIP Bridal' | 'High net worth' | 'Regular' | 'Wholesale'`.
- `src/store/transitions.ts` `onboardCustomer`: "Add the customer name.", "Add a phone number."; id `CU-NNN`; history empty; value sockets null; no role check, no audit, no duplicate check.
- `src/components/people/OnboardCustomer.tsx` (route `customer-new`): client checks "Add a phone number with at least 10 digits. It is also the WhatsApp number.", "Give both the day and the month of the birthday, or neither." (same for anniversary); `GROUPS` list from the type; default group Regular.
- `src/components/people/Customers.tsx` (route `customers`): search across name, phone (spaces ignored) and city; group filter; drawer with history newest first and "N pieces in all"; empty search text "Nobody matches that. Clear the search or add them as a new customer."
- `src/store/selectors.ts` `wishesDueToday` reads `dob`, `anniversary` and `optedIn`.
- `sendWishes` and `sendBroadcast` skip customers with `optedIn` false.
- `src/components/ui/ValueSlot.tsx` renders nothing while `pricingEnabled` is false.
- `stockOut` records no customer, so `Customer.history` has no live source (G13).
- Reusable: the record shape, the form and its messages, the directory search and drawer, the `ValueSlot` sockets.
- Must be rebuilt server-side: storage, edit, consent events with time and source, opt-out, duplicate and phone matching, deletion handling, audit of changes, and a real history source.

## 7. Functional requirements

- FR-17-1. A staff or owner user can add a customer with name and phone; the server rejects a missing name with "Add the customer name." and a phone with fewer than 10 digits.
- FR-17-2. The server normalises the phone (digits with country code) before storing and matching.
- FR-17-3. The server warns when the phone already belongs to a customer and shows that customer, and does not create a second record unless the decided duplicate rule allows it.
- FR-17-4. A staff or owner user can edit name, phone, city, address, group, birthday, anniversary and notes.
- FR-17-5. The server rejects a birthday or anniversary with a day but no month, or a month but no day.
- FR-17-6. Recording consent stores a consent event with time, source and the user who recorded it; the customer's current consent is the latest event.
- FR-17-7. Withdrawing consent stores an opt-out event; from that moment wishes and broadcasts skip the customer.
- FR-17-8. A karigar user is refused every customer operation.
- FR-17-9. The directory searches name, phone (ignoring spaces) and city, filters by group, and pages results.
- FR-17-10. The customer detail shows piece history by tag, name, pure gold grams and date, and the total grams taken home.
- FR-17-11. The system supports matching by phone (G7): given a phone from a manual lead or a PO, it returns the known customer or none.
- FR-17-12. Budget and spend fields are stored as null and rendered only through `ValueSlot`; nothing in this epic reads or writes an amount.
- FR-17-13. On an approved deletion request (EP-39), the server erases or anonymises name, phone, address, birthday and anniversary and keeps piece history by tag and grams without the personal fields.
- FR-17-14. Every add, edit, consent change and deletion writes an audit entry; the entry does not copy the deleted personal values (per G22 answer).

## 8. Business rules

- BR-17-1. The phone is also the WhatsApp number. [mockup 23]
- BR-17-2. Consent for WhatsApp messaging is recorded, opt-out is honoured, and deletion requests are supported. [PRODUCTION-SCOPE §5 Personal data]
- BR-17-3. Birthday and anniversary are ISO dates (day and month required together). [src/types/jewellery.ts Customer; src/components/people/OnboardCustomer.tsx]
- BR-17-4. Budget and spend are `ValueSlot` fields, dark until pricing is on. [SCOPE-ANALYSIS App. G "Customer directory — resolved"; mockup 23 "fills in when pricing is switched on"]
- BR-17-5. Piece history is keyed by tag and grams, not price: "135.890 g taken home". [mockup 23; SCOPE-ANALYSIS App. G]
- BR-17-6. The customer directory is built now, fully. [SCOPE-ANALYSIS App. G]
- BR-17-7. Staff can add a customer and send wishes. [mockup 11]
- BR-17-8. Only opted-in customers receive wishes and broadcasts. [src/store/transitions.ts sendWishes, sendBroadcast]
- BR-17-9. A karigar never sees customers. [mockup 11]

## 9. Data

- Customer: id, name, phone (normalised), city, address (nullable), group, birthday (date, nullable), anniversary (date, nullable), notes, branch key (if D7), status (`active`, `erased`), created at, created by, version.
- ConsentEvent: id, customer id, kind (`opt_in`, `opt_out`), source (`counter`, `whatsapp_reply`, `form`, `import`), recorded by, at.
- HistoryRow: customer id, piece tag, piece name, pure gold (integer, units of 0.0001 g), date; source is open (G13).
- Value sockets: budget and spend, nullable value socket, unused until EP-42.
- CustomerGroup: the group set (open, G19), possibly a reference list in EP-15.
- DeletionRequest: lives in EP-39; this epic adds the erase action on the record.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Customer | Add a customer | Staff, Owner (per decision) |
| Update | Customer | Edit details | Staff, Owner |
| List | Customers | Directory with search, group filter and paging | Staff, Owner |
| Read | Customer | Detail with history by weight | Staff, Owner |
| Find | Customer by phone | Match a phone to a known customer (G7) | Staff, Owner, System |
| Create | Consent event | Record opt-in or opt-out with source | Staff, Owner, System (WhatsApp STOP reply) |
| Erase | Customer personal data | Carry out an approved deletion request | System (from EP-39), Owner |

## 11. Live events

None. Customer records change at the counter and do not race in a way that costs money. A consent withdrawal is read by EP-33 and EP-34 at send time on the server, so no push is needed.

## 12. Screens and UX references

- Route ids: `customers` (Customers, on both staff and owner rails), `customer-new` (OnboardCustomer).
- Mockups: `23-onboard-customer.svg` (name, "Phone · also the WhatsApp number", city, address optional, groups VIP Bridal / High net worth / Festive collector, birthday, anniversary, "Send wishes on WhatsApp", "COMES LATER · WITH PRICING" budget and spend, "WHAT THEY HAVE TAKEN HOME · BY WEIGHT, NOT PRICE", "135.890 g taken home"), `15-value-ready.svg` (budget line socket), `17-lead-create.svg` ("known customer" match, G7), `26-wishes.svg` (consent).
- Not yet designed (MOCKUP-COVERAGE §3): customer directory and customer detail. The prototype `customers` screen was built without a mockup and needs a design pass; an edit form, consent history and the duplicate warning are also undrawn.

## 13. Non-functional requirements

- Personal data: name, phone, address, birthday and anniversary are personal data under the DPDP Act, 2023; consent is stored with time and source; deletion is supported; obligations are verified with a professional (EP-39).
- Security: karigar users cannot call any customer operation; customer lists are never sent to the karigar portal.
- Audit: changes are audited without copying erased personal values into the append-only log (G22).
- Concurrency: two staff adding the same phone at once produce one customer; the phone has a unique index among active customers if the duplicate rule says so.
- Precision: history grams are integers, units of 0.0001 g.
- Performance: phone match returns in under 200 ms (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none) so lead creation stays instant; the directory loads under 2 seconds for 10,000 customers.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05, EP-08
- Downstream: EP-28, EP-33, EP-39, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given staff on `customer-new`, when they add Meera Iyer, +91 98840 21107, Chennai, VIP Bridal, birthday 14 Mar, and tick "Send wishes on WhatsApp", then the customer is stored with an opt-in consent event naming the staff member and time.
2. Given a customer with phone +91 98840 21107 exists, when staff add another customer with "98840 21107", then the server warns and shows the existing customer.
3. Given an opted-in customer, when staff record an opt-out, then the next wishes run and broadcast skip them.
4. Given a manual lead with phone +91 98840 21107, when the lead form asks for a match, then Meera Iyer is returned (G7).
5. Given pricing is off, when anyone opens the customer detail, then no budget or spend figure is shown and no amount is stored.
6. Given an approved deletion request, when it is carried out, then name, phone, address and dates are erased and the history keeps only tags and grams.

## 16. Risks

- Risk: consent recorded as a plain boolean cannot prove when or how it was given. Mitigation: store consent events with time and source from the first story.
- Risk: duplicates from leads and POs split one customer's history. Mitigation: phone normalisation and matching (G7) before EP-28.
- Risk: piece history stays empty because stock-out records no customer (G13). Mitigation: keep G13 open with EP-26 and decide before EP-26 is built.
- Risk: deletion conflicts with the append-only audit log that holds customer names. Mitigation: G22 decision in EP-39 and EP-06; avoid copying personal values into audit summaries.
- Risk: groups in the type and on the mockups differ, so broadcast audiences are wrong. Mitigation: settle G19 before EP-34.

## 17. Open decisions and questions

- Who may add a customer: staff (mockup 11 "Add a customer and send wishes") or owner only (the mockups README places onboarding under owner-level)?
- G19: which customer groups exist (type: VIP Bridal, High net worth, Regular, Wholesale; mockups: Festive collector, Collectors, "Bought in last 6 months")? Are they fixed or a reference list?
- G13: where does piece history come from, given stock-out records no customer today?
- G7: when a lead's phone matches a customer but the name differs, which wins, and who confirms the match?
- Can two customers share a phone (family members)?
- D7: are customers shop-wide or per branch?
- G22: how is a deletion request carried out when the audit log already holds the customer's name?
- How long is a deleted customer's anonymised history kept?

## 18. Candidate stories

1. EP-17-S1: System can store customers with normalised phones and nullable value sockets
2. EP-17-S2: System can store consent as events with time, source and recorder
3. EP-17-S3: Staff can add a customer at the counter
4. EP-17-S4: System can warn about a duplicate phone on add and edit
5. EP-17-S5: Staff can edit a customer's details
6. EP-17-S6: Staff can record a customer's WhatsApp consent
7. EP-17-S7: Staff can record a customer's opt-out
8. EP-17-S8: Staff can search and filter the customer directory
9. EP-17-S9: Staff can see a customer's piece history by tag and grams
10. EP-17-S10: System can match a phone to a known customer for leads and POs (G7)
11. EP-17-S11: System can keep budget and spend dark behind the pricing switch
12. EP-17-S12: System can refuse every customer operation from a karigar
13. EP-17-S13: Owner can carry out an approved deletion request on a customer
14. EP-17-S14: System can audit customer changes without copying erased values
