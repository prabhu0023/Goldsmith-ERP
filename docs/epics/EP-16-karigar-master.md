# EP-16: Karigar master

## 1. Summary

A karigar is an outside artisan the shop issues gold to and who returns finished pieces. The karigar master is the
record of each one: name, code (KG-01), phone (which is also their portal login), workshop location, what they are best
at, the language they prefer (stored for later; v1 is English only), and their wastage allowance, the share of issued gold they may lose in
making (0.6% to 1.2%). The allowance matters because every job is later judged against it, and anything above it is
flagged to the owner. The owner also needs a fair, data-backed view of each karigar: loss, lateness, rating and the gold
gap on their last six parcels (the karigar scorecard, gap G4). This epic moves the records to the server, adds editing
and deactivation, links each karigar to a user account so they can sign in to the portal, and computes the scorecard
from real job and ledger data.

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Partial. Owner-only `onboardKarigar` with the 0.6–1.2% wastage check and `KG-NN` ids, the `karigars` directory sorted worst first with a job ledger, and the `karigar-new` form exist; there is no edit, no deactivate, no user-account link, no workshop location field, language is stored but unused, and the scorecard figures (`gapsMg`, `metalLossPct`, `lateDays`, `rating`) are seeded, not computed.

## 3. Roles involved

- Owner: adds a karigar, edits their details, changes their wastage allowance, deactivates them, links them to a user account, and reads the directory and scorecard.
- Staff: picks a karigar on the order copy and parcel forms; does not see the scorecard or wastage figures beyond what the order copy shows (to confirm with G4).
- Karigar: signs in with the phone recorded here and their own password, set from the activation email sent to the email recorded here (D4); sees their own profile in the "Me" tab; never sees another karigar's record or scorecard.
- System: generates the `KG-NN` code, enforces the wastage range, computes scorecard figures from EP-18 and EP-19 data, and audits every change.

## 4. In scope

- Karigar record: code, name, phone, email (required; every karigar has one, D4), workshop location, specialties, language preference (stored only, unused until EP-44), wastage allowance, status.
- Owner adds a karigar; code assigned `KG-NN` in sequence.
- Owner edits name, phone, email, workshop location and specialties.
- Every karigar record belongs to the one shop: it carries the shop ID set by the server, and the karigar code and phone are unique within the shop (D7).
- Owner changes the wastage allowance within 0.6% to 1.2%, audited with old and new value.
- Owner deactivates a karigar; refused while the karigar has open jobs or gold out, unless the decided rule says otherwise.
- Link between a karigar record and a karigar user account (EP-05 owns the user side).
- Directory listing karigars worst first, with open jobs, gold with them and their allowance.
- Karigar scorecard (G4): metal loss % against allowance, days late, rating, finished jobs, and the gold gap on their last six parcels. Figures come from EP-18 (ledger) and EP-19 (jobs) and EP-23 (parcel gaps); the rating formula is a decision.
- Language preference kept as a stored field, defaulting to English; nothing reads it in v1, and EP-44 Localisation uses it later.
- The allowance worked example on the form: "On a 160 g job, that means up to 1.120 g lost".

## 5. Out of scope

- Signing in with phone and password, the activation and reset emails (EP-04); the user account itself (EP-05). There is no OTP sign-in in v1 (D4).
- Issuing gold and creating jobs (EP-19); the gold ledger (EP-18).
- Reconciliation B, judging a finished job against the allowance and flagging it (EP-19 with EP-18, gap G23).
- Parcel gaps at intake that feed "last six parcels" (EP-23 produces them).
- v1 is English only. The language choice on `karigar-new` (mockup 24 தமிழ் / हिन्दी / English), translating the karigar app and any use of the stored language preference are out of scope, owned by EP-44 Localisation (gap G2 resolved).
- Loading the real karigars at launch (EP-41).
- Karigar-facing screens (EP-20).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Karigar {id, name, phone, specialty, language, wastagePct, gapsMg[], metalLossPct, lateDays, rating, finishedJobs, openSince}`; no workshop location, no status.
- `src/store/transitions.ts` `onboardKarigar`: `requireOwner(by, 'add a karigar')`, "Add the karigar name.", "The wastage allowance is between 0.6% and 1.2%."; id `KG-NN` (first free number); `gapsMg`, `metalLossPct`, `lateDays`, `rating` start at 0; no audit.
- `finishRelease` appends `Math.round(|gapNetG| × 1000)` mg to `Karigar.gapsMg` and keeps the last six.
- `src/components/people/OnboardKarigar.tsx` (route `karigar-new`): `SPECIALTIES` chips (Chettinad, Temple, Kundan, Polki, Antique, Jadau, Meenakari), "Pick at least one thing they are best at.", `LANGUAGES` தமிழ் / हिन्दी / English, `SAMPLE_JOB_G = 160` for the allowance example.
- `src/components/people/Karigars.tsx` (route `karigars`): owner-only, sorted by `metalLossPct − wastagePct` descending ("worst first"), shows rating "x / 5" or "None yet", last gaps in mg with average, and a ledger of jobs.
- `src/store/selectors.ts` `jobsForKarigar`, `openJobsForKarigar`, `goldWithKarigar`, `jobOverdueDays`.
- `Identity.karigarId` links a demo identity to a karigar; no real account.
- Seed: KG-01 Lakshmi Devi, Tamil, 0.7%; KG-02 Mahesh Soni, Hindi, 0.8%; KG-04 Vijay Kumar, Hindi, 0.8%.
- Reusable: the record fields, the wastage range and its sentence, the form layout and allowance example, the worst-first ordering, the job ledger view.
- Must be rebuilt server-side: storage, edit and deactivate, the user-account link, the workshop location field, audit of every change, and the scorecard computed from ledger, job and parcel data instead of seeded numbers.

## 7. Functional requirements

- FR-16-1. The owner can add a karigar with name, phone, email, workshop location, one or more specialties and wastage allowance.
- FR-16-2. The server assigns the next free code `KG-NN` and never reuses a code.
- FR-16-3. The server rejects a missing name with "Add the karigar name." and an empty specialty list with "Pick at least one thing they are best at."
- FR-16-4. The server rejects a wastage allowance below 0.6% or above 1.2% with "The wastage allowance is between 0.6% and 1.2%."
- FR-16-5. A staff or karigar user who calls add, edit or wastage change is refused with "Only the owner can add a karigar or change their wastage allowance."
- FR-16-6. The owner can edit name, phone, email, workshop location and specialties.
- FR-16-7. The server records which allowance was in force for each job, so a later change can be applied by the decided rule (new jobs only, or open jobs too).
- FR-16-8. The owner can deactivate a karigar; the server refuses while the karigar has an open job or gold issued and not returned, naming the jobs.
- FR-16-9. A deactivated karigar is not offered on the order copy or parcel forms and cannot sign in to the portal.
- FR-16-10. The owner can link a karigar record to a karigar user account; one account per karigar.
- FR-16-11. The directory lists karigars worst first by metal loss against allowance, with open jobs and gold with them in grams.
- FR-16-12. The system computes scorecard figures (G4) from data: metal loss % from EP-18 and EP-19 settlement, days late from EP-19 agreed dates, and the last six parcel gaps from EP-23.
- FR-16-13. The system supports a rating computed by the decided formula; until decided, the rating is not shown.
- FR-16-14. The karigar's language preference is stored with the default English and is not read by any v1 screen or message; EP-44 uses it.
- FR-16-15. Every add, edit, wastage change, link and deactivation writes an audit entry with before and after values.

## 8. Business rules

- BR-16-1. The wastage allowance is between 0.6% and 1.2%. [mockup 24; src/store/transitions.ts onboardKarigar]
- BR-16-2. Only the owner can add a karigar or change their wastage allowance. [mockup 24]
- BR-16-3. The phone number is the karigar's portal login, with a password the karigar sets from the activation email. [mockup 24; D4]
- BR-16-4. More than the allowance against a job is flagged to the owner. [mockup 24 "More than that against a job, and it is flagged to you"; SCOPE-ANALYSIS App. C reconciliation B]
- BR-16-5. The allowance is judged against the job (reconciliation B), not at parcel intake (reconciliation A). [SCOPE-ANALYSIS App. C]
- BR-16-6. Metal loss is shown as a percentage and in grams, never as a cost. [SCOPE-ANALYSIS App. F]
- BR-16-7. The owner sees karigars worst first. [mockup 08 "KARIGARS, WORST FIRST"]
- BR-16-8. The owner's clearance screen shows the karigar's last six parcels' gold gap. [mockup 22 "His last six parcels, gold gap"]
- BR-16-9. A karigar never sees any other karigar's work or scorecard. [mockup 11]
- BR-16-10. Every karigar has an email address. [D4]
- BR-16-11. Karigar records are scoped to the one shop; codes and phones are unique within the shop. [D7]

## 9. Data

- Karigar: id (`KG-NN`, unique within the shop), shop ID, name, phone (unique within the shop), email (required), workshop location, specialties (references to EP-15 list), language (`Tamil`, `Hindi`, `English`, set open; default `English`; stored only, unused until EP-44), wastage allowance (basis points, integer; 0.70% = 70), status (`active`, `deactivated`), user id (nullable link to EP-05 user), open since, version.
- KarigarScorecard (derived, may be cached): karigar id, metal loss % over a period, days late (sum or average, per decision), rating (nullable until G4 formula is decided), finished jobs count, last six parcel gaps (integer, units of 0.0001 g each).
- Gold with the karigar: derived from EP-18 ledger, integer, units of 0.0001 g.
- The job stores the allowance in force when it was issued (EP-19 owns the field).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Karigar | Add a karigar | Owner |
| Update | Karigar details | Edit name, phone, email, location, specialties | Owner |
| Update | Karigar wastage | Change the allowance (audited) | Owner |
| Update | Karigar status | Deactivate or reactivate | Owner |
| Update | Karigar account link | Link to a karigar user account | Owner |
| List | Karigars | Directory worst first | Owner; Staff get a picker list of active karigars without scorecards |
| Read | Karigar scorecard | Loss, lateness, rating, last six gaps (G4) | Owner |
| Read | My karigar profile | Own record for the "Me" tab | Karigar (own only) |

## 11. Live events

None from the catalogue. The scorecard updates when EP-19 and EP-23 settle jobs and parcels; deactivation reaches the karigar's phone through "User deactivated or role changed", which EP-05 emits for the linked user account.

## 12. Screens and UX references

- Route ids: `karigars` (Karigars, owner rail), `karigar-new` (OnboardKarigar).
- Mockups: `24-onboard-karigar.svg` (name, code KG-01, phone = portal login, workshop location, specialty chips, language தமிழ் / हिन्दी / English (out of scope for v1, owned by EP-44), allowed loss 0.70% "On a 160 g job, that means up to 1.120 g lost", "Only the owner can add a karigar or change their wastage allowance"), `08-owner-home.svg` ("KARIGARS, WORST FIRST"), `22-owner-clear-mismatch.svg` ("His last six parcels, gold gap", scorecard data G4), `19-order-copy-builder.svg` (karigar picker with allowance).
- Not yet designed (MOCKUP-COVERAGE §3): karigar list and ledger / scorecard page. The prototype `karigars` screen was built without a mockup and needs a design pass; an edit form and deactivate action are also undrawn.

## 13. Non-functional requirements

- Precision: the allowance is stored as an integer (basis points), and every gram figure on the scorecard is integer, units of 0.0001 g; percentages are computed from integers, not stored floats.
- Security: add, edit, wastage change, link and deactivate are owner-only on the server; a karigar reads only their own profile.
- Audit: a wastage change records old and new allowance, because it changes how every future job is judged.
- Personal data: karigar phone, email and workshop location are personal data; only the owner sees the full directory.
- Concurrency: a deactivation and a new order copy for the same karigar at once cannot both succeed; the job creation re-checks status in the same transaction.
- Performance: the directory with scorecards for 50 karigars loads under 2 seconds.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05, EP-08
- Downstream: EP-19, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given the owner on `karigar-new`, when they add "Ravi Achari", phone, email, Temple and Kundan, 0.9%, then the record KG-05 (next free code) is stored and audited.
2. Given a staff user, when they call the add-karigar operation directly, then the server refuses and nothing is stored.
3. Given the owner, when they set the allowance to 1.5%, then the server refuses with "The wastage allowance is between 0.6% and 1.2%."
4. Given KG-04 Vijay Kumar has an open job, when the owner tries to deactivate him, then the server refuses and names the job.
5. Given three parcels released for KG-02, when the owner opens the scorecard, then the last gaps shown are those of the released parcels, computed by the server.
6. Done when no scorecard figure on `karigars` or `parcel-clear` comes from seeded numbers.

## 16. Risks

- Risk: the scorecard rating looks authoritative before its formula is agreed and causes unfair judgement. Mitigation: hide rating until G4 is decided; show only measured figures.
- Risk: an allowance change is applied to jobs already issued and changes past verdicts. Mitigation: record the allowance in force on each job, and decide (section 17) whether a change reaches open jobs.
- Risk: karigars in one workshop share a phone, so "phone = login" breaks. Mitigation: D4 decided that phone numbers are unique. How to handle a karigar without their own phone is open (see section 17).
- Risk: language is stored but nothing reads it in v1. Mitigation: the field is kept only for EP-44, which reads it; v1 is English only (G2 resolved).

## 17. Open decisions and questions

- D4 is decided: phone and password; phone numbers are unique, so two karigars cannot share a phone, and every karigar has an email address ([decision record](../decisions/D4-sign-in.md)).
- G4: how is the rating computed, over what period are loss % and days late measured, and do staff see any of it?
- G23: is reconciliation B (gold issued vs net returned vs allowance) settled per job or per period, and where is the flag raised?
- Does a changed wastage allowance apply only to jobs issued after the change, or also to jobs already open?
- If two karigars share one phone, or a karigar has no phone of their own, how do they get a portal account? Proposed option: no portal account, and staff record that karigar's job updates for them.
- Can a karigar with open jobs be deactivated if the owner takes the gold back first?
- Should the workshop location be free text or an address with a map pin?

## 18. Candidate stories

1. EP-16-S1: System can store karigar records with code, phone, location, specialties, language and allowance
2. EP-16-S2: System can refuse karigar changes from anyone but the owner
3. EP-16-S3: Owner can add a karigar with the 0.6% to 1.2% allowance check
4. EP-16-S4: Owner can edit a karigar's details
5. EP-16-S5: Owner can change a karigar's wastage allowance, audited
6. EP-16-S6: Owner can link a karigar to a karigar user account
7. EP-16-S7: Owner can deactivate a karigar with no open jobs
8. EP-16-S8: Staff can pick only active karigars on the order copy and parcel forms
9. EP-16-S9: Owner can see the karigar directory worst first
10. EP-16-S10: System can compute loss %, days late and last six parcel gaps from real data (G4)
11. EP-16-S11: Owner can see a karigar's scorecard (G4)
12. EP-16-S12: Karigar can see their own profile
13. EP-16-S13: System can audit every karigar change
