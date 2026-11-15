# EP-33: Wishes

## 1. Summary

Wishes sends birthday and anniversary greetings to customers on WhatsApp. Each morning the system lists the customers
whose birthday or anniversary is today or tomorrow, taken from their profile. Staff can send a wish with a tap, or the
owner can let the system send them itself at 9 am. A wish comes from a known name under the owner, one of two sender
identities, using one message template with {name} filled in per person. A customer who has not opted in to WhatsApp is
still shown so staff can call instead, but is never messaged automatically. The business needs this because a personal
greeting from a known name keeps customers close, and missing one costs goodwill.

## 2. Layer, milestone, status

- Layer: D · Experience
- Milestone: M6 Homes and outreach
- Prototype status: Partial. `sendWishes` records `WishRecord` entries for opted-in customers whose date is today, with a 24-hour de-duplication, and the `wishes` screen shows today and tomorrow, two senders and an auto-send toggle; nothing is sent, nothing runs at 9 am, and the edited template is not stored.

## 3. Roles involved

- Staff: sees the queue, sends a wish now, previews, calls a customer who is not opted in.
- Owner: does the same; chooses whether auto-send is on (who may change it is G12); chooses the sender identities; edits the template.
- Karigar: not involved.
- System: builds the daily queue, checks consent at send time, sends at 9 am Asia/Kolkata when auto-send is on, sends through EP-12, records delivery status, and never sends the same wish twice.

## 4. In scope

- Daily queue: customers with a birthday or anniversary today and tomorrow, from EP-17 profile dates.
- For each row: name, occasion, group, last purchase or piece count, consent state, and the action (send now, preview, call instead).
- Customers not opted in are shown with "not opted in to WhatsApp · will not auto-send · Call instead".
- Send now for one or several rows.
- Auto-send at 9 am Asia/Kolkata each day when the setting is on, through a scheduled job (EP-10).
- Two sender identities under the owner; the chosen identity appears on the message (SCOPE-ANALYSIS Q9).
- One birthday template and one anniversary template with {name}; edit once, applies to all.
- Consent check at the moment of sending, not only when the queue is built.
- De-duplication: one wish per customer per occasion per year.
- Delivery status per wish: queued, sent, delivered, failed (from EP-12).
- Today's wishes count for the homes (EP-31, EP-32).

## 5. Out of scope

- Customer profiles, dates and consent capture (EP-17).
- The WhatsApp provider, template approval and delivery receipts (EP-12).
- The scheduler (EP-10).
- The auto-send setting store and who may change it (EP-13, G12).
- Broadcasts to groups and catalogue share (EP-34).
- Consent ledger, opt-out flow and deletion requests (EP-39).
- Reports on wishes sent (EP-35).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `WishRecord { id, at, customerId, kind: 'birthday' | 'anniversary', sender }`; `Customer.dob`, `Customer.anniversary` (ISO dates), `Customer.optedIn`; `Settings.autoSendWishes` (seed false).
- `src/store/transitions.ts` `sendWishes(customerIds, sender)`: skips customers not opted in or with no occasion today, skips a wish of the same kind within 24 hours, creates `WS-` records. Not guarded by owner, not audited, sends nothing.
- `src/store/selectors.ts` `wishesDueToday` (uses `isMonthDayToday` from `src/domain/clock.ts`).
- `src/components/marketing/Wishes.tsx` (route `wishes`): auto-send toggle calling `setSetting('autoSendWishes', ...)` for any role (G12); queue for today and tomorrow; "Opted in · scheduled for 9 am tomorrow" or "auto-send is off"; senders are the owner and the first showroom staff member, labelled "(Owner)" and "(Showroom staff)"; "Edit the message" keeps the text only on screen.
- Deviations recorded in `.agents/tasks/jgd-redesign/features/FEAT-005.json`: no "Manager" role, so "Priya (Manager)" is not reproduced (G20); edited text not stored; "Call instead" shows only if a not-opted-in customer has a date today.
- `StaffToday.tsx` "SAY HAPPY BIRTHDAY" list and `OwnerDecisions.tsx` "wishes sent" count read the same data.
- Reusable: the queue rule, the de-duplication idea, the screen and phone preview (`src/components/marketing/util.tsx` `PhonePreview`, `fillName`).
- Must be rebuilt server-side: the daily job, template storage, sender identity storage, consent check at send, real sending and delivery status, owner check on the toggle, audit.

## 7. Functional requirements

- FR-33-1. The system builds a queue of customers whose birthday or anniversary falls today or tomorrow in Asia/Kolkata.
- FR-33-2. Each row shows the customer, the occasion, the group, the consent state and the right action.
- FR-33-3. A staff member can send a wish now to one or several opted-in customers in today's queue.
- FR-33-4. The server refuses to message a customer who is not opted in at the moment of sending.
- FR-33-5. A not-opted-in customer is shown with "Call instead" and never sent a message.
- FR-33-6. When auto-send is on, a scheduled job sends today's wishes at 9 am Asia/Kolkata to every opted-in customer not already wished.
- FR-33-7. The server sends at most one wish per customer per occasion per year.
- FR-33-8. The sender is one of two configured identities under the owner; the message shows that name.
- FR-33-9. The owner can edit the birthday and anniversary templates; {name} is replaced by the customer's first name; the change applies to all later wishes.
- FR-33-10. The message is sent through an approved WhatsApp template (EP-12).
- FR-33-11. Each wish records sender, template version, time and delivery status (queued, sent, delivered, failed).
- FR-33-12. A failed send is shown on the screen and retried by the decided rule.
- FR-33-13. A staff member can preview a wish as it lands on the phone.
- FR-33-14. The auto-send setting can be changed only by roles allowed under G12; each change is audited.
- FR-33-15. Every sent wish writes an audit entry.

## 8. Business rules

- BR-33-1. Birthdays and anniversaries come up on their own; send with a tap or let it send itself. [mockup 26]
- BR-33-2. Auto-send goes out each morning at 9 am. [mockup 26 "Send wishes automatically at 9 am"]
- BR-33-3. A customer who is not opted in is still shown but never auto-messaged. [mockup 26]
- BR-33-4. Two names under the owner can be the sender. [mockup 26; SCOPE-ANALYSIS §6 Q9]
- BR-33-5. The template uses {name}; edit once, applies to all. [mockup 26]
- BR-33-6. The dates come from each customer's profile. [mockup 26; mockup 23]
- BR-33-7. No pricing involved; contact and goodwill only. [mockup 26]
- BR-33-8. Record consent for WhatsApp messaging and honour opt-out. [PRODUCTION-SCOPE §5 Personal data]
- BR-33-9. Outbound messages outside a conversation need pre-approved templates. [PRODUCTION-SCOPE §4 D8]
- BR-33-10. Store UTC, display Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- Wish: id, customer id, occasion (`birthday`, `anniversary`), occasion year, sender identity id, template id and version, queued at, sent at, provider message id, delivery status, failure reason, sent by (user id or System).
- SenderIdentity: id, display name, linked user id, active flag (two allowed).
- WishTemplate: id, occasion, text with {name}, version, approved template name at the provider, edited by, edited at.
- Setting (owned by EP-13): auto-send on or off, send time 9 am.
- Customer (owned by EP-17): date of birth, anniversary, consent state.
- Audit entries: `wish_sent`, `wish_template_changed` (new kinds), `setting_changed`.
- No weights. No money fields.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Wishes queue | Today's and tomorrow's occasions | Staff, Owner |
| Create | Wish send | Send now to chosen customers | Staff, Owner |
| Read | Wish preview | The message as it lands | Staff, Owner |
| List | Sent wishes | Today's sent wishes with status | Staff, Owner |
| Update | Wish template | Edit the birthday or anniversary text | Owner |
| Update | Sender identities | Set the two sender names | Owner |
| Run | Daily auto-send | Send at 9 am when on | System (EP-10) |

## 11. Live events

- None from the catalogue. Wishes are not on the PRODUCTION-SCOPE §1 list; the homes read today's wish count when they load.
- Delivery status comes from EP-12 provider callbacks, not from a live event.

## 12. Screens and UX references

- Route ids: `wishes` (Wishes), `today` ("SAY HAPPY BIRTHDAY" list), `decisions` ("wishes sent" in "Went through without you today"), `customer-new` (where dates and consent are captured).
- Mockups: `26-wishes.svg` ("Send wishes automatically at 9 am", "COMING UP · 3", "opted in · will auto-send at 9 am unless you send now", "not opted in to WhatsApp · will not auto-send · Call instead", "SENT FROM · Sanjay (Owner) · Priya (Manager)", "Happy birthday {name}!", "edit once, applies to all"), `23-onboard-customer.svg` (dates and consent).

## 13. Non-functional requirements

- Personal data: birthdays, anniversaries and phones are personal data under the DPDP Act 2023; consent is checked at send time; opt-out is honoured at once.
- Security: template, sender and auto-send changes are owner-only or as decided in G12, checked on the server.
- Time: the 9 am job runs in Asia/Kolkata; occasion dates compare month and day in Asia/Kolkata.
- Availability: if the 9 am job fails, it retries and does not send twice.
- Audit: sends, template edits and the auto-send switch are appended.
- Performance: the queue loads under 2 seconds on a shop connection; the occasion lookup is indexed by month and day, not a scan of every customer on each load.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-17, EP-12, EP-10, EP-08
- Downstream: EP-34, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given Priya Malhotra is opted in and her birthday is today, when auto-send is on and 9 am Asia/Kolkata arrives, then one wish is sent from the chosen sender with her first name filled in.
2. Given Ravi Shankar is not opted in and his birthday is today, when the queue loads, then he is shown with "Call instead" and no message is sent.
3. Given a wish was sent to Priya this morning, when staff press "Send now" again, then no second wish is sent.
4. Given Priya opted out after the queue was built, when the job runs, then she is skipped.
5. Given the owner edits the birthday template, when the next wish is sent, then it uses the new text.
6. Given the provider rejects a send, when the status returns, then the row shows failed with the reason.

## 16. Risks

- Risk: the WhatsApp template is not approved in time. Mitigation: submit templates early under D8.
- Risk: a wish goes to a customer who opted out. Mitigation: check consent at send, not at queue time.
- Risk: the sender identity "Manager" does not match any role. Mitigation: settle G20 before build.
- Risk: the job runs twice after a restart. Mitigation: de-duplicate per customer, occasion and year.
- Risk: staff flip auto-send. Mitigation: settle G12 and check on the server.

## 17. Open decisions and questions

- G20: who is "Priya (Manager)" when only three roles exist, and is a sender identity tied to a user?
- D8: which provider sends wishes, and which templates are approved?
- G12: who may switch auto-send on or off?
- Is 9 am fixed, or a setting, and is it per branch (D7)?
- Should a wish be sent on the day for a leap-day birthday (29 February) in other years?
- Is there one template per occasion, or several to choose from?
- Should wishes sent show on the customer's history (EP-17)?

## 18. Candidate stories

1. EP-33-S1: System can store wishes, templates and sender identities
2. EP-33-S2: System can build today's and tomorrow's wishes queue
3. EP-33-S3: Staff can see each customer's occasion and consent state
4. EP-33-S4: Staff can send a wish now to opted-in customers
5. EP-33-S5: System can refuse a wish to a customer who is not opted in
6. EP-33-S6: Staff can see "Call instead" for customers not opted in
7. EP-33-S7: Owner can choose the two sender identities
8. EP-33-S8: Owner can edit the wish template once for all
9. EP-33-S9: System can send wishes automatically at 9 am
10. EP-33-S10: System can send at most one wish per customer per occasion per year
11. EP-33-S11: Staff can preview a wish as it lands
12. EP-33-S12: Staff can see delivery status and failures
13. EP-33-S13: System can audit wishes, template edits and the auto-send switch
