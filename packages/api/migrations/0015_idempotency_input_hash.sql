-- 0015 Fingerprint of the request on each idempotency record (EP-03-S8, PR #3 review).
--
-- input_hash is the SHA-256 (hex) of the validated input in canonical JSON (keys sorted), stored
-- when the key is claimed. A repeat with the same (key, operation, user_id) and the same hash
-- replays the stored result; a different hash is refused as `conflict` (409) and runs nothing.
-- Rows written before this migration have no hash and replay as before; they expire within
-- IDEMPOTENCY_RETENTION_HOURS.
alter table idempotency_records add column input_hash text;
