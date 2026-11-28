# EP-19: Order copy and karigar jobs · stories

Epic document: [EP-19 Order copy and karigar jobs](../epics/EP-19-order-copy-and-karigar-jobs.md)

Role note: stories where the server creates, refuses, derives, schedules or pushes on its own use "System". The karigar's phone screens are EP-20; stories here give the karigar the server operations and the job payload that EP-20 shows. Parcel release is EP-23; the settlement in EP-19-S12 ships as a function called by the release and is tested with a test caller until EP-23 exists.

---

## EP-19-S1: System can store order copies, jobs and settlements with integer weights

- **Story ID:** EP-19-S1
- **Status:** Not started
- **Title:** System can store order copies, jobs and settlements with integer weights
- **As a:** System
- **I want:** the `order_copies` and `karigar_jobs` tables from EP-02-S8 extended with the fields this epic needs, and a new `job_settlements` table, with every weight an integer in units of 0.0001 g
- **So that:** an order copy can exist with or without a lead, a job carries its own title, purity and dates, and a settlement can be stored once per job (FR-19-1, FR-19-12, BR-19-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `order_copies` is inspected, then it has `leadId` and `leadItemId` nullable, a nullable `designId` referencing the EP-15-S10 design master, `brief`, `qty`, `purity`, `targetGrossG`, `targetNetG`, `toleranceG`, `goldIssuedG` as integers in units of 0.0001 g, `allowanceBp` (basis points, for example 70 for 0.7%), `karigarId`, `dueDate`, `createdBy` and `createdAt`.
  2. Given an order copy for 2 pieces of 22K (916) with "Finished piece should weigh" 80.000 g, "Allowed to be off by" ± 500 mg and gold issued 162.4000 g, when it is stored and read back, then `targetGrossG` is `800000`, `toleranceG` is `5000` and `goldIssuedG` is `1624000`.
  3. Given the migrations have run, when `karigar_jobs` is inspected, then it has `orderCopyId`, `title`, `style`, `qty`, `purity`, `karigarId`, `status`, `sentAt`, `dueDate`, `confirmedDate`, `stopped`, `parcelId`, `benchNote`, `settledAt`, `cancelledAt` and `version`.
  4. Given the migrations have run, when `job_settlements` is inspected, then it has `jobId` (unique), `issuedG`, `netReturnedG`, `lossG` as signed integers in units of 0.0001 g, `allowanceBp`, `allowedLossG`, `flagged` (boolean) and `settledAt`, and a second settlement row for the same job is rejected by the database.
  5. Given an order copy row with a weight of 80.00005 g or a negative `goldIssuedG`, when it is written through the EP-02-S2 helpers, then it is refused, and no row is stored.
- **Rules enforced on the server:** Weights pass only through the EP-02-S2 conversion helpers; more than 4 decimals is refused, never rounded. Database checks: `targetGrossG > 0`, `goldIssuedG >= 0`, `toleranceG >= 0`, `qty >= 1`, `allowanceBp >= 0`. `job_settlements.jobId` is unique. `purity` and `style` must be active list entries (EP-15-S4). Due and confirmed dates are stored as calendar dates read in Asia/Kolkata. No money column on any of the three tables.
- **Live events emitted / consumed:** None. Storage only.
- **Audit entry written:** No. This story creates storage; EP-19-S14 and the writing stories state their audit entries.
- **Data changes:** Migration on `order_copies` adds `designId` (nullable, foreign key to designs), `allowanceBp`, and makes `leadId` and `leadItemId` nullable if not already. Migration on `karigar_jobs` adds `title`, `style`, `qty`, `purity`, `sentAt`, `cancelledAt` and `settledAt` where missing. Migration creates `job_settlements` with a unique index on `jobId` and a foreign key to `karigar_jobs`. Reference images stay as attachment rows (EP-09-S8). Overdue columns come from EP-10-S7.
- **UI reference:** No screen
- **Non-functional checks:** Precision: all weights integers of 0.0001 g; `allowanceBp` is an integer so no percentage is stored as a float. Time: `sentAt`, `settledAt`, `cancelledAt` in UTC; due and confirmed dates are Asia/Kolkata dates. D7 is decided: one shop, no branches; jobs carry the shop ID (EP-02-S3) and no `branchId`. Open decision G10: the stored unit must match EP-02 and EP-18.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S8, EP-02-S14, EP-09-S8, EP-15-S4, EP-15-S10, EP-18-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S2: System can issue gold and create a job in one transaction

- **Story ID:** EP-19-S2
- **Status:** Not started
- **Title:** System can issue gold and create a job in one transaction
- **As a:** System
- **I want:** one Create Order copy and job operation that, inside a single transaction, checks the inputs, takes the EP-18 pool lock, creates the order copy and a job in `sent`, posts the `issued` pool entry through EP-18-S3 and writes the audit entry
- **So that:** a job never exists without its gold leaving the pool, and gold never leaves the pool without a job (FR-19-2, FR-19-3, FR-19-5, BR-19-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a pool of 812.5800 g, when Rajesh Verma creates an order copy for Lakshmi Devi · KG-01, 2 pieces, 80.0000 g each, gold issued 162.4000 g, then order copy OC-2026-NNN and job MO-2026-NNN in `sent` exist, an `issued` entry of -162.4000 g references the job, and the pool reads 650.1800 g (epic acceptance criterion 1).
  2. Given a pool of 100.0000 g, when Rajesh issues 162.4000 g, then the server refuses with "The metal pool does not have that much gold to issue.", and no order copy, no job and no pool entry exist (epic acceptance criterion 2).
  3. Given no karigar is picked, when the request reaches the server, then it refuses with "Pick who makes it."; given a target gross of 0.0000 g, then it refuses with "Enter the weight the finished piece should have."; given gold issued of -1.0000 g, then it refuses with "Gold issued cannot be negative." (FR-19-2).
  4. Given the karigar KG-05 was deactivated after the form loaded, when Rajesh sends, then the server refuses through the EP-16-S8 active-karigar check and nothing is stored.
  5. Given the same request is sent twice with one idempotency key after a network drop, when the server processes it, then one order copy, one job and one pool entry exist, and the second call returns the same ids.
- **Rules enforced on the server:** Caller must hold the create-order-copy permission (Owner and Staff, EP-05-S2). Inputs validated against the contract (EP-03-S2). The karigar must be active (EP-16-S8). The job id is the next `MO-YYYY-NNN` and the order copy id the next `OC-YYYY-NNN`, generated without duplicates. `allowanceBp` is copied from the karigar record at send time, so a later allowance change does not alter this job. Order of locks: pool row, then karigar row (EP-18-S5). Pool entry, order copy, job and audit commit or roll back together (EP-03-S6, EP-06-S2). `createdBy` and `createdAt` come from the session and server clock (EP-03-S3). Deduplicated by idempotency key (EP-03-S8).
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (job sent, through EP-19-S7) and "Metal pool changed" (through EP-18-S12).
- **Audit entry written:** Yes: actor, time, entity (order copy and job id), action (`order_copy_sent`), after (karigar, qty, purity, target gross, target net, tolerance, gold issued in integer units, due date, lead id or none). Written here and listed in EP-19-S14.
- **Data changes:** Inserts into `order_copies`, `karigar_jobs` and `pool_entries`; updates `metal_pools.balanceG` and `version`. Adds Create Order copy and job to the shared contract and ports `createOrderCopyAndJob` from `src/store/transitions.ts` as a server service function.
- **UI reference:** No screen of its own. Called from `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("Send the order copy").
- **Non-functional checks:** Concurrency: issue and job creation share one transaction with EP-18's lock; two sends against a pool that holds enough for only one leave one job. Precision: integer comparison against the pool. Audit: create is audited in the same transaction (epic section 13). D1 is decided (Option C): this is a Node API endpoint, and the Node API holds issue, job creation and audit in one transaction.
- **Depends on:** EP-19-S1, EP-03-S2, EP-03-S3, EP-03-S4, EP-03-S6, EP-03-S7, EP-03-S8, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S5, EP-16-S8, EP-18-S3, EP-18-S4, EP-18-S5, EP-18-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S3: Staff can build an order copy without a lead

- **Story ID:** EP-19-S3
- **Status:** Not started
- **Title:** Staff can build an order copy without a lead
- **As a:** Staff
- **I want:** to open `order-copy` with no lead and fill in reference images, the brief, how many, purity, "Finished piece should weigh", the gold inside after stones, and "Allowed to be off by", then press "Send the order copy"
- **So that:** I can send work to a karigar today without first creating a lead, and the lead path from EP-30 reuses the same screen later (FR-19-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma opens `order-copy` from the Parcels in or karigar area with no `leadId` or `itemId` params, when the screen loads, then it shows the builder with empty fields and the heading "Order copy to a karigar", and no "From the … lead" line.
  2. Given Rajesh adds 3 images through "Add a photo", types the brief "Chettinad long haram, Goddess Lakshmi centre", picks 2 pieces, 22K (916), 80.0000 g, ± 0.5000 g, Lakshmi Devi · KG-01, 17 Nov 2026 and 162.4000 g, when he presses "Send the order copy", then the order copy is created through EP-19-S2 with `leadId` empty, and the screen confirms with the job number.
  3. Given Rajesh types "80.000" in "Finished piece should weigh", when the field loses focus, then it shows "80.0000 g", and a value with 5 decimals is refused with a validation message.
  4. Given the server refuses the send, for example with "Pick who makes it.", when the refusal returns, then the sentence shows next to "Send the order copy" through EP-08-S5 and the typed values stay on the form.
  5. Given the device is offline, when the screen is open, then "Send the order copy" is disabled with the EP-08-S11 offline state, and a send retried after a drop is not applied twice (EP-08-S6).
- **Rules enforced on the server:** The same rules as EP-19-S2. Purity and style must be active list entries (EP-15-S4). Reference images must be files the caller uploaded or may read (EP-09-S6, EP-09-S8). The brief is trimmed and limited to 1,000 characters (proposed limit, to confirm). The server never pre-fills a weight from a design or category (BR-19-8).
- **Live events emitted / consumed:** Emitted through EP-19-S2: "Karigar job status changed" and "Metal pool changed". Consumed: "Metal pool changed" for the balance line (EP-18-S10).
- **Audit entry written:** Yes, through EP-19-S2 (`order_copy_sent`). Attaching or detaching a reference image is recorded on the order copy's audit entry (EP-09-S8).
- **Data changes:** None beyond EP-19-S2. Moves `src/components/leads/OrderCopyBuilder.tsx` off `useStore()` onto the EP-08 data layer and makes the `leadId` and `itemId` route params optional.
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("WHAT YOU SEND · IMAGES AND THE BRIEF", "Add a photo", "The brief, in your words and theirs", "THE TARGETS AND WHO MAKES IT", "How many", "Purity", "Finished piece should weigh", "Allowed to be off by", "Send the order copy"). The mockup shows the lead path; the direct path without the "From the Sharma lead" line is not drawn. Weights show to 4 decimals in v1.
- **Non-functional checks:** Precision: typed grams converted with the EP-02-S2 helper; "± 500 mg" is entered and shown as "± 0.5000 g" or the mg wording decided in the design pass. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Performance: the screen loads within 2 seconds (PRODUCTION-SCOPE §5). Open question: whether the brief and target net are required fields.
- **Depends on:** EP-19-S2, EP-09-S2, EP-09-S8, EP-15-S5, EP-08-S1, EP-08-S3, EP-08-S4, EP-08-S5, EP-08-S6, EP-08-S11, EP-08-S13, EP-08-S17, EP-18-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S4: Staff can pick a karigar and due date with suggested gold shown

- **Story ID:** EP-19-S4
- **Status:** Not started
- **Title:** Staff can pick a karigar and due date with suggested gold shown
- **As a:** Staff
- **I want:** to pick "Who makes it" from active karigars, set the "Due date", and see a suggested gold figure (target plus the karigar's allowance) under "Pure gold issued to …" as a hint, while I type the issued figure myself
- **So that:** I hand over the right amount of gold and give the karigar a date that leaves time for QC (FR-19-4, BR-19-2, BR-19-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma picks Lakshmi Devi · KG-01 with allowance 0.7% and enters 2 pieces at 80.0000 g, when Read Suggested gold runs, then the hint reads "161.1200 g suggested · 160.0000 g target + her 0.7% wastage", computed as 1,600,000 × 10,070 ÷ 10,000 = 1,611,200 units.
  2. Given the hint shows 161.1200 g, when Rajesh leaves "Pure gold issued to Lakshmi" empty and presses send, then the server refuses with a validation message on the gold field, because the hint is never copied into the issued figure on its own (FR-19-4).
  3. Given Rajesh types 162.4000 g, when he sends, then 162.4000 g is issued and stored, even though it differs from the hint.
  4. Given Rajesh picks a due date of 14 Nov 2026, when the field is shown, then the note "3 days before the customer needs it, for QC" is shown as guidance, and a due date before today in Asia/Kolkata is refused by the server.
  5. Given the karigar picker opens, when it loads, then it lists only active karigars with name, code, specialty and allowance, such as "Lakshmi Devi · KG-01 · Chettinad specialist · 0.7% loss" (EP-16-S8).
- **Rules enforced on the server:** Read Suggested gold is Owner and Staff only (EP-05-S2) and returns qty × target gross × (10,000 + allowance basis points) ÷ 10,000, in integer units, rounded half up to 1 unit. It changes nothing. The due date must be today or later in Asia/Kolkata (EP-10-S10). The karigar must be active (EP-16-S8). The issued figure is required and is whatever staff typed, checked by EP-19-S2.
- **Live events emitted / consumed:** Consumed: "Metal pool changed" so the balance next to the gold field stays current (EP-18-S10).
- **Audit entry written:** No. Reading a suggestion changes nothing; the issued figure is audited on send (EP-19-S2).
- **Data changes:** None in the product database. Adds Read Suggested gold to the shared contract and the karigar picker and date field to `order-copy`.
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("Who makes it", "Lakshmi Devi · KG-01", "Chettinad specialist · 0.7% loss · always on time", "THE DUE DATE AND THE GOLD YOU HAND OVER", "Due date", "17 Nov 2026", "3 days before the customer needs it, for QC", "Pure gold issued to Lakshmi", "160 g target + her 0.7% wastage, from the metal pool").
- **Non-functional checks:** Precision: suggestion computed in integers. Time: due date is an Asia/Kolkata date. Open question: the mockup shows "162.400 g" for 160 g plus 0.7%, but 160 g plus 0.7% is 161.1200 g; the source figure needs confirming, and this story uses the arithmetic. Open question: whether the suggestion is based on target gross (as the mockup's "160 g target" implies) or target net, since the gold issued is pure gold. Open question: whether the "3 days before" rule is a guide only or enforced against a customer date when the order copy comes from a lead.
- **Depends on:** EP-19-S3, EP-16-S1, EP-16-S8, EP-05-S2, EP-10-S10, EP-18-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S5: Karigar can receive the sent job

- **Story ID:** EP-19-S5
- **Status:** Not started
- **Title:** Karigar can receive the sent job
- **As a:** Karigar
- **I want:** a job sent to me to appear in my job list and be readable with its reference images, brief, quantity, purity, targets, tolerance and due date, with a notice that it has arrived
- **So that:** I know what to make and by when without a phone call from the desk (FR-19-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given job MO-2026-119 is sent to Lakshmi Devi · KG-01, when Lakshmi, signed in as the karigar user linked to KG-01, lists her jobs, then MO-2026-119 is returned in `sent` with title, "2 pieces · 22K", "Finished piece must weigh 80.0000 g", "Allowed to be off by ± 0.5000 g", the due date 17 Nov 2026 and the brief.
  2. Given the job payload returned to Lakshmi, when it is inspected, then it has no customer name, customer phone, lead id, price or other karigar's data (epic section 13).
  3. Given Vijay Kumar · KG-04 is signed in, when he asks for MO-2026-119, then the server returns `not_found` (EP-05-S3).
  4. Given the job is sent, when the transaction commits, then Lakshmi gets one notification naming the job (EP-11-S8) and her open job list updates live (EP-07-S6).
  5. Given Lakshmi opens the job, when its reference images load, then she sees only that job's reference images through signed, expiring links (EP-09-S9).
- **Rules enforced on the server:** List My jobs and Read Job for a karigar are filtered in the query to `karigarId` equal to the session user's linked karigar (EP-05-S3, EP-05-S13). Owner and Staff may read any order copy. The karigar response shape is a fixed allow-list of fields that excludes lead, customer and money fields. Images are served per EP-09-S6 and EP-09-S9.
- **Live events emitted / consumed:** Consumed: "Karigar job status changed" (job sent) on the karigar's own channel.
- **Audit entry written:** No. Reading a job changes nothing.
- **Data changes:** None in the product database. Adds List My jobs and Read Job (karigar shape and desk shape) to the shared contract.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("My jobs", "What it should look like", "Finished piece must weigh", "Allowed to be off by", "Note from the desk"); the screen is built in EP-20, and shows weights to 4 decimals. v1 is English only, so the "हिन्दी" switch on the mockup is not built (EP-44).
- **Non-functional checks:** Security: a karigar reads only their own jobs; prices and customers are never in the payload (epic section 13). Performance: the job list for one karigar with 20 open jobs returns in under 500 ms (proposed target, to confirm). Open question G14: if one hand-over can carry several jobs, the list may group jobs; this story returns one row per job.
- **Depends on:** EP-19-S2, EP-05-S3, EP-05-S13, EP-07-S6, EP-09-S9, EP-11-S8, EP-16-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S6: System can enforce the job state order and the stopped guard

- **Story ID:** EP-19-S6
- **Status:** Not started
- **Title:** System can enforce the job state order and the stopped guard
- **As a:** System
- **I want:** Update Job state operations for accept (with a confirmed date), start, mark ready and hand over that allow only `sent` → `accepted` → `on_bench` → `ready` → `handed_over`, refuse any move on a stopped job, and use a version check
- **So that:** a job's state always means the same thing, and a stopped job stays still until the owner clears the problem (FR-19-6, FR-19-7, BR-19-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 in `sent`, when Lakshmi Devi accepts it with confirmed date 16 Nov 2026, then it is `accepted` with `confirmedDate` 16 Nov 2026; a second accept is refused with "This job has already been accepted."
  2. Given a job in `accepted`, when "mark ready" is sent, then the server refuses with "Mark it as being worked on first."; given a job in `sent`, when "start" is sent, then it refuses with "Accept the job first."; given a job in `on_bench`, when "hand over" is sent, then it refuses with "Mark the job ready before handing it over."
  3. Given MO-2026-118 has `stopped` true, when Vijay Kumar tries to start, mark ready or hand it over, then the server refuses with "This job is stopped. Only the owner can start it again." and nothing changes (epic acceptance criterion 4).
  4. Given Vijay Kumar · KG-04 sends any state change for a KG-01 job, when the server checks it, then it returns `not_found` and nothing changes.
  5. Given two state changes on one job arrive with the same version, when both are processed, then one commits and the other gets the EP-03-S5 conflict error.
- **Rules enforced on the server:** Accept, start and mark ready may be called by the karigar linked to the job (EP-05-S3); Owner and Staff may not move a karigar's state for them unless the decided rule allows it. Hand over is called by the EP-20 hand-over operation, which creates the parcel in the same transaction. Only the transitions listed are allowed; a `cancelledAt` job cannot move. The confirmed date must be today or later in Asia/Kolkata. The stopped flag is set and cleared only by EP-24; this story only reads it. Each change checks `version` (EP-02-S14) and writes the audit entry in the same transaction.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (through EP-19-S7).
- **Audit entry written:** Yes: actor, time, entity (job id), action (`job_accepted`, `job_started`, `job_ready`, `job_handed_over`), before and after status, confirmed date on accept, bench note if given (EP-06-S7).
- **Data changes:** Updates `karigar_jobs.status`, `confirmedDate`, `benchNote`, `parcelId` and `version`. Adds the four Update Job state operations to the shared contract and ports `acceptJob`, `startJob`, `markJobReady`, `handOver` and `stoppedGuard` from `src/store/transitions.ts`.
- **UI reference:** No screen of its own. The rail is drawn on `docs/ux/mockups/12-state-lifecycles.svg` ("Sent to him", "Accepted, date set", "On the bench", "Ready", "Sent to the store"); the buttons ("Gold received", "Working on it", "Ready for checking", "Sent to the showroom") are on `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`, built in EP-20.
- **Non-functional checks:** Concurrency: version check on every transition. Security: a karigar moves only their own jobs. Audit: every transition audited, which the prototype does not do (epic section 13). Open question G14: if one hand-over carries several jobs, hand over moves each job in one transaction with one parcel. Open question: whether staff may move a job's state on the karigar's behalf, for example when the karigar has no phone.
- **Depends on:** EP-19-S2, EP-02-S14, EP-03-S4, EP-03-S5, EP-03-S6, EP-05-S3, EP-06-S2, EP-06-S7, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S7: System can push job status changes live

- **Story ID:** EP-19-S7
- **Status:** Not started
- **Title:** System can push job status changes live
- **As a:** System
- **I want:** to emit "Karigar job status changed" after every committed send, transition, cancel or stop flag change, carrying job id, karigar id, new status, stopped flag and version, to owner and staff connections and to the job's own karigar only
- **So that:** the tracker, the desk and the karigar's phone all show the same state within about a second (FR-19-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma has the tracker open and Lakshmi Devi accepts MO-2026-119, when the change commits, then the job moves to the accepted lane on Rajesh's screen within about a second without a reload.
  2. Given Vijay Kumar · KG-04 is connected, when Lakshmi Devi's job changes, then Vijay receives no event (EP-07-S6).
  3. Given the transition is refused or rolls back, when it ends, then no event is sent (EP-07-S1).
  4. Given two events for one job arrive out of order, when a screen applies them, then it keeps the state with the higher version.
  5. Given Rajesh's connection drops while a job changes, when he reconnects, then he catches up from his last sequence number and the tracker shows the current state (EP-07-S7, EP-08-S10).
- **Rules enforced on the server:** Published only after commit (EP-07-S1), stamped with sequence number, entity id and version (EP-07-S2). Audience: Owner and Staff role channels, plus the user channel of the karigar linked to the job, filtered by permission (EP-07-S5, EP-07-S11). The payload carries no customer, lead or money field, and no brief text.
- **Live events emitted / consumed:** Emitted: "Karigar job status changed". Consumed by the client: "Karigar job status changed" to refresh the tracker, job reads and rail badges (EP-08-S8).
- **Audit entry written:** No. Each change writes its own audit entry.
- **Data changes:** None in the product database. Wires the job service functions to the EP-07 publisher and adds the event-to-read map entries for job list, job detail, tracker and overdue reads (EP-08-S8).
- **UI reference:** No screen of its own. Effects show on the tracker (EP-19-S8, not yet designed), route `order-copy` confirmation, and `docs/ux/mockups/09-karigar-phone.svg` route `k-jobs` ("Tap one. The desk sees it at once.").
- **Non-functional checks:** Performance: event reaches open screens within about a second (PRODUCTION-SCOPE §1). Concurrency: version in the payload lets a screen drop an older state. Security: karigars receive only their own jobs' events.
- **Depends on:** EP-19-S2, EP-19-S6, EP-07-S1, EP-07-S2, EP-07-S4, EP-07-S5, EP-07-S6, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S8: Staff can see the job tracker with an overdue lane

- **Story ID:** EP-19-S8
- **Status:** Not started
- **Title:** Staff can see the job tracker with an overdue lane
- **As a:** Staff
- **I want:** a tracker board that lists open jobs in lanes Sent, Accepted, On the bench and Ready, plus an Overdue lane, each card showing job number, title, karigar, quantity, agreed date and days over, with a filter by karigar
- **So that:** I can see where every job is and chase the late ones before the customer asks (FR-19-8, BR-19-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given 7 open jobs, 2 of them past their agreed date, when Rajesh Verma opens the tracker, then each job appears in the lane for its status, and the Overdue lane lists the 2 late jobs with "Mahesh Soni · 3 days over" and "Lakshmi Devi · 1 day over".
  2. Given Rajesh filters by Vijay Kumar · KG-04, when the list loads, then only KG-04 jobs are shown in every lane.
  3. Given a job is `handed_over` or cancelled, when the tracker loads, then it is not shown in any lane.
  4. Given 500 open jobs, when the tracker loads, then it renders within 2 seconds (epic section 13).
  5. Given a karigar user calls List Jobs for the tracker, when the server checks the permission, then it is refused; and given the read fails or the device is offline, then the tracker shows the EP-08-S4 error with "Try again" or the EP-08-S11 offline state.
- **Rules enforced on the server:** List Jobs (tracker shape) is Owner and Staff only (EP-05-S2). Lanes are grouped and overdue days computed on the server from the agreed date (`confirmedDate` else `dueDate`) in Asia/Kolkata (BR-19-5, EP-10-S10). Open jobs are those not `handed_over` and not cancelled. Filter by karigar id is validated. Paged by cursor if a lane holds more than 100 jobs (EP-03-S9).
- **Live events emitted / consumed:** Consumed: "Karigar job status changed" and "Job passed its agreed date" (proposed, gap G26) to refresh lanes (EP-08-S9).
- **Audit entry written:** No. Reading the tracker changes nothing.
- **Data changes:** None in the product database beyond indexes. Migration adds an index on `karigar_jobs` (`status`, `karigarId`). Adds List Jobs (tracker shape) to the shared contract and a tracker screen with a new route id, proposed `job-tracker`.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3: job tracker board with overdue lane). Entry point is "See tracker" on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions`. The lane names follow `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Performance: under 2 seconds for 500 open jobs (epic section 13). Time: overdue days in whole Asia/Kolkata days. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Open question: whether an overdue job shows only in the Overdue lane or also in its status lane; to settle in the design pass. D7 is decided: no branch filter.
- **Depends on:** EP-19-S6, EP-19-S7, EP-03-S9, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S10, EP-08-S11, EP-08-S13, EP-10-S7, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S9: System can flag overdue jobs and remind the karigar

- **Story ID:** EP-19-S9
- **Status:** Not started
- **Title:** System can flag overdue jobs and remind the karigar
- **As a:** System
- **I want:** the EP-10-S7 overdue job to run against the real `karigar_jobs` table, every job read to return its agreed date and days over, and each overdue job to hand one reminder per day to the karigar through EP-11-S8
- **So that:** a late job is visible and the karigar is reminded without anyone chasing by hand (FR-19-9, FR-19-10, BR-19-4, BR-19-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-121 for Mahesh Soni · KG-02 with due date 30 Oct 2026, no confirmed date and status `on_bench`, when the overdue job runs on 2 Nov 2026 in Asia/Kolkata, then the job reads "3 days over", `overdueSince` is set, and Mahesh gets one reminder for that day.
  2. Given a job with due date 1 Nov and confirmed date 5 Nov, when the job runs on 2 Nov, then it is not overdue, because the confirmed date wins (BR-19-5).
  3. Given a job in `sent` that was never accepted, when its due date passes, then it is overdue in the same way, because the rule applies from send.
  4. Given an overdue job is handed over, when the hand-over commits, then it reads 0 days over and the next run sends no reminder.
  5. Given a job becomes overdue, when the change commits, then "Job passed its agreed date" is published to owner and staff and to that karigar only, and the reminder text has no customer, lead or price detail.
- **Rules enforced on the server:** A job is overdue from the day after its agreed date until handed over or cancelled (FR-19-9). Days over are whole Asia/Kolkata days (EP-10-S10). One reminder per job per day, keyed by job id, "overdue" and date (EP-10-S4). A stopped job is still counted overdue but its reminder says it is stopped, so the karigar is not told to hurry a job only the owner can restart. Reminder audience and channel are EP-11's.
- **Live events emitted / consumed:** Emitted: "Job passed its agreed date" (proposed, gap G26, through EP-10-S7). Consumed: "Karigar job status changed" to stop counting a handed-over job.
- **Audit entry written:** Yes, through EP-10-S12: actor System, time, entity (job id), action (`job_overdue`), after (`overdueSince`). Reminders are notification rows, not audit entries.
- **Data changes:** Uses `overdueSince` and `lastReminderAt` from EP-10-S7. Adds agreed date and days over to the job read shapes, replacing `agreedDate` and `jobOverdueDays` in `src/store/selectors.ts`.
- **UI reference:** No screen of its own. The rule is drawn on `docs/ux/mockups/12-state-lifecycles.svg` ("Past the agreed date the job joins the overdue tracker, the karigar is reminded and the owner sees it on Decisions."); the karigar sees it on `k-jobs` (EP-20).
- **Non-functional checks:** Time: dates and days over computed in Asia/Kolkata. Availability: a missed run after downtime runs once on recovery (EP-10-S11). Open question (compare A3): which channel carries the overdue reminder and how often; this story sends once a day until decided. Open question: whether a stopped job's reminder is suppressed.
- **Depends on:** EP-19-S6, EP-19-S7, EP-10-S4, EP-10-S7, EP-10-S10, EP-10-S11, EP-10-S12, EP-11-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S10: Owner can see overdue jobs on Decisions

- **Story ID:** EP-19-S10
- **Status:** Not started
- **Title:** Owner can see overdue jobs on Decisions
- **As a:** Owner
- **I want:** a Read Overdue jobs summary that returns the count of jobs past their agreed date and, per job, the karigar, days over and whether a reminder was sent, shown on `decisions` under "RUNNING LATE" with "See tracker"
- **So that:** I know which karigars are late without asking, and can open the tracker from there (FR-19-10, BR-19-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Mahesh Soni is 3 days over and Lakshmi Devi 1 day over, when Sanjay Seth opens `decisions`, then the card reads "2 karigar jobs past their agreed date" with "Mahesh Soni 3 days over · Lakshmi Devi 1 day over · both reminded automatically" and counts under running late (epic acceptance criterion 3).
  2. Given Sanjay presses "See tracker", when the tracker opens, then it shows the Overdue lane from EP-19-S8.
  3. Given Lakshmi Devi hands over her job while `decisions` is open, when "Karigar job status changed" arrives, then the card changes to "1 karigar job past its agreed date" without a reload.
  4. Given no job is overdue, when `decisions` loads, then the card is not shown and the running-late count does not include it.
  5. Given a karigar user calls Read Overdue jobs summary, when the server checks the permission, then it is refused.
- **Rules enforced on the server:** Read Overdue jobs summary is Owner and Staff (EP-05-S2). Count and days over are computed on the server as in EP-19-S9. "Reminded" is true when `lastReminderAt` is today in Asia/Kolkata. Jobs are listed worst first by days over. The card counts as one running-late item, as `decisionsSummary` does in the prototype.
- **Live events emitted / consumed:** Consumed: "Job passed its agreed date" (proposed, gap G26) and "Karigar job status changed".
- **Audit entry written:** No. Reading the summary changes nothing.
- **Data changes:** None in the product database. Adds Read Overdue jobs summary to the shared contract, replacing `overdueJobs` and the overdue part of `decisionsSummary` in `src/store/selectors.ts`. The `decisions` page layout itself is EP-32.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("RUNNING LATE · 2 · THE CLOCK TOLD ME, NOT A PERSON", "2 karigar jobs past their agreed date", "Mahesh Soni 3 days over · Lakshmi Devi 1 day over · both reminded automatically", "See tracker").
- **Non-functional checks:** Performance: the summary reads in under 500 ms for 500 open jobs (proposed target, to confirm). Time: days over in Asia/Kolkata. Availability: the card shows the EP-08-S4 error state if its read fails, without blocking the rest of `decisions`. D7 is decided: the mockup's "All branches" shows the shop name and counts are for the shop.
- **Depends on:** EP-19-S8, EP-19-S9, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S11: Staff can cancel a job and return the gold

- **Story ID:** EP-19-S11
- **Status:** Not started
- **Title:** Staff can cancel a job and return the gold
- **As a:** Staff
- **I want:** to cancel a job that is not handed over, with a reason, so that it closes and its gold goes back to the pool in one `returned` entry through EP-18
- **So that:** gold issued for work that will not be made is back in the pool and no longer counted as with the karigar (FR-19-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 in `sent` with 162.4000 g issued and no returns, when Rajesh Verma cancels it with the reason "Customer changed the design", then `cancelledAt` is set, a `returned` entry of +162.4000 g references the job, and the pool rises by 162.4000 g.
  2. Given the cancelled job, when it is cancelled again, then the server refuses and no second `returned` entry is posted.
  3. Given a job in `handed_over`, when Rajesh tries to cancel it, then the server refuses and nothing changes.
  4. Given a job in `accepted`, `on_bench` or `ready`, when Rajesh tries to cancel it, then the server applies the decided rule; until the rule is decided it refuses with code `cancel_rule_pending` and nothing changes.
  5. Given a reason shorter than 3 characters, or a karigar user sending cancel, when the server checks it, then it refuses and nothing changes.
- **Rules enforced on the server:** Cancel is Owner and Staff (EP-05-S2). Allowed in `sent`; other non-handed-over states follow the open rule. A stopped job may be cancelled only by the owner (proposed, to confirm). The returned amount is the job's `goldIssuedG` less its earlier `returned` entries, read on the server, never sent by the client. The return is posted as an internal System entry inside the cancel transaction through the EP-18-S1 posting function under the EP-18-S5 lock, with one cancel return per job enforced by a unique index. Job update, pool entry and audit commit together. Version check on the job.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (job cancelled, through EP-19-S7) and "Metal pool changed" (through EP-18-S12).
- **Audit entry written:** Yes: actor, time, entity (job id), action (`job_cancelled`), before (status), after (`cancelledAt`, gold returned in integer units), reason.
- **Data changes:** Updates `karigar_jobs.cancelledAt` and `version`; inserts one `returned` row into `pool_entries` and updates `metal_pools.balanceG`. Migration adds a unique partial index on `pool_entries` (`ref_id`) for cancel returns. Adds Cancel Job to the shared contract.
- **UI reference:** Not yet designed. No mockup draws cancel; it belongs on the tracker card or the job detail.
- **Non-functional checks:** Concurrency: the unique index and job version stop a double return (epic section 16). Audit: cancel is audited (epic section 13). Precision: integer arithmetic for the returned amount. Open question: can a job be cancelled after it is accepted, and if so is the full issued gold returned or only what the karigar hands back and is weighed. Open question: can an order copy be edited after send; edit before accept is listed in the epic's API surface but has no candidate story, so it is not built here.
- **Depends on:** EP-19-S6, EP-19-S7, EP-18-S1, EP-18-S5, EP-18-S7, EP-18-S12, EP-02-S14, EP-03-S4, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S12: System can settle a job when its parcel is released (G23)

- **Story ID:** EP-19-S12
- **Status:** Not started
- **Title:** System can settle a job when its parcel is released (G23)
- **As a:** System
- **I want:** a Settle Job function that the parcel release of EP-23 calls inside its own transaction, which records gold issued, net returned, the allowance in force, the allowed loss and the loss, sets `settledAt`, and flags a loss above the allowance
- **So that:** each job is reconciled against the karigar's wastage allowance, apart from the parcel's exact-match check in EP-23 (FR-19-12, FR-19-13, BR-19-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 issued 162.4000 g with no returns, allowance 70 basis points, and its released parcel holds pieces with net 160.9000 g in total, when settlement runs, then a `job_settlements` row stores issued `1624000`, net returned `1609000`, loss `15000` (1.5000 g), allowed loss `11368` (1.1368 g) and flagged true (epic acceptance criterion 5).
  2. Given the same job with net returned 161.5000 g, when settlement runs, then loss is 0.9000 g, which is within 1.1368 g, and flagged is false.
  3. Given the job had a `returned` pool entry of 2.0000 g before release, when settlement runs, then the returned gold is subtracted from issued before the loss is computed.
  4. Given a job is already settled, when Settle Job is called again, then it refuses and nothing changes, because the settlement row is unique per job.
  5. Given the parcel release rolls back after Settle Job ran, when the transaction ends, then no settlement row exists and `settledAt` is empty.
- **Rules enforced on the server:** Settle Job is internal, callable only from the release service (EP-23) and a test caller until then. It requires the caller's open transaction. Net returned is the sum of stored net (gross less stone, in integer units) of the job's pieces in the released parcel, read on the server. Loss = issued − earlier returns − net returned, which may be zero or negative; a negative loss is stored and not flagged. Allowed loss = (issued − earlier returns) × `allowanceBp` ÷ 10,000, rounded down to 1 unit, using the allowance copied onto the order copy at send. The settlement is kept apart from the EP-23 exact-match check (reconciliation B here, A there).
- **Live events emitted / consumed:** None of its own. The release that calls it emits its own events in EP-23. The owner reads the flag through Read Job settlement; showing it on Decisions is EP-32.
- **Audit entry written:** Yes: actor (the user releasing the parcel, or System), time, entity (job id), action (`job_settled`), after (issued, net returned, loss, allowed loss in integer units, flagged).
- **Data changes:** Inserts one row into `job_settlements`; sets `karigar_jobs.settledAt`. Adds Settle Job to the internal service layer and Read Job settlement (Owner only) to the shared contract. Replaces the prototype `finishRelease` stamp and its append to `Karigar.gapsMg`.
- **UI reference:** Not yet designed. The settlement is named on `docs/ux/mockups/19-order-copy-builder.svg` ("settled against this job when the parcel is reconciled"); no screen shows the settlement or the flag.
- **Non-functional checks:** Precision: all figures integers of 0.0001 g. Audit: settlement audited (epic section 13). Security: Read Job settlement is Owner only; a karigar does not see the flag. Open question G23: when settlement is computed, who sees the flag, and whether loss is booked against the karigar ledger; criteria use the allowed-loss formula above until decided. Open question Q5b: whether intake is only reconciliation A with wastage handled here. Open question G14: if one parcel carries several jobs, how net returned is split per job. Open question G4: which settlement figures feed the EP-16 scorecard.
- **Depends on:** EP-19-S1, EP-19-S2, EP-18-S1, EP-18-S7, EP-02-S5, EP-02-S6, EP-03-S6, EP-05-S2, EP-06-S2, EP-06-S5, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S13: Staff can start an order copy from a sold-out design (G3)

- **Story ID:** EP-19-S13
- **Status:** Not started
- **Title:** Staff can start an order copy from a sold-out design (G3)
- **As a:** Staff
- **I want:** "Order another from Vijay" on a sold-out design to open `order-copy` as a draft with the design, its category and style, and the named karigar filled in, and every weight empty
- **So that:** I can reorder a design customers keep asking for in a few taps, without copying old weights by mistake (FR-19-14, BR-19-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the design "Peacock Ruby Pendant" is sold out and its last piece TAG-7914 was made by Vijay Kumar · KG-04, when Rajesh Verma presses "Order another from Vijay" on `stock`, then `order-copy` opens with the design id, category, style "Antique" and karigar Vijay Kumar · KG-04 filled in (epic acceptance criterion 6).
  2. Given the draft opens, when Rajesh looks at "Finished piece should weigh", "Allowed to be off by" and "Pure gold issued to Vijay", then all are empty, and no weight from TAG-7914 or the design is filled in (BR-19-8).
  3. Given Rajesh completes the draft and sends it, when it commits through EP-19-S2, then the order copy stores `designId` and `leadId` empty.
  4. Given Vijay Kumar has been deactivated since, when the draft opens, then the karigar field is empty with a note that Vijay is no longer active, and Rajesh picks another.
  5. Given Rajesh leaves the draft without sending, when he returns later, then nothing was created on the server and no gold was issued.
- **Rules enforced on the server:** Create Reorder draft is Owner and Staff (EP-05-S2) and only returns a draft; it stores nothing. It reads the design from EP-15-S10, refuses a design that is not sold out per EP-15-S11 with a validation message, and never returns weights. The suggested karigar is the maker of the most recent piece of the design, returned only if active (EP-16-S8). Sending is EP-19-S2 with its full checks.
- **Live events emitted / consumed:** None for the draft. Sending emits through EP-19-S2.
- **Audit entry written:** No for the draft, which stores nothing. The send writes `order_copy_sent` with `designId` (EP-19-S2).
- **Data changes:** None in the product database for the draft. Adds Create Reorder draft to the shared contract and a `designId` route param to `order-copy`.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Sold out", "Peacock Ruby Pendant", "TAG-7914 · 22K · Antique", "Asked for 4 times since July", "Order another from Vijay"), opening `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy`. The stock card is built in EP-22.
- **Non-functional checks:** Security: the draft returns no customer or price data. Open question G3: what "Order another from Vijay" copies from the sold piece, such as photos as reference images, the brief or the quantity; this story copies design, category, style and karigar only until decided.
- **Depends on:** EP-19-S3, EP-19-S4, EP-15-S10, EP-15-S11, EP-16-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-19-S14: System can audit order copy and job changes

- **Story ID:** EP-19-S14
- **Status:** Not started
- **Title:** System can audit order copy and job changes
- **As a:** System
- **I want:** every write on order copies and jobs to write one audit entry in its own transaction, with fixed action names `order_copy_sent`, `job_accepted`, `job_started`, `job_ready`, `job_handed_over`, `job_cancelled`, `job_overdue` and `job_settled`, and a test that fails if any job write has none
- **So that:** the owner can see who sent, moved, cancelled or settled each job and what changed, which the prototype does not record (epic section 13)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma sends MO-2026-119, when Sanjay Seth filters the audit log by entity MO-2026-119, then he sees `order_copy_sent` with actor Rajesh, the karigar, the targets and gold issued 162.4000 g.
  2. Given Lakshmi Devi accepts, starts and marks the job ready, when the log is read, then three entries show actor Lakshmi, before and after status and the confirmed date.
  3. Given the overdue job marks the job late and the parcel release settles it, when the log is read, then `job_overdue` shows actor System and `job_settled` shows the settlement figures in integer units.
  4. Given any job write rolls back, when the transaction ends, then no audit entry for it exists.
  5. Given the test suite runs, when each job operation in the contract is exercised, then each one writes exactly one audit entry with its action name, and the test fails if one writes none.
- **Rules enforced on the server:** Audit entries are written through EP-06-S2 in the same transaction as the change, with before and after values (EP-06-S3) and weights as integer units (EP-06-S5). System actions name the System actor (EP-06-S6). Audit entries cannot be updated or deleted (EP-06-S1). Reads stay Owner only (EP-06-S12).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (order copy or job id), action, before, after, reason (cancel only), for each action listed above.
- **Data changes:** None in the product database beyond `audit_entries` rows. Adds the eight action names to the shared audit kind list under the job kind group (EP-06-S10) and the coverage test to the `api` test suite.
- **UI reference:** No screen of its own. Entries show in the owner's audit log from EP-06-S9 to EP-06-S11.
- **Non-functional checks:** Audit: create, cancel and settlement audited as the epic requires, plus every transition (EP-06-S7). Precision: weights in entries as integers. Personal data: entries carry no customer data, because jobs have none.
- **Depends on:** EP-19-S2, EP-19-S6, EP-19-S9, EP-19-S11, EP-19-S12, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S5, EP-06-S6, EP-06-S7, EP-06-S9, EP-06-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Q5b: is the intake check only reconciliation A, with wastage handled against the job here? (EP-19-S12)
- G23: when is settlement computed, who sees the flag, and is loss booked against the karigar ledger? (EP-19-S12)
- G3: what does "Order another from Vijay" copy from the sold piece? (EP-19-S13)
- Which channel carries the overdue reminder, and how often (compare A3)? (EP-19-S9)
- G14: can one hand-over carry several jobs? (EP-19-S5, S6, S12)
- Can an order copy be edited after send, and can a job be cancelled after accepted? (EP-19-S11)
- G4: which job figures feed the karigar scorecard? (EP-19-S12)
- D7 is decided: one shop, no branches; jobs belong to the shop (EP-19-S1, S8, S10).
