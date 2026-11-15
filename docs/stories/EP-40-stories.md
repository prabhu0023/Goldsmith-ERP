# EP-40: Automated testing · stories

Epic document: [EP-40 Automated testing](../epics/EP-40-automated-testing.md)

Role note: this is a layer E testing epic with no end user. Stories use "Developer" for the person writing and running the tests, and "System" for the CI service acting on its own. "Rules enforced on the server" here means rules enforced by the CI pipeline, the test environment configuration and the product API under test, because the epic's own operations (Create and Delete Test database, Create Test session) exist only in test environments. Fixtures follow the seed from EP-02-S13: scales Bench balance (readability 0.0001 g, capacity 600 g) and Platform scale (0.01 g, 30 kg); parcels BATCH-2026-041 to 046 as seeded; karigars KG-01 Lakshmi Devi, KG-02 Mahesh Soni and KG-04 Vijay Kumar; staff ST-01 Rajesh Verma and ST-02 Deepak Rao; owner Sanjay Seth. All fixture weights are integers in units of 0.0001 g, and all fixture customers are made up.

---

## EP-40-S1: Developer can run unit tests for the shared package in one command

- **Story ID:** EP-40-S1
- **Title:** Developer can run unit tests for the shared package in one command
- **As a:** Developer
- **I want:** the test runner from EP-01-S8 set up in the shared package and the server service layer, with one command that runs every unit test in one run and exits non-zero on any failure
- **So that:** every domain rule and service function has a single, fast check that CI and developers both use (FR-40-1, BR-40-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the repository root, when a developer runs the unit test command, then every test file under the shared package (the port of `src/domain/**`) and the `api` service layer runs in one process and the summary lists passed, failed and skipped counts.
  2. Given one unit test that fails, when the command finishes, then it exits with a non-zero code and names the failing file and test.
  3. Given all unit tests pass, when the command finishes, then it exits with code 0.
  4. Given a test file marked as focused (only this test) is committed, when the command runs in CI, then the run fails, so a focused test cannot silently skip the rest.
  5. Given a CI run, when the unit step finishes, then a test run record with commit, suite `unit`, passed, failed and duration is kept with the run.
- **Rules enforced on the server:** CI runs the command on its own machines; a local pass does not count (EP-01-S8). Focused and skipped-by-default tests are refused in CI. Unit tests touch no database and no network.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Test results are kept by the CI service as the test run record (epic section 9).
- **Data changes:** None in the product database. Adds the unit test configuration to the shared package and `api`, and the test run record to CI output.
- **UI reference:** No screen
- **Non-functional checks:** Performance: the unit suite finishes inside the time limit the team agrees, so it runs on every push (epic section 13). Open question: which test tooling is used for the web app and the karigar PWA.
- **Depends on:** EP-01-S2, EP-01-S3, EP-01-S8, EP-03-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S2: Developer can run weight and ceiling unit tests on integer units

- **Story ID:** EP-40-S2
- **Title:** Developer can run weight and ceiling unit tests on integer units
- **As a:** Developer
- **I want:** unit tests for the shared weight helpers (gram text to integer units and back, net, sum) and for the ceiling function, all asserting integer equality
- **So that:** a change to the unit or the rounding cannot alter a stored weight or the match ceiling without a test failing (FR-40-3, BR-40-4, BR-40-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the text "41.5900", when it is converted to units, then the result is exactly 415900, and converting 415900 back gives "41.5900" with 4 decimals.
  2. Given gross 485.5000 g and stones 38.2000 g, when net is computed, then it equals exactly 4473000 units (447.3000 g), checked with integer equality and never with a float tolerance.
  3. Given one parcel weighing and 12 tag weighings, all on the Bench balance, when the ceiling is computed, then it equals 13 half-steps of 0.0001 g, which is 0.00065 g (epic acceptance criterion 1).
  4. Given one weighing on the Platform scale and 300 on the Bench balance, when the ceiling is computed, then it equals 0.0200 g, which is 200 units (FR-40-3, mockup 14).
  5. Given text with 5 decimals such as "1.23456", or a negative weight where the field does not allow it, when it is converted, then the helper refuses it rather than rounding.
  6. Given every weight in the seed fixture, when each is converted to units and back, then each round trip returns the original text.
- **Rules enforced on the server:** The tests call the same shared functions the server uses for the gate (EP-02-S2, EP-14-S10, EP-23-S1). No float comparison helper is allowed in weight tests. Expected values are written as integers or exact gram text.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Pure unit tests with no state change.
- **Data changes:** None in the product database. Adds unit test files for the weight helpers and the ceiling function.
- **UI reference:** No screen. Expected figures come from `docs/ux/mockups/14-match-rule-any-parcel.svg`.
- **Non-functional checks:** Precision: integer equality only (epic section 13); the half-step case is the G10 check. Open decision G10: 0.00065 g is 6.5 units of 0.0001 g, so the expected value is written in the unit G10 settles (for example 13 half-units); the test is finalised after G10 is answered (epic section 16 risk).
- **Depends on:** EP-40-S1, EP-02-S2, EP-14-S10, EP-23-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S3: Developer can run the rewritten match and gate tests (G11)

- **Story ID:** EP-40-S3
- **Title:** Developer can run the rewritten match and gate tests (G11)
- **As a:** Developer
- **I want:** the deleted prototype match assertions rewritten as unit tests on the shared `evaluateParcel` and as service tests on the release and clear rules, using the cases recorded in `.agents/tasks/jgd-redesign/review.md`
- **So that:** the exact-match gate keeps refusing gold that does not add up, as it did in the prototype (FR-40-2, FR-40-3, FR-40-4, BR-40-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the BATCH-2026-044 fixture, when it is evaluated, then the verdict is `mismatch` with a net gap of −0.1380 g (−1380 units) and a ceiling of 0.00065 g (epic acceptance criterion 1).
  2. Given the BATCH-2026-046 fixture, when it is evaluated as seeded, then the verdict is `exact`; with a 0.0001 g or 0.0002 g bump on one tag it is `last_digit` against a 5-weighing ceiling of 0.00025 g; with a 0.0003 g bump it is `mismatch` (epic acceptance criterion 2).
  3. Given a parcel where saving a tag opens a gap above the ceiling, when the save runs, then the parcel is stopped, and a staff session can neither release it nor re-tag the item.
  4. Given a mismatched parcel, when Rajesh Verma (Staff) or Lakshmi Devi (Karigar) calls clear, send-back, re-check or accept-loss, then each is refused with its `DomainError` sentence, and the same call by Sanjay Seth succeeds.
  5. Given a parcel with an open problem, when Sanjay Seth tries to release it, then it is refused even for the owner.
  6. Given the rewritten list, when it is compared with the cases in section 6 of the epic, then each case has a named test, and the list is reviewed with the owner.
- **Rules enforced on the server:** Tests run against the same shared functions and service layer the API uses; no copy of the rule lives in the test. Each `requireOwner` guard in `src/store/transitions.ts` on match and clear has a refusal test for Staff and for Karigar (FR-40-4).
- **Live events emitted / consumed:** None in unit tests. Event publication is tested in EP-40-S9.
- **Audit entry written:** No. The tests assert that the `parcel_last_digit` entry and the clearance entries are written by the services under test (EP-23-S5, EP-23-S11), but write nothing of their own.
- **Data changes:** None in the product database. Adds unit and service test files and the BATCH-2026-044 and 046 fixtures in integer units.
- **UI reference:** No screen. Reference figures from `docs/ux/mockups/04-parcel-match.svg`, `14-match-rule-any-parcel.svg` and `22-owner-clear-mismatch.svg` ("485.5000 · 485.3620 · 138").
- **Non-functional checks:** Precision: verdicts compared on integer units. Open decision G11: whether 88 or 72 prototype assertions is the authoritative list; this story covers the recorded match cases either way. Open decision Q5d: the expected outcome for the last-digit middle case; criterion 2 follows the prototype (released and logged). Open decision G10: the ceiling unit.
- **Depends on:** EP-40-S1, EP-40-S2, EP-23-S2, EP-23-S4, EP-23-S5, EP-23-S6, EP-23-S7, EP-23-S9, EP-23-S10, EP-23-S11, EP-21-S13, EP-24-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S4: Developer can run the rewritten edit, scrap, stop and stock-out rule tests (G11)

- **Story ID:** EP-40-S4
- **Title:** Developer can run the rewritten edit, scrap, stop and stock-out rule tests (G11)
- **As a:** Developer
- **I want:** the remaining recorded prototype assertions rewritten as unit and service tests: problems and stops, edit tokens, scrap, stock-out, owner-only onboarding and scale changes
- **So that:** every owner signature and every stop rule from the prototype is checked again by machine (FR-40-2, FR-40-4, BR-40-6, BR-40-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a stopped piece, when a stock-out is tried, then it is refused; given a stopped job, when it is advanced, then it is refused (EP-24-S2).
  2. Given an edit token, when it is generated, then it has six digits; given a wrong, an expired (older than 10 minutes) or an already used token, when apply edit is called, then each is refused and the piece is unchanged.
  3. Given TAG-8841 with an open edit proposal, when it is sold, then the proposal is voided; given a billed piece, when an edit is proposed or applied, then it is refused.
  4. Given a scrap request on TAG-7701 Temple Haram (78.4000 g), when it is created, then the piece is at `with_owner`; when Sanjay Seth marks it scrapped, then the pool moves from 812.5800 g to 890.9800 g, compared as 8125800 to 8909800 units.
  5. Given Rajesh Verma (Staff) and Lakshmi Devi (Karigar), when each calls clear problem, agree edit, apply edit, refuse edit, scrap, decline scrap, onboard staff, onboard karigar or change a scale, then each call is refused, and Rajesh's call to send-back, accept-loss, apply edit or scrap gives the server's refusal (epic acceptance criterion 4).
  6. Given Rajesh Verma or Lakshmi Devi, when either raises a problem on a parcel they may see, then it is accepted and the target is stopped.
- **Rules enforced on the server:** Tests exercise the service layer that the API calls, so the refusals tested are the server's. Every `requireOwner` transition in `src/store/transitions.ts` has a Staff and a Karigar refusal test (FR-40-4). Token tests use the hashed store from EP-25-S6 and a fixed test clock (EP-03-S3).
- **Live events emitted / consumed:** None in these tests. Event publication is tested in EP-40-S9.
- **Audit entry written:** No. The tests assert that the services write their own entries; they write none.
- **Data changes:** None in the product database. Adds unit and service test files and fixtures for TAG-8841, TAG-7701 and the pool opening balance 812.5800 g.
- **UI reference:** No screen. Reference figures from `docs/ux/mockups/05-edit-propose-apply.svg` and `06-stock-out.svg`.
- **Non-functional checks:** Precision: pool and piece weights compared as integers. Time: token expiry tested with a fixed clock at 9 minutes 59 seconds (accepted) and 10 minutes 1 second (refused). Security: token values in test output are not printed. Open decision G11: the authoritative assertion list.
- **Depends on:** EP-40-S1, EP-40-S2, EP-24-S2, EP-24-S3, EP-24-S9, EP-25-S6, EP-25-S7, EP-25-S8, EP-25-S10, EP-25-S11, EP-26-S2, EP-26-S10, EP-27-S2, EP-27-S4, EP-27-S6, EP-27-S7, EP-14-S4, EP-05-S2, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S5: Developer can run API tests against a fresh seeded database

- **Story ID:** EP-40-S5
- **Title:** Developer can run API tests against a fresh seeded database
- **As a:** Developer
- **I want:** an API test suite that creates a fresh test database, runs every migration, loads the fixture seed, signs fixture users in through a test-only session operation, calls each API operation and drops the database afterwards
- **So that:** each operation is checked for success, a validation failure, each rule refusal and the refused roles, through the real API and database (FR-40-5, BR-40-1, BR-40-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a CI run, when the API suite starts, then Create Test database makes a new database, applies all migrations from EP-02-S1 and loads the fixture seed, and Delete Test database drops it when the suite ends, pass or fail.
  2. Given the stock-out operation, when the suite runs, then it has a success test, a validation test (missing invoice number refused with the standard validation error), a rule test ("TAG-8841 is already taken." on a sold piece) and a permission test (Lakshmi Devi refused).
  3. Given each operation in the shared contract (EP-03-S1), when the suite's coverage report runs, then any operation without a success, validation, rule and permission test is listed and the run fails (epic acceptance criterion 6).
  4. Given a production configuration, when the API starts, then Create Test session is not registered and a call to it returns not found; a configuration test fails the deploy if it is enabled (epic section 16 risk).
  5. Given a rule refusal, when the response is read, then it has the code and the `DomainError` sentence in the format of EP-03-S4.
- **Rules enforced on the server:** Create and Delete Test database are CI only and refuse any connection string that names the production database. Create Test session exists only when the environment is `test`, and is refused in staging and production. The suite uses the real API, contract validation and transactions (EP-03-S2, EP-03-S6).
- **Live events emitted / consumed:** None asserted here. Live-event tests are EP-40-S9.
- **Audit entry written:** No by the suite. Audit writes by the operations under test go to the throwaway database and are asserted for each state change.
- **Data changes:** None in the product database. Creates and drops a throwaway test database per run. Adds the Create Test database, Delete Test database and Create Test session operations to test configuration only.
- **UI reference:** No screen
- **Non-functional checks:** Security: the test sign-in path exists only in test environments and is checked to be absent in production (epic section 13). Personal data: fixtures hold made-up customers only; no production data is copied. Performance: the API suite stays within the agreed per-push time. Open decision D1: on a managed platform, how server-side policies run locally for these tests.
- **Depends on:** EP-40-S1, EP-02-S1, EP-02-S13, EP-03-S1, EP-03-S2, EP-03-S4, EP-03-S5, EP-03-S6, EP-04-S5, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S6: Developer can run permission tests generated from the permission matrix

- **Story ID:** EP-40-S6
- **Title:** Developer can run permission tests generated from the permission matrix
- **As a:** Developer
- **I want:** a permission test suite generated from the permission list in the shared package (EP-05-S1), which calls every operation as Owner, Staff and Karigar and checks the result against the matrix, plus a test that an operation missing from the matrix is denied
- **So that:** a new operation or a changed role cannot open a gap that nobody noticed (FR-40-4, FR-40-6, BR-40-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the permission list, when the suite runs, then for every operation and each of the three roles there is one test, and it passes only if an allowed role is not refused for permission and a disallowed role gets the permission refusal.
  2. Given a test-only operation registered in the API but absent from the matrix, when Sanjay Seth (Owner) calls it, then it is denied by default (FR-40-6).
  3. Given Rajesh Verma (Staff), when he calls send-back, accept-loss, apply edit or mark scrapped, then each is refused (epic acceptance criterion 4).
  4. Given Lakshmi Devi (Karigar), when she reads a job of KG-02 Mahesh Soni, then it is refused or returns nothing, and her own KG-01 job is returned (EP-05-S3).
  5. Given a deactivated user's session, when it calls any operation, then it is refused.
  6. Given an operation added to the contract without a matrix row, when the suite runs, then it fails and names the operation.
- **Rules enforced on the server:** The matrix in the shared package is the single source for both the server check (EP-05-S2) and the generated tests. Deny by default for any operation not listed. Karigar reads are scoped to their own jobs (EP-05-S3, EP-20-S1).
- **Live events emitted / consumed:** None
- **Audit entry written:** No by the suite. Refused calls change no state.
- **Data changes:** None in the product database. Adds the generated permission test file, run against the throwaway database from EP-40-S5.
- **UI reference:** No screen. Reference: `docs/ux/mockups/11-roles-and-permissions.svg` ("Release a parcel whose weights disagree" and "Apply their own edit, or scrap a piece" under Staff CANNOT).
- **Non-functional checks:** Security: every permission is checked on the server (BR-40-9); the suite also covers owner-only settings (EP-39-S11). Performance: the generated tests share one database and one session per role to stay within the per-push time.
- **Depends on:** EP-40-S5, EP-05-S1, EP-05-S2, EP-05-S3, EP-05-S7, EP-20-S1, EP-39-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S7: Developer can run concurrency tests for double-sell and double-routing

- **Story ID:** EP-40-S7
- **Title:** Developer can run concurrency tests for double-sell and double-routing
- **As a:** Developer
- **I want:** concurrency tests against the real database engine that send two or more stock-outs of one piece, two lead-line routings of one line, and two owner clearances of one parcel at the same moment from different sessions
- **So that:** two staff can never sell the same piece or route the same line, and a parcel is cleared once (FR-40-7, FR-40-8, BR-40-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma and Deepak Rao each signed in, when both stock out TAG-8841 at the same moment, then exactly one succeeds and the other gets "TAG-8841 is already taken." (epic acceptance criterion 3).
  2. Given 20 parallel stock-outs of TAG-8841 from different sessions, when they finish, then 1 succeeded, 19 got the "already taken" refusal, and one stock-out record exists.
  3. Given one lead line, when two staff route it at the same moment (one to stock, one to make), then exactly one succeeds and the other gets "That line has already been routed.", and no order copy is created for the refused one.
  4. Given BATCH-2026-044 stopped on a mismatch, when two owner sessions send accept-loss at the same moment, then one commits and the other is refused as a conflict, and one audit entry exists.
  5. Given the test is run 50 times in a row in CI, when the results are read, then every run gives the same outcome, so the test is not flaky.
- **Rules enforced on the server:** Tests run against the real database engine with real transactions, never a mock (epic section 13). Calls are released together from a barrier so they overlap. The locking under test is the server's (EP-26-S2, EP-22-S6, EP-30-S4, EP-30-S5, EP-02-S14).
- **Live events emitted / consumed:** None asserted here. "Piece billed by one staff member" delivery is asserted in EP-40-S9.
- **Audit entry written:** No by the suite. The test asserts exactly one stock-out audit entry and one clearance entry.
- **Data changes:** None in the product database. Uses the throwaway database from EP-40-S5.
- **UI reference:** No screen. Reference: `docs/ux/mockups/06-stock-out.svg`, route `stock-out`.
- **Non-functional checks:** Concurrency: real engine, real transactions, repeated runs (epic section 13, section 16 risk). Precision: the pure gold leaving, 41.5900 g, is counted once in the day's total.
- **Depends on:** EP-40-S5, EP-22-S6, EP-26-S2, EP-26-S3, EP-30-S4, EP-30-S5, EP-23-S11, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S8: Developer can run a concurrency test for two staff tagging one parcel

- **Story ID:** EP-40-S8
- **Title:** Developer can run a concurrency test for two staff tagging one parcel
- **As a:** Developer
- **I want:** a concurrency test where two staff sessions save the same tag on a shared parcel at the same moment, and another where a tag save races a release
- **So that:** a shared parcel never gets a duplicate piece and a late tag save cannot slip past the match gate (FR-40-9, BR-40-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given a parcel shared by Rajesh Verma and Deepak Rao, when both save item 7 at the same moment, then one piece exists for item 7, and the second save is refused as a conflict or treated as the same save, never a second piece.
  2. Given both staff save different items at the same moment, when the saves finish, then both pieces exist and the tagged count goes up by 2.
  3. Given a parcel at an exact match, when a release and a tag save that opens a gap arrive at the same moment, then either the release commits first and the save is refused because the parcel is released, or the save commits first and the release is refused on the new `mismatch` verdict (EP-23-S12).
  4. Given the same test run 50 times in CI, when the results are read, then no run creates a duplicate piece.
- **Rules enforced on the server:** Tagging rules and the parcel lock are the server's (EP-21-S5, EP-23-S12). Tests run on the real engine with real transactions.
- **Live events emitted / consumed:** None asserted here. "Tag saved on a shared parcel" is asserted in EP-40-S9.
- **Audit entry written:** No by the suite. The test asserts one tag audit entry per created piece.
- **Data changes:** None in the product database. Uses the throwaway database from EP-40-S5 with a shared parcel fixture.
- **UI reference:** No screen. Flow under test: route `parcel-tag`, `docs/ux/mockups/04-parcel-match.svg`.
- **Non-functional checks:** Concurrency: real engine and real transactions (epic section 13). Precision: the tagged total equals the sum of saved pieces in integer units.
- **Depends on:** EP-40-S5, EP-40-S7, EP-21-S5, EP-21-S6, EP-23-S12, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S9: Developer can run live-event delivery and audience tests

- **Story ID:** EP-40-S9
- **Title:** Developer can run live-event delivery and audience tests
- **As a:** Developer
- **I want:** tests that open live connections as Owner, Staff and Karigar, trigger each catalogue event's operation, and check the event arrives only after the commit and only to the allowed audience
- **So that:** every screen that relies on a live update gets it, and nobody sees an event they may not see (FR-40-10, BR-40-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the 10 catalogue events ("Piece billed by one staff member", "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Edit applied", "Lead arrived / passed its SLA", "Karigar job status changed", "Parcel handed over by karigar", "Tag saved on a shared parcel", "Metal pool changed", "User deactivated or role changed"), when the suite runs, then each has a test that triggers it and checks its receivers.
  2. Given an operation that fails and rolls back, when the test listens, then no event is received for it (EP-07-S1).
  3. Given Lakshmi Devi (KG-01) and Mahesh Soni (KG-02) connected, when Mahesh's job status changes, then Mahesh receives "Karigar job status changed" and Lakshmi receives nothing.
  4. Given a staff connection, when an edit token is sent to the owner, then the staff connection receives no token value and the owner's event holds none either.
  5. Given a connection that drops and reconnects with its last sequence number, when events were published in between, then it receives them in order with no gap (EP-07-S7).
  6. Given an event on staging, when the end-to-end run measures it, then it reaches the other browser within about 1 second.
- **Rules enforced on the server:** Events are published only after commit (EP-07-S1) and filtered by the receiver's permissions (EP-07-S5, EP-07-S6). Proposed events in gap G26 get tests only once accepted into the catalogue.
- **Live events emitted / consumed:** consumed: all 10 catalogue events, in tests only. emitted: none in production.
- **Audit entry written:** No by the suite.
- **Data changes:** None in the product database. Uses the throwaway database from EP-40-S5 and a test live connection client.
- **UI reference:** No screen
- **Non-functional checks:** Performance: live events within about 1 second (PRODUCTION-SCOPE §5), measured on staging (EP-37-S7). Security: karigar receives only events for their own jobs. Open question G26: which proposed events get tests.
- **Depends on:** EP-40-S5, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S6, EP-07-S7, EP-07-S11, EP-07-S12, EP-37-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S10: Developer can run a test that no currency shows while pricing is off

- **Story ID:** EP-40-S10
- **Title:** Developer can run a test that no currency shows while pricing is off
- **As a:** Developer
- **I want:** a rendering test that opens every route with each fixture identity and sample parameters, with the pricing flag off, and fails if any rendered screen contains a currency sign or rupee figure
- **So that:** no rupee figure reaches a screen before pricing exists, as the prototype checked across 2,430 combinations (FR-40-12, BR-40-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the pricing flag off, when every route is rendered for Owner, Staff and Karigar with the sample parameters, then no rendered text contains "₹", "Rs", "INR" or a figure formatted as rupees, and the test lists the combinations checked.
  2. Given a developer adds a raw rupee figure outside `ValueSlot` on route `stock-out`, when the test runs, then it fails and names the route and the identity.
  3. Given `docs/ux/mockups/06-stock-out.svg` shows "total value fills here later", when `stock-out` renders with pricing off, then the value slot is empty or shows that placeholder text.
  4. Given a new route is added, when the test runs, then it is included without editing the test, because routes are read from the route list.
- **Rules enforced on the server:** The pricing flag is owner-only on the server (EP-13-S9). The rendering test uses the flag as the server returns it, not a client toggle.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Rendering tests change no state.
- **Data changes:** None in the product database. Adds the rendering test and the sample-parameter list per route.
- **UI reference:** All routes. Reference: `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("No prices here").
- **Non-functional checks:** Performance: run on deploy if too slow for every push. Pricing on is not tested here; price logic tests wait for EP-42 (epic section 5). Open question: which test tooling is used for the web app and the karigar PWA.
- **Depends on:** EP-40-S1, EP-08-S13, EP-08-S19, EP-13-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S11: Developer can run a test that OTPs and tokens never reach logs or audit

- **Story ID:** EP-40-S11
- **Title:** Developer can run a test that OTPs and tokens never reach logs or audit
- **As a:** Developer
- **I want:** a security test that runs sign-in by OTP, a wrong OTP, an edit token request and an edit apply, captures the issued codes from the test delivery stub, and searches audit entries, application logs, error reports and stored messages for them
- **So that:** no log line or audit entry ever holds a usable code (FR-40-13, BR-40-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signs in by OTP and enters one wrong code first, when the audit log and captured log lines are searched for both six-digit values, then neither is found.
  2. Given Sanjay Seth agrees to proposal ED-102 and applies it with the token, when the audit entries for the flow are read, then they hold a token reference and not the six digits.
  3. Given an apply edit call that fails validation with the token in the request body, when the error report and log line are read, then the token is redacted (EP-37-S2).
  4. Given the stored WhatsApp message for the token, when it is read from the message store, then it holds no code (EP-12-S11).
  5. Given a developer adds a log line that prints the OTP, when the test runs, then it fails and names the flow.
- **Rules enforced on the server:** OTPs and tokens are stored hashed (EP-04-S2, EP-25-S6). Audit entries carry a token reference only (EP-06-S4). Log redaction is on in every environment (EP-37-S2). The test reads codes only from the test delivery stub (EP-04-S4).
- **Live events emitted / consumed:** None asserted here.
- **Audit entry written:** No by the suite. The test asserts that the flow's entries hold actor, time, entity, action and token reference only.
- **Data changes:** None in the product database. Uses the throwaway database from EP-40-S5 and captures log output for the run.
- **UI reference:** No screen. Flow under test: route `edit-apply`, `docs/ux/mockups/05-edit-propose-apply.svg`.
- **Non-functional checks:** Security: OTP and token never logged in plain text (BR-40-7, PRODUCTION-SCOPE §5). Cross-reference: EP-39-S10 adds the audit write check; this story is the full-flow test across logs, errors and messages. Open decision D4: the sign-in method; the test covers whichever OTP path is built.
- **Depends on:** EP-40-S5, EP-04-S2, EP-04-S4, EP-04-S14, EP-06-S4, EP-25-S6, EP-25-S14, EP-37-S2, EP-37-S3, EP-12-S11, EP-39-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S12: Developer can run end-to-end tests of the main flows on staging

- **Story ID:** EP-40-S12
- **Title:** Developer can run end-to-end tests of the main flows on staging
- **As a:** Developer
- **I want:** end-to-end tests that drive the web app and the karigar portal in real browsers on staging through each main flow in FR-40-11
- **So that:** the whole chain from lead to stock-out works together after every deploy, not only each part alone (FR-40-11, BR-40-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given staging, when the suite runs, then it covers: sign in by OTP; issue gold and create a job on `order-copy`; karigar accepts and hands over on `k-jobs`; parcel arrives on `parcel-arrival`, is tagged by two staff on `parcel-tag`, passes `parcel-qc` and matches exactly on `parcel-match`; a mismatched parcel is cleared by the owner on `parcel-clear`; stop the line and clear on `decisions`; edit with token on `edit-propose` and `edit-apply`; stock-out on `stock-out`; scrap to pool on `scrap-decision`; lead to conversion on `lead-create` and `lead-convert` (epic acceptance criterion 6).
  2. Given the tagging flow, when Rajesh Verma saves a tag in one browser, then Deepak Rao's open `parcel-tag` in a second browser shows it within about 1 second.
  3. Given the scrap flow on TAG-7701 (78.4000 g), when Sanjay Seth marks it scrapped, then the pool shown goes up by 78.4000 g.
  4. Given each key screen (`today`, `decisions`, `stock`, `parcels`, `leads`), when it is opened, then it loads in under 2 seconds.
  5. Given a flow fails, when the run ends, then the result names the flow and step and keeps a screenshot, and staging data is reset for the next run.
- **Rules enforced on the server:** End-to-end tests use real sign-in on staging with the OTP read from the delivery stub (EP-04-S4); the test session path is not used on staging. Staging data is a fixture seed with made-up customers, never production data.
- **Live events emitted / consumed:** consumed: "Tag saved on a shared parcel", "Karigar job status changed", "Parcel handed over by karigar", "Parcel stopped (mismatch or raised problem)", "Edit applied", "Piece billed by one staff member" and "Metal pool changed", observed in the browsers under test.
- **Audit entry written:** No by the suite. Flows write their normal entries in staging.
- **Data changes:** None in the product database. Resets the staging database to the fixture seed before each run (EP-02-S13).
- **UI reference:** Routes `today`, `decisions`, `leads`, `lead-create`, `lead-convert`, `order-copy`, `k-jobs`, `parcels`, `parcel-arrival`, `parcel-tag`, `parcel-qc`, `parcel-match`, `parcel-clear`, `stock`, `edit-propose`, `edit-apply`, `stock-out`, `scrap-decision`. Acceptance references: `04-parcel-match.svg`, `05-edit-propose-apply.svg`, `06-stock-out.svg`, `22-owner-clear-mismatch.svg`.
- **Non-functional checks:** Performance: screen load under 2 seconds and live events within about 1 second (epic section 13). Personal data: made-up customers only. Availability: tests limited to the main flows to stay stable (epic section 16 risk). Open question: which flows are required before launch and which can follow. Open question: which tooling drives the web app and the karigar PWA. Open decision D4: the sign-in method the first flow uses.
- **Depends on:** EP-40-S5, EP-01-S12, EP-02-S13, EP-04-S4, EP-04-S5, EP-08-S9, EP-19-S2, EP-20-S4, EP-20-S6, EP-21-S2, EP-21-S6, EP-21-S8, EP-23-S4, EP-23-S11, EP-24-S3, EP-24-S9, EP-25-S2, EP-25-S7, EP-26-S7, EP-27-S6, EP-28-S2, EP-30-S6, EP-37-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-40-S13: System can block a merge or deploy when any test fails

- **Story ID:** EP-40-S13
- **Title:** System can block a merge or deploy when any test fails
- **As a:** System
- **I want:** CI to run the unit, API, permission, concurrency, live-event, rendering and security suites on every push, the end-to-end suite before every staging promotion to production, and to block the merge or deploy on any failure
- **So that:** a change that breaks a gold rule cannot reach main or the shop (FR-40-14, BR-40-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a pull request with one failing unit or API test, when CI runs, then the run is red and the merge into main is blocked, naming the failing suite (epic acceptance criterion 5).
  2. Given every per-push suite passes, when the run ends, then the merge is allowed by the branch protection of EP-01-S11.
  3. Given a green main build deployed to staging, when the end-to-end suite fails, then promotion to production is blocked and production keeps its current build.
  4. Given a deploy configuration with Create Test session enabled for staging or production, when the deploy runs, then the configuration test fails it.
  5. Given a CI run, when its result is read, then each suite's test run record (commit, suite, passed, failed, duration) is shown.
- **Rules enforced on the server:** The git host and CI enforce the block; it cannot be skipped by the developer (EP-01-S11). Each suite is a required status check by name. A skipped required suite counts as failed.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Merge and deploy history is kept by the git host and CI service.
- **Data changes:** None in the product database. Adds the suites as required checks in the CI pipeline and branch protection.
- **UI reference:** No screen
- **Non-functional checks:** Performance: per-push suites within the agreed CI time; end-to-end on deploy only (epic section 16 risk). Security: the test sign-in path is checked absent from production configuration. Open question G24: whether "EP-03 onwards" includes EP-41 to EP-43; the required suites cover EP-03 to EP-39 until it is answered.
- **Depends on:** EP-40-S1, EP-40-S5, EP-40-S6, EP-40-S7, EP-40-S8, EP-40-S9, EP-40-S10, EP-40-S11, EP-40-S12, EP-01-S8, EP-01-S11, EP-01-S12, EP-01-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- G11: which list of assertions is authoritative now that `scripts/verify-domain.ts` is gone (PRODUCTION-SCOPE says 88, review.md says 72)? (EP-40-S3, S4)
- G10: is the integer unit 0.0001 g, or a finer unit so the ceiling half-steps are whole numbers? (EP-40-S2, S3)
- G24: does "EP-03 onwards" include EP-41 to EP-43? (EP-40-S13)
- D1: on a managed platform, how are server-side policies tested locally? (EP-40-S5)
- Which end-to-end flows are required before launch, and which can follow? (EP-40-S12)
- Q5d: what is the expected outcome for the last-digit middle case, so it can be tested? (EP-40-S3)
- What test tooling is used for the web app and the karigar PWA? (EP-40-S1, S10, S12)
