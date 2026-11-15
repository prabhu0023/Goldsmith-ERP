# EP-38: Backup and recovery

## 1. Summary

The database holds the shop's gold custody: every piece, parcel, weighing, pool ledger entry and audit entry. Losing
it means losing the record of which gold is where. This epic sets up automated daily backups of the database and
of the file storage that holds photos and PO attachments, point-in-time restore so the system can be rolled back to
any moment, and a written, tested restore drill. The target is to lose less than one hour of work in the worst case.
Restores must keep the append-only audit log whole.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: N/A. The prototype holds all data in browser memory from `src/data/seed.ts` and resets on reload, so there is nothing to back up.

## 3. Roles involved

- Owner: approves the recovery targets and the backup region; is told when a restore is needed and what window of work was lost.
- Staff: not involved, except re-entering work done after the restore point if a restore happens.
- Karigar: not involved, except resending status updates queued after the restore point.
- System: runs scheduled backups, keeps the continuous log for point-in-time restore, copies file storage, checks backups, and alerts on a failed backup.

## 4. In scope

- Automated daily backups of the database.
- Point-in-time restore with a recovery point under 1 hour.
- Backup of object storage (piece photos, reference images, PO attachments, bench photos).
- Backups stored in a separate location from the live data, in the region decided under D10.
- Encryption of backups at rest.
- A retention period for backups.
- A documented restore drill, run in staging on a schedule, with the time taken recorded.
- A restore test before launch.
- An alert when a backup fails (through EP-37).
- A procedure for what happens after a restore: which work is lost, how staff are told, how sent WhatsApp messages and live clients are handled.

## 5. Out of scope

- The schema and migrations (EP-02).
- Monitoring and the alert channel itself (EP-37).
- File storage, upload and access rules (EP-09).
- Deletion requests under the DPDP Act and their effect on backups (EP-39, gap G22).
- Reconnect and catch-up of live clients (EP-07).
- Environment setup and secrets for backup credentials (EP-01).

## 6. Current state in the prototype

- `src/store/StoreProvider.tsx` builds the in-memory `AppState` from `src/data/seed.ts` and `src/data/seedRows.ts` on load; every reload resets it.
- `src/assets/images/` holds four bundled JPEGs referenced from `src/data/images.ts`; no uploaded files exist.
- `AuditEntry` rows in memory can be overwritten by any code path; there is no append-only store to preserve.
- Reusable: `src/data/seed.ts` can seed a staging database used for restore drills.
- Must be rebuilt server-side: all of it. Backups, point-in-time restore, file storage copies, drills and alerts are new.

## 7. Functional requirements

- FR-38-1. The database is backed up automatically at least once a day.
- FR-38-2. The database can be restored to any point in time within the retention window, with a recovery point under 1 hour.
- FR-38-3. Object storage is backed up so that every file referenced by a database row at the restore point can be restored.
- FR-38-4. Backups are stored apart from the live database and in the region decided under D10.
- FR-38-5. Backups are encrypted at rest and readable only by the operator role.
- FR-38-6. A failed or missing daily backup raises an alert through EP-37.
- FR-38-7. A written restore drill names each step, who does it and how long it takes.
- FR-38-8. The restore drill is run in staging before launch and then on the agreed schedule, and each run is recorded with its date and duration.
- FR-38-9. After a restore, the audit log contains every entry up to the restore point and no entry is altered.
- FR-38-10. After a restore, open clients reconnect and refetch state, so no screen shows data from after the restore point.
- FR-38-11. The restore procedure says how to find WhatsApp messages and OTPs sent after the restore point and how staff are told what to re-enter.
- FR-38-12. Backups older than the retention period are deleted.

## 8. Business rules

- BR-38-1. Daily backups, point-in-time restore and a tested restore drill; recovery point under 1 hour. [PRODUCTION-SCOPE §5 Availability and recovery]
- BR-38-2. The audit log is append-only with no update or delete path, including for the owner. [PRODUCTION-SCOPE §5 Audit]
- BR-38-3. Every lead, parcel, tag, edit and stock-out survives a reload, a crash and a redeploy. [PRODUCTION-SCOPE §1 "Persistent"]
- BR-38-4. Host in India for latency and personal-data law (recommended, not decided). [PRODUCTION-SCOPE §4 D10]
- BR-38-5. Customer names, phones, birthdays and anniversaries in backups are personal data. [PRODUCTION-SCOPE §5 Personal data]
- BR-38-6. Weights restored are the same integers in units of 0.0001 g that were stored. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Backup record: id, kind (daily full, continuous log, file storage), started at, finished at, size, status, location.
- Restore drill record: date, environment, restore point chosen, duration, steps passed, notes, run by.
- No new business entities. Backups copy every table from EP-02, including weight fields (integer, units of 0.0001 g) and money sockets (nullable value socket, unused until EP-42), unchanged.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Backup | Run a scheduled or on-demand backup | System, Operator |
| List | Backups | See backups with status and time | Operator |
| Create | Restore | Restore the database and files to a point in time | Operator, with owner approval for production |
| Create | Restore drill record | Record a drill run and its duration | Operator |

## 11. Live events

- None. Backups do not emit business events. After a restore, clients rely on EP-07 reconnect and catch-up to refetch authoritative state.

## 12. Screens and UX references

- No screen of its own. The operator uses the hosting tools.
- Screens that depend on it: all routes, because every screen reads restored data after a restore.
- Mockups: none.

## 13. Non-functional requirements

- Availability and recovery: recovery point under 1 hour; recovery time target to be agreed and measured in each drill.
- Security: backup credentials live in environment configuration (EP-01); backups are encrypted; only the operator can restore.
- Personal data: backups hold customer personal data and follow the same region and retention rules; the effect of a deletion request on old backups is decided with EP-39.
- Audit: a production restore is recorded with who approved it, who ran it and the restore point.
- Precision: a restore test compares weight totals (integer units of 0.0001 g) before and after to prove no value changed.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-02
- Downstream: EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given production has run for a day, when the operator lists backups, then a daily backup from the last 24 hours shows as complete.
2. Given a staging database with known data, when the operator restores it to a time 30 minutes ago, then every row up to that time is present and nothing after it.
3. Given a restore, when the audit log is compared with the source up to the restore point, then every entry is present and unchanged.
4. Given a restored database, when a piece photo referenced at the restore point is opened, then the file loads.
5. Given the daily backup fails, when the failure is recorded, then the operator is alerted.
6. Done when the restore drill is written, run once in staging with its duration recorded, and signed off before launch.

## 16. Risks

- Risk: backups run but have never been restored. Mitigation: the drill restores in staging before launch and on a schedule.
- Risk: the database and file backups come from different times, leaving rows that point at missing photos. Mitigation: restore files to the same point and check references after each drill.
- Risk: WhatsApp messages and OTPs sent after the restore point cannot be unsent. Mitigation: the restore procedure lists them from provider logs and tells staff what to recheck.
- Risk: a deletion request removes a customer, then a restore brings them back. Mitigation: decide with EP-39 how deletions are reapplied after a restore (G22).
- Risk: backups stored outside India conflict with D10. Mitigation: choose the backup region with D10.

## 17. Open decisions and questions

- D10: in which region are backups stored?
- D1: on a managed platform, which backup and point-in-time features are included, and at what retention?
- What is the recovery time target (how long may the shop be down)?
- How long are backups kept?
- How often is the restore drill run after launch?
- G22: how is a DPDP deletion request handled in existing backups and after a restore?
- Who approves a production restore: the owner, the operator, or both?

## 18. Candidate stories

1. EP-38-S1: System can take a daily database backup
2. EP-38-S2: System can keep a continuous log for point-in-time restore
3. EP-38-S3: System can back up file storage
4. EP-38-S4: System can encrypt backups and keep them apart from live data
5. EP-38-S5: Operator can receive an alert when a backup fails
6. EP-38-S6: Operator can restore staging to a point in time
7. EP-38-S7: Operator can check that the audit log is whole after a restore
8. EP-38-S8: Operator can follow a written restore drill and record its duration
9. EP-38-S9: Operator can list sends made after a restore point for follow-up
10. EP-38-S10: System can delete backups after the retention period
