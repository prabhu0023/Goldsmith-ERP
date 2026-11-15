# EP-39: Security and data protection

## 1. Summary

The app holds customer names, phones, birthdays and anniversaries, and controls who may release gold, apply an
edit or scrap a piece. This epic hardens it before launch. It adds rate limits on sign-in, OTP and edit-token
requests and on the API as a whole; records customer consent for WhatsApp messages with time and source; gives
customers a working opt-out and a deletion request flow under India's Digital Personal Data Protection Act, 2023;
runs a periodic access review of who holds which role; rotates secrets; reviews the public catalogue link; and
ends with an external penetration test. Legal obligations must be checked with a professional; this epic builds the
mechanisms.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: Not built. The prototype has only an `optedIn` flag on `Customer` and owner guards inside in-memory transitions; there is no rate limiting, consent record, opt-out, deletion flow, access review, secrets handling or test of any of them.

## 3. Roles involved

- Owner: receives and approves deletion requests; runs the access review; confirms who holds the owner role; approves the penetration test scope.
- Staff: records a customer's consent or opt-out at the counter; passes on a deletion request a customer makes in person.
- Karigar: not involved, except that karigar accounts are part of the access review.
- System: enforces rate limits, keeps the consent ledger, applies opt-outs to every outbound send, carries out approved deletions across records and files, reminds the owner of the access review, and rotates secrets.

## 4. In scope

- Rate limiting on OTP requests, OTP verification, edit-token requests and token entry, and a general per-user and per-address limit on the API (filling the hook from EP-03).
- A consent ledger: each grant or withdrawal of WhatsApp consent with customer, channel, time, source (counter, form, reply) and who recorded it.
- Opt-out: a customer can withdraw consent by a reply such as "STOP" or at the counter; the opt-out applies to wishes and broadcasts at once.
- A deletion request flow: request recorded, owner approves or records why it is refused, personal fields erased or anonymised across customer records, leads, PO attachments and files, completion recorded.
- A decision and mechanism for personal data inside the append-only audit log (gap G22).
- An access review: a periodic list of every active user with role and last sign-in, for the owner to confirm or deactivate.
- Secrets rotation for provider keys, the WhatsApp token, the LLM key and database credentials, with a documented procedure.
- Security review of the public catalogue link from EP-34 (gap G9): unguessable token, expiry, revoke, no customer data, no price.
- Review of settings guards (gap G12): which settings only the owner may change, enforced on the server.
- Session and token rules from PRODUCTION-SCOPE §5 checked end to end.
- An external penetration test before launch, with findings fixed or accepted by the owner.

## 5. Out of scope

- Sign-in, OTP sending and session handling (EP-04).
- The permission matrix and deactivation itself (EP-05).
- The consent checkbox on the customer form and erase action on the customer record (EP-17).
- The append-only audit store (EP-06).
- Building the public catalogue link (EP-34).
- Which setting is owner-only, as a product rule (EP-13; this epic tests that it is enforced).
- WhatsApp template approval and provider terms (EP-12).
- Log redaction and alerting (EP-37).
- Backup retention and restores after deletions (EP-38).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Customer.optedIn: boolean` only; no consent time, source or history.
- `src/components/people/OnboardCustomer.tsx` (route `customer-new`): the "Send wishes on WhatsApp" checkbox starts ticked (`useState(true)`).
- `src/components/marketing/util.tsx` `reachable` filters broadcasts to opted-in customers; `src/components/marketing/Wishes.tsx` shows "not opted in to WhatsApp · will not auto-send".
- `src/store/transitions.ts`:
  - `requireOwner` guards 12 transitions, but runs in the browser and can be bypassed by switching identity (`switchIdentity` in `src/store/StoreProvider.tsx`).
  - `setSetting` has no owner check; `Wishes.tsx` lets staff flip `autoSendWishes`; the pricing switch in `src/components/shell/AppShell.tsx` flips `pricingEnabled` for any role and is not audited (G12).
  - `applyEdit` writes the edit token in plain text into the audit detail (`Token ${edit.token}`).
- `src/domain/edits.ts`: 6-digit token, `TOKEN_TTL_MS` 10 minutes, `checkToken` returns ok, wrong, expired or none; no attempt limit.
- `src/components/marketing/CatalogueShare.tsx` (route `catalogue`) copies a made-up link `https://jaigulabdev.example/showcase/{ids}` that exposes piece ids (G9).
- `.env.example` holds `GEMINI_API_KEY` and `APP_URL`; no secrets store.
- Reusable: the token expiry rule and `checkToken` outcomes, the opted-in filter, the owner-only list of operations as a starting point for tests.
- Must be rebuilt server-side: rate limits, the consent ledger, opt-out handling, the deletion flow, access review, secrets rotation, server-side guards for settings, token references instead of token values in audit.

## 7. Functional requirements

- FR-39-1. The server limits OTP requests per phone and per address within a time window and refuses further requests with a clear message.
- FR-39-2. The server limits wrong OTP and edit-token entries per code and invalidates the code after the limit.
- FR-39-3. The server applies a general request limit per user and per address on every operation.
- FR-39-4. Every grant or withdrawal of WhatsApp consent writes a consent ledger entry with customer, time, source and who recorded it.
- FR-39-5. A customer's current consent is the latest ledger entry; wishes and broadcasts read it at send time.
- FR-39-6. An opt-out reply received through WhatsApp (wording as decided) withdraws consent when it is received, and no further wish or broadcast is sent to that customer.
- FR-39-7. A staff member can record a customer's opt-out or deletion request at the counter.
- FR-39-8. The owner can approve or refuse a deletion request with a reason; both are recorded.
- FR-39-9. An approved deletion erases or anonymises the customer's personal fields in customer records, leads, PO attachments and stored files, and keeps piece history by tag and grams.
- FR-39-10. The handling of personal data inside audit entries follows the G22 decision, and the audit log stays append-only.
- FR-39-11. The owner can open an access review listing every active user with role, last sign-in and created date, and deactivate a user from it (through EP-05).
- FR-39-12. The system reminds the owner when an access review is due.
- FR-39-13. Each secret can be rotated without downtime by following the written procedure, and each rotation is recorded.
- FR-39-14. The server refuses a change to an owner-only setting by a non-owner, for every setting named owner-only in EP-13 (G12).
- FR-39-15. The public catalogue link uses an unguessable token, shows only the chosen in-stock pieces, carries no customer data and no price, expires and can be revoked (G9).
- FR-39-16. Audit entries carry a token reference, never the token value.
- FR-39-17. A penetration test is run on staging before launch and each finding is fixed or accepted in writing by the owner.

## 8. Business rules

- BR-39-1. Every permission is checked on the server; hiding a button is not a control. [PRODUCTION-SCOPE §5 Security]
- BR-39-2. OTP and edit tokens are 6 digits, single use, 10-minute expiry, rate-limited, never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-39-3. Sessions expire; deactivating a user ends their sessions at once. [PRODUCTION-SCOPE §5 Security]
- BR-39-4. Secrets live in environment configuration, never in the repo. [PRODUCTION-SCOPE §5 Security]
- BR-39-5. Record consent for WhatsApp messaging, honour opt-out, and support deletion requests; verify obligations with a professional. [PRODUCTION-SCOPE §5 Personal data]
- BR-39-6. The audit log has no update or delete path, including for the owner. [PRODUCTION-SCOPE §5 Audit]
- BR-39-7. A customer who is not opted in is shown but never auto-messaged. [mockup 26]
- BR-39-8. Only customers who opted in are counted and messaged. [mockup 27]
- BR-39-9. A shared showcase shows photos and weights, never a price. [mockup 28]
- BR-39-10. Only the owner can add staff or change a role. [mockup 25]
- BR-39-11. Host in India for personal-data law (decided). [PRODUCTION-SCOPE §4 D10]

## 9. Data

- ConsentEntry: id, customer id, channel (WhatsApp), granted or withdrawn, source (counter, form, reply, import), recorded by, at (UTC), evidence reference (message id for a reply).
- DeletionRequest: id, customer id, received via, received at, recorded by, status (open, approved, refused, done), decided by, decided at, reason, completed at, scope of erasure.
- AccessReview: id, due at, done at, done by, users reviewed, users deactivated.
- SecretRotation: secret name (not value), rotated at, rotated by.
- RateLimitCounter: key (phone, user or address), operation, window start, count.
- PenTestFinding: id, severity, summary, status (fixed, accepted), decided by.
- No weight or money fields are created. Piece history kept after a deletion stays in integer, units of 0.0001 g.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Consent entry | Record a grant or withdrawal | Staff, Owner, System (from a reply) |
| List | Consent history | See a customer's consent entries | Staff, Owner |
| Create | Deletion request | Record a customer's request | Staff, Owner |
| Update | Deletion request | Approve or refuse with a reason | Owner |
| Create | Deletion run | Erase personal data for an approved request | System |
| Read | Access review | Active users with role and last sign-in | Owner |
| Create | Access review record | Record a completed review | Owner |
| Create | Secret rotation record | Record a rotation | Operator |
| Read | Public showcase | Chosen in-stock pieces through a valid link | Anyone with a valid link |

## 11. Live events

- Consumes: none of its own.
- Emits: none of its own. Deactivating a user from the access review goes through EP-05, which emits "User deactivated or role changed" so that user's open sessions end at once.

## 12. Screens and UX references

- No screen of its own in the mockups. It adds an access review list for the owner near `staff-directory`, a consent history and deletion request panel on `customers`, and consent wording on `customer-new`.
- Screens that depend on it: `wishes`, `broadcast`, `catalogue` (consent and public link), `edit-apply` (token limits), `security` (token references).
- Mockups: `23-onboard-customer.svg` ("Send wishes on WhatsApp"), `26-wishes.svg` ("not opted in to WhatsApp · will not auto-send"), `27-broadcast.svg` (opted-in counts), `28-catalogue-share.svg` ("Copy a link", G9), `25-onboard-staff.svg` ("Only the owner can add staff or change a role").
- Not yet designed: access review list, consent history, deletion request panel.

## 13. Non-functional requirements

- Security: rate limits apply before any OTP is sent; limits are per phone, per user and per address; the public link token cannot be guessed from piece ids.
- Personal data: consent is checked at send time, not at draft time; a deletion completes within the period the professional advice sets; deletion covers files in EP-09 storage.
- Audit: consent changes, deletion decisions and access reviews are appended to the audit log without copying the deleted personal values into new entries.
- Concurrency: an opt-out that arrives during a broadcast send stops the remaining sends to that customer.
- Availability and recovery: the deletion procedure says how deletions are reapplied after a restore (EP-38).

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05, EP-17, EP-08
- Downstream: EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a phone number that has requested OTPs up to the limit, when another OTP is requested, then the server refuses it and no message is sent.
2. Given Meera Iyer is opted in, when she replies "STOP" to a broadcast, then a withdrawal entry is recorded and the next morning's wishes skip her.
3. Given an approved deletion request for a customer, when the deletion runs, then name, phone, address, birthday and anniversary are gone from customer, lead and file storage, and her piece history by tag and grams remains.
4. Given a staff member, when they try to change an owner-only setting through the API, then the server refuses it (G12).
5. Given an edit applied with a token, when the audit log is read, then it shows a token reference and not the six digits.
6. Done when the penetration test report is received and each finding is fixed or accepted in writing.

## 16. Risks

- Risk: legal duties under the DPDP Act differ from what is built. Mitigation: get professional advice before build and record it in the epic.
- Risk: the consent box starts ticked on the customer form, which may not count as consent. Mitigation: raise it as a question for EP-17 and the professional review.
- Risk: deletion breaks the append-only audit log (G22). Mitigation: decide the approach before launch, for example keeping personal values out of audit entries.
- Risk: rate limits block a whole shop that shares one address. Mitigation: combine per-address limits with per-phone and per-user limits and tune them in staging.
- Risk: a leaked provider key lets others send WhatsApp messages as the shop. Mitigation: rotation procedure and alert on unusual send volume (EP-37).
- Risk: the public link exposes stock lists to competitors. Mitigation: expiry, revoke and review under G9.

## 17. Open decisions and questions

- D10 is decided (India region) for the system's own hosting. Must every outside tool that holds personal data, backups or logs also keep them in India?
- G22: how does a deletion request apply to audit entries that name a customer?
- G9: should a public catalogue link exist, how long does it last, and what may it show?
- G12: which settings are owner-only, and is the pricing switch audited?
- What rate limits apply to OTP requests, wrong entries and the general API?
- How often is the access review run?
- Who carries out the penetration test, and when?
- Is a ticked-by-default consent box acceptable, or must staff ask each time?
- How long may a deletion request take, and who may make one on the customer's behalf?
- Do karigar phone numbers and staff phone numbers fall under the same deletion rules?
- Which reply words count as an opt-out ("STOP" or others, in which languages)?

## 18. Candidate stories

1. EP-39-S1: System can store a consent ledger per customer
2. EP-39-S2: System can rate-limit OTP and edit-token requests and entries
3. EP-39-S3: System can apply a general request limit per user and address
4. EP-39-S4: Staff can record a customer's consent or opt-out at the counter
5. EP-39-S5: System can withdraw consent from a WhatsApp opt-out reply
6. EP-39-S6: System can check consent at send time for wishes and broadcasts
7. EP-39-S7: Staff can record a customer's deletion request
8. EP-39-S8: Owner can approve or refuse a deletion request
9. EP-39-S9: System can erase a customer's personal data across records and files
10. EP-39-S10: System can write token references instead of token values in audit
11. EP-39-S11: System can enforce owner-only settings on the server (G12)
12. EP-39-S12: Owner can run an access review and deactivate users from it
13. EP-39-S13: Operator can rotate secrets by a written procedure
14. EP-39-S14: Owner can sign off the public catalogue link review (G9)
15. EP-39-S15: Owner can accept or close each penetration test finding
