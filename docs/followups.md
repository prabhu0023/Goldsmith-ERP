# Follow-ups

Review findings that were accepted but not fixed in the pull request that raised them. Each row names the epic or story that owns the fix. Remove a row when the owning work lands, and name the pull request that closed it.

| ID | Description | Owning epic / story | Source PR |
| --- | --- | --- | --- |
| FU-001 | Audit triggers can be switched off by the table owner. The app, migrations and tests all connect as `postgres` (superuser and owner of `audit_entries`), which can run `alter table audit_entries disable trigger …` and then update or delete audit rows. When real credentials arrive, the app must connect as a non-owner role with UPDATE, DELETE and TRUNCATE revoked on `audit_entries`; only migrations run as the owner. (EP-02 review finding 2.) | Deployment credentials: EP-04 (first real app credentials), EP-39 (security and data protection), deploy job EP-01-S12 | [#2](https://github.com/prabhu0023/Goldsmith-ERP/pull/2) |
| FU-002 | A missing row is reported as stale. `updateVersioned` throws `StaleWriteError` (`code 'STALE_WRITE'`) when no row matches id, shop and version, which includes an id that does not exist or belongs to another shop. EP-03 must check that the row exists in the caller's shop before mapping the error to `conflict`, or return `not_found` when it does not. (EP-02 review finding 7.) | EP-03-S5 (not-found, validation and conflict errors) | [#2](https://github.com/prabhu0023/Goldsmith-ERP/pull/2) |
