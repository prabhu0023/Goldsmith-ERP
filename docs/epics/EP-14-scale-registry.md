# EP-14: Scale registry

## 1. Summary

The scale registry is the list of weighing scales the shop uses, each with a name, its smallest step (readability)
and its heaviest load (capacity). It exists because the exact-match gate does not use a tolerance number. Instead
the ceiling for a parcel is computed from the scales actually used: half of each scale's smallest step, added up over
every weighing. That only works if every scale is registered once and every weighing records which scale it was taken
on. This epic stores the scales on the server, lets the owner add, edit and retire them, assigns them to counters,
remembers each staff member's last scale, and gives the server one ceiling function that reads from the registry.

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Partial. `Scale {id, name, readabilityG, capacityG}`, owner-only `upsertScale`, `rememberScale` / `lastScaleId`, the `scales` screen and `computeCeiling` exist; there is no counter assignment, no retire, no capacity check on weighings, and editing a scale silently changes the ceilings of open parcels.

## 3. Roles involved

- Owner: registers each scale once, edits its name, readability and capacity, retires a scale, and assigns scales to counters.
- Staff: picks a scale when weighing; the pick is remembered for the session so they do not choose it again.
- Karigar: not involved.
- System: stores the registry, computes the ceiling server-side from the scales recorded on each weighing, warns when a weighing exceeds capacity, and audits scale changes.

## 4. In scope

- Scale records: name, readability in grams, capacity in grams, status (active or retired).
- Owner adds a scale; the server rejects a readability of 0 or less, and a capacity of 0 or less.
- Owner edits a scale's name, readability and capacity.
- A rule for what an edit does to open parcels that already have weighings on that scale (the rule itself is an open question).
- Owner retires a scale; a retired scale cannot be picked for new weighings and stays readable on old ones.
- Assigning a scale to a counter. There are no branches (D7).
- Remembering the last scale used per staff session, so the picker defaults to it.
- The ceiling function `ceiling = Σ ½ × readability` over every weighing, run on the server and shared with the client for instant feedback.
- A capacity warning when a typed weight is above the chosen scale's capacity.
- An audit entry for every scale change.
- Seed records: Bench balance 0.0001 g up to 600 g, Platform scale 0.01 g up to 30 kg.

## 5. Out of scope

- The match verdict and release decision that use the ceiling (EP-23).
- Recording parcel and piece weighings, trays and the scale picker on those forms (EP-21).
- Reading the weight directly from the balance and calibration integration (EP-36, per D9).
- The integer weight unit chosen for the database (EP-02; conflict G10 is listed below).
- Counter records themselves (EP-13). Branches are not in v1 (D7).
- Registering the shop's first scales during first-run setup (EP-45 calls this epic's Create Scale).
- Loading the real scales of the shop at launch (EP-41).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Scale {id, name, readabilityG, capacityG}`; `AppState.scales`, `AppState.lastScaleId`.
- Every stored weighing carries a scale: `ParcelWeighing.scaleId`, `Piece.scaleId`.
- `src/store/transitions.ts` `upsertScale`: `requireOwner(by, 'change the scales')`, "Name the scale.", "Enter the smallest step the scale reads."; creates `SC-NNN` ids or replaces in place; no audit; no capacity validation on the server.
- `rememberScale` sets `lastScaleId`; `recordParcelArrival` and `saveTag` also set it from the weighing.
- `src/domain/match.ts` `computeCeiling(weighings, scales)`: per scale adds `toU(readabilityG) / 2` in units of 0.00001 g, returns `ceilingU`, `ceilingG`, rows per scale and a plain line such as "13 weighings × ½ × 0.0001 g = 0.0007 g".
- `src/domain/weights.ts` `UNITS_PER_G = 100000` (0.00001 g), finer than PRODUCTION-SCOPE §5 (gap G10).
- `src/components/settings/ScalesRules.tsx` on route `scales`: list of scales, `ScaleForm` add and edit, client checks "Enter the smallest step the scale reads, in grams, for example 0.0001." and "Enter the heaviest load the scale can take, in grams."; shows the ceiling of open parcels.
- `src/components/parcels/ScaleAndWeights.tsx` `ScalePicker` defaults to `state.lastScaleId` on `parcel-arrival` and `parcel-tag`.
- Seed: Bench balance 0.0001 g / 600 g, Platform scale 0.01 g / 30 kg.
- Reusable: `computeCeiling` and its plain-English line, the `ScaleForm` fields and messages, the `ScalePicker`, the seed.
- Must be rebuilt server-side: storage, audit, retire, counter assignment, capacity validation, the rule for edits on scales used by open parcels, and the ceiling computed by the server as the authority.

## 7. Functional requirements

- FR-14-1. The owner can register a scale with a name, readability in grams and capacity in grams.
- FR-14-2. The server rejects a missing name with "Name the scale." and a readability of 0 or less with "Enter the smallest step the scale reads."
- FR-14-3. The server rejects a capacity of 0 or less with "Enter the heaviest load the scale can take, in grams."
- FR-14-4. A staff or karigar user who calls the add or edit operation is refused with "Only the owner can change the scales."
- FR-14-5. The owner can edit a scale's name, readability and capacity, and the server applies the decided rule for open parcels that already used it.
- FR-14-6. The owner can retire a scale; the picker no longer offers it and past weighings still show its name and readability.
- FR-14-7. The owner can assign a scale to a counter, and the picker lists the counter's scales first.
- FR-14-8. The picker defaults to the scale the staff member used last in the session.
- FR-14-9. The server computes the ceiling for a set of weighings as Σ ½ × readability of the scale recorded on each weighing.
- FR-14-10. For 13 weighings on the 0.0001 g bench balance, the server ceiling is 0.00065 g, displayed as the decided rounding (G10).
- FR-14-11. For 300 weighings on 0.0001 g plus 1 on 0.01 g, the ceiling is 0.0200 g; for 320 weighings on 0.0001 g, 0.0160 g.
- FR-14-12. A weighing above the chosen scale's capacity shows a warning naming the capacity, for example "The bench balance takes up to 600 g."
- FR-14-13. Every add, edit, retire and assignment writes an audit entry with before and after values.
- FR-14-14. Every weighing stored anywhere refers to a registered scale id; the server rejects an unknown id with "Pick the scale this was weighed on."

## 8. Business rules

- BR-14-1. Every scale used in the shop is registered once, with a name and readability; a one-time setup, owner-level. [SCOPE-ANALYSIS App. E rule 1; mockup 14]
- BR-14-2. Every weighing records which scale it was taken on, picked once per session and remembered. [SCOPE-ANALYSIS App. E rule 2]
- BR-14-3. The match ceiling is computed, never configured: Σ (½ × readability) over every weighing. [SCOPE-ANALYSIS App. E rule 3; mockup 14 "THE ONLY RULE — IT HAS NO SETTINGS"]
- BR-14-4. Parcel size, piece count and value never appear in the rule. [SCOPE-ANALYSIS App. E]
- BR-14-5. Readability must be greater than 0. [src/store/transitions.ts upsertScale]
- BR-14-6. Only the owner changes the scales. [src/store/transitions.ts upsertScale requireOwner; SCOPE-ANALYSIS App. E]
- BR-14-7. Parcel and pieces are weighed on the same scale where the owner says so; trays may use whichever scale fits. [SCOPE-ANALYSIS App. D, App. E trays]
- BR-14-8. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Scale: id, name, readability (integer, units of 0.0001 g; see G10), capacity (integer, units of 0.0001 g), status (`active`, `retired`), counter key (nullable), shop ID, location ID (not null, "Main shop" in v1, set by the server; D7), created at, retired at, version.
- ScaleAssignment (if one scale may serve several counters): scale id, counter key, from, to.
- Session preference: user id, last scale id (the prototype's `lastScaleId`, moved per user).
- Ceiling result (computed, not stored): rows per scale with count and subtotal, total ceiling, plain line. The total needs half-steps of readability (0.00005 g on a 0.0001 g scale), which is not a whole number of 0.0001 g units; the stored unit is open (G10).
- Weighings in EP-21 and pieces store the scale id they were taken on.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Scales | Picker and registry list (active, or all with retired) | Owner, Staff |
| Create | Scale | Register a scale | Owner |
| Update | Scale | Edit name, readability or capacity | Owner |
| Update | Scale status | Retire or reactivate a scale | Owner |
| Update | Scale assignment | Assign a scale to a counter | Owner |
| Update | My last scale | Remember the scale picked in this session | Staff, Owner |
| Compute | Ceiling | Ceiling for a set of weighings (internal to match, also readable for the screen) | System, Staff, Owner |

## 11. Live events

None. Scale changes are rare owner actions. A changed readability affects ceilings, and EP-23 recomputes verdicts when it next evaluates a parcel; no catalogue event is needed unless the open-parcel rule says otherwise.

## 12. Screens and UX references

- Route ids: `scales` (ScalesRules, owner rail "Scales & rules"); the scale picker appears on `parcel-arrival` and `parcel-tag`.
- Mockups: `14-match-rule-any-parcel.svg` ("SET UP ONCE · THE SCALES IN THE SHOP": "Bench balance reads to 0.0001 g · up to 600 g", "Platform scale reads to 0.01 g · up to 30 kg", "Each scale is named once with its smallest step. Every weighing remembers which scale it was on. Staff never retype it."), `20-parcel-arrival.svg` (scale picker).
- Not yet designed (MOCKUP-COVERAGE §3): add / edit scale form (mockup 14 explains the rule but is not a form). The prototype `scales` screen was built without a mockup and needs a design pass.

## 13. Non-functional requirements

- Precision: readability and capacity are integers in units of 0.0001 g; the ceiling must be exact at half-steps, so the unit used for the ceiling is settled with G10 before EP-23.
- Security: add, edit, retire and assignment are owner-only on the server.
- Audit: every scale change writes before and after values, because a readability change alters every future ceiling.
- Concurrency: an edit to a scale and a parcel evaluation at the same moment use a consistent version of the scale (the evaluation reads one version, never half an edit).
- Performance: computing the ceiling for a 500-weighing parcel takes under 10 ms on the server (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none).

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-02, EP-13, EP-08
- Downstream: EP-21, EP-40, EP-41, EP-45.

## 15. Epic acceptance criteria

1. Given the owner on `scales`, when they add "Counter 2 balance" reading 0.001 g up to 200 g, then it appears in the picker on `parcel-arrival` and an audit entry records it.
2. Given a staff user, when they call the add-scale operation directly, then the server refuses with "Only the owner can change the scales."
3. Given a parcel weighed once and 12 pieces tagged, all on the Bench balance, when the server computes the ceiling, then it is 13 × ½ × 0.0001 g = 0.00065 g, shown as decided under G10.
4. Given a 10 kg parcel weighed once on the Platform scale and 300 pieces on the Bench balance, when the ceiling is computed, then it is 0.0200 g, and the line shows "300 × 0.00005 + 1 × 0.005".
5. Given a retired scale, when staff open the picker, then it is not offered, and an old piece weighed on it still shows its name.
6. Given a staff member picked the Platform scale for a tray, when they open the next tray, then the picker defaults to the Platform scale.

## 16. Risks

- Risk: an owner corrects a readability while parcels are open, and their verdicts flip without anyone noticing. Mitigation: decide the open-parcel rule (snapshot readability on each weighing, or block edits while used) and audit every change.
- Risk: the 0.0001 g integer unit cannot hold 0.00005 g half-steps, so the ceiling is rounded and the mockup's 0.0007 g differs from the true 0.00065 g. Mitigation: settle G10 with EP-02 and EP-23 before building the ceiling.
- Risk: real shop scales differ from the seed values. Mitigation: collect the real readabilities and capacities before launch (EP-41).
- Risk: staff pick the wrong scale because the remembered one is stale after moving counters. Mitigation: show the picked scale name beside every weight field and reset the memory at sign-out.

## 17. Open decisions and questions

- Q5d: for the middle case (gap above 0 and within the ceiling), release and log, or treat as a mismatch? The prototype implements release-and-log; SCOPE-ANALYSIS App. E still lists it open.
- G10: should the stored unit be 0.0001 g as PRODUCTION-SCOPE §5 says, or a finer unit (the prototype uses 0.00001 g), or a doubled half-step unit, so the ceiling is exact? How is 0.00065 g displayed (mockup 14 rounds it to 0.0007 g)?
- What are the exact readabilities and capacities of the real scales in the shop? (SCOPE-ANALYSIS App. E "Still genuinely open")
- D9: will weights be typed by hand or read directly from the balance, and does that change what the registry stores (model, port, serial number)?
- When the owner edits the readability of a scale already used by open parcels, do those parcels keep the old figure or take the new one?
- Should the registry hold calibration dates and block a scale past its calibration date?
- Is a scale tied to one counter, or can any staff use any scale?

## 18. Candidate stories

1. EP-14-S1: System can store scales with readability and capacity as integer weights
2. EP-14-S2: System can seed the bench balance and platform scale for dev
3. EP-14-S3: Owner can register a scale
4. EP-14-S4: System can refuse scale changes from anyone but the owner
5. EP-14-S5: Owner can edit a scale's name, readability and capacity
6. EP-14-S6: System can apply the decided rule when a scale used by open parcels is edited
7. EP-14-S7: Owner can retire a scale
8. EP-14-S8: Owner can assign a scale to a counter
9. EP-14-S9: Staff can have their last scale remembered for the session
10. EP-14-S10: System can compute the ceiling server-side from the registry
11. EP-14-S11: Staff can see a warning when a weight is above the scale's capacity
12. EP-14-S12: System can audit every scale change
