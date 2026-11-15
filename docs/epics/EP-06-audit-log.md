# EP-06: Audit log

## 1. Summary

This epic gives the shop a permanent record of every change to its books. A jewellery business carries gold on
trust: when a tag weight is edited, a loss is accepted or a piece is scrapped, the owner must later be able to see
who did it, when, what the values were before and after, and why. The record must not be editable by anyone,
including the owner. This epic builds an append-only audit store, makes every state-changing operation write to it,
and moves the existing Security log screen onto the real data.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Partial. An `audit()` helper, the `AuditEntry` type, 10 `AuditKind` values and the `security` screen exist, but only some transitions write entries, entries live in editable memory, and there are no before and after fields.

## 3. Roles involved

- Owner: reads the audit log on the Security log screen, filters by kind, entity and date. Cannot edit or delete entries.
- Staff: their actions are recorded; they cannot read the log.
- Karigar: their actions (accept, status changes, hand-over, raise a problem) are recorded; they cannot read the log.
- System: writes an entry in the same transaction as every state change; records system actors such as the scheduler.

## 4. In scope

- An append-only audit store with no update or delete path for any role, including the owner.
- Entry fields: actor, actor role, time, entity type, entity id, action, before, after, reason, token reference.
- A write on every state-changing operation, inside the same transaction, so a change without an entry cannot commit.
- Extending the action list beyond today's 10 kinds to every transition, including those not audited today.
- Recording a token reference, never the token value, for edits (the owner edit code); passwords and activation or reset links are never recorded.
- Weights in entries recorded as integers in units of 0.0001 g and shown at four decimals.
- The owner-only Security log screen on real data, with filters and pagination.
- Optional tamper evidence (for example a hash chain), listed as an option to decide.

## 5. Out of scope

- The operations that produce entries; each feature epic calls the audit writer (EP-18 to EP-43).
- Sign-in events are written by EP-04 using this store.
- DPDP deletion and export flows (EP-39); the conflict with append-only is recorded as gap G22.
- Backups of the audit store (EP-38).
- Application logs for debugging and error tracking (EP-37); those are not the audit log.
- Reports built from audit data (EP-35).

## 6. Current state in the prototype

- `src/store/transitions.ts` `audit(s, {at, by, kind, summary, detail, ref})` prepends an `AuditEntry` to `state.audit` with an `AU-` id.
- `src/types/jewellery.ts` `AuditEntry {id, at, actorName, actorRole, kind, summary, detail, ref}`. There are no before or after fields, no entity type, and no token reference.
- `AuditKind` has 10 values: `edit_applied`, `edit_refused`, `loss_accepted`, `parcel_sent_back`, `parcel_last_digit`, `problem_cleared`, `scrap_marked`, `scrap_declined`, `stock_out`, `setting_changed`.
- Transitions that write today: releaseParcel (only on the last-digit case), ownerSendBack, ownerAcceptLoss, clearProblem, applyEdit, refuseEdit, stockOut, ownerScrap, ownerDeclineScrap, setSetting (except `pricingEnabled`).
- Not audited today: lead transitions (createLead, confirmLead, startWorkingLead, markLeadLost, routeLeadItemToStock, releaseHold; v1 drops holds, so `releaseHold` is not carried over), order copy and job transitions (createOrderCopyAndJob, acceptJob, startJob, markJobReady, handOver), parcel arrival, saveTag, qcTick, plain releaseParcel on an exact match, ownerRecheckTag, raiseProblem, proposeEdit, ownerAgreeEdit, requestScrap, onboarding (customer, karigar, staff), sendWishes, sendBroadcast, simulateReply, upsertScale, and the pricing flag.
- `applyEdit` writes detail text "Token ${edit.token}", the token value in plain text. This conflicts with PRODUCTION-SCOPE §5 ("never logged in plain text"); production stores a token reference.
- `src/components/settings/SecurityLog.tsx` (route `security`): "Owner only"; non-owners see "Only the owner can read the security log."; filter groups Everything, Tag edits, Parcels and losses, Problems, Scrap, Stock-out, Rules; subtitle "Entries are never edited or removed."
- Reusable: the `audit()` call sites as the starting list; `AuditEntry` fields; the SecurityLog screen and its filter groups.
- Must be rebuilt server-side: the append-only store, transactional writes, before and after snapshots, token references, coverage of every transition, and owner-only reads with pagination.

## 7. Functional requirements

- FR-06-1. Every state-changing operation writes exactly one audit entry in the same transaction as the change.
- FR-06-2. If the audit write fails, the state change is rolled back.
- FR-06-3. Each entry records actor id, actor name, actor role, server time in UTC, entity type, entity id, action, before values, after values, reason (when given) and token reference (when a token was used).
- FR-06-4. No operation exists to update or delete an audit entry, and a direct attempt through any role is refused.
- FR-06-5. Entries for edits record a token reference and never the 6-digit token value.
- FR-06-6. Weight values in before and after are stored as integers in units of 0.0001 g and displayed at four decimals.
- FR-06-7. Actions by the scheduler or integrations are recorded with a System actor.
- FR-06-8. The owner can list audit entries newest first, filtered by kind group, entity, actor and date range, one page at a time.
- FR-06-9. A staff or karigar user who requests the audit log is refused.
- FR-06-10. Every transition named in section 6 as "not audited today" writes an entry in production.
- FR-06-11. A change to the `pricingEnabled` setting writes an entry like any other setting.

## 8. Business rules

- BR-06-1. The audit log is append-only and records actor, time, entity, action, before, after, reason and token reference; there is no update or delete path, including for the owner. [PRODUCTION-SCOPE §5 Audit]
- BR-06-2. Every state change records who did it, when, and the before and after values; the record cannot be edited. [PRODUCTION-SCOPE §1 Auditable]
- BR-06-3. Tokens are never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-06-4. Only the owner reads the security log. [src/components/settings/SecurityLog.tsx]
- BR-06-5. Every edit, accepted loss, cleared problem, scrap and rule change shows who, when and why. [src/components/settings/SecurityLog.tsx]
- BR-06-6. An applied edit leaves an audit entry. [PRODUCTION-SCOPE §6 EP-25 scope; mockup 05]
- BR-06-7. Weights are stored as integers in units of 0.0001 g, so they are shown at four decimals. [PRODUCTION-SCOPE §5 Precision]
- BR-06-8. Write on every transition, with the existing Security log as the owner view. [PRODUCTION-SCOPE §6 EP-06 scope]

## 9. Data

- AuditEntry: id, at (UTC), actor id, actor name, actor role (`owner`, `staff`, `karigar`, or System), entity type (piece, parcel, lead, job, edit, problem, scrap request, stock-out, setting, user, scale, karigar, customer, broadcast, wish), entity id, action (extends today's `AuditKind`), summary, before (structured), after (structured), reason, token reference, ref (human reference such as `TAG-8841` or `BATCH-2026-044`).
- Any weight inside before or after (for example `grossG`, `stoneG`, `lossG`, `gapNetG`, `deltaG`) is an integer, units of 0.0001 g.
- Money fields never appear in entries until EP-42 turns on the value sockets.
- Optional: previous entry hash for tamper evidence.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Append | Audit entry | Record a state change inside the operation's transaction (internal) | System only, from service functions |
| List | Audit entries | Page through entries with filters | Owner |
| Read | Audit entry | See one entry with before and after values | Owner |
| Update / Delete | Audit entry | Not offered; refused for every caller | Nobody |

## 11. Live events

None. The audit log records changes but does not push events. A new entry appearing on an open Security log screen is
not in the catalogue and is not required; the owner reloads the page or pages forward.

## 12. Screens and UX references

- Route id: `security` (SecurityLog, owner rail, "Security log").
- No dedicated mockup. The owner rail in `08-owner-home.svg` and `13-notifications-escalation.svg` shows where it lives; `03-showroom-stock.svg` and `05-edit-propose-apply.svg` show actions that create entries.
- Not yet designed (MOCKUP-COVERAGE §3): Security log list and filters. The prototype version was built without a mockup and needs a design pass.

## 13. Non-functional requirements

- Audit: append-only, enforced by storage permissions as well as by the API, so even a developer tool cannot update rows in production.
- Security: token values never stored; the reference points to the hashed token record.
- Precision: weights in before and after are integers in units of 0.0001 g.
- Personal data: entries may include customer names (for example on stock-outs and wishes); the DPDP deletion conflict is G22.
- Concurrency: entries are written in the operation's transaction, so order matches commit order.
- Performance: the Security log first page loads under 2 seconds with a year of entries.
- Time: stored in UTC, shown in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05
- Downstream: EP-18, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given an owner applies an edit to TAG-8841 changing gross weight, when the operation commits, then one entry exists with before and after gross weights at four decimals and a token reference, and no 6-digit token.
2. Given any audit entry, when the owner or any other caller tries to change or delete it, then the request is refused.
3. Given a staff member, when they request the audit log, then the server refuses.
4. Given the audit write fails during a stock-out, when the operation ends, then the piece is still in stock.
5. Given the karigar hands over a job, when the operation commits, then an entry exists with the karigar as actor.
6. Done when every operation in the EP-03 catalogue has a test that checks it writes an entry.

## 16. Risks

- Risk: a later epic adds an operation and forgets the audit write. Mitigation: the service-layer wrapper writes the entry, so an operation cannot run without it; EP-40 checks every operation.
- Risk: the plain-text token habit from `applyEdit` is ported. Mitigation: the entry type has a token reference field and no field that can hold the code.
- Risk: before and after snapshots grow large and slow the log. Mitigation: store only changed fields.
- Risk: a deletion request under DPDP cannot be met without editing entries. Mitigation: record as G22 and decide with EP-39 before launch.
- Risk: the owner expects to correct a wrong entry. Mitigation: corrections are new entries that reference the old one.

## 17. Open decisions and questions

- How long are audit entries kept?
- G22: how does a DPDP deletion request apply to entries that contain a customer's name, given the log is append-only?
- Are reads of the audit log themselves audited?
- Can the owner export the log, and in what format?
- Is tamper evidence (a hash chain) required, or are storage permissions enough?
- Which new action kinds are named for the transitions not audited today?

## 18. Candidate stories

1. EP-06-S1: System can store audit entries that cannot be updated or deleted
2. EP-06-S2: System can write an audit entry in the same transaction as every state change
3. EP-06-S3: System can record before and after values for each change
4. EP-06-S4: System can record a token reference instead of the token value
5. EP-06-S5: System can record weights in entries as integer units of 0.0001 g
6. EP-06-S6: System can record actions taken by the scheduler and integrations
7. EP-06-S7: System can audit lead, job, parcel, problem, edit-proposal and onboarding transitions not audited today
8. EP-06-S8: System can audit the pricing flag and every other setting change
9. EP-06-S9: Owner can list audit entries newest first, one page at a time
10. EP-06-S10: Owner can filter the log by kind group, entity, actor and date
11. EP-06-S11: Owner can open one entry and see before and after values
12. EP-06-S12: System can refuse audit reads by staff and karigars
