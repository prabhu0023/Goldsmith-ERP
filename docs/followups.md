# Follow-ups

Review findings that were accepted but not fixed in the pull request that raised them. Each row names the epic or story that owns the fix. Remove a row when the owning work lands, and name the pull request that closed it.

| ID | Description | Owning epic / story | Source PR |
| --- | --- | --- | --- |
| FU-001 | Audit triggers can be switched off by the table owner. The app, migrations and tests all connect as `postgres` (superuser and owner of `audit_entries`), which can run `alter table audit_entries disable trigger …` and then update or delete audit rows. When real credentials arrive, the app must connect as a non-owner role with UPDATE, DELETE and TRUNCATE revoked on `audit_entries`; only migrations run as the owner. (EP-02 review finding 2.) | Deployment credentials: EP-04 (first real app credentials), EP-39 (security and data protection), deploy job EP-01-S12 | [#2](https://github.com/prabhu0023/Goldsmith-ERP/pull/2) |

| FU-003 | The rate-limit hook does not see every request. `GET /api/contract-version` resolves the session and answers without calling `rateLimiter`, and `POST /api/ops/:operation` with an unknown operation name answers 404 `not_found` before the hook runs, so neither is ever counted. EP-39 must run the hook for both (e.g. operation `readContractVersion`, and an unknown-operation bucket). (EP-03 review finding 4.) | EP-39 (security and rate limiting) | [#3](https://github.com/prabhu0023/Goldsmith-ERP/pull/3) |
FU-002 closed by EP-03 (pull request [#3](https://github.com/prabhu0023/Goldsmith-ERP/pull/3) "EP-03: API foundation", branch `ep03-api`).
