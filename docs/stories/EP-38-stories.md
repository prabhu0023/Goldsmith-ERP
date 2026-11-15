# EP-38: Backup and recovery · stories

Epic document: [EP-38 Backup and recovery](../epics/EP-38-backup-and-recovery.md)

Role note: this is a layer E operations epic with no shop-facing screen. Stories use "System" for the backup service, the continuous log and the scheduler acting on their own, and "Developer" for the operator, the person who runs backups, restores and drills with the hosting tools. The Owner approves a production restore and is told what window of work was lost; who exactly approves is an open question, so criteria say "the agreed approver". Seed users named in criteria are Sanjay Seth (Owner), Rajesh Verma (Staff) and Lakshmi Devi (Karigar). The database is managed PostgreSQL (D1, Option C), so its backup and point-in-time features come from the D1a cloud provider; backups stay in an India region (D10, decided).

---

## EP-38-S1: System can take a daily database backup

- **Story ID:** EP-38-S1
- **Title:** System can take a daily database backup
- **As a:** System
- **I want:** to take a full backup of the production and staging databases at least once a day on a schedule, and write a backup record for each run
- **So that:** every piece, parcel, weighing, pool ledger entry and audit entry survives a crash, a bad deploy or a lost host (FR-38-1, BR-38-1, BR-38-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given production has run for a day, when the operator calls List backups, then a backup of kind `daily full` from the last 24 hours shows with status `complete`, started at, finished at, size and location (epic acceptance criterion 1).
  2. Given the daily backup schedule, when the scheduled time passes, then exactly one daily full backup is started for each environment, and a second start for the same day is not made.
  3. Given a daily backup in progress, when Rajesh Verma tags a piece at the counter, then the tag is saved normally and the counter does not wait for the backup.
  4. Given a completed daily backup, when it is restored into an empty staging database, then every table from EP-02 is present with the same row counts as the source at backup time.
  5. Given the backup, when the weight fields of `Piece` and pool ledger entries are compared with the source, then the integers in units of 0.0001 g are identical, and nullable money sockets stay null (BR-38-6).
- **Rules enforced on the server:** Create Backup may be called only by the System schedule or an operator (epic section 10). One daily full backup per environment per day. Backup credentials come from environment configuration (EP-01-S6), never from code.
- **Live events emitted / consumed:** None. Backups do not emit business events (epic section 11).
- **Audit entry written:** No. A backup changes no business state; the backup record holds kind, started at, finished at, size, status and location.
- **Data changes:** Adds a Backup record (id, kind `daily full` / `continuous log` / `file storage`, started at, finished at, size, status, location), kept in the hosting tool or in an operations table outside the business schema. No change to business tables.
- **UI reference:** No screen. The operator uses the hosting tools (epic section 12).
- **Non-functional checks:** Availability: a backup runs every day for production and staging (BR-38-1). Precision: weights copied unchanged as integers in units of 0.0001 g (BR-38-6). Performance: the backup does not lock tables the counter writes to. D1 is decided (Option C): the managed PostgreSQL service has a daily backup built in, so this story means turning it on and confirming its schedule. Open decision D1a: the exact backup options follow the cloud provider.
- **Depends on:** EP-02-S1, EP-02-S3, EP-02-S4, EP-02-S5, EP-02-S6, EP-02-S7, EP-02-S8, EP-02-S9, EP-02-S10, EP-02-S11, EP-02-S12, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S2: System can keep a continuous log for point-in-time restore

- **Story ID:** EP-38-S2
- **Title:** System can keep a continuous log for point-in-time restore
- **As a:** System
- **I want:** to ship the database's change log continuously to backup storage between daily backups
- **So that:** the database can be rolled back to any moment within the retention window and no more than 1 hour of work is lost in the worst case (FR-38-2, BR-38-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given continuous log shipping is on for production, when the operator calls List backups, then a backup of kind `continuous log` shows with the time of its latest shipped change, and that time is less than 1 hour old.
  2. Given log shipping stops for any reason, when the latest shipped change becomes 1 hour old, then the backup is marked failed so EP-38-S5 can alert.
  3. Given a daily full backup and the continuous log, when any time between the oldest kept daily backup and the latest shipped change is chosen, then that time is accepted as a restore point.
  4. Given a time older than the retention window, when it is chosen as a restore point, then it is refused with the oldest point that can be restored.
- **Rules enforced on the server:** The continuous log is written only by the database host, never by application code. Restore points are limited to the retention window. The log is stored apart from the live database (EP-38-S4).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Shipping the log changes no business state.
- **Data changes:** None in the product database. Turns on change-log shipping on the database host and adds Backup records of kind `continuous log`.
- **UI reference:** No screen
- **Non-functional checks:** Availability: recovery point under 1 hour (BR-38-1). Time: restore points are stored and chosen in UTC and shown in Asia/Kolkata. Open decision D1a: which point-in-time features the chosen provider's managed PostgreSQL includes and at what retention.
- **Depends on:** EP-38-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S3: System can back up file storage

- **Story ID:** EP-38-S3
- **Title:** System can back up file storage
- **As a:** System
- **I want:** to copy object storage (piece photos, order copy reference images, PO attachments and bench photos) to backup storage, keeping earlier versions of each file
- **So that:** every file a database row points to at a restore point can be restored with it (FR-38-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma attached a piece photo through EP-09-S7, when the next file storage backup runs, then the photo and its thumbnail and display-size copies are in backup storage.
  2. Given a restored database, when a piece photo referenced at the restore point is opened through a signed link, then the file loads (epic acceptance criterion 4).
  3. Given a file was deleted from live storage after the restore point, when the files are restored to that point, then the file is back, because earlier versions are kept.
  4. Given a restore drill, when every file id in the restored database is checked against restored storage, then the check lists zero missing files, or names each missing one.
  5. Given a file storage backup, when it ends, then a Backup record of kind `file storage` is written with status, size and location.
- **Rules enforced on the server:** Backups copy files as stored, without changing their ids. File access after restore still goes through the owning-entity and role check (EP-09-S6). Only System and operators may write to backup storage.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Copying files changes no business state.
- **Data changes:** None in the product database. Turns on versioning or scheduled copy for the object storage bucket and adds Backup records of kind `file storage`.
- **UI reference:** No screen
- **Non-functional checks:** Availability: database and files can be restored to the same point, so no row points at a missing photo (epic section 16). Security: backup copies are not reachable by signed links meant for live files. Personal data: inbound PO attachments may hold customer details and follow the same region rule. D10 is decided: backup storage is in an India region.
- **Depends on:** EP-09-S1, EP-09-S4, EP-09-S5, EP-09-S6, EP-09-S7, EP-09-S8, EP-09-S10, EP-09-S11, EP-38-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S4: System can encrypt backups and keep them apart from live data

- **Story ID:** EP-38-S4
- **Title:** System can encrypt backups and keep them apart from live data
- **As a:** System
- **I want:** every database backup, continuous log and file storage copy to be encrypted at rest and stored in a separate location from the live data, in an India region (D10, decided)
- **So that:** losing or breaking into the live host does not also lose or expose the backups, and customer personal data stays in the agreed region (FR-38-4, FR-38-5, BR-38-4, BR-38-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a daily full backup, when its storage settings are read, then encryption at rest is on and the location differs from the live database's location.
  2. Given the backup location, when it is compared with the India region decided under D10, then they match.
  3. Given a user with a shop account only (Sanjay Seth, Rajesh Verma or Lakshmi Devi), when they try to read or download a backup, then access is refused, because only the operator role can read backups.
  4. Given the live database credentials, when they are used against backup storage, then they cannot delete or overwrite a backup.
  5. Given the backup encryption keys and credentials, when the repository is scanned by EP-01-S10, then none are found in code; they live in environment configuration.
- **Rules enforced on the server:** Backup storage access is limited to the operator role and the System backup service. Live application credentials have no delete right on backups. Keys and credentials come from environment configuration (EP-01-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Storage settings are infrastructure configuration, not business state.
- **Data changes:** None in the product database. Sets encryption, location and access rules on backup storage.
- **UI reference:** No screen
- **Non-functional checks:** Security: backups encrypted; only the operator can read or restore (epic section 13). Personal data: backups hold customer names, phones, birthdays and anniversaries and follow the same region and retention rules (BR-38-5). D10 is decided: backups are stored in an India region; the exact region follows the D1a provider.
- **Depends on:** EP-38-S1, EP-38-S2, EP-38-S3, EP-01-S6, EP-01-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S5: Operator can receive an alert when a backup fails

- **Story ID:** EP-38-S5
- **Title:** Operator can receive an alert when a backup fails
- **As a:** Developer
- **I want:** an alert through the EP-37 alert route when a daily backup, the continuous log or a file storage backup fails or does not happen
- **So that:** a broken backup is fixed the same day instead of being found during a restore (FR-38-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the daily backup fails, when the failure is recorded, then the operator is alerted with the environment, backup kind `daily full`, the time and the error text (epic acceptance criterion 5).
  2. Given no daily full backup has completed in the last 24 hours plus the agreed grace period, when the check runs, then the operator is alerted that the backup is missing.
  3. Given the continuous log's latest shipped change is 1 hour old, when the check runs, then the operator is alerted with backup kind `continuous log`.
  4. Given a file storage backup fails, when it ends, then the alert names kind `file storage`.
  5. Given the same backup failure is seen again within the grouping window, when it is reported, then the operator gets one alert, not one per check.
- **Rules enforced on the server:** The missing-backup check runs outside the main app, so it still alerts when the app host is down. Alerts carry no customer data or credentials.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Alerts are operational; acknowledgement is recorded by EP-37-S10.
- **Data changes:** None in the product database. Adds backup failure and missing-backup alert rules to the monitoring tool.
- **UI reference:** No screen. The alert arrives by the agreed alert route.
- **Non-functional checks:** Availability: the check runs outside the main app. Time: alert times in UTC, shown in Asia/Kolkata. Open question: who receives alerts and at which hours (EP-37 section 17).
- **Depends on:** EP-38-S1, EP-38-S2, EP-38-S3, EP-37-S5, EP-37-S6, EP-37-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S6: Operator can restore staging to a point in time

- **Story ID:** EP-38-S6
- **Title:** Operator can restore staging to a point in time
- **As a:** Developer
- **I want:** to restore the staging database and its files to a chosen point in time, and to use the same procedure for production once the agreed approver has approved
- **So that:** the system can be rolled back to a known good moment after data loss or a bad change, and the procedure is proven before it is needed (FR-38-2, FR-38-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a staging database with known data, when the operator restores it to a time 30 minutes ago, then every row written up to that time is present and no row written after it is present (epic acceptance criterion 2).
  2. Given a restore to a point, when the weight totals of pieces in stock and the pool ledger balance are compared with the source at that point, then the integer totals in units of 0.0001 g are equal (BR-38-6).
  3. Given a restore finishes, when Rajesh Verma's open `today` screen reconnects through EP-07, then it refetches state and shows no data from after the restore point.
  4. Given Lakshmi Devi's karigar portal was open on `k-jobs`, when it reconnects after the restore, then it refetches her jobs and shows only state up to the restore point.
  5. Given a production restore is requested without approval from the agreed approver, when the operator tries to start it, then it is refused; with approval, the restore is recorded with who approved it, who ran it and the restore point.
- **Rules enforced on the server:** Create Restore is for operators only; production also needs the agreed approver's approval (epic section 10). Database and files are restored to the same point. After a restore, connected clients do a full refetch instead of catching up from the sequence number they had cached, because events after the restore point no longer exist (EP-07-S7).
- **Live events emitted / consumed:** None emitted. After a restore, clients rely on EP-07 reconnect and catch-up to refetch authoritative state (epic section 11).
- **Audit entry written:** Yes, for a production restore: actor (operator who ran it), approver, time, entity `database`, action `restore`, restore point, reason. The entry is written after the restore so the restore does not remove it.
- **Data changes:** The whole business database and file storage are replaced with their state at the restore point. No schema change. Adds a restore record (requested by, approved by, run by, restore point, started at, finished at).
- **UI reference:** No screen. The operator uses the hosting tools. Every route reads restored data afterwards.
- **Non-functional checks:** Precision: weight totals compared before and after (epic section 13). Audit: a production restore is recorded with approver, operator and restore point. Security: only the operator can restore. Availability: the recovery time target is measured in each run. Open decision D1a: the restore steps follow the chosen provider's managed PostgreSQL and object storage tools. Open question: who approves a production restore.
- **Depends on:** EP-38-S2, EP-38-S3, EP-38-S4, EP-07-S2, EP-07-S7, EP-08-S10, EP-06-S2, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S7: Operator can check that the audit log is whole after a restore

- **Story ID:** EP-38-S7
- **Title:** Operator can check that the audit log is whole after a restore
- **As a:** Developer
- **I want:** a check that compares the restored audit log with the source up to the restore point and reports any missing or changed entry
- **So that:** a restore never breaks the append-only audit trail of who moved which gold (FR-38-9, BR-38-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a restore, when the audit log is compared with the source up to the restore point, then every entry is present and unchanged (epic acceptance criterion 3).
  2. Given the check, when it runs, then it compares entry count, each entry's id and a checksum of actor, time, entity, action, before, after, reason and token reference.
  3. Given an entry that differs or is missing, when the check finishes, then it names the entry id and fails the drill.
  4. Given the restored database, when anyone tries to update or delete an audit entry, then it is still refused, because the append-only rule from EP-06-S1 is part of the restored schema.
  5. Given an audit entry with weights, when it is compared, then the weights are the same integers in units of 0.0001 g.
- **Rules enforced on the server:** The check only reads; it never repairs or rewrites audit entries. The append-only rule (no update or delete path, including for the owner) survives the restore.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The check only reads; its result is kept on the restore drill record.
- **Data changes:** None in the product database. Adds a read-only audit comparison script used in drills.
- **UI reference:** No screen
- **Non-functional checks:** Audit: no entry altered after a restore (BR-38-2). Precision: weights in entries compared as integers. Personal data: the check prints entry ids, not customer names.
- **Depends on:** EP-38-S6, EP-06-S1, EP-06-S3, EP-06-S4, EP-06-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S8: Operator can follow a written restore drill and record its duration

- **Story ID:** EP-38-S8
- **Title:** Operator can follow a written restore drill and record its duration
- **As a:** Developer
- **I want:** a written restore drill that names each step, who does it and how long it takes, run in staging before launch and then on the agreed schedule, with each run recorded
- **So that:** a restore is a known, timed procedure rather than a first attempt during an outage (FR-38-7, FR-38-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the drill document, when it is read, then it lists each step (pick restore point, get approval, restore database, restore files, check file references, check audit log, reconnect clients, tell staff), who does it and the expected time.
  2. Given a drill run in staging, when it ends, then the operator calls Create restore drill record with date, environment `staging`, restore point chosen, duration, steps passed, notes and run by.
  3. Given the drill record, when the duration is compared with the recovery time target, then the result is noted as within or over target.
  4. Given launch, when the go-live checklist is checked, then a drill has been run once in staging with its duration recorded and has been signed off (epic acceptance criterion 6).
  5. Given the drill schedule after launch, when the agreed interval passes without a drill record, then the operator is reminded.
- **Rules enforced on the server:** Create restore drill record is for operators only (epic section 10). A drill record needs every step marked passed or failed. Drills run in staging only, using data seeded from `src/data/seed.ts` through EP-02-S13 or a copy of production.
- **Live events emitted / consumed:** None
- **Audit entry written:** No in the product audit log. The drill record keeps date, environment, duration and run by.
- **Data changes:** Adds a Restore drill record (date, environment, restore point chosen, duration, steps passed, notes, run by), kept in an operations table or the operations document store.
- **UI reference:** No screen
- **Non-functional checks:** Availability: recovery time target agreed and measured in each drill (epic section 13). Time: drill dates stored in UTC, shown in Asia/Kolkata. Open question: the recovery time target and how often the drill runs after launch.
- **Depends on:** EP-38-S6, EP-38-S7, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S9: Operator can list sends made after a restore point for follow-up

- **Story ID:** EP-38-S9
- **Title:** Operator can list sends made after a restore point for follow-up
- **As a:** Developer
- **I want:** to list the WhatsApp messages and OTPs sent between the restore point and the restore, from provider logs and receipts, and the work lost in that window
- **So that:** staff can be told what to re-enter, karigars what to resend, and customers who got a wish or broadcast are not sent it twice (FR-38-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given a restore to 10:00 done at 10:40, when the operator runs the list, then it shows every outbound message sent between 10:00 and 10:40 with message id, kind (OTP, edit token, wish, broadcast, alert), template name, send time and status from the provider.
  2. Given an edit token sent in that window, when the list shows it, then it shows the token reference only, never the token value.
  3. Given wish sends in that window, when the next 9 am wishes run starts, then customers already wished in the window are not wished again that day.
  4. Given the list, when it is handed to Sanjay Seth, then it names the window of lost work and the kinds of work to re-enter (for example tags, weighings and stock-outs), without customer phone numbers.
  5. Given karigar status updates that Lakshmi Devi sent after the restore point, when the procedure is followed, then she is told to resend them.
- **Rules enforced on the server:** The list reads the WhatsApp provider's logs and the EP-12 receipt records; it does not send anything. OTP and token values are never shown (EP-12-S11).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The list only reads; the production restore entry from EP-38-S6 already records the window.
- **Data changes:** None in the product database. Adds a script or procedure step that reads provider logs for a time window.
- **UI reference:** No screen
- **Non-functional checks:** Security: no OTP or token values in the list. Personal data: phone numbers are left out of the list given to the shop; the operator sees message ids. Time: window shown in Asia/Kolkata.
- **Depends on:** EP-38-S6, EP-12-S3, EP-12-S9, EP-12-S11, EP-11-S13, EP-10-S9, EP-04-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-38-S10: System can delete backups after the retention period

- **Story ID:** EP-38-S10
- **Title:** System can delete backups after the retention period
- **As a:** System
- **I want:** daily backups, continuous log segments and old file versions to be deleted once they pass the agreed retention period
- **So that:** backups, which hold customer personal data, are kept no longer than agreed (FR-38-12, BR-38-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the retention period is set in configuration, when a daily full backup becomes older than it, then the backup is deleted and its Backup record shows status `deleted`.
  2. Given backups within the period, when the cleanup runs, then they are kept, and the oldest kept backup still allows a restore.
  3. Given continuous log segments older than the oldest kept daily backup, when the cleanup runs, then they are deleted.
  4. Given old file versions past the period, when the cleanup runs, then they are deleted, and current files are not touched.
  5. Given the cleanup, when it ends, then List backups shows no backup older than the retention period.
- **Rules enforced on the server:** The retention period comes from configuration (EP-01-S6), one value per environment. Only the System cleanup deletes backups; live application credentials cannot. The live audit log is not touched.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Deleting expired backups is not a business change; the Backup record status shows it.
- **Data changes:** None in business tables. Backup records move to status `deleted`. Sets retention on backup storage.
- **UI reference:** No screen
- **Non-functional checks:** Personal data: backups are kept only for the agreed period (BR-38-5); how a DPDP deletion request affects backups still inside the period is decided with EP-39 (G22). Open question: how long backups are kept. Open decision D1a: retention options of the chosen provider's managed PostgreSQL.
- **Depends on:** EP-38-S1, EP-38-S2, EP-38-S3, EP-38-S4, EP-01-S6, EP-09-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D1a: which backup and point-in-time features does the chosen provider's managed PostgreSQL include, at what retention, and in which India region are backups stored (D10 is decided)? (EP-38-S1, S2, S3, S4, S6, S10)
- What is the recovery time target (how long may the shop be down)? (EP-38-S6, S8)
- How long are backups kept? (EP-38-S2, S10)
- How often is the restore drill run after launch? (EP-38-S8)
- G22: how is a DPDP deletion request handled in existing backups and after a restore? (EP-38-S6, S10)
- Who approves a production restore: the owner, the operator, or both? (EP-38-S6)
