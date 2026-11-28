# Customer master (EP-17)
The shop's customers: who they are, when to wish them, whether they agreed to WhatsApp messages, and what they have taken home by weight. One shop, English only, no prices (budget and spend are empty sockets until EP-42). Epic: [EP-17](../epics/EP-17-customer-master.md). Stories and their status: [EP-17-stories.md](../stories/EP-17-stories.md).
Code:
- Shared rules: `packages/shared/src/domain/customer-rules.ts` (groups, consent vocabulary, `normaliseCustomerPhone`, `dayMonthProblem`, every refusal sentence in `CUSTOMER_MESSAGES`).
- Contract: `packages/shared/src/contract/customers-contract.ts`.
- Server: `packages/api/src/customers/` (one file per operation, `customer-store.ts`, `customer-audit.ts`, `index.ts` for what other epics import).
- Storage: `packages/api/migrations/20261128T1132_ep17_customer_master.sql`.
- Web: `packages/web/src/components/people/Customers.tsx`, `OnboardCustomer.tsx`, `CustomerDrawer.tsx`, `customer-fields.tsx`, `customer-rows.ts`.
## Operations and roles
| Operation | Kind | Who | What it does |
| --- | --- | --- | --- |
| `createCustomer` | create | Staff, Owner | Adds a customer. `optInSource: 'counter' \| 'form'` also writes the first `opt_in` event in the same transaction. |
| `updateCustomer` | command | Staff, Owner | Edits the fields staff type. Sends the `version` it read; an older one is a `conflict`. A text field or date sent as `null` is cleared. |
| `listCustomers` | list | Staff, Owner | Name order, keyset paging. `search` matches name and city, or the phone when the text is only digits and phone punctuation; `group` filters. Erased customers are not listed. |
| `readCustomer` | read | Staff, Owner | One customer with consent history (newest first), piece history by tag and grams, piece count and total grams (summed from integers). `budgetINR` and `spentINR` are always `null`. |
| `findCustomerByPhone` | read | Staff, Owner | `{ id, name, city, group }` of the customer who holds the phone, or `null`. Nothing else is returned. |
| `recordConsent` | command | Staff, Owner | Writes an `opt_in` or `opt_out` event with source `counter` or `form`. Repeating the current state writes nothing. |
| `eraseCustomer` | command | Owner only | Carries out an approved deletion request (below). |
A karigar is refused every one of them with "A karigar can only work on their own jobs." (EP-17-S12). A staff member who calls `eraseCustomer` gets "Only the owner can erase a customer.". Customer ids over the API are codes (`CU-001`), made by `nextCode()`; the first customer of a fresh shop is `CU-001`.
## Decisions
1. One phone per customer. `customers_shop_id_phone_key` (unique on shop and phone) is the rule. There is no confirm flag and no shared family phone. An erased customer has no phone, so it holds none.
2. A duplicate phone is a `validation` refusal on field `phone` with "A customer with this phone number already exists." There is no ninth error code (`duplicate_phone`). The add form then calls `findCustomerByPhone` and shows the existing customer with "Open their record".
3. Phones are stored as `+<country><number>`. `normaliseCustomerPhone` keeps the digits only: fewer than 10 or more than 15 digits is refused, 10 digits get `+91`, 11 digits starting 0 drop the 0 and get `+91`, other 11 to 15 digits keep their own country code. The migration applies the same rule in SQL to stored phones.
4. A birthday or anniversary crosses the contract as `{ day, month }` and is stored as `2000-MM-DD` (a leap year, so 29 Feb is allowed; no real year is invented). The handler, not zod, checks that both parts are given and that the date exists, so the person sees the exact sentence. An edit that leaves a stored day and month unchanged keeps the stored date.
5. `createCustomer` and `updateCustomer` are `.strict()`: a stray `optedIn`, `status`, `budgetINR`, `spentINR` or `id` is a `validation` refusal.
6. The add form's WhatsApp box starts unticked. Consent is on the customer's word (BR-17-2), so staff tick it. The earlier prototype ticked it.
7. No live events. A write refetches the reads it affects (`affects` on each web action).
8. Pricing stays dark. `usePricingEnabled` is a constant `false` until EP-13-S9 feeds it. The screens show budget and spend only through `ValueSlot`.
## Consent
Consent is a list of events in `consent_events` (kind, source, time, recorder), append-only by trigger (`reject_consent_change()`, "consent_events is append-only"). `customers.opted_in` is a copy of the latest event, written in the same transaction. It is the value EP-12, EP-33 and EP-34 read at send time, not at queue time.
Server code writes consent through `recordConsentEvent(client, shop, { customerId, customerCode, kind, source, actor, at })` from `packages/api/src/customers/index.ts`. It writes the event, the copy and the audit entry, and does nothing when the customer is already in that state. The WhatsApp STOP handler of EP-12-S10 must call it with source `whatsapp_reply` and a System actor (recorded by null). Staff can name only `counter` and `form`; `whatsapp_reply` and `import` are `validation` refusals from a session.
Seeded customers who were opted in got one `import` opt-in event when the migration ran.
## Matching a phone (EP-28, EP-29)
`findCustomerByPhone(client, shop, phone)` from `packages/api/src/customers/index.ts` returns `{ id, name, city, group }` or `null`, for any typing of the number, and writes nothing. A number with fewer than 10 digits returns `null`. EP-28 (leads) and EP-29 (POs) call it instead of creating a duplicate.
## Erase
`eraseCustomer { customerId, version, deletionRequestRef, reason }`, owner only, both texts required (the handler throws "Add the deletion request reference." and "Add the reason for erasing this customer."). It clears exactly five fields: name (becomes "Erased customer"), phone, address, birthday and anniversary. City and notes stay: the stories list their erasure as an open question and no rule is added. The customer becomes `erased`, `opted_in` becomes false, consent events and piece history rows stay, and the directory and the phone match no longer find it. Erasing an erased customer is `not_found`.
The audit entry (`customer_erased`) lists the field names in `detail` and holds no erased value. The owner's typed reason goes into the log as written, so the form tells the owner not to type the customer's name or phone there. Earlier entries that already hold the customer's name are not touched (G22, FU-031).
## Audit
| Kind | Written by | Notes |
| --- | --- | --- |
| `customer_added` | `createCustomer` | after = stored fields; phone masked. With `optInSource` the entry's after has `optedIn: true`; there is no separate consent entry. |
| `customer_edited` | `updateCustomer` | only changed fields. An edit that changes nothing writes nothing (`auditNoChange`). |
| `customer_consent_recorded` | `recordConsent`, `recordConsentEvent` | before `{ optedIn }`, after `{ optedIn, consentSource }`. |
| `customer_opted_out` | same | same shape. |
| `customer_erased` | `eraseCustomer` | field names, request reference, reason; no before or after. |
Summaries use the customer code ("Customer CU-001 added"), never the name or phone. The entry is written in the same transaction; a failed audit write rolls the change back. `customer_onboarded`, the planned `onboardCustomer` operation and its rule are left for the prototype store and go with FU-020 (FU-035).
## Screens
- `customers`: search (sent 250 ms after typing stops), group chips, "Load more", a customer drawer for the clicked row or for `route.params.customerId`.
- `customer-new`: the add form. A duplicate phone shows on the phone field with a card for the existing customer.
- Drawer (`CustomerDrawer.tsx`): history by tag, name, grams and month; consent state and history with times in Asia/Kolkata; "Record consent" and "Record opt-out"; an edit form that keeps what was typed and the version it was opened with; the owner-only erase form.
All three read through `usePagedQuery` or `useQuery` and write through `defineAction`, as described in [web-data.md](web-data.md). None imports the prototype store.
## Acceptance map
| Story | AC | Where it is met | Test |
| --- | --- | --- | --- |
| S1 | 1 to 5 | migration, `normaliseCustomerPhone` | `packages/api/test/db/customer-schema.test.ts`; `packages/shared/test/customer-rules.test.ts` |
| S2 | 1 to 5 | `consent_events`, `recordConsentEvent` | `packages/api/test/db/customer-schema.test.ts`; `packages/api/test/customers/consent.test.ts` |
| S3 | 1 to 6 | `create-customer.ts`, `OnboardCustomer.tsx` | `packages/api/test/customers/add-customer.test.ts`; `packages/web/src/components/people/customers-screens.test.tsx`, `customer-rows.test.ts` |
| S4 | 1 to 5 (no `duplicate_phone` code; 6 does not apply) | unique key, `findCustomerByPhone` | `add-customer.test.ts`, `edit-customer.test.ts`; `customers-screens.test.tsx` |
| S5 | 1 to 6 | `update-customer.ts`, `CustomerDrawer.tsx` | `packages/api/test/customers/edit-customer.test.ts` |
| S6 | 1, 2, 4, 5 (3 waits for the 9 am send) | `record-consent.ts` | `add-customer.test.ts`, `consent.test.ts` |
| S7 | 4 and the recording part of 1 and 3 | `record-consent.ts` | `consent.test.ts` |
| S8 | 1 to 5 | `list-customers.ts`, `Customers.tsx` | `packages/api/test/customers/directory.test.ts`; `customers-screens.test.tsx` |
| S9 | 1 to 5 | `read-customer.ts`, `CustomerDrawer.tsx` | `directory.test.ts`; `customers-screens.test.tsx` |
| S10 | 1 to 5 | `find-customer-by-phone.ts` | `packages/api/test/customers/phone-match.test.ts` |
| S11 | 1 to 4 (5 waits for EP-13-S9) | `ValueSlot`, null sockets | `add-customer.test.ts`, `directory.test.ts`; `customers-screens.test.tsx` |
| S12 | 1 to 3 | `OPERATION_RULES` | `packages/api/test/customers/customer-access.test.ts` |
| S13 | 1 to 6 | `erase-customer.ts`, `CustomerDrawer.tsx` | `packages/api/test/customers/erase-customer.test.ts`; `customers-screens.test.tsx` |
| S14 | 1 to 5 (6 open) | `customer-audit.ts` | `packages/api/test/customers/customer-audit.test.ts`; `consent.test.ts` (AC3, the System path) |
Guard tests that list every operation: `packages/api/test/manifest/operation-coverage.test.ts`, `validation-matrix.test.ts` and `packages/api/test/audit/every-operation-audits.test.ts`.
## Open items
Listed in [followups.md](../followups.md) (FU-028 to FU-035): consent checks at send time and the STOP path (EP-12, EP-33, EP-34), the source of piece history (G13, EP-26), the pricing flag feed (EP-13-S9), erase and retention (G22, EP-39), a security-log filter by entity type (EP-06), the owner decisions behind one phone per customer and groups (G7, G19), the missing design for the directory, detail, edit and consent history, and the old `onboardCustomer` cleanup (FU-020).
