# Karigars (EP-16)

The karigar master: records, the 0.6% to 1.2% wastage allowance, the account link, the directory and scorecard, the picker, and the karigar's own profile. Code is in `packages/api/src/karigars/`, the pure rules in `packages/shared/src/domain/karigars.ts`, the contract in `packages/shared/src/contract/karigars-contract.ts`, the screens in `packages/web/src/components/people/`. Follow-ups are FU-028 to FU-031 in `docs/followups.md`.

## Data

- `karigars`: `code` (`KG-NN`, per shop, from `nextCode` with prefix `KG` and pad 2, so the next code after KG-04 is KG-05 and gaps are never refilled), `name`, `phone` (normalised, unique per shop when set), `email` (not null), `workshop_location`, `language` (`Tamil`, `Hindi` or `English`, default `English`; stored only, no operation accepts or returns it), `wastage_bp` (integer basis points, 60 to 120), `status` (`active` or `deactivated`), `deactivated_at`, `version`.
- `karigar_specialties`: one row per karigar and specialty name. The name is plain text until EP-15 has a list (FU-028).
- `email` and `workshop_location` are commented `personal data (DPDP)`; audit entries mask the phone and email.
- The seeded scorecard columns and `karigar_gap_history` are gone. Nothing is stored for a scorecard; it is computed on read.
- Migration: `packages/api/migrations/20261128T1130_ep16_karigar_master.sql`.

## Operations

All take the karigar code as `karigarId`. A refusal for the wrong role comes before validation, so a staff member sending an empty name gets the role sentence.

| Operation | Who | What it does |
| --- | --- | --- |
| `onboardKarigar` | owner | Creates a karigar, returns the code. Audit kind `karigar_onboarded`. Safe to repeat with one `Idempotency-Key`. |
| `updateKarigarDetails` | owner | Name, phone, email, workshop location, specialties, with `version`. Strict input: `wastageBp`, `status` and `id` keys are refused as `validation`. A linked live user gets the new phone and email in the same transaction. No change writes no entry and no new version. Kinds `karigar_edited`, `user_edited`. |
| `updateKarigarWastage` | owner | New `wastageBp` and an optional `reason`, with `version`. Same value is a no-op. Kind `karigar_wastage_changed`. |
| `updateKarigarStatus` | owner | `active` or `deactivated`, with `version` and an optional `reason`. Deactivating is refused while a job is not handed over. It also deactivates the linked user and ends their sessions. Reactivating leaves the user deactivated. Kinds `karigar_deactivated`, `karigar_reactivated`, `user_deactivated`, `sessions_ended`. |
| `linkKarigarAccount` | owner | Without `userId`, creates a `pending_activation` karigar user from the karigar's name, phone and email and mails the activation link. With `userId`, links an existing karigar user whose phone matches. Kinds `karigar_linked`, `user_added`, `activation_link_sent`. |
| `listKarigars` | owner | The directory. Active karigars with a loss figure first, by `metalLossBp - wastageBp` descending, then active ones without a figure by code, then deactivated ones by code. The cursor carries an offset. |
| `listKarigarPicker` | staff, owner | Active karigars only: `id`, `name`, `specialties`, `wastageBp`. No phone, location or scorecard. A karigar session is refused. |
| `readKarigarScorecard` | owner | Loss, days late, finished jobs, last gaps, job ledger. Unknown code is `not_found`. |
| `readMyKarigarProfile` | karigar | The caller's own record, found from their user row. Takes no id. `profile` is `null` when the account is not linked. |

`assertKarigarActive(tx, shop, karigarCode)` and `readAllowanceInForce(client, shop, karigarCode)` in `active-check.ts` are for the order-copy and parcel-arrival work (FU-030). The first takes the karigar row `for share`, so a deactivation (`for update`) and a job insert for the same karigar cannot both succeed.

### Sentences

- "Only the owner can add a karigar or change their wastage allowance." (every owner write except the account link)
- "Only the owner can give a karigar portal access." (`linkKarigarAccount`)
- "Add the karigar name." / "Pick at least one thing they are best at."
- "The wastage allowance is between 0.6% and 1.2%." (a `rule_refused`; 0.705% is a `validation` refusal because it is not a whole basis point)
- "This phone number is already used by another account."
- "KG-04 has open jobs: MO-2026-118. Hand them over before deactivating."
- "This karigar is already deactivated." / "This karigar is already active."
- "This karigar already has an account." / "This karigar is deactivated. Reactivate them before giving portal access."
- "<name> is no longer active. Pick another karigar." / "Say which karigar it came from."

## Before giving portal access
The migration and seed give each existing karigar the placeholder email `<code>@example.com`. Mail sent to it goes nowhere. Correct the email before giving a karigar portal access.
## Interim scorecard sources

EP-18 (ledger), EP-19 (per-job allowance and settlement) and EP-23 (parcel gaps) are not merged, G4 and G23 are undecided (FU-029). Figures are computed on read from existing tables, in integers.

- Open job: `karigar_jobs.status <> 'handed_over'`. Gold with the karigar: sum of `gold_issued_units` of open jobs.
- Finished job: `karigar_jobs.settled_at is not null`.
- Metal loss: sum of `parcels.loss_units` (null counts 0) of the released parcels of finished jobs, times 10,000, divided by the sum of `gold_issued_units` of finished jobs, rounded half up, in basis points. No finished job gives `null` ("None yet").
- Days late: for each finished job, `max(0, handover date - agreed date)` in Asia/Kolkata days. Agreed is `coalesce(confirmed_date, due_date)`, handover is `coalesce(parcels.arrived_at, settled_at)`. The sum is returned with `finishedJobs`.
- Last gaps: `abs(gap_net_units)` of the karigar's released parcels, newest `released_at` first, six at most. The average is a whole number of units, half up.
- `rating` is never returned.

## Acceptance criteria map

Test files are under `packages/api/test/` unless a package is named.

| Story | Where it is built | Tests |
| --- | --- | --- |
| S1 schema, allowance check, code counter | migration, `db/seed/seed-database.ts`, `db/versioned.ts` | `db/karigar-schema.test.ts`, `db/seed.test.ts`, `db/master-records.test.ts` (AC3 reference to EP-15 open) |
| S2 owner only, before validation | `OPERATION_RULES` in `packages/shared/src/permissions/permissions.ts` | `karigars/karigar-writes.test.ts`, `karigars/scorecard.test.ts`, `manifest/operation-coverage.test.ts` |
| S3 add | `karigars/onboard-karigar.ts`, `packages/shared/src/domain/karigars.ts` | `karigars/karigar-writes.test.ts`, shared `karigars.test.ts`, web `karigar-screens.test.tsx` |
| S4 edit | `karigars/update-karigar-details.ts` | `karigars/karigar-writes.test.ts` |
| S5 allowance | `karigars/update-karigar-wastage.ts`, `readAllowanceInForce` | `karigars/karigar-writes.test.ts`, `karigars/active-check.test.ts` (AC4 open) |
| S6 link account | `karigars/link-karigar-account.ts` | `karigars/karigar-link.test.ts` |
| S7 deactivate, reactivate | `karigars/update-karigar-status.ts` | `karigars/karigar-writes.test.ts`, `karigars/active-check.test.ts` (AC4 race; AC2 open) |
| S8 picker, active check | `karigars/list-karigar-picker.ts`, `active-check.ts`, web `KarigarPicker.tsx` | `karigars/picker-and-profile.test.ts`, `karigars/active-check.test.ts`, web `karigar-screens.test.tsx` (not used on the order screens) |
| S9 directory | `karigars/list-karigars.ts`, web `Karigars.tsx`, `query/event-query-map.ts` | `karigars/directory.test.ts`, web `karigar-screens.test.tsx`, web `event-query-map.test.ts` |
| S10 computed figures | `karigars/scorecard.ts`, `packages/shared/src/domain/karigars.ts` | `karigars/scorecard.test.ts`, shared `karigars.test.ts` |
| S11 scorecard | `karigars/read-karigar-scorecard.ts`, web `Karigars.tsx` | `karigars/scorecard.test.ts` |
| S12 own profile | `karigars/read-my-karigar-profile.ts` | `karigars/picker-and-profile.test.ts` (no screen yet) |
| S13 audit | `audit/audit-writer.ts` through every handler; kinds in `packages/shared/src/domain/audit-log.ts` | `karigars/karigar-audit.test.ts`, `audit/every-operation-audits.test.ts`, shared `audit-log.test.ts` |
