-- 0012 Tag the broadcast consent as personal data (review finding 6, EP-02-S4).
--
-- S4 lists the customer's opted-in consent with the DPDP columns, but 0002 left
-- customers.opted_in without the comment its sibling columns carry.
comment on column customers.opted_in is 'personal data (DPDP)';
