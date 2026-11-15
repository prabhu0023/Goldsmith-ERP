# EP-41: Launch and data migration

## 1. Summary

Launch moves the shop from the paper register to the app. Before the first real parcel goes through the match
gate, the system needs the shop's real karigars, customers with their WhatsApp consent, existing showroom stock as
in-stock pieces, the real scales with their true readabilities, the opening balance of the metal pool, and an
account for every staff member and karigar. Staff and karigars need training on the screens they will use. The app
then runs in parallel with the paper register for an agreed period, and the owner compares the two before the paper
register stops. A go-live checklist confirms that monitoring, backups, tests and security work are in place.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: N/A. The prototype loads demo data from `src/data/seed.ts` and has no import path, no real records and no launch process.

## 3. Roles involved

- Owner: provides the real lists, confirms the opening pool balance and existing stock weights, approves each import, decides when the parallel run ends, signs the go-live checklist.
- Staff: check imported stock against the showroom, attend training, record work in both the app and the paper register during the parallel run.
- Karigar: receive an account and training on the phone portal; confirm the gold they hold at launch.
- System: validates and loads each import, reports rows it refused, writes audit entries for the opening records, and produces the comparison figures for the parallel run.

## 4. In scope

- Import real karigars: name, phone, specialty, language (stored only, unused until EP-44), wastage allowance, account link.
- Import customers with name, phone, birthday, anniversary, group and WhatsApp consent with its source.
- Import existing showroom stock as in-stock pieces with tag number, HUID, purity, gross and stone weights.
- Register the real scales with their true readability and capacity (SCOPE-ANALYSIS App. E).
- Record the opening balance of the metal pool (App. B sub-question 1).
- Record gold currently with each karigar at launch, as open jobs or opening ledger entries.
- Create user accounts for the owner, staff and karigars, and run the first-owner bootstrap.
- Load shop settings (lead SLA hours, notification channels, wish time) and reference data lists.
- Training for staff, the owner and karigars, per role.
- A parallel run with the paper register and a daily comparison.
- A go-live checklist and a rollback plan.

## 5. Out of scope

- Import formats for each master are built on the master's own create rules (EP-13 to EP-17).
- The first-owner bootstrap mechanism (EP-04).
- User accounts and roles (EP-05).
- Pool ledger rules (EP-18).
- Backups and restore drills (EP-38).
- Monitoring and alerts (EP-37).
- Security review and penetration test (EP-39).
- Test suites (EP-40).
- Reports (EP-35), whose launch timing is gap G24.
- Any import of prices, budgets or invoice amounts (EP-42).

## 6. Current state in the prototype

- `src/data/seed.ts` and `src/data/seedRows.ts`: demo data only. Karigars KG-01 Lakshmi Devi (Tamil, 0.7%), KG-02 Mahesh Soni (Hindi, 0.8%), KG-04 Vijay Kumar (Hindi, 0.8%); staff ST-01 Rajesh Verma, ST-02 Deepak Rao, ST-03 Sanjay Seth (owner); eight customers CU-001 to CU-008; scales Bench balance (0.0001 g, 600 g) and Platform scale (0.01 g, 30,000 g); pool opening 812.5800 g.
- `src/store/transitions.ts` create paths that an import must respect: `onboardKarigar`, `onboardStaff` and `upsertScale` (owner only), `onboardCustomer`, `saveTag` (pieces start as `draft`, not `in_stock`).
- `MetalPool.ledger` kinds `opening`, `issued`, `recovered` in `src/types/jewellery.ts`; the seed has an `opening` entry, but no screen creates one.
- `Customer.history` is seeded by hand; there is no source for past purchases (G13).
- No import screen, no file upload for lists, no comparison report.
- Reusable: the field lists and validation messages of the onboarding transitions, the seed as a staging rehearsal, the `opening` ledger kind.
- Must be rebuilt server-side: import jobs with validation and row-level error reports, opening records with audit, the parallel-run comparison.

## 7. Functional requirements

- FR-41-1. The owner can import karigars from a list; each row passes the same rules as onboarding a karigar, and refused rows are reported with the reason.
- FR-41-2. The owner can import customers; each row records consent with source "import" and the date consent was originally given, or no consent if none is on record.
- FR-41-3. The owner can import existing stock as in-stock pieces with gross and stone weights converted to integer units without rounding.
- FR-41-4. The server refuses an imported piece whose tag number already exists or whose stone weight exceeds its gross weight.
- FR-41-5. The owner can register each real scale with its true readability and capacity before the first parcel is weighed.
- FR-41-6. The owner can record the opening pool balance once, as an `opening` ledger entry with a reason and audit entry.
- FR-41-7. The owner can record the gold each karigar holds at launch, so gold with karigars matches the paper register.
- FR-41-8. The owner can create accounts for every staff member and karigar, and each can sign in before go-live.
- FR-41-9. Each import is recorded with who ran it, when, the file, rows loaded and rows refused, and the loaded rows are audited.
- FR-41-10. An import can be run again on staging as a rehearsal without touching production.
- FR-41-11. During the parallel run, the system shows daily figures for comparison with the paper register: pieces in stock, pure gold on the floor, gold with karigars, pool balance, pieces out.
- FR-41-12. Training material exists for each role and covers the screens that role uses.
- FR-41-13. The go-live checklist lists each item with an owner and a tick, and go-live waits for every item.
- FR-41-14. A rollback plan says how the shop returns to the paper register if go-live fails.

## 8. Business rules

- BR-41-1. Load real karigars, customers and existing stock; train staff; run in parallel with the paper register; use a go-live checklist. [PRODUCTION-SCOPE §6 EP-41]
- BR-41-2. Weights are integers in units of 0.0001 g; never store grams as floating point. [PRODUCTION-SCOPE §5 Precision]
- BR-41-3. The ceiling reads each scale's real readability, so the registered value must be the true one. [SCOPE-ANALYSIS App. E]
- BR-41-4. The metal pool may or may not already exist in the shop's books. [SCOPE-ANALYSIS App. B sub-question 1]
- BR-41-5. Record consent for WhatsApp messaging and honour opt-out. [PRODUCTION-SCOPE §5 Personal data]
- BR-41-6. Only the owner can add staff or change a role. [mockup 25]
- BR-41-7. Adding a karigar and changing scales are owner-only. [src/store/transitions.ts onboardKarigar, upsertScale]
- BR-41-8. Every state change is audited with actor, time, before and after. [PRODUCTION-SCOPE §5 Audit]
- BR-41-9. A tag number is used on one piece only, and stones cannot weigh more than the piece. [src/store/transitions.ts saveTag]
- BR-41-10. A karigar's wastage allowance is between 0.6% and 1.2%. [src/store/transitions.ts onboardKarigar]

## 9. Data

- ImportRun: id, kind (karigars, customers, stock, scales, users, opening pool, karigar holdings), file reference, run by, environment, started at, rows loaded, rows refused, status.
- ImportRowError: import run id, row number, field, reason.
- Pieces created by import: tag number, HUID, name, kind, purity, gross and stone (integer, units of 0.0001 g), status `in_stock`, source "import", imported at; value socket nullable, unused until EP-42.
- Opening pool entry: kind `opening`, grams (integer, units of 0.0001 g), reason, recorded by.
- Karigar holdings at launch: karigar id, grams held (integer, units of 0.0001 g), linked open job if any.
- Scales: readability and capacity (integer, units of 0.0001 g).
- Customers: consent entry with source "import"; budget and spend stay nullable value sockets, unused until EP-42.
- ParallelRunDay: date, app figures (pieces, grams), register figures entered by the owner, difference, note.
- GoLiveChecklistItem: item, responsible person, done at, signed by.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Import run | Upload and validate a list for one kind | Owner |
| Read | Import run | Rows loaded and refused with reasons | Owner |
| Create | Opening pool entry | Record the pool balance at launch | Owner |
| Create | Karigar holding | Record gold with a karigar at launch | Owner |
| Read | Parallel run figures | Daily app figures for comparison | Owner |
| Create | Parallel run day | Enter register figures and a note | Owner |
| List | Go-live checklist | Items and their status | Owner, Operator |
| Update | Go-live checklist item | Tick an item | Owner, Operator |

## 11. Live events

- Emits: none of its own. Imports run before go-live, when no screens are in use. The opening pool entry passes through EP-18, which emits "Metal pool changed" if any screen is open.
- Consumes: none.

## 12. Screens and UX references

- No screen of its own in the mockups. It needs an owner import page, a parallel-run comparison page and the go-live checklist, none designed.
- Screens that depend on it: `stock` (imported pieces), `karigars`, `customers`, `staff-directory`, `scales`, `k-jobs` (karigar sign-in), `decisions` (gold with karigars).
- Mockups: `24-onboard-karigar.svg`, `23-onboard-customer.svg`, `25-onboard-staff.svg` and `14-match-rule-any-parcel.svg` define the fields each import must carry.

## 13. Non-functional requirements

- Precision: imported weights are parsed from text into integer units of 0.0001 g with no float step; totals after import equal the source totals exactly.
- Personal data: customer lists are personal data; files are deleted after import; consent without a record is imported as no consent.
- Audit: every imported row and every opening entry is audited with the import run as the reason.
- Security: imports are owner-only; import files are stored with restricted access and removed after use.
- Availability and recovery: a full backup is taken after imports and before go-live (EP-38).
- Time: the parallel run compares by day in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): All above
- Upstream, expanded: EP-01 to EP-40 (EP-35 is milestone M8, after M7; see gap G24).
- Downstream: None.

## 15. Epic acceptance criteria

1. Given a karigar list with one row whose wastage allowance is 1.5%, when the owner imports it, then every other row loads and the report names the refused row with "The wastage allowance is between 0.6% and 1.2%."
2. Given existing stock with a total of 1,847.0000 g pure gold in the register, when the stock import finishes, then the app shows the same total to four decimals.
3. Given the real bench balance reads to 0.001 g, when the owner registers it, then the ceiling for parcels weighed on it uses 0.001 g.
4. Given the owner records an opening pool balance, when the ledger is read, then it shows one `opening` entry with the owner, time and reason.
5. Given the parallel run has ended, when the owner compares the last week, then each day's app figures and register figures are listed with their differences.
6. Done when every go-live checklist item is ticked and signed, including backups, monitoring, tests and the security review.

## 16. Risks

- Risk: existing stock weights in the register are rounded to fewer decimals than the app expects. Mitigation: import the decimals as recorded and decide whether to re-weigh (open question).
- Risk: the opening pool balance is not known. Mitigation: settle App. B sub-question 1 with the owner before launch.
- Risk: customer consent cannot be proven for existing customers. Mitigation: import as no consent unless a record exists, and collect consent at the next visit.
- Risk: staff keep using paper after go-live. Mitigation: agree the end date of the parallel run and compare daily.
- Risk: karigars cannot sign in on their phones on day one. Mitigation: sign each karigar in during training, before go-live.
- Risk: real scale readabilities differ from the seed and change ceilings. Mitigation: register the true values from each scale's documentation.

## 17. Open decisions and questions

- App. B sub-question 1: does the metal pool already exist in the shop's books, and what is its opening balance?
- What are the real readabilities and capacities of the shop's scales (App. E)?
- Does existing stock enter as in-stock directly, or does it pass the match gate or an owner check first?
- Is existing stock re-weighed at import, or are register weights trusted?
- How long is the parallel run, and who decides it has passed?
- Which customer records have proof of WhatsApp consent?
- G13: is past purchase history imported for customers, and from where?
- G24: is EP-35 Reports required before launch, or after as M8 says?
- D7: is launch for one shop or several branches at once?
- In which spoken language is each karigar trained? The app itself is English only in v1 (G2 resolved; other languages in EP-44).

## 18. Candidate stories

1. EP-41-S1: System can record import runs with loaded and refused rows
2. EP-41-S2: Owner can import karigars from a list
3. EP-41-S3: Owner can import customers with their consent status
4. EP-41-S4: Owner can import existing stock as in-stock pieces with integer weights
5. EP-41-S5: Owner can register the real scales with true readabilities
6. EP-41-S6: Owner can record the opening pool balance
7. EP-41-S7: Owner can record the gold each karigar holds at launch
8. EP-41-S8: Owner can create accounts for every staff member and karigar
9. EP-41-S9: Owner can rehearse every import on staging
10. EP-41-S10: Staff can follow role-based training for their screens
11. EP-41-S11: Karigar can sign in and follow training on the phone portal
12. EP-41-S12: Owner can compare daily app figures with the paper register
13. EP-41-S13: Owner can tick and sign the go-live checklist
14. EP-41-S14: Owner can follow a rollback plan to the paper register
