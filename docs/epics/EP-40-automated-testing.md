# EP-40: Automated testing

## 1. Summary

The rules that protect the shop's gold are exact: a parcel matches only within the scale-derived ceiling, a stopped
piece cannot be sold, only the owner can clear a mismatch, an edit needs a fresh 6-digit token, and two staff must
never sell the same piece. These rules must be tested by machine on every change, because a single regression can
release gold that is missing. This epic sets up the test runner, rewrites the prototype's domain assertions as unit
tests (the original script was deleted), adds API tests for every operation and its permission, concurrency tests
for double-selling, end-to-end tests of the main flows, and makes CI refuse a change when any test
fails. It runs continuously alongside every epic from EP-03 onwards.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: Not built. The repo has no test runner (`package.json` scripts are dev, build, preview, clean and lint), and the 72 to 88 scripted domain assertions used during the prototype build lived in `scripts/verify-domain.ts`, which was deleted (gap G11).

## 3. Roles involved

- Owner: not involved directly; accepts the list of flows the end-to-end tests must cover.
- Staff: not involved directly; their main flows are the end-to-end scenarios.
- Karigar: not involved directly; the karigar portal flows are end-to-end scenarios.
- System: CI runs the suites on every push and blocks a merge on any failure.

## 4. In scope

- A unit test runner in the shared package that holds `src/domain/**` and the server service layer.
- Rewrite of the prototype domain assertions as unit tests, from `src/store/transitions.ts`, `src/domain/*.ts` and the cases recorded in `.agents/tasks/jgd-redesign/plan.md` and `review.md` (G11).
- Unit tests for the integer weight helpers and the ceiling, including the G10 half-step case.
- API tests for every operation: success, validation failure, rule refusal with its `DomainError` sentence, and permission refusal for each role that may not call it.
- Permission tests built from the permission matrix (EP-05): every operation not in the matrix is denied by default.
- Concurrency tests: two staff stock out the same piece, two staff save the same tag on a shared parcel, two owners clear the same parcel.
- Live-event tests: each catalogue event is published after its commit and reaches only the allowed audience.
- End-to-end tests of the main flows on staging.
- Rendering tests: with pricing off, no screen shows a currency symbol.
- Security tests: OTP and token never appear in logs or audit entries.
- A CI gate (EP-01) that fails on any test failure.

## 5. Out of scope

- CI setup and environments (EP-01).
- The rules themselves; each feature epic owns its rules and its stories add the tests for them (EP-03 to EP-39).
- Penetration testing (EP-39).
- Restore drills (EP-38).
- Load and uptime monitoring in production (EP-37).
- Tests for price logic, until pricing exists (EP-42).
- Tests for scoring and leaderboards, until they exist (EP-43).

## 6. Current state in the prototype

- `package.json` scripts: `dev`, `build`, `preview`, `clean`, `lint` (`tsc --noEmit`). No test runner and no test files.
- `scripts/verify-domain.ts` was deleted at the end of the prototype build (`.agents/tasks/jgd-redesign/features/FEAT-005.json` findings; `review.md` "Coverage note": "none of these checks will run again unless someone rewrites them") (G11).
- PRODUCTION-SCOPE says "port the 88 prototype assertions"; `review.md` pass 2 reports 72 assertions; neither set is in the repo.
- Recorded cases to rewrite (`.agents/tasks/jgd-redesign/review.md`):
  - BATCH-2026-044 is `mismatch` with a net gap of −0.1380 g against a 13-weighing ceiling of 0.00065 g.
  - BATCH-2026-046 is `exact`; a 0.0001 to 0.00025 g bump gives `last_digit` (5 weighings, ceiling 0.00025 g); 0.0003 g gives `mismatch`.
  - Platform scale plus 300 bench weighings gives a ceiling of 0.0200 g (mockup 14).
  - Saving a tag that opens a gap auto-stops the parcel; staff can neither release nor re-tag it.
  - Staff and karigar can raise a problem; `clearProblem`, send-back, re-check, accept-loss, agree, apply and refuse edit, scrap, decline scrap, onboard staff, onboard karigar and scale changes throw for non-owners.
  - A stopped piece cannot be stocked out; a stopped job cannot advance; a parcel with an open problem cannot be released even by the owner.
  - The edit token is six digits; wrong, expired and replayed tokens are rejected; selling a piece voids its open proposals; a billed piece cannot be edited.
  - A scrap request parks the piece at `with_owner`; scrapping TAG-7701 Temple Haram (78.4000 g) moves the pool from 812.5800 g to 890.9800 g.
  - 2,430 rendered route and parameter combinations for six identities, pricing off and on; none contains a currency sign with pricing off.
- `src/domain/weights.ts` (`UNITS_PER_G = 100000`, `toU`, `netOf`, `sumG`), `src/domain/match.ts` (`computeCeiling`, `evaluateParcel`), `src/domain/edits.ts` (`checkToken`), `src/domain/leads.ts` (`slaState`, `isFullyRouted`) are pure functions ready for unit tests.
- Reusable: the pure domain functions, the seed in `src/data/seed.ts` as test fixtures, the recorded cases above.
- Must be rebuilt server-side: every test. API, permission, concurrency and live-event tests have no prototype analogue.

## 7. Functional requirements

- FR-40-1. A unit test command runs all shared-package tests in one run and exits non-zero on any failure.
- FR-40-2. The rewritten domain tests cover every case listed in section 6.
- FR-40-3. The match tests compare integer units and include the 0.00065 g ceiling for 13 bench weighings and the 0.0200 g ceiling for one platform plus 300 bench weighings.
- FR-40-4. Each transition guarded by `requireOwner` in the prototype has a test that a staff member and a karigar are refused on the server.
- FR-40-5. Each API operation has a test for success, a validation failure, each rule refusal and each refused role.
- FR-40-6. A test proves that an operation missing from the permission matrix is denied.
- FR-40-7. A concurrency test sends two stock-outs for the same piece at the same moment; exactly one succeeds and the other gets "already taken".
- FR-40-8. A concurrency test sends two lead-line routings for the same line at once; exactly one succeeds and the other gets "That line has already been routed."
- FR-40-9. A concurrency test saves the same tag on a shared parcel from two sessions; no duplicate piece is created.
- FR-40-10. A live-event test checks that each catalogue event is published after its commit and that a karigar receives only events for their own jobs.
- FR-40-11. End-to-end tests cover: sign in by OTP; issue gold and create a job; karigar accepts and hands over; parcel arrives, is tagged by two staff and matches exactly; a mismatched parcel is cleared by the owner; stop the line and clear; edit with token; stock-out; scrap to pool; lead to conversion.
- FR-40-12. A rendering test checks that no screen shows a currency symbol while pricing is off.
- FR-40-13. A test checks that OTP and edit-token values never appear in logs or audit entries.
- FR-40-14. CI runs unit and API tests on every push and end-to-end tests before every staging deploy, and blocks the merge or deploy on failure.

## 8. Business rules

- BR-40-1. Unit tests for the domain rules, API tests, end-to-end tests of the main flows, concurrency tests for double-selling. [PRODUCTION-SCOPE §6 EP-40]
- BR-40-2. CI runs lint, typecheck, tests and build on every push. [PRODUCTION-SCOPE §6 EP-01]
- BR-40-3. Two staff selling the same piece must not both succeed; the second gets "already taken". [PRODUCTION-SCOPE §5 Concurrency]
- BR-40-4. The match gate compares integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]
- BR-40-5. Ceiling = sum of ½ × the scale's smallest step for every weighing taken. [SCOPE-ANALYSIS App. E; mockup 14]
- BR-40-6. A parcel must match exactly; anyone can stop the line, only the owner can start it again. [docs/ux/mockups/README.md]
- BR-40-7. OTP and edit tokens: 6 digits, single use, 10-minute expiry, never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-40-8. With pricing off, nothing shows a currency figure; every rupee goes through `ValueSlot`. [SCOPE-ANALYSIS App. G; src/components/ui/ValueSlot.tsx]
- BR-40-9. Every permission is checked on the server. [PRODUCTION-SCOPE §5 Security]

## 9. Data

- Test fixtures: a seed derived from `src/data/seed.ts` with scales Bench balance (readability 0.0001 g, capacity 600 g) and Platform scale (0.01 g, 30 kg), parcels BATCH-2026-041 to 046, karigars KG-01, KG-02, KG-04, staff ST-01 to ST-03; all weights integer, units of 0.0001 g.
- Test run record in CI: commit, suite, passed, failed, duration.
- No production data is created. Money sockets in fixtures are null (nullable value socket, unused until EP-42).

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Test database | Create and seed a fresh database for a test run | CI only, never production |
| Delete | Test database | Drop it after the run | CI only |
| Create | Test session | Sign in a fixture user without a real OTP, in test environments only | CI only, disabled in production |

## 11. Live events

- Emits and consumes none in production. The live-event tests assert that each catalogue event is published after its commit and reaches the right audience:
  - "Piece billed by one staff member"
  - "Parcel stopped (mismatch or raised problem)"
  - "Edit proposed / token sent"
  - "Edit applied"
  - "Lead arrived / passed its SLA"
  - "Karigar job status changed"
  - "Parcel handed over by karigar"
  - "Tag saved on a shared parcel"
  - "Metal pool changed"
  - "User deactivated or role changed"
- The proposed events in gap G26 get tests once they are accepted into the catalogue.

## 12. Screens and UX references

- No screen of its own.
- Screens the end-to-end tests drive: `today`, `decisions`, `leads`, `lead-create`, `lead-convert`, `order-copy`, `k-jobs`, `parcels`, `parcel-arrival`, `parcel-tag`, `parcel-qc`, `parcel-match`, `parcel-clear`, `stock`, `edit-propose`, `edit-apply`, `stock-out`, `scrap-decision`.
- Mockups used as acceptance reference: `04-parcel-match.svg`, `14-match-rule-any-parcel.svg`, `05-edit-propose-apply.svg`, `06-stock-out.svg`, `22-owner-clear-mismatch.svg`, `11-roles-and-permissions.svg`.

## 13. Non-functional requirements

- Precision: tests assert integer equality on weights, never float closeness.
- Concurrency: concurrency tests run against the real database engine with real transactions, not a mock.
- Security: the test sign-in path exists only in test environments and is checked to be absent in production configuration.
- Performance: unit and API tests stay fast enough to run on every push, within a time limit the team agrees; end-to-end tests may run on deploy. End-to-end tests also check the §5 targets on key screens: load under 2 seconds and live events within about 1 second.
- Personal data: fixtures use made-up customers only; no production data is copied into tests.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03 onwards, run continuously
- Upstream, expanded: EP-03 to EP-39 (read as the lower-numbered epics, per the bottom-up rule; whether EP-41 to EP-44 are included is gap G24).
- Downstream: EP-41.

## 15. Epic acceptance criteria

1. Given the rewritten domain tests, when BATCH-2026-044 is evaluated, then the verdict is mismatch with a net gap of −0.1380 g and a ceiling of 0.00065 g.
2. Given BATCH-2026-046 with a 0.0003 g bump, when it is evaluated, then the verdict is mismatch; with a 0.0002 g bump it is last digit.
3. Given two staff sessions, when both stock out TAG-8841 at the same moment, then exactly one succeeds and the other is told it is already taken.
4. Given a staff session, when it calls send-back, accept-loss, apply edit or scrap, then the server refuses each.
5. Given a pull request with a failing test, when CI runs, then the merge is blocked.
6. Done when every operation in the permission matrix has an API test and every main flow in FR-40-11 has an end-to-end test on staging.

## 16. Risks

- Risk: the deleted assertions are rewritten from memory and miss cases. Mitigation: derive tests from each transition in `src/store/transitions.ts` and the recorded cases in `review.md`, and review the list with the owner.
- Risk: concurrency tests pass on a mock and fail on the real database. Mitigation: run them against the real engine in CI.
- Risk: end-to-end tests are slow and flaky, so people skip them. Mitigation: keep them to the main flows and run them on deploy, not on every push.
- Risk: the G10 unit decision changes expected values. Mitigation: settle G10 before writing the ceiling tests.
- Risk: the test sign-in path leaks into production. Mitigation: a configuration test fails the deploy if it is enabled.

## 17. Open decisions and questions

- G11: which list of assertions is authoritative now that `scripts/verify-domain.ts` is gone (PRODUCTION-SCOPE says 88, review.md says 72)?
- G10: is the integer unit 0.0001 g, or a finer unit so the ceiling half-steps are whole numbers?
- G24: does "EP-03 onwards" include EP-41 to EP-43?
- D1: on a managed platform, how are server-side policies tested locally?
- Which end-to-end flows are required before launch, and which can follow?
- Q5d: what is the expected outcome for the last-digit middle case, so it can be tested?
- What test tooling is used for the web app and the karigar PWA?

## 18. Candidate stories

1. EP-40-S1: Developer can run unit tests for the shared package in one command
2. EP-40-S2: Developer can run weight and ceiling unit tests on integer units
3. EP-40-S3: Developer can run the rewritten match and gate tests (G11)
4. EP-40-S4: Developer can run the rewritten edit, scrap, stop and stock-out rule tests (G11)
5. EP-40-S5: Developer can run API tests against a fresh seeded database
6. EP-40-S6: Developer can run permission tests generated from the permission matrix
7. EP-40-S7: Developer can run concurrency tests for double-sell and double-routing
8. EP-40-S8: Developer can run a concurrency test for two staff tagging one parcel
9. EP-40-S9: Developer can run live-event delivery and audience tests
10. EP-40-S10: Developer can run a test that no currency shows while pricing is off
11. EP-40-S11: Developer can run a test that OTPs and tokens never reach logs or audit
12. EP-40-S12: Developer can run end-to-end tests of the main flows on staging
13. EP-40-S13: System can block a merge or deploy when any test fails
