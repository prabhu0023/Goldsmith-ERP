# EP-17: Customer master · stories

Epic document: [EP-17 Customer master](../epics/EP-17-customer-master.md)

Role note: stories where the server stores, checks, matches, hides or audits on its own use "System". Stories where a person adds, edits, searches or records consent for a customer use "Staff", because mockup 11 gives staff "Add a customer and send wishes"; the owner can do everything staff can. The deletion story uses "Owner".

---

## EP-17-S1: System can store customers with normalised phones and nullable value sockets

- **Story ID:** EP-17-S1
- **Status:** Not started
- **Title:** System can store customers with normalised phones and nullable value sockets
- **As a:** System
- **I want:** the `customers` table from EP-02-S4 extended with a normalised phone, optional address, status (`active` or `erased`), created at, created by and version, a shared phone normaliser that turns any typed phone into digits with the country code, and the budget and spend columns kept nullable with no default
- **So that:** each buyer is one stored record that leads, POs, wishes and broadcasts can find by phone, and the value sockets are ready for pricing without a later migration (FR-17-2, FR-17-12, BR-17-1, BR-17-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `customers` is inspected, then it has `id` (`CU-NNN`), `name`, `phone` (normalised), `city`, nullable `address`, `group`, nullable `dob`, nullable `anniversary`, `notes`, `status` accepting only `active` or `erased`, `created_at`, `created_by`, an integer `version` starting at 1, and nullable `budgetINR` and `spentINR` with no default.
  2. Given the typed phones "+91 98840 21107", "98840 21107", "098840 21107" and "+91-9884021107", when each is passed to the shared normaliser, then each returns "+919884021107".
  3. Given a typed phone with fewer than 10 digits, such as "98840 211", when it is normalised, then the normaliser returns a refusal and no value, so no store or match can use it.
  4. Given a birthday of 14 Mar with no year, when it is stored, then `dob` holds the ISO date `2000-03-14`, the placeholder year the prototype `dayMonthToIso` uses, and it reads back as "14 Mar".
  5. Given the seeded customers such as Meera Iyer and Priya Malhotra, when the migration has run, then their phones are rewritten in normalised form, their status is `active`, their `budgetINR` and `spentINR` are null, and no other field has changed.
  6. Given an insert that writes a non-null `budgetINR` while EP-42 is not built, when the server's customer service writes it, then the write is refused (the database column stays nullable for EP-42; the service guard is in EP-17-S11).
- **Rules enforced on the server:** Database checks: `name` not empty, `status` enum, `group` enum (the four type values `VIP Bridal`, `High net worth`, `Regular`, `Wholesale` until G19 is settled), `dob` and `anniversary` are dates, not timestamps. The phone is always stored after normalisation through the one shared function in the shared package, so add, edit and match use the same form. The server sets `id`, `status`, `created_at`, `created_by` and `version`. Ids are handed out by an atomic counter and never reused.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates storage; changes are audited through EP-17-S14.
- **Data changes:** Migration on `customers` (EP-02-S4) adds `address`, `status` (default `active`), `created_at`, `created_by`, `version` if missing, and rewrites existing `phone` values in normalised form. Migration creates `customer_id_counter`, initialised above the highest `CU-NNN` in use. `budgetINR`, `spentINR` and `customer_history` stay as EP-02-S4 made them. Each table has the shop ID (EP-02-S3, D7).
- **UI reference:** No screen
- **Non-functional checks:** Personal data: `name`, `phone`, `address`, `dob` and `anniversary` are tagged as personal data under the DPDP Act, 2023, for EP-39 export and erasure. Precision: no weight column is added; history grams stay integers of 0.0001 g (EP-02-S4). Open question G19: which groups exist and whether they become an EP-15 reference list; the enum here is the type's four values. D7 is decided: customers belong to the one shop and carry its shop ID, set by the server. Open question: how phones outside India (not +91) are normalised; this story treats a 10-digit number as Indian and keeps any number already starting with a country code.
- **Depends on:** EP-02-S1, EP-02-S4, EP-02-S14, EP-03-S1, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S2: System can store consent as events with time, source and recorder

- **Story ID:** EP-17-S2
- **Status:** Not started
- **Title:** System can store consent as events with time, source and recorder
- **As a:** System
- **I want:** a `consent_events` table where each row is one opt-in or opt-out with its source, the user who recorded it and the server time, the customer's current consent derived from the latest event, and the existing `optedIn` column kept as a copy of that latest event, written in the same transaction
- **So that:** the shop can prove when and how a customer agreed to WhatsApp messages, and the send-time consent check in EP-12-S5 keeps working unchanged (FR-17-6, BR-17-2, BR-17-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `consent_events` is inspected, then it has `id`, `customer_id` referencing `customers`, `kind` accepting only `opt_in` or `opt_out`, `source` accepting only `counter`, `whatsapp_reply`, `form` or `import`, `recorded_by` (a user id, or System), and `at` in UTC.
  2. Given Meera Iyer has an `opt_in` event at 10:02 and an `opt_out` event at 16:40 on the same day, when her current consent is read, then it is opted out and `customers.optedIn` is false.
  3. Given a new consent event is inserted, when the transaction commits, then `customers.optedIn` matches the new event's kind; if the transaction rolls back, neither the event nor the copy changes.
  4. Given a seeded customer with `optedIn` true and no events, when the migration runs, then one `opt_in` event with source `import`, recorded by System, at the migration time is written for them, and customers with `optedIn` false get no event.
  5. Given an attempt to update or delete a row in `consent_events`, when it reaches the database, then it is refused, because consent history is append-only.
- **Rules enforced on the server:** Consent events are only inserted, never updated or deleted, except by the erase action in EP-17-S13, which keeps the rows and holds no personal value in them. `optedIn` is written only by the consent service, in the same transaction as the event (EP-03-S6); no other operation may set it. `recorded_by` comes from the session, or is System for the WhatsApp keyword path and the migration (EP-03-S3, EP-06-S6). Time comes from the server clock.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates storage; consent changes are audited through EP-17-S14.
- **Data changes:** Migration creates `consent_events` (id, customer id, kind, source, recorded by, at) with an index on customer id and `at`, and backfills `import` events for seeded opted-in customers. `customers.optedIn` stays as a maintained copy. Rows carry the shop ID (D7).
- **UI reference:** No screen
- **Non-functional checks:** Personal data: consent is stored with time and source (epic section 13, DPDP Act, 2023). Time: `at` stored in UTC, shown in Asia/Kolkata. Concurrency: two consent events for one customer in the same second are both kept and ordered by `at` then `id`, so "latest" is always one row.
- **Depends on:** EP-17-S1, EP-02-S1, EP-03-S3, EP-03-S6, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S3: Staff can add a customer at the counter

- **Story ID:** EP-17-S3
- **Status:** Not started
- **Title:** Staff can add a customer at the counter
- **As a:** Staff
- **I want:** to add a customer on `customer-new` with name, phone, city, optional address, group, birthday, anniversary and notes, through a Create Customer operation that returns the new `CU-NNN` id
- **So that:** a buyer is recorded once at the counter and their wishes, leads and pieces can attach to them (FR-17-1, FR-17-2, FR-17-5, BR-17-3, BR-17-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma on `customer-new`, when he adds Meera Iyer, "+91 98840 21107", Chennai, VIP Bridal, birthday 14 Mar and chooses "Add this customer", then a customer is stored with phone "+919884021107", status `active`, `created_by` Rajesh and server time, and the new id is returned (epic acceptance criterion 1, consent part in EP-17-S6).
  2. Given the name is empty or only spaces, when Rajesh chooses "Add this customer", then the server refuses with "Add the customer name." and nothing is stored.
  3. Given the phone "98840 211" with 9 digits, when Rajesh saves, then the server refuses with "Add a phone number with at least 10 digits. It is also the WhatsApp number." and nothing is stored.
  4. Given a birthday day of 14 with no month, when Rajesh saves, then the server refuses with "Give both the day and the month of the birthday, or neither."; the same check on the anniversary gives "Give both the day and the month of the anniversary, or neither.".
  5. Given a day that does not exist in the month, such as 31 Feb, when Rajesh saves, then the server refuses it as a validation error on `dob`.
  6. Given the same Create Customer request is sent twice with one idempotency key after a network drop, when the server processes it, then only one customer and one id are created.
- **Rules enforced on the server:** Caller must hold the add-customer permission (staff and owner per mockup 11, EP-05-S1; refused for karigar by EP-17-S12). Name required and trimmed. Phone normalised through the EP-17-S1 function and refused under 10 digits. Day and month required together for each date, and the date must exist. Group must be one of the allowed groups. The duplicate phone check from EP-17-S4 runs before the insert. The client cannot send `id`, `status`, `created_by`, `version`, `budgetINR` or `spentINR`. Deduplicated by idempotency key (EP-03-S8). Insert, id assignment and audit run in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_added`), after (the stored fields). Written through EP-17-S14.
- **Data changes:** Inserts into `customers`; moves `customer_id_counter`. Adds Create Customer to the shared contract and moves `customer-new` off `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg`, route `customer-new` ("Add a customer", "WHO THEY ARE", "Name", "Phone · also the WhatsApp number", "City", "Address (optional)", "Group", "WHEN TO WISH THEM", "Birthday", "Anniversary", "Add this customer", "Cancel"). The group chips on the mockup (VIP Bridal, High net worth, Festive collector) follow G19.
- **Non-functional checks:** Personal data: the form collects only the fields in epic section 9; nothing is written to logs except the customer id. Security: client-side checks in `OnboardCustomer.tsx` are a convenience; the server repeats every check. Open question: who may add a customer, staff (mockup 11) or owner only (mockups README); criteria are written for staff and change only the permission entry if the answer is owner only. Open question G19: which groups appear on the form.
- **Depends on:** EP-17-S1, EP-17-S4, EP-02-S14, EP-03-S2, EP-03-S4, EP-03-S7, EP-03-S8, EP-05-S1, EP-05-S2, EP-08-S5, EP-08-S7, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S4: System can warn about a duplicate phone on add and edit

- **Story ID:** EP-17-S4
- **Status:** Not started
- **Title:** System can warn about a duplicate phone on add and edit
- **As a:** System
- **I want:** Create Customer and Update Customer to compare the normalised phone with every active customer, and when it matches, to return a `duplicate_phone` warning naming the existing customer instead of writing, unless the decided duplicate rule allows the save
- **So that:** one buyer does not end up as two records with split history and double wishes (FR-17-3, epic section 13 concurrency)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer is stored with phone "+919884021107", when Rajesh Verma adds a new customer "M. Iyer" with phone "98840 21107", then the server writes nothing and returns `duplicate_phone` with Meera Iyer's id, name, city and group, and the screen offers to open her record (epic acceptance criterion 2).
  2. Given Rajesh edits Priya Malhotra's phone to "+91 98840 21107", when he saves, then the server returns the same warning naming Meera Iyer and Priya's phone is unchanged.
  3. Given Rajesh edits Meera Iyer and keeps her own phone, when he saves, then no duplicate warning is raised.
  4. Given two staff add a customer with "98840 21107" at the same moment and no customer has it yet, when both requests commit, then exactly one customer exists with that phone and the other request gets `duplicate_phone` naming it.
  5. Given a customer with that phone has status `erased`, when a new customer is added with it, then no warning is raised, because an erased record no longer holds the phone.
  6. Given the decided rule allows family members to share a phone, when Rajesh confirms the save after the warning, then the second customer is stored and both records keep the phone.
- **Rules enforced on the server:** The check uses the normalised phone (EP-17-S1). It runs inside the create or update transaction. If the decided rule is one phone per customer, a unique index on shop ID and `phone` among `active` customers enforces it in the database, so the race in criterion 4 cannot produce two records. If shared phones are allowed, the save needs an explicit confirm flag on the request after the warning, and the index is not unique. The warning is a refusal with code `duplicate_phone`, in the EP-03-S4 format.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A warned request writes nothing; a confirmed save is audited by EP-17-S3 or EP-17-S5.
- **Data changes:** Migration adds an index on `customers.phone` filtered to `status = 'active'`, unique only if the decided rule is one phone per customer. Adds the `duplicate_phone` code to the shared error list.
- **UI reference:** Not yet designed. The duplicate warning is undrawn (epic section 12); it shows on `customer-new` (`docs/ux/mockups/23-onboard-customer.svg`) and on the edit form.
- **Non-functional checks:** Concurrency: two staff adding the same phone at once produce one customer when the rule is one phone per customer (epic section 13). Personal data: the warning returns only id, name, city and group of the existing customer, not their dates, address or history. Open question: can two customers share a phone (family members)? Criterion 6 applies only if they can.
- **Depends on:** EP-17-S1, EP-03-S4, EP-03-S5, EP-03-S6, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S5: Staff can edit a customer's details

- **Story ID:** EP-17-S5
- **Status:** Not started
- **Title:** Staff can edit a customer's details
- **As a:** Staff
- **I want:** to change a customer's name, phone, city, address, group, birthday, anniversary and notes through Update Customer, saving with the version I last read
- **So that:** the record stays correct when a buyer moves, changes number or gives a date they did not give at first, without adding them again (FR-17-4, FR-17-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer with no anniversary, when Rajesh Verma adds anniversary 2 Dec and changes her city to "Coimbatore", then both are stored, `anniversary` is `2000-12-02`, her version goes up by one, and her id, phone and consent are unchanged.
  2. Given Rajesh clears her name, when he saves, then the server refuses with "Add the customer name." and nothing changes.
  3. Given Rajesh enters an anniversary month with no day, when he saves, then the server refuses with "Give both the day and the month of the anniversary, or neither." and nothing changes.
  4. Given Rajesh changes her phone to a number that belongs to another active customer, when he saves, then the EP-17-S4 duplicate warning is returned and nothing changes.
  5. Given another staff member saved Meera Iyer after Rajesh opened her, when Rajesh saves with the older version, then the server refuses as a conflict and nothing changes (EP-02-S14).
  6. Given an edit request that also sends `optedIn`, `status`, `budgetINR`, `spentINR` or `id`, when the contract check runs, then it is rejected as a validation error, because consent changes only through EP-17-S6 and EP-17-S7 and the others never through this operation.
- **Rules enforced on the server:** Caller must hold the edit-customer permission (staff and owner; refused for karigar by EP-17-S12). Same field checks as EP-17-S3. Phone normalised and checked for duplicates (EP-17-S4). Stale version refused (EP-02-S14, EP-03-S5). An erased customer cannot be edited and returns `not_found`. Update and audit run in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_edited`), before and after for each changed field only. Written through EP-17-S14.
- **Data changes:** Updates `customers` (changed fields and `version`). Adds Update Customer to the shared contract.
- **UI reference:** Not yet designed. The edit form is undrawn (epic section 12); it reuses the `customer-new` fields from `docs/ux/mockups/23-onboard-customer.svg` and is opened from the customer drawer on `customers`.
- **Non-functional checks:** Concurrency: version check on every save. Personal data: before and after values of personal fields in the audit entry are visible only to the owner (EP-06-S12). Open question G19: which groups may be chosen.
- **Depends on:** EP-17-S1, EP-17-S3, EP-17-S4, EP-02-S14, EP-03-S5, EP-03-S6, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S6: Staff can record a customer's WhatsApp consent

- **Story ID:** EP-17-S6
- **Status:** Not started
- **Title:** Staff can record a customer's WhatsApp consent
- **As a:** Staff
- **I want:** ticking "Send wishes on WhatsApp" when adding a customer, or choosing to record consent on an existing customer, to write an `opt_in` consent event with source, my user and the server time, through Create Consent event
- **So that:** wishes and broadcasts go only to customers who agreed, and the shop can show when and how each one agreed (FR-17-6, BR-17-2, BR-17-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma adds Meera Iyer on `customer-new` with "Send wishes on WhatsApp" ticked, when the add commits, then one `opt_in` event exists for her with source `counter`, recorded by Rajesh and the server time, in the same transaction as the customer, and `optedIn` is true (epic acceptance criterion 1).
  2. Given the box is left unticked, when the add commits, then no consent event is written and `optedIn` is false.
  3. Given Ravi Shankar is stored as "not opted in to WhatsApp", when Rajesh records consent for him with source `form`, then an `opt_in` event is written and his next birthday is eligible for the 9 am auto-send.
  4. Given Meera Iyer is already opted in, when Rajesh records consent again, then the server writes nothing and returns her current consent, so the history holds no repeated event.
  5. Given a request with source `whatsapp_reply` or `import` from a user session, when the server checks it, then it is refused as a validation error, because those sources are set only by the system.
- **Rules enforced on the server:** Caller must hold the record-consent permission (staff and owner; System for the WhatsApp path; refused for karigar by EP-17-S12). Staff may only use sources `counter` and `form`. The event and the `optedIn` copy are written in one transaction (EP-17-S2). The customer must be `active`. Deduplicated by idempotency key (EP-03-S8).
- **Live events emitted / consumed:** None. EP-33 and EP-34 read consent at send time on the server (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_consent_recorded`), before (opted out) and after (opted in), source. Written through EP-17-S14.
- **Data changes:** Inserts into `consent_events`; updates `customers.optedIn` and `version`. Adds Create Consent event to the shared contract; Create Customer accepts an optional consent flag and source.
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg`, route `customer-new` ("Send wishes on WhatsApp"). Recording consent on an existing customer and the consent history are not yet designed (epic section 12). `docs/ux/mockups/26-wishes.svg` shows the result ("opted in · will auto-send at 9 am unless you send now", "not opted in to WhatsApp · will not auto-send").
- **Non-functional checks:** Personal data: consent stored with time and source (DPDP Act, 2023); a professional review of the wording shown at the counter belongs to EP-39. Time: event time stored in UTC, shown in Asia/Kolkata. Open question: who may add a customer, which decides whether staff record the first consent on add.
- **Depends on:** EP-17-S2, EP-17-S3, EP-03-S6, EP-03-S8, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S7: Staff can record a customer's opt-out

- **Story ID:** EP-17-S7
- **Status:** Not started
- **Title:** Staff can record a customer's opt-out
- **As a:** Staff
- **I want:** to record that a customer withdrew consent, through Create Consent event with kind `opt_out`, effective at once, and the WhatsApp opt-out keyword path from EP-12-S10 to write the same event with source `whatsapp_reply` and recorder System
- **So that:** a customer who says stop gets no more wishes or broadcasts from the next send on (FR-17-7, BR-17-2, BR-17-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra is opted in with a birthday today, when Rajesh Verma records her opt-out at the counter at 08:30, then an `opt_out` event with source `counter`, recorded by Rajesh, is stored, `optedIn` is false, and the 9 am wishes run sends her nothing (epic acceptance criterion 3).
  2. Given Priya is opted out, when a broadcast to VIP Bridal is sent afterwards, then she is skipped by the send-time consent check (EP-12-S5).
  3. Given Priya replies "STOP" on WhatsApp, when EP-12-S10 processes it, then an `opt_out` event with source `whatsapp_reply`, recorded by System, is written through this operation, and `optedIn` is false.
  4. Given Priya is already opted out, when an opt-out is recorded again, then the server writes nothing and returns her current consent.
  5. Given Priya is opted out, when the `wishes` screen lists her birthday, then she is still shown with "not opted in to WhatsApp · will not auto-send" so staff can reach her another way.
- **Rules enforced on the server:** Caller must hold the record-consent permission (staff and owner, or System for the keyword path; refused for karigar by EP-17-S12). The event and the `optedIn` copy are written in one transaction (EP-17-S2). Sends read consent at the moment of sending, not at queue time (EP-12-S5), so an opt-out recorded at 08:59 stops a 9:00 send. Only the consent service sets `optedIn`; EP-12-S10 calls it instead of writing the column itself.
- **Live events emitted / consumed:** None. Consent is read at send time on the server (epic section 11).
- **Audit entry written:** Yes: actor (user or System), time, entity (customer id), action (`customer_opted_out`), before (opted in) and after (opted out), source. Written through EP-17-S14.
- **Data changes:** Inserts into `consent_events`; updates `customers.optedIn` and `version`. The EP-12-S10 keyword handler is changed to call this operation.
- **UI reference:** Not yet designed. The opt-out action and consent history are undrawn (epic section 12); they belong in the customer drawer on `customers`. `docs/ux/mockups/26-wishes.svg`, route `wishes`, shows the result ("not opted in to WhatsApp · will not auto-send", "Call instead").
- **Non-functional checks:** Personal data: opt-out is honoured from the next send (PRODUCTION-SCOPE §5). Concurrency: the send-time check reads the committed `optedIn`, so an opt-out and a send at the same moment never deliver after the opt-out commits. Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-17-S2, EP-17-S6, EP-12-S5, EP-12-S10, EP-03-S6, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S8: Staff can search and filter the customer directory

- **Story ID:** EP-17-S8
- **Status:** Not started
- **Title:** Staff can search and filter the customer directory
- **As a:** Staff
- **I want:** the `customers` screen to load customers from the server through List Customers, search by name, phone (spaces ignored) or city, filter by group, and page through long results
- **So that:** I can find a buyer at the counter in a few keystrokes, even with thousands of customers (FR-17-9, BR-17-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer of Chennai is stored, when Rajesh Verma types "iyer", "98840 21107", "9884021107" or "chennai" into "Search name, phone or city", then her row is in the results each time.
  2. Given the group filter is set to "VIP Bridal", when the search is empty, then only VIP Bridal customers are listed, and choosing "All" lists every active customer.
  3. Given the search "zzz" matches nobody, when the results come back, then the screen reads "Nobody matches that. Clear the search or add them as a new customer.".
  4. Given 10,000 customers, when Rajesh opens `customers`, then the first page loads in under 2 seconds, and further pages load by cursor as he scrolls (EP-03-S9).
  5. Given a customer with status `erased`, when the directory is listed or searched, then that record does not appear.
  6. Given the read is loading or fails, when Rajesh opens `customers`, then the screen shows the EP-08-S3 loading state or the EP-08-S4 error with "Try again".
- **Rules enforced on the server:** Caller must hold the list-customers permission (staff and owner; refused for karigar by EP-17-S12). Search runs on the server: name and city case-insensitive contains, phone matched on digits only. Only `active` customers are returned. Results are paged with a cursor and a page size cap (EP-03-S9). Each row carries id, name, phone, city, group, consent and piece count, and no budget or spend value while pricing is off (EP-17-S11).
- **Live events emitted / consumed:** None. The list refetches after the user's own add or edit (EP-08-S7).
- **Audit entry written:** No. Reading the directory changes nothing.
- **Data changes:** None in the product database beyond indexes. Migration adds indexes for name and city search and for group. Adds List Customers to the shared contract and moves `customers` off `useStore()` onto the EP-08 data layer.
- **UI reference:** Route `customers` (staff and owner rails, "Customers"). Not yet designed: the directory has no mockup (MOCKUP-COVERAGE §3); the prototype `Customers.tsx` screen ("Search name, phone or city", group filter, drawer) is reused until the design pass.
- **Non-functional checks:** Performance: under 2 seconds for 10,000 customers (epic section 13). Personal data: the list is held in memory only on the client (EP-08-S2) and never sent to the karigar portal. Availability: loading, error and offline states shown (EP-08-S3, EP-08-S4, EP-08-S11). Open question G19: which groups the filter offers. D7 is decided: one shop, no branches; staff see the shop's customers.
- **Depends on:** EP-17-S1, EP-03-S9, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S7, EP-08-S11, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S9: Staff can see a customer's piece history by tag and grams

- **Story ID:** EP-17-S9
- **Status:** Not started
- **Title:** Staff can see a customer's piece history by tag and grams
- **As a:** Staff
- **I want:** to open a customer from `customers` and see, through Read Customer, their details, current consent and the pieces they have taken home, each with piece name, tag, pure gold grams and date, newest first, with the count and total grams taken home
- **So that:** I know what a buyer already owns by weight, without any price (FR-17-10, BR-17-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer has history rows "Chettinad Haram · TAG-7521" with pure gold 784,000 units in Oct 2026 and "Polki Kada pair · TAG-6690" with 574,900 units in Feb 2026, when Rajesh Verma opens her, then they show as "Chettinad Haram · TAG-7521 · 78.4000 g · Oct 2026" and "Polki Kada pair · TAG-6690 · 57.4900 g · Feb 2026", newest first.
  2. Given her six history rows add up to 1,358,900 units, when the detail is shown, then it reads "6 pieces in all" and "135.8900 g taken home", summed from integers on the server.
  3. Given a customer with no history rows, when the detail is shown, then the history area says nothing has been taken home yet and the total is not shown.
  4. Given the detail response, when it is inspected, then it carries no price, value, budget or spend figure while pricing is off (EP-17-S11).
  5. Given an unknown or erased customer id, when Read Customer is called, then the server returns `not_found`.
- **Rules enforced on the server:** Caller must hold the read-customer permission (staff and owner; refused for karigar by EP-17-S12). History rows are read from `customer_history` and returned as integers of 0.0001 g; the total is computed on the server from integers. Rows are ordered by date descending, then tag. The source of new history rows is open (G13); this story reads whatever rows exist and writes none.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading a customer changes nothing.
- **Data changes:** None in the product database. Adds Read Customer to the shared contract.
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg` ("WHAT THEY HAVE TAKEN HOME · BY WEIGHT, NOT PRICE", "6 pieces in all · their history ties to the same tags and grams the system already tracks", "135.890 g taken home", shown here to 4 decimals). The customer detail itself is not yet designed (MOCKUP-COVERAGE §3); the prototype drawer on `customers` is reused until the design pass.
- **Non-functional checks:** Precision: grams are integers of 0.0001 g, summed as integers and shown to 4 decimals; the mockup's "78.400 g" and "135.890 g" read "78.4000 g" and "135.8900 g". Personal data: details are shown only to staff and owner. Open question G13: where piece history comes from, given stock-out records no customer today; until EP-26 decides, history holds only seeded or imported rows.
- **Depends on:** EP-17-S1, EP-17-S2, EP-17-S8, EP-02-S2, EP-02-S4, EP-08-S2, EP-08-S3, EP-08-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S10: System can match a phone to a known customer for leads and POs (G7)

- **Story ID:** EP-17-S10
- **Status:** Not started
- **Title:** System can match a phone to a known customer for leads and POs (G7)
- **As a:** System
- **I want:** a Find Customer by phone operation that normalises a given phone and returns the one active customer who holds it (id, name, city, group), or none, callable from the lead form, the PO intake and server code
- **So that:** a lead or PO from a known buyer links to their record instead of creating a duplicate (FR-17-11, gap G7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer holds "+919884021107", when a manual lead is typed with phone "+91 98840 21107", then Find Customer by phone returns Meera Iyer's id, name, city and group (epic acceptance criterion 4).
  2. Given a PO arrives from "+91 98451 20034" and no active customer holds that phone, when the match runs, then it returns none and creates no customer.
  3. Given the phone "98840 211" with fewer than 10 digits, when the match is asked, then it returns none with no error, so the lead form can still be saved.
  4. Given Meera Iyer is erased, when her old phone is matched, then it returns none.
  5. Given 10,000 customers, when the match is called, then it answers in under 200 ms at the server.
  6. Given the decided rule lets two customers share a phone and both are active, when the match runs, then it returns both, and the lead form asks staff to choose one.
- **Rules enforced on the server:** Callable by staff, owner and server code (EP-28, EP-29); refused for karigar (EP-17-S12). Uses the same normaliser as add and edit (EP-17-S1) and the phone index (EP-17-S4). Read only: it never creates, edits or links a customer; linking the lead is done by EP-28 and EP-29. Returns only id, name, city and group.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A match reads data; the lead that uses it is audited by EP-28 and EP-29.
- **Data changes:** None in the product database. Adds Find Customer by phone to the shared contract.
- **UI reference:** No screen of its own. `docs/ux/mockups/17-lead-create.svg` shows the result on `lead-create` ("Who is it?", "Mrs Nair", "known customer ·", "Phone", "+91 94440 22189"); EP-28 builds that screen.
- **Non-functional checks:** Performance: under 200 ms (proposed target in epic section 13, to confirm; PRODUCTION-SCOPE §5 sets none). Personal data: the response holds only the fields needed to recognise the customer. Open question G7: when a lead's phone matches a customer but the name differs, which wins and who confirms the match. Open question: can two customers share a phone; criterion 6 applies only if they can.
- **Depends on:** EP-17-S1, EP-17-S4, EP-03-S1, EP-03-S2, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S11: System can keep budget and spend dark behind the pricing switch

- **Story ID:** EP-17-S11
- **Status:** Not started
- **Title:** System can keep budget and spend dark behind the pricing switch
- **As a:** System
- **I want:** the customer service to refuse any write to `budgetINR` or `spentINR`, the customer responses to carry them only as null, and every screen to render them only through `ValueSlot`, which draws nothing while the pricing flag is off
- **So that:** the sockets exist from day one and fill when EP-42 turns pricing on, and no amount is stored or shown before then (FR-17-12, BR-17-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given pricing is off, when Rajesh Verma or Sanjay Seth opens Meera Iyer's detail, then no budget or spend figure is shown, no empty space is left for it, and `budgetINR` and `spentINR` are null in the database (epic acceptance criterion 5).
  2. Given a Create Customer or Update Customer request that includes `budgetINR: 800000`, when the contract check runs, then it is rejected as a validation error and nothing is stored.
  3. Given `customer-new`, when the form is shown with pricing off, then the "COMES LATER · WITH PRICING" panel with "Budget" and "Spend so far" shows no input and accepts no value.
  4. Given the List Customers, Read Customer and Find Customer by phone responses, when they are inspected, then none carries a non-null budget or spend value.
  5. Given pricing is switched on by the owner (EP-13-S9), when the customer detail is opened, then the `ValueSlot` sockets render, still empty, because only EP-42 fills them.
- **Rules enforced on the server:** No operation in this epic reads or writes an amount. The shared contract for Create Customer and Update Customer has no budget or spend field. The pricing flag is read from shop settings (EP-13-S9); this epic adds no price logic.
- **Live events emitted / consumed:** None. The pricing flag change is pushed by EP-13-S14.
- **Audit entry written:** No. Nothing changes; the pricing flag itself is audited by EP-13-S9.
- **Data changes:** None in the product database. `budgetINR` and `spentINR` stay nullable with no default (EP-02-S4).
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg`, route `customer-new` ("COMES LATER · WITH PRICING", "Budget", "fills in when pricing is switched on", "Spend so far"); `docs/ux/mockups/15-value-ready.svg` ("budget line · hidden").
- **Non-functional checks:** Security: the server refuses amount fields; hiding them in the form is not the control. Open decision: money is deferred to EP-42; nothing here computes, stores or shows rupees.
- **Depends on:** EP-17-S1, EP-17-S3, EP-17-S5, EP-17-S9, EP-03-S2, EP-13-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S12: System can refuse every customer operation from a karigar

- **Story ID:** EP-17-S12
- **Status:** Not started
- **Title:** System can refuse every customer operation from a karigar
- **As a:** System
- **I want:** Create Customer, Update Customer, List Customers, Read Customer, Find Customer by phone, Create Consent event and Erase Customer personal data to refuse a karigar caller with `forbidden` before any read or validation
- **So that:** a karigar never sees a customer's name, phone or dates (FR-17-8, BR-17-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar signed in as a karigar, when he calls List Customers, then the server returns `forbidden` and no customer row.
  2. Given Vijay calls Read Customer or Find Customer by phone with Meera Iyer's id or phone, when the server checks the role, then it returns `forbidden` and nothing about whether she exists.
  3. Given Vijay calls Create Customer with an invalid body, when the server checks it, then he gets the role refusal, not the validation sentence.
  4. Given Vijay's portal, when its routes are listed, then `customers` and `customer-new` are not among them (EP-08-S13).
  5. Given any karigar job response sent to Vijay, when it is inspected, then it carries no customer name or phone (EP-05-S3).
- **Rules enforced on the server:** The role check runs before validation and before any read (deny by default, EP-05-S2). Every customer operation is listed in the permission matrix for staff and owner only, with Erase for owner only (EP-05-S1). Customer lists are never sent to the karigar portal (epic section 13).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused request changes nothing.
- **Data changes:** Adds the customer operations to the permission matrix. No schema change.
- **UI reference:** No screen of its own. Routes `customers` and `customer-new` are on the staff and owner rails only (EP-08-S13); mockup `docs/ux/mockups/11-roles-and-permissions.svg` lists "Customers, leads or stock" among what a karigar cannot see.
- **Non-functional checks:** Security: hiding the routes is not the control; the server check is (epic section 13). Personal data: customer data never reaches a karigar phone.
- **Depends on:** EP-17-S3, EP-17-S5, EP-17-S8, EP-17-S9, EP-17-S10, EP-05-S1, EP-05-S2, EP-05-S3, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S13: Owner can carry out an approved deletion request on a customer

- **Story ID:** EP-17-S13
- **Status:** Not started
- **Title:** Owner can carry out an approved deletion request on a customer
- **As a:** Owner
- **I want:** an Erase Customer personal data operation that, for an approved deletion request, clears the customer's name, phone, address, birthday and anniversary, sets status `erased`, and keeps their piece history by tag, grams and date without the personal fields
- **So that:** the shop can honour a deletion request under the DPDP Act, 2023, and still keep its stock and weight records whole (FR-17-13, BR-17-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer has an approved deletion request, when Sanjay Seth carries it out, then her `name` reads "Erased customer", and `phone`, `address`, `dob` and `anniversary` are null, her status is `erased`, and her version goes up by one (epic acceptance criterion 6).
  2. Given her history rows TAG-7521 and TAG-6690, when the erase commits, then the rows remain with tag, piece name, pure gold grams and date, linked to the erased record and to no name or phone.
  3. Given her consent events, when the erase commits, then the rows stay as proof of consent and an `opt_out` state applies, so she cannot receive a wish or broadcast.
  4. Given she is erased, when the directory is searched or her old phone is matched, then she is not found (EP-17-S8, EP-17-S10).
  5. Given Rajesh Verma (Staff) or a request with no approved deletion request, when Erase is called, then the server refuses and nothing changes.
  6. Given Meera Iyer is already erased, when Erase is called again, then the server refuses with `not_found` and nothing changes.
- **Rules enforced on the server:** Owner only, or System when EP-39 carries out an approved request. The request must reference an approved deletion request; until EP-39 builds the request flow, the operation takes a deletion request reference and a reason from the owner. All fields are cleared, the consent copy set to false, and the audit entry written in one transaction (EP-03-S6). The erased record is never deleted, so history foreign keys stay valid. Stale version refused (EP-02-S14).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_erased`), the deletion request reference, and the names of the erased fields only, never their values (G22). Written through EP-17-S14.
- **Data changes:** Updates `customers` (personal fields cleared, `status` `erased`, `optedIn` false, `version`). Keeps `customer_history` and `consent_events` rows. Adds Erase Customer personal data to the shared contract.
- **UI reference:** Not yet designed. No mockup draws the deletion step; it belongs with the EP-39 request flow.
- **Non-functional checks:** Personal data: deletion supported under the DPDP Act, 2023; legal obligations verified with a professional (EP-39). Audit: the erase entry holds no erased value. Open question G22: how earlier audit entries that already hold the customer's name are handled, given the log is append-only. Open question: how long the anonymised history is kept. Open question: whether `city` and `notes` are erased too; FR-17-13 names only the five fields above.
- **Depends on:** EP-17-S1, EP-17-S2, EP-17-S8, EP-17-S10, EP-02-S14, EP-03-S6, EP-05-S2, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-17-S14: System can audit customer changes without copying erased values

- **Story ID:** EP-17-S14
- **Status:** Not started
- **Title:** System can audit customer changes without copying erased values
- **As a:** System
- **I want:** every add, edit, consent change and erase of a customer to write one append-only audit entry in the same transaction, with before and after for changed fields, and the erase entry to name the erased fields without their values
- **So that:** the owner can see who changed a customer record or their consent, when and how, and an erased customer's details do not survive in a new log entry (FR-17-14, epic section 13 audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma adds Meera Iyer, when the create commits, then one entry exists with actor Rajesh, server time, entity type customer, entity her id, action `customer_added` and the stored fields as after.
  2. Given Rajesh changes her city from Chennai to Coimbatore, when it commits, then one entry exists with action `customer_edited`, before `{city: "Chennai"}` and after `{city: "Coimbatore"}`, and no unchanged field.
  3. Given Priya Malhotra replies "STOP", when the opt-out commits, then one entry exists with actor System, action `customer_opted_out` and source `whatsapp_reply`.
  4. Given Sanjay Seth erases Meera Iyer, when it commits, then the entry with action `customer_erased` lists the field names name, phone, address, dob and anniversary, and its text contains neither "Meera Iyer" nor "9884021107".
  5. Given an edit that fails after the customer row was updated, when the transaction rolls back, then neither the change nor the audit entry is stored.
  6. Given Sanjay filters the security log by entity type customer, when the results come back, then they list the customer entries newest first (EP-06-S10).
- **Rules enforced on the server:** Audit entries are written in the same transaction as the change (EP-06-S2) and cannot be updated or deleted (EP-06-S1). Actor comes from the session or is System, time from the server clock (EP-03-S3, EP-06-S6). Before and after hold only changed fields (EP-06-S3). The erase entry is built from field names only. Audit reads are owner-only (EP-06-S12). A refused request writes no entry.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_added`, `customer_edited`, `customer_consent_recorded`, `customer_opted_out`, `customer_erased`), before, after, source for consent, deletion request reference for erase.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds the customer action kinds to the audit kind list by migration. No other schema change.
- **UI reference:** No screen of its own. Entries show in the security log built in EP-06 (EP-06-S9, EP-06-S10, EP-06-S11).
- **Non-functional checks:** Audit: every customer change writes an append-only entry. Personal data: personal values in before and after are visible only to the owner; the erase entry copies no erased value. Time: stored in UTC, shown in Asia/Kolkata. Open question G22: how a deletion request applies to earlier entries that already hold the customer's name.
- **Depends on:** EP-17-S3, EP-17-S5, EP-17-S6, EP-17-S7, EP-17-S13, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S6, EP-06-S7, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Who may add a customer: staff (mockup 11 "Add a customer and send wishes") or owner only (the mockups README places onboarding under owner-level)? (EP-17-S3, S6)
- G19: which customer groups exist (type: VIP Bridal, High net worth, Regular, Wholesale; mockups: Festive collector, Collectors, "Bought in last 6 months")? Are they fixed or a reference list? (EP-17-S1, S3, S5, S8)
- G13: where does piece history come from, given stock-out records no customer today? (EP-17-S9)
- G7: when a lead's phone matches a customer but the name differs, which wins, and who confirms the match? (EP-17-S10)
- Can two customers share a phone (family members)? (EP-17-S4, S10)
- D7 is decided: one shop, no branches; customers belong to the shop (EP-17-S1, S8).
- G22: how is a deletion request carried out when the audit log already holds the customer's name? (EP-17-S13, S14)
- How long is a deleted customer's anonymised history kept? (EP-17-S13)
