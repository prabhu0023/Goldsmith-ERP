# Audit log (EP-06)

Every change to the books writes one row in `audit_entries`, in the same transaction as the change. Rows are only ever inserted and read: the database refuses UPDATE, DELETE and TRUNCATE, and the api's role cannot switch that off. The owner reads the log on the Security log screen (`security` route), served by `listAuditEntries` and `readAuditEntry` ([api.md](api.md)).

## Model

Columns of `audit_entries` (migrations `0009_audit_entries.sql` and `20261122T1732_ep06_audit_log.sql`). The story's names are on the left where they differ.

| Story name | Column | Notes |
| --- | --- | --- |
| id | `id` | uuid; `readAuditEntry` takes it |
| at | `at` | `timestamptz`, the server clock (`ctx.at`), UTC |
| actor id, name, role | `actor_id`, `actor_name`, `actor_role` | role `owner`, `staff`, `karigar`, `system` or `setup`; `actor_id` null for System and setup |
| entity type, entity id | `entity_type`, `entity_id` | type one of `AUDIT_ENTITY_TYPES` (no `invoice`); id is the record's code (`LD-2026-213`, `KG-04`, a setting key), else its uuid (users, sessions). Required on every new row; rows from before EP-06 keep nulls |
| action | `kind` | one of `AUDIT_ACTIONS` |
| summary | `summary` | a short sentence, e.g. "Lead LD-2026-213 marked lost" |
| before, after | `before_value`, `after_value` | `jsonb`, only the fields that changed; null before for a create |
| reason | `reason` | as typed, phones and emails masked |
| token reference | `token_reference` | the record id of the token that authorised the change (`piece_edits.token_ref`), never the token |
| ref | `reference` | the tag, batch, job or run code; for a correction, the id of the entry it corrects |
| | `detail` | free text kept from EP-02/EP-04 (sign-in entries store JSON facts here) |

Weights in before and after are integers of 0.0001 g (`grossG: 486500` is 48.6500 g). Money fields never reach an entry (value fields stay off until EP-42). Secret-like keys (`code`, `token`, `password`, `link`, `secret`, `tokenHash`, …) are dropped; `requireEditToken` is the one exemption (`NOT_SECRET_KEYS` in `packages/api/src/audit/redact.ts`).

## Kinds and groups

`packages/shared/src/domain/audit-log.ts` holds the one list `AUDIT_ACTIONS`: the 10 prototype kinds, EP-04's sign-in kinds, EP-10's job kinds, EP-05's user kinds and the 25 EP-06-S7 kinds for transitions that arrive in later epics. `AUDIT_ACTION_LABELS` names each on the screen, `AUDIT_ACTION_ENTITY` gives its default entity type. The database check `audit_entries_kind_check` holds exactly this list (`audit-store.test.ts` compares them). A migration that adds kinds widens the check with the order-safe DO block ([parallel-lanes.md](parallel-lanes.md)); kinds and entity types use only `a-z` and `_`.

`AUDIT_GROUPS` are the screen's filter buttons, as in the prototype: Everything, Tag edits (`edit_applied`, `edit_refused`), Parcels and losses (`loss_accepted`, `parcel_sent_back`, `parcel_last_digit`), Problems (`problem_cleared`), Scrap (`scrap_marked`, `scrap_declined`), Stock-out (`stock_out`), Rules (`setting_changed`). A kind is in at most one group; every newer kind is under Everything only.

## Writing entries

`appendAudit(client, entry)` in `packages/api/src/audit/audit-writer.ts` is the only code that inserts into `audit_entries`. It runs on the operation's transaction client, so a rolled-back operation leaves no entry and a failed insert rolls the operation back. It refuses an entry before the insert when the kind or entity type is unknown, the entity id is empty, the token reference looks like a token (4 to 8 digits) or a weight key holds anything but an integer.

The older writers keep their signatures and call it: `writeAuthAudit` (sign-in), `writeUserLifecycleAudit` (users), `writeJobAudit` and `writeUserAudit` (jobs and `retryJobRun`). A service function uses `auditChange(tx, ctx, change)`, which stores only the changed fields of `before` and `after`, with the session user as actor and `ctx.at` as time:

```ts
await auditChange(tx, ctx, {
  kind: 'lead_lost',
  entityId: lead.code,
  ref: lead.code,
  reason: input.reason ?? null,
  summary: `Lead ${lead.code} marked lost`,
  before: { state: lead.state, note: lead.note },
  after: { state: 'lost', note },
});
```

### Adding a state-changing operation

1. Call `auditChange` (or `appendAudit`) in the handler, in its transaction. When the call changes nothing, call `auditNoChange(tx.client)` instead (`packages/api/src/audit/audited-operation.ts`).
2. Add the operation to `OPERATION_AUDIT_KINDS` (or `AUTH_OPERATION_AUDIT_KINDS`) in `packages/shared/src/contract/audit-contract.ts` with its kinds, the always-written one first; reads and lists map to `null`. `npm run typecheck` fails until it is there.
3. Add a case to `AUDIT_CASES` in `packages/api/test/audit/every-operation-audits.test.ts`. The guard fails with `<op> has no audit case` until it is there.

The registry wraps every operation whose entry is not null (`requireAudit`): if the handler returns without an entry, or writes a kind it does not declare, the operation throws, the transaction rolls back and the caller gets `internal`; the log names the operation.

## System actors

The actor always comes from the session, never from the request body. A job writes as `System (<label>)` (e.g. `System (SLA breach job)`), role `system`, no actor id. Integrations use the fixed names in `SYSTEM_ACTORS`: `Scheduler` and `WhatsApp intake`. The screen shows `auditActorLabel(entry)`: "Sanjay Seth (owner)", "Scheduler (System)", "SLA breach job (System)".

## Application role

The api connects as `goldsmith_app` (`APP_DATABASE_URL`), which has only `SELECT` and `INSERT` on `audit_entries` and owns no table; migrations, seed and dev tools connect as the owner (`DATABASE_URL`). In staging and production the api refuses to start when its connection can change audit entries. Details: [database.md](database.md) "Application role". Deploy-time work is FU-008 ([followups.md](../followups.md)).

## State-changing operations

| Operation | Path | Kinds (first = always written) |
| --- | --- | --- |
| `markLeadLost` | `/api/ops` | `lead_lost` |
| `retryJobRun` | `/api/ops` | `job_run_retried` |
| `createUser` | `/api/ops` | `user_added`, `activation_link_sent` |
| `resendActivation` | `/api/ops` | `activation_link_sent` |
| `updateUserProfile` | `/api/ops` | `user_edited` |
| `updateUserRole` | `/api/ops` | `role_changed`, `sessions_ended` |
| `deactivateUser` | `/api/ops` | `user_deactivated`, `sessions_ended` |
| `reactivateUser` | `/api/ops` | `user_reactivated` |
| `unlockUser` | `/api/ops` | `account_unlocked` |
| `linkKarigar` | `/api/ops` | `karigar_linked` |
| `setSetting` | `/api/ops` | `setting_changed` |
| `signIn` | `/api/auth` | `signed_in`, `sign_in_failed`, `sign_in_locked` |
| `signOut` | `/api/auth` | `signed_out` |
| `requestPasswordReset` | `/api/auth` | `password_reset_requested` (an unknown phone writes nothing) |
| `activateAccount` | `/api/auth` | `password_set` |
| `resetPassword` | `/api/auth` | `password_reset` |
| `createFirstOwner` | `/api/auth` | `first_owner_created`, `activation_link_sent` |
| job `lead-sla-breach` | scheduler | `lead_marked_late` |
| job `karigar-overdue` | scheduler | `job_marked_overdue`, `job_reminder_sent` |
| job `edit-token-expiry` | scheduler | `edit_token_expired` (with the token reference) |
| job `lead-sla-timers` | scheduler | exempt: reschedules job-internal timer rows only |
| job `wishes-9am` | scheduler | exempt: emits an outbox event only, no record changes |

Reads write nothing: `listJobRuns`, `listMyJobs`, `readMyJob`, `listUsers`, `listAuditEntries`, `readAuditEntry`, `readCurrentSession`, `checkPasswordLink`. Which operations write a second entry, and whether that is right, is FU-009.

**Covered by rule.** These operations arrive in EP-18 onward. Each has its kind in `TRANSITION_AUDIT_KINDS` and must be added to `OPERATION_AUDIT_KINDS` and `AUDIT_CASES` when it is ported, or typecheck and the guard fail: `createLead`, `confirmLead`, `startWorkingLead`, `routeLeadItemToStock`, `createOrderCopyAndJob`, `acceptJob`, `startJob`, `markJobReady`, `handOver`, `recordParcelArrival`, `saveTag`, `qcTick`, `releaseParcel`, `ownerRecheckTag`, `raiseProblem`, `proposeEdit`, `ownerAgreeEdit`, `requestScrap`, `onboardCustomer`, `onboardKarigar`, `onboardStaff`, `sendWishes`, `sendBroadcast`, `upsertScale`, plus the prototype-audited `applyEdit`, `refuseEdit`, `ownerSendBack`, `ownerAcceptLoss`, `clearProblem`, `stockOut`, `ownerScrap`, `ownerDeclineScrap` (the 10 prototype kinds). `releaseHold` has no kind: v1 has no holds.

## Reading the log

`listAuditEntries` orders by `at desc, id desc` with the shared cursor (`packages/api/src/audit/audit-reads.ts`). Every filter is a where clause, so the next page keeps it: `group` (the group's kinds), `entity` (entity id or reference), `actorId`, `actorRole`, and `from`/`to` as Asia/Kolkata days (`at >= from 00:00 IST` and `at < the day after to, 00:00 IST`). The indexes `(shop_id, at)`, `(shop_id, kind, at)`, `(shop_id, actor_id, at)` and `(shop_id, entity_id)` serve them; with 40,000 entries in one shop the first page answers well under 2 seconds in the test.

The screen (`packages/web/src/components/settings/SecurityLog.tsx`, state helpers in `security-log-state.ts`) is shown only when the session may call `listAuditEntries`; everyone else sees "Only the owner can read the security log.", and the staff and karigar rails have no Security log item. It loads from the server with the group buttons, an entity field, a who select (users from `listUsers`, plus System) and from/to dates; "Load more" follows `nextCursor`. It shows "Loading the security log…", the server's message with Retry, or "Reconnecting…" while offline (and reloads when the connection returns). A row opens the entry in a drawer: actor, IST time, record, action, reason, "Token used" (never the reference), each changed field before → after, and "Corrects an earlier entry" for a correction.

## Acceptance criteria map (S1–S12)

Api tests are in `packages/api/test/audit/` unless noted; shared tests in `packages/shared/test/`, web tests next to the screen.

| Story | AC | Code | Test |
| --- | --- | --- | --- |
| S1 | 1 columns | `20261122T1732_ep06_audit_log.sql` | `audit-store.test.ts` "EP-06-S1 AC1: has every column of an entry" |
| S1 | 2 app role cannot UPDATE or DELETE | migration grants, `src/db/app-role.ts` | `audit-store.test.ts` "EP-06-S1 AC2: as goldsmith_app, UPDATE, DELETE, TRUNCATE and disabling the trigger fail with 42501" |
| S1 | 3 no update or delete operation | contract has only `listAuditEntries`, `readAuditEntry` | `audit-log-reads.test.ts` "S1 AC3: there is no operation that changes or removes an entry" |
| S1 | 4 entity `invoice` rejected | `audit_entries_entity_type_check`, `audit_entries_entity_present` | `audit-store.test.ts` "EP-06-S1 AC4: an entity type that is not a record of the app, or no entity, is rejected" |
| S1 | 5 grants INSERT, SELECT only | migration grants | `audit-store.test.ts` "EP-06-S1 AC5: goldsmith_app holds only INSERT and SELECT on audit_entries, and no other role can change it"; the staging check is FU-008 |
| S2 | 1 entry in the same transaction | `mark-lead-lost.ts` `auditChange` | `state-change-audit.test.ts` "S2 AC1, S3 AC1, S7 AC4: markLeadLost writes one lead_lost entry with only the changed fields" |
| S2 | 2 failed insert rolls back | `runInTransaction` | `state-change-audit.test.ts` "S2 AC2: when the audit insert fails the change rolls back and the caller gets internal" |
| S2 | 3 refused, forbidden or conflict: no entry | pipeline order | `state-change-audit.test.ts` "S2 AC3: a refused, forbidden or conflicting call writes no entry" |
| S2 | 4 unwrapped operation fails CI | `OPERATION_AUDIT_KINDS`, `requireAudit` | `audited-operation.test.ts` "a write without an entry answers 500 internal, …"; `every-operation-audits.test.ts` "every state-changing operation has an audit case"; shared `audit-contract.test.ts` |
| S2 | 5 commit order | `at desc, id desc`, `ctx.at` | `state-change-audit.test.ts` "S2 AC5: two changes read back newest first, in the order they committed" |
| S3 | 1 changed fields only | `changedFields` | `state-change-audit.test.ts` "S2 AC1, S3 AC1, S7 AC4" |
| S3 | 2 create: no before, phone masked | `writeUserLifecycleAudit` → `appendAudit` | `audit-writer.test.ts` "EP-06-S3 AC2"; `test/users/lifecycle-audit.test.ts` |
| S3 | 3 list field kept whole | `changedFields` | `settings-audit.test.ts` "S3 AC3: turning on email alerts stores the whole channel list before and after"; `audit-writer.test.ts` "EP-06-S3 AC3" |
| S3 | 4 secret keys left out | `redact.ts` `redactSecrets` | `audit-writer.test.ts` "EP-06-S3 AC4" |
| S3 | 5 no money field | `redact.ts` `stripMoney` | `audit-writer.test.ts` "EP-06-S3 AC5" |
| S4 | 1 token reference, no 6 digits | `appendAudit` `tokenReference` | `no-secrets.test.ts` "S4 AC1" (applyEdit itself arrives in EP-25) |
| S4 | 2 no password, link or code in any column | | `no-secrets.test.ts` "S4 AC2: no column of any entry holds a password, a link token or the edit code" |
| S4 | 3 type has `tokenReference`, nothing for the code | `AuditWrite`, `readAuditEntry` result | `audit-writer.test.ts` "EP-06-S4 AC3" |
| S4 | 4 no token: empty reference | `appendAudit` | `audit-writer.test.ts` "EP-06-S4 AC4" |
| S5 | 1, 3 integer units | `appendAudit` | `audit-writer.test.ts` "EP-06-S5 AC1, AC3" |
| S5 | 2 four decimals on screen | `formatAuditValue`, `AuditEntryDetail` | shared `audit-log.test.ts` "EP-06-S5 AC2"; `security-log.test.tsx` "S11 AC1, AC3" |
| S5 | 4 decimal grams rejected | `appendAudit` | `audit-writer.test.ts` "EP-06-S5 AC4" |
| S6 | 1 job actor is System | `writeJobAudit` | `audit-writer.test.ts` "EP-06-S6 AC1"; `test/jobs/system-audit.test.ts` |
| S6 | 2 integration actor | `SYSTEM_ACTORS` | `audit-writer.test.ts` "EP-06-S6 AC2" |
| S6 | 3 body cannot act as System | actor from `ctx.by` | `state-change-audit.test.ts` "S6 AC3" |
| S6 | 4 filter by System | `listAuditEntries` `actorRole` | `audit-log-reads.test.ts` "S6 AC4, S8 AC5" |
| S7 | 1, 2 kind list | `AUDIT_ACTIONS`, `TRANSITION_AUDIT_KINDS` | shared `audit-log.test.ts` "EP-06-S7 AC1", "EP-06-S7 AC2" |
| S7 | 3 karigar hand-over | kind `job_handed_over` (covered by rule) | `state-change-audit.test.ts` "S7 AC3" |
| S7 | 4 markLeadLost kind | `lead_lost` | `state-change-audit.test.ts` "S2 AC1, S3 AC1, S7 AC4" |
| S7 | 5 database accepts a new kind | migration DO block | `audit-store.test.ts` "EP-06-S7 AC5" |
| S7 | 6 every operation tested | `AUDIT_CASES` | `every-operation-audits.test.ts` "%s writes an entry of a declared kind" |
| S8 | 1–4 settings | `src/settings/set-setting.ts` | `settings-audit.test.ts` "AC1" to "AC4" |
| S8 | 5 Rules filter | group `rules` | `audit-log-reads.test.ts` "S6 AC4, S8 AC5" |
| S9 | 1 title, subtitle, loaded from the server | `SecurityLog.tsx`, `listAuditEntries` | `security-log.test.tsx` "S9 AC1"; `audit-log-reads.test.ts` "S9 AC1, AC2" |
| S9 | 2 row text, 14:32 IST | `AuditLogRow`, `fmtAuditTime`, `auditActorLabel` | `security-log.test.tsx` "S9 AC2"; `audit-log-reads.test.ts` "S9 AC1, AC2"; shared `audit-log.test.ts` "EP-06-S9 AC2" |
| S9 | 3 next page by cursor | `listEntries`, `afterAuditAnswer` | `audit-log-reads.test.ts` "S9 AC3"; `security-log.test.tsx` "S9 AC3, AC4" |
| S9 | 4 loading, error with retry, reconnecting | `securityLogNotice`, `SecurityLogStatus` | `security-log.test.tsx` "S9 AC4" |
| S9 | 5 empty sentence | `AuditEntries` | `security-log.test.tsx` "S9 AC5"; `audit-log-reads.test.ts` "S9 AC5" |
| S9 | 6 under 2 s with a year of entries | indexes | `audit-log-reads.test.ts` "S9 AC6" (40,000 entries; staging measurement waits on D1a) |
| S10 | 1 Tag edits, pressed | group filter, `AuditGroupButtons` | `audit-log-reads.test.ts` "S10 AC1"; `security-log.test.tsx` "S10 AC1" |
| S10 | 2 entity id or ref | `entity` filter | `audit-log-reads.test.ts` "S10 AC2" |
| S10 | 3 actor and IST dates | `actorId`, `from`/`to` via `shopDateTime` | `audit-log-reads.test.ts` "S10 AC3"; "S10: an end date before the start date is refused on the field to" |
| S10 | 4 filter kept across pages | where clauses + cursor | `audit-log-reads.test.ts` "S10 AC4" |
| S10 | 5 groups once in shared | `AUDIT_GROUPS` | shared `audit-log.test.ts` "EP-06-S10 AC5" |
| S11 | 1 weights, actor, IST, reason, "Token used" | `readAuditEntry`, `AuditEntryDetail` | `audit-log-reads.test.ts` "S11 AC1"; `security-log.test.tsx` "S11 AC1, AC3" |
| S11 | 2 lead lost state and reason | | `audit-log-reads.test.ts` "S11 AC2"; `security-log.test.tsx` "S11 AC2" |
| S11 | 3 "Scheduler (System)" | `auditActorLabel` | `security-log.test.tsx` "S11 AC3"; shared `audit-log.test.ts` "EP-06-S11 AC3" |
| S11 | 4 unknown id: `not_found` | `readEntry` | `audit-log-reads.test.ts` "S11 AC4" |
| S11 | 5 correction links the earlier entry | `corrects`, "Corrects an earlier entry" | `audit-log-reads.test.ts` "S11 AC5"; `security-log.test.tsx` "S11 AC5" |
| S12 | 1 staff list: `forbidden` | `OPERATION_RULES.listAuditEntries`, `matrixPermissionCheck` | `audit-log-reads.test.ts` "S12 AC1"; `test/permissions/role-matrix.test.ts` |
| S12 | 2 karigar read: `forbidden` | `OPERATION_RULES.readAuditEntry` | `audit-log-reads.test.ts` "S12 AC2"; `role-matrix.test.ts` |
| S12 | 3 staff screen and rail | `SecurityLog.tsx` `can('listAuditEntries')`, `nav.ts` | `security-log.test.tsx` "S12 AC3"; `packages/web/src/nav.test.ts` "EP-06-S12 AC3" |
| S12 | 4 no session: `unauthenticated` | session check | `audit-log-reads.test.ts` "S12 AC4"; `role-matrix.test.ts` "AC5" |
