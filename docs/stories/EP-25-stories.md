# EP-25: Edit proposals · stories

Epic document: [EP-25 Edit proposals](../epics/EP-25-edit-proposals.md)

Role note: stories where the server stores, checks, sends, voids or audits on its own use "System". Staff propose and never touch the field (BR-25-1); only the owner agrees, applies or refuses (FR-25-16). The edit token (the owner edit code) is the only one-time code in v1; sign-in uses phone and password with no code (D4). The flow is confirmed by the owner: staff propose without changing the piece, the proposal waits for the owner, only the owner applies it, and the code goes as a WhatsApp message to the owner's registered mobile number. v1 has no holds, so a piece with an open proposal stays sellable (BR-25-5, still assumption A4) and the proposal voids itself if the piece is sold or scrapped. No price or value appears. Weights are integers in units of 0.0001 g and shown to 4 decimals; mockup 05 shows pure gold to 3 decimals ("41.590 g"), which these stories show as 41.5900 g. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff). The seed proposals are ED-102, Rajesh's change of `grossG` on TAG-8841 (Antique Kundan Choker) from 48.6500 g to 48.6100 g with net gold 41.5900 g, and ED-101, Deepak's change of `stoneCount` on TAG-9012 from 4 to 5.

---

## EP-25-S1: System can store edit proposals with their states

- **Story ID:** EP-25-S1
- **Status:** Not started
- **Title:** System can store edit proposals with their states
- **As a:** System
- **I want:** the `piece_edits` table from EP-02-S5 to hold one proposal per row with piece id, field (`grossG`, `stoneG`, `stoneCount`, `purity`, `huid`, `name`), from value, to value, reason, proposed by, proposed at, status (`proposed`, `token_sent`, `applied`, `refused`, `void`), decided by, decided at and void reason (`sold` or `scrapped`), with weights as integers in units of 0.0001 g
- **So that:** every requested change to a tag in stock is kept with who asked, why and how it ended, and the other stories have one place to read and move it (FR-25-12, BR-25-8, BR-25-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when ED-102 is stored, then the row has field `grossG`, from 486500, to 486100 (integer units of 0.0001 g), status `proposed`, proposed by Rajesh Verma's user id, proposed at from the server clock, and decided by, decided at and void reason empty.
  2. Given ED-101 is stored, when the row is read, then from is 4 and to is 5 as whole numbers in the stone-count value, and the weight value columns are empty.
  3. Given a row with status `applied` or `refused` and an empty decided by, when it is written, then the database rejects it; given a row with status `void` and an empty void reason, then the database rejects it.
  4. Given a row with status `applied`, `refused` or `void`, when any write tries to change its status again, then the server refuses with "This proposal has already been decided." and the row is unchanged (FR-25-12).
  5. Given the prototype seed is loaded (EP-02-S13), when `piece_edits` is read, then ED-101 and ED-102 are present with status `proposed`, and new ids continue after them with the `ED-` prefix.
- **Rules enforced on the server:** Field and status accept only the listed values (check constraints). Weight from and to values are positive integers; text values (`purity` list id, `huid`, `name`) are stored as strings. Decided rows carry decided by and decided at; void rows carry a void reason. Allowed status moves are `proposed` to `token_sent`, `applied`, `refused` or `void`; `token_sent` to `token_sent` (re-issue), `applied`, `refused` or `void`; nothing leaves `applied`, `refused` or `void`. The row has a `version` and stale writes are refused (EP-02-S14). The prototype `token` and `tokenIssuedAt` fields are not stored on this table; tokens live in EP-25-S6.
- **Live events emitted / consumed:** None. Storing the table publishes nothing; events come from the propose, agree and apply stories.
- **Audit entry written:** No. Table and state rules only; each step is audited by EP-25-S14.
- **Data changes:** Migration on `piece_edits` (EP-02-S5): adds or confirms the value columns split into integer weight value and text value, `status` check, `decidedBy`, `decidedAt`, `voidReason`, `version`, the decided-row checks, and an index on (piece id, status) for open proposals. Drops the prototype `token` and `tokenIssuedAt` columns if EP-02-S5 created them. Ports `EditableField` and `EditStatus` from `src/types/jewellery.ts` into the shared package.
- **UI reference:** No screen. The edit rail ("An edit to a piece already in house · Proposed by staff · lands with owner") is on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Precision: weight values are integers in units of 0.0001 g, never floats. Concurrency: status moves use the version check so two decisions on one proposal cannot both commit. Time: proposed at and decided at in UTC, shown in Asia/Kolkata. Open question: whether a piece may have more than one open proposal (section 17); the index allows either answer.
- **Depends on:** EP-02-S5, EP-02-S2, EP-02-S13, EP-02-S14, EP-22-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S2: Staff can propose a change to one field of an in-stock piece

- **Story ID:** EP-25-S2
- **Status:** Not started
- **Title:** Staff can propose a change to one field of an in-stock piece
- **As a:** Staff
- **I want:** an "Edit tag" button in the piece drawer on `stock` that opens `edit-propose` for that piece, where I pick "What should change?", see "From" with the current value, type "To", write "Why? The owner will read this." and press "Send to the owner"
- **So that:** a wrong weight, stone count, purity, HUID or name reaches the owner with my reason, and I never change the tag myself (FR-25-1, FR-25-2, FR-25-3, BR-25-1, BR-25-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `in_stock` at 48.6500 g gross, when Rajesh Verma picks "The tag weight", types 48.6100 g and the reason "Re-weighed on the calibrated balance this morning, reads 40 mg lighter than the tag." and presses "Send to the owner", then a proposal with status `proposed` is stored, the screen shows "taking off 40 mg", and TAG-8841 still reads 48.6500 g (epic acceptance criterion 1).
  2. Given the reason "ok", when Rajesh presses "Send to the owner", then the server refuses with "Say why. The owner will read this." and nothing is stored.
  3. Given TAG-9012 has stone count 4, when Deepak Rao enters 4 as the new value, then the server refuses with "That is already the stone count." and nothing is stored.
  4. Given a piece in `draft`, `with_owner`, `stopped`, `billed` or `scrapped`, when anyone proposes an edit on it, then the server refuses with "{tag} is not in stock, so it cannot be edited." (a stopped piece gets the EP-24-S2 sentence instead).
  5. Given the proposal is stored, when the drawer reloads, then "Edit tag" is disabled with "An edit is already waiting for the owner" and the screen line "You cannot change the weight yourself · This goes to the owner. The piece stays sellable while he decides." was shown before sending.
- **Rules enforced on the server:** Create Edit proposal is Staff and Owner only; a Karigar is refused with `forbidden` (EP-05-S2). The piece row is read under lock inside the transaction and must be `in_stock`. The reason is trimmed and must be at least 3 characters. The new value must differ from the current value. The value is checked for its field by EP-25-S3. Proposer and proposed at come from the session and server clock (EP-03-S3). The piece itself is not written. Whether a second open proposal on the same piece is refused depends on the section 17 question; until answered, the server refuses a second open proposal on the same piece with "An edit is already waiting for the owner on {tag}.", matching the prototype's disabled button.
- **Live events emitted / consumed:** Emitted after commit: "Edit proposed / token sent" with edit id, piece id, tag number, field and proposer, to Owner screens and the proposer (audience filtered by EP-07-S5). Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor, role, time, entity (edit id and tag number), action `edit_proposed`, after (field, from, to, reason).
- **Data changes:** Inserts into `piece_edits`. Adds Create Edit proposal to the shared contract. Ports `proposeEdit` from `src/store/transitions.ts` and moves `EditPropose.tsx` (route `edit-propose`, param `pieceId`) and the drawer button onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-propose` (panel "WHAT STAFF DO · PROPOSE"); "Edit tag" and "Editing a tag needs the owner's WhatsApp code." on `docs/ux/mockups/03-showroom-stock.svg`, route `stock`.
- **Non-functional checks:** Precision: the "taking off 40 mg" line is computed from integer units (486500 minus 486100 is 400 units, 40 mg). Concurrency: a sale that commits first makes the proposal fail with the not-in-stock sentence. Performance: the owner's card appears within about 1 second (FR-25-15 pattern, epic section 13). Personal data: the reason is free text and may name a customer. Open decision A4: the piece stays sellable while the proposal is open, as an assumption.
- **Depends on:** EP-25-S1, EP-25-S3, EP-22-S5, EP-22-S8, EP-24-S2, EP-05-S2, EP-03-S3, EP-03-S6, EP-08-S5, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S3: System can validate the proposed value for its field

- **Story ID:** EP-25-S3
- **Status:** Not started
- **Title:** System can validate the proposed value for its field
- **As a:** System
- **I want:** one shared check per editable field that runs on propose and again on apply: `grossG` and `stoneG` are positive integers in units of 0.0001 g, `stoneG` never exceeds `grossG`, `stoneCount` is a whole number of 0 or more, `purity` is an active purity in reference data, `huid` passes the HUID rule and is not on another piece, and `name` is non-empty text
- **So that:** a proposal the owner reads can always be applied as written, and a bad value is stopped at the counter instead of at the owner (FR-25-4, BR-25-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 has 7.0600 g of stones, when a proposal sets `grossG` to 6.5000 g, then the server refuses with "Stones cannot weigh more than the piece." and nothing is stored.
  2. Given a proposal sets `grossG` to 48.61005 g, when it reaches the server, then it is refused with a validation error because the value is not a whole number of 0.0001 g units.
  3. Given a proposal sets `stoneCount` to 4.5 or −1, when it reaches the server, then it is refused with "Stone count must be a whole number."
  4. Given a proposal sets `purity` to a retired purity or an id not in the list, when it reaches the server, then it is refused through the EP-15-S4 check.
  5. Given HUID "AB12CD" is already on TAG-7914, when a proposal sets the `huid` of TAG-8841 to "ab12cd", then it is normalised to "AB12CD" and refused with the EP-15-S8 duplicate sentence.
- **Rules enforced on the server:** Weights arrive as integers (EP-02-S2) and are validated at the trust boundary (EP-03-S2). The stones-not-above-gross check uses the piece's other weight as it stands when the check runs, so it is repeated at apply (EP-25-S7). Purity uses EP-15-S4; HUID uses EP-15-S8, including uniqueness only if that is confirmed there. Refusals use the EP-03-S4 code and sentence format.
- **Live events emitted / consumed:** None. A check publishes nothing.
- **Audit entry written:** No. Refused proposals store nothing.
- **Data changes:** None in the product database. Adds the per-field validators to the shared package so the `edit-propose` form can show the same sentences before sending.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-propose` ("From", "To" fields). The error placement under "To" is not yet designed.
- **Non-functional checks:** Precision: all weight comparisons are on integers. Security: the server check is the control; the form check only saves a round trip.
- **Depends on:** EP-25-S1, EP-02-S2, EP-03-S2, EP-03-S4, EP-15-S4, EP-15-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S4: Owner can see open proposals with old value, new value and reason

- **Story ID:** EP-25-S4
- **Status:** Not started
- **Title:** Owner can see open proposals with old value, new value and reason
- **As a:** Owner
- **I want:** a List Open edit proposals read and a Read Edit proposal read that give, for each proposal, the tag number and piece name, the field, old and new values, the change in mg for weights, net gold before and after, the proposer, the reason and the time asked, feeding the "STAFF WANTS A CODE" card on `decisions` and the owner panel on `edit-apply`
- **So that:** I can judge the change from one screen without opening the piece, and see what it does to the gold on the floor (FR-25-5, BR-25-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 is open, when Sanjay Seth opens `edit-apply` for it, then the panel reads "RAJESH ASKS · TAG-8841 weight · 48.6500 → 48.6100 g (−40 mg)", the quoted reason, and "pure gold would go 41.5900 → 41.5500 g" (epic acceptance criterion 1).
  2. Given ED-102 was proposed at 11:04 Asia/Kolkata, when Sanjay opens `decisions` at 11:06, then the card reads "Rajesh wants to shave 40 mg off TAG-2026-8841 · Antique Kundan Choker · asked 11:04, 2 minutes ago" with "Send the code" and "Refuse".
  3. Given ED-101 and ED-102 are both open, when the list is read, then both come back oldest first, and the notice line reads "2 edits proposed on tags in stock · Rajesh wants 40 mg off TAG-8841 · Deepak wants the stone count changed on TAG-9012".
  4. Given Rajesh Verma calls List Open edit proposals, when the server answers, then it is refused with `forbidden`; given he calls Read Edit proposal on ED-102, then he gets it because he is the proposer; on ED-101 he gets `not_found`.
  5. Given a proposal changes to `applied`, `refused` or `void`, when the list is read again, then it is gone from the list and the card count drops by one.
- **Rules enforced on the server:** List Open edit proposals is Owner only. Read Edit proposal is Owner or the proposer (epic section 10). The mg change and net gold before and after are computed on the server from integer units of the current piece, never sent by the client. Net gold is gross minus stones. Lists page with a cursor (EP-03-S9). Card layout and ranking among other Decisions cards belong to EP-32.
- **Live events emitted / consumed:** Consumed: "Edit proposed / token sent", "Edit applied" and "Piece billed by one staff member" to refetch the list and the open panel (EP-08-S9).
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds List Open edit proposals and Read Edit proposal to the shared contract. Moves the `openEditFor` selector, the `ownerQueues.pendingEdits` count and the owner panel of `EditApply.tsx` (route `edit-apply`, param `editId`) onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` ("WHAT THE OWNER DOES · READ, TOKEN, APPLY", "RAJESH ASKS"); `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("STAFF WANTS A CODE"); `docs/ux/mockups/13-notifications-escalation.svg` ("2 edits proposed on tags in stock", "Read them").
- **Non-functional checks:** Precision: mg change and net gold computed from integers and shown to 4 decimals for grams. Security: owner and proposer scoping on the server. Performance: the card appears within about 1 second of a proposal (epic section 13). Time: asked times shown in Asia/Kolkata.
- **Depends on:** EP-25-S1, EP-25-S2, EP-05-S2, EP-03-S9, EP-08-S2, EP-08-S3, EP-08-S9, EP-08-S17, EP-22-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S5: Owner can agree and receive a token on WhatsApp

- **Story ID:** EP-25-S5
- **Status:** Not started
- **Title:** Owner can agree and receive a token on WhatsApp
- **As a:** Owner
- **I want:** to press "Yes, send me a token" on `edit-apply` (or "Send the code" on the Decisions card) so the server issues a 6-digit token and sends it as a WhatsApp message to my registered mobile number as "JGD: confirm edit to TAG-8841. Token 480 913"
- **So that:** the change needs both my signed-in session and the phone I hold (FR-25-6, BR-25-2, BR-25-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 is `proposed`, when Sanjay Seth presses "Yes, send me a token", then a token record is created (EP-25-S6), a template message goes through EP-12 to Sanjay's registered phone, ED-102 becomes `token_sent`, and the panel shows "2 · Enter the token sent to your WhatsApp · To Sanjay's phone · now" (epic acceptance criterion 2).
  2. Given the message is stored as an OutboundMessage, when it is read, then the token variable holds only a reference to the token record and no 6 digits (EP-12-S11).
  3. Given ED-102 is `token_sent`, when Sanjay asks again within the rate limit, then the earlier token is marked used-up and a new one is sent, and only the new one works.
  4. Given Rajesh Verma calls the agree operation directly, when it reaches the server, then it is refused with "Only the owner can approve a tag edit." and no token is created (epic acceptance criterion 6 pattern, FR-25-16).
  5. Given the provider refuses the send, when the failure is recorded (EP-12-S12), then the panel shows "The code could not be sent. Try again." and ED-102 stays `token_sent` with no usable token delivered.
- **Rules enforced on the server:** Create Edit token is Owner only (EP-05-S2). The proposal must be `proposed` or `token_sent`. The token goes only to the phone on the signed-in owner's user record, never to a number in the request. Sending uses EP-12-S3 with an approved template and an idempotency key per token record. Re-issue invalidates the previous token in the same transaction. The rate limit of EP-25-S9 runs first. The `requireEditToken` setting does not skip this step: until G18 is answered the token is always required (EP-13-S10).
- **Live events emitted / consumed:** Emitted after commit: "Edit proposed / token sent" with edit id and status `token_sent`, to Owner screens and the proposer (so Rajesh sees the Waiting for the owner's code message). Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor (owner), role, time, entity (edit id), action `edit_token_sent`, token reference (token record id), and the EP-12 sent message id; never the token.
- **Data changes:** Inserts into `edit_tokens` (EP-25-S6); updates `piece_edits.status`; inserts an OutboundMessage through EP-12. Adds Create Edit token to the shared contract and the edit-token template to the EP-12 template list with the token variable marked secret. Ports `ownerAgreeEdit` and replaces the prototype `makeToken(seq)`.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` ("1 · Do you agree with the change? · Yes, send me a token · Refuse", phone preview "JGD: confirm edit to TAG-8841. Token 480 913"); `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Send the code"). The send-failure message is not yet designed.
- **Non-functional checks:** Security: token sent only to the owner's own registered phone; no token in logs, messages or audit (BR-25-3). Personal data: the owner's phone is used only for delivery (epic section 13). Performance: the token arrives within the provider's normal delivery time. Open decision D8: provider and approved template for the token message. Open question UX-SPEC Q5: approval by WhatsApp reply is not built here. Open decision G18: whether the owner may switch the token off.
- **Depends on:** EP-25-S1, EP-25-S4, EP-25-S6, EP-25-S9, EP-12-S3, EP-12-S11, EP-12-S12, EP-13-S10, EP-05-S2, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S6: System can store the token hashed with a 10-minute expiry

- **Story ID:** EP-25-S6
- **Status:** Not started
- **Title:** System can store the token hashed with a 10-minute expiry
- **As a:** System
- **I want:** an `edit_tokens` table with edit id, token hash, issued at, expires at (issued at plus 10 minutes), used at, attempts count and sent message id, and a generator that makes the 6 digits from a secure random source and keeps the plain value only in memory until it is handed to EP-12
- **So that:** nobody reading the database, a backup or a log can learn or reuse a token (FR-25-7, BR-25-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth agrees to ED-102 at 11:06:00 UTC+5:30, when the token record is written, then it holds a hash of the 6 digits, issued at 05:36:00 UTC, expires at 05:46:00 UTC, used at empty and attempts count 0 (epic acceptance criterion 2).
  2. Given the database and every log line for the request are searched for the 6 digits that were sent, when the search runs in the CI test, then no match is found.
  3. Given 10 000 tokens generated in a test, when they are checked, then each is exactly 6 digits including leading zeros, and the generator is the platform's cryptographic random source, not `makeToken` from `src/domain/edits.ts`.
  4. Given the EP-10-S8 sweep runs after 05:46:00 UTC, when it finds the unused token, then it marks it expired without deleting the row, and the check at apply does not depend on the sweep having run.
- **Rules enforced on the server:** Hashing uses a slow or keyed hash so 6 digits cannot be looked up from a table of all 1 000 000 values. `TOKEN_TTL_MS` (10 minutes) comes from the shared package. Issued at and expires at use the server clock. Token rows are never deleted, so the audit token reference always resolves. The table is readable only by the server's database role.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. The token record is the target of the token reference written by EP-25-S14.
- **Data changes:** Migration creates `edit_tokens` (id, edit id, token hash, issued at, expires at, used at nullable, expired at nullable, attempts count, sent message id nullable) with an index on edit id. The EP-10-S8 sweep sets `expired at` on this table for edit tokens.
- **UI reference:** No screen. "Valid 10 minutes" is shown on `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply`.
- **Non-functional checks:** Security: secure random source, hash at rest, no plain value in logs (PRODUCTION-SCOPE §5). Time: expiry computed on the server clock in UTC. Audit: rows kept so token references stay valid.
- **Depends on:** EP-25-S1, EP-10-S8, EP-12-S11, EP-06-S4, EP-04-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S7: Owner can apply a change with the token

- **Story ID:** EP-25-S7
- **Status:** Not started
- **Title:** Owner can apply a change with the token
- **As a:** Owner
- **I want:** to type the 6 digits into "Enter the token sent to your WhatsApp" and press "Apply the change", so the field on the piece changes, the proposal becomes `applied`, and the new net gold is shown
- **So that:** the tag holds the true value, recorded against the proposer's name, my token, and the old and new values (FR-25-9, FR-25-10, BR-25-2, BR-25-6, BR-25-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 is `token_sent` with a valid token, when Sanjay Seth enters it and presses "Apply the change", then TAG-8841 `grossG` becomes 486100 units (48.6100 g), net gold becomes 41.5500 g, ED-102 is `applied` with decided by Sanjay, and the token's used at is set, all in one transaction.
  2. Given TAG-8841 was sold between agree and apply, when Sanjay applies, then the server refuses with "TAG-8841 is billed. Its weights are frozen." and nothing changes (BR-25-6).
  3. Given TAG-9012 is `stopped` when Sanjay applies ED-101, then the server refuses with the EP-24-S2 sentence and the token is not used up.
  4. Given a `stoneG` proposal of 7.0000 g on a piece whose gross was lowered to 6.9000 g by an earlier apply, when the owner applies, then the server re-checks and refuses with "Stones cannot weigh more than the piece." (FR-25-10).
  5. Given Rajesh Verma calls apply directly with a correct token, when it reaches the server, then it is refused with `forbidden` and the piece is unchanged (epic acceptance criterion 6).
- **Rules enforced on the server:** Update Apply edit is Owner only (EP-05-S2, FR-25-16). The transaction locks the piece row, then the proposal and token rows. The proposal must be `token_sent`. The token is checked by EP-25-S8. The piece must still be `in_stock` (EP-22-S8 refuses billed and stopped). The value is re-validated by EP-25-S3. The piece write bumps `version`. Until G18 is answered, the token is required regardless of `requireEditToken`.
- **Live events emitted / consumed:** Emitted after commit: "Edit applied" with edit id, piece id, tag number, field, new value and piece version, to the proposer and every stock screen (EP-25-S12). Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor (owner), role, time, entity (edit id and tag number), action `edit_applied`, before (field value, net gold), after (field value, net gold), proposer, reason, token reference.
- **Data changes:** Updates the edited field and `version` on `pieces`; updates `piece_edits.status`, `decidedBy`, `decidedAt`; sets `edit_tokens.used at`. Adds Update Apply edit to the shared contract. Ports `applyEdit`, dropping the "Token {token}" audit detail, and moves the apply part of `EditApply.tsx` and `OtpPanel.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` ("3 · Apply it", "AFTER YOU APPLY · Pure gold becomes 41.550 g", "Apply the change", "staff see it update in stock").
- **Non-functional checks:** Concurrency: the piece row lock means a stock-out and an apply on the same piece cannot both succeed; the loser gets its sentence (epic section 13). Precision: new weight stored as an integer; net gold computed from integers. Security: owner role and token checked on the server. Open decision G18: whether `requireEditToken` false may skip the token. Open question UX-SPEC Q5: applying by WhatsApp reply is not built.
- **Depends on:** EP-25-S1, EP-25-S3, EP-25-S5, EP-25-S6, EP-25-S8, EP-22-S2, EP-22-S8, EP-24-S2, EP-05-S2, EP-03-S6, EP-02-S14, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S8: System can reject a wrong, expired or reused token

- **Story ID:** EP-25-S8
- **Status:** Not started
- **Title:** System can reject a wrong, expired or reused token
- **As a:** System
- **I want:** a token check used by apply that compares the hash in constant time and returns `ok`, `wrong`, `expired`, `used` or `none`, and that only accepts the token issued for this proposal
- **So that:** a guessed, old or already used token never changes a tag (FR-25-7, FR-25-9, BR-25-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a token for ED-102 issued 11 minutes ago, when Sanjay Seth enters it, then the server refuses with "That token has expired. Ask for a new one." and TAG-8841 is unchanged (epic acceptance criterion 3).
  2. Given Sanjay types 480 914 instead of 480 913, when he presses "Apply the change", then the server refuses with "That token is not right. Check the code on your WhatsApp.", the attempts count goes up by 1, and the piece is unchanged.
  3. Given the token for ED-102 was used to apply ED-102, when the same 6 digits are entered for ED-101, then the server refuses, because a token is valid only for the proposal it was issued for and only once (epic acceptance criterion 4).
  4. Given a token was re-issued for ED-102, when the earlier token is entered, then it is refused as not right.
  5. Given ED-102 is `proposed` with no token issued, when apply is called, then the server refuses with "Ask for a token first."
- **Rules enforced on the server:** The check reads the latest token record for the edit under lock. Expiry is checked against the server clock, not the sweep flag. `used at` is set in the same transaction as a successful apply, so a second apply with the same token sees `used`. Comparison is constant-time. A wrong attempt increments the attempts count in its own committed write so the count survives the refused request. Refusals use the EP-03-S4 code and sentence format.
- **Live events emitted / consumed:** None. A refused attempt publishes nothing.
- **Audit entry written:** No for a single wrong or expired attempt; the attempts count is kept on the token record. Repeated failures that hit the limit are recorded by EP-25-S9.
- **Data changes:** Updates `edit_tokens.attempts count` and `used at`. Ports `checkToken` from `src/domain/edits.ts` to compare hashes instead of plain values.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` (token boxes in "2 · Enter the token sent to your WhatsApp"). The error line under the boxes is not yet designed.
- **Non-functional checks:** Security: constant-time compare, single use, bound to one proposal, 10-minute expiry. Concurrency: two apply requests with the same token race on the token row lock; exactly one succeeds. Time: expiry on the server clock.
- **Depends on:** EP-25-S6, EP-03-S4, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S9: System can rate-limit token requests and attempts

- **Story ID:** EP-25-S9
- **Status:** Not started
- **Title:** System can rate-limit token requests and attempts
- **As a:** System
- **I want:** limits on how many tokens an owner can request per period, how many tokens one proposal can have issued, and how many wrong attempts one token allows before it is burnt, filled into the EP-03-S11 rate-limit hook
- **So that:** nobody can guess a token by trying many codes, and the owner's WhatsApp cannot be flooded with codes (FR-25-8, BR-25-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a limit of A wrong attempts per token (a configuration value), when the Ath wrong token is entered for ED-102, then the token is burnt, later attempts with any code are refused with "Too many wrong tokens. Ask for a new one.", and the piece is unchanged.
  2. Given a limit of R token requests per proposal per period, when Sanjay Seth asks for the R+1th token on ED-102 inside the period, then the request is refused with `rate_limited` and "Too many codes sent. Wait a few minutes and try again.", and nothing is sent.
  3. Given a limit of O token requests per owner per period across all proposals, when it is exceeded, then further requests are refused the same way, whichever proposal they are for.
  4. Given the period has passed, when Sanjay asks again, then a new token is issued and sent.
- **Rules enforced on the server:** Limits run before any token is created or any message is sent. Counters are kept per owner user id and per proposal id and are shared across api instances. A burnt token is marked used-up with reason `too_many_attempts`. Limit values come from environment configuration; EP-39 sets the final values across the API.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. A burnt token changes no proposal or piece state; the burn is recorded on the token record (`used reason` `too_many_attempts`) and passed to EP-39 security monitoring. Requests refused by the rate limit store nothing.
- **Data changes:** Updates `edit_tokens.used at` and adds a `used reason` column (`applied`, `reissued`, `too_many_attempts`) by migration. Rate-limit counters live in the store chosen for the EP-03-S11 hook.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply`. The rate-limit messages are not yet designed.
- **Non-functional checks:** Security: per-token attempt limit stops guessing of the 1 000 000 possible codes; per-owner and per-proposal limits stop flooding. Availability: counters survive one api instance restart. Open question: final limit values are not set in the epic.
- **Depends on:** EP-25-S6, EP-25-S8, EP-03-S11, EP-04-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S10: Owner can refuse a proposal

- **Story ID:** EP-25-S10
- **Status:** Not started
- **Title:** Owner can refuse a proposal
- **As a:** Owner
- **I want:** to press "Refuse" on `edit-apply` or on the Decisions card, without a token, so the proposal becomes `refused` and the piece keeps its value
- **So that:** a change I do not agree with is closed and the proposer knows (FR-25-11, FR-25-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-101 is `proposed`, when Sanjay Seth presses "Refuse", then ED-101 is `refused` with decided by Sanjay and decided at set, TAG-9012 keeps stone count 4, and Deepak Rao's drawer shows "The owner refused this edit".
  2. Given ED-102 is `token_sent`, when Sanjay refuses it, then it becomes `refused` and its open token is marked used-up so it can never apply.
  3. Given ED-101 is already `refused`, when Sanjay presses "Refuse" or "Yes, send me a token" again, then the server refuses with "This proposal has already been decided." (FR-25-12).
  4. Given Deepak Rao calls refuse directly, when it reaches the server, then it is refused with `forbidden` and ED-101 is unchanged.
- **Rules enforced on the server:** Update Refuse edit is Owner only (EP-05-S2, FR-25-16). The proposal must be `proposed` or `token_sent`; the row is version-checked. No token is needed. A refusal reason is optional until the section 17 question is answered; if given, it is trimmed and stored.
- **Live events emitted / consumed:** Emitted after commit: "Edit proposed / token sent" with edit id and status `refused`, to Owner screens and the proposer, so the card disappears and the proposer's drawer updates. Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor (owner), role, time, entity (edit id and tag number), action `edit_refused`, before (status), after (`refused`, field, from, to), proposer, reason if given.
- **Data changes:** Updates `piece_edits.status`, `decidedBy`, `decidedAt`, and an optional `refuseReason` column by migration; sets `edit_tokens.used at` with `used reason` `refused`, a value added to the EP-25-S9 list by the same migration. Adds Update Refuse edit to the shared contract and ports `refuseEdit`.
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` ("Refuse"); `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Refuse"). A refusal reason box is not yet designed.
- **Non-functional checks:** Concurrency: refuse and apply on the same proposal are serialised by the row lock; the second gets "This proposal has already been decided." Security: owner role checked on the server.
- **Depends on:** EP-25-S1, EP-25-S4, EP-25-S6, EP-25-S9, EP-05-S2, EP-02-S14, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S11: System can void open proposals when a piece is sold or scrapped

- **Story ID:** EP-25-S11
- **Status:** Not started
- **Title:** System can void open proposals when a piece is sold or scrapped
- **As a:** System
- **I want:** a shared service function, Void open edits on a piece, that the sale and scrap operations call inside their own transaction to set every `proposed` or `token_sent` proposal on the piece to `void` with void reason `sold` or `scrapped` and burn its token
- **So that:** the piece stays sellable while the owner decides, and a sale never leaves a proposal that could later change a billed piece (FR-25-13, BR-25-5, BR-25-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 is open on TAG-8841, when Deepak Rao sells TAG-8841, then in the same transaction ED-102 becomes `void` with void reason `sold`, and the owner's "STAFF WANTS A CODE" card for it disappears (epic acceptance criterion 5).
  2. Given ED-102 was `token_sent`, when it is voided, then its token is marked used-up, and if Sanjay Seth enters it a moment later the server refuses with "This proposal has already been decided."
  3. Given the owner scraps a piece with an open proposal, when the scrap commits, then the proposal is `void` with void reason `scrapped`.
  4. Given the sale transaction rolls back, when the piece is read, then it is still `in_stock` and the proposal is still open, because the void ran in the same transaction.
  5. Given a piece with no open proposal, when it is sold, then the function changes nothing and writes no audit entry.
- **Rules enforced on the server:** The function is internal; no browser may call it. It runs after the caller has locked the piece row and moved it to `billed` or `scrapped` through Update Piece state (EP-22-S2). Only `proposed` and `token_sent` rows are voided. The stock-out (EP-26) and scrap (EP-27) operations call it; this story provides it and its tests with the EP-22-S6 sale transition.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" on Owner screens to refetch the proposal list (EP-25-S4). Emitted after commit: "Edit proposed / token sent" with status `void` for each voided proposal, so the proposer's drawer updates.
- **Audit entry written:** Yes, through EP-25-S14: actor (the seller or the owner who scrapped), role, time, entity (edit id and tag number), action `edit_voided`, before (status), after (`void`, void reason).
- **Data changes:** Updates `piece_edits.status`, `voidReason`, `decidedAt`; sets `edit_tokens.used at` with `used reason` `voided`, a value added to the EP-25-S9 list. Ports the void step of `stockOut` and `ownerScrap` from `src/store/transitions.ts` into one function.
- **UI reference:** No screen of its own. The card disappears from `docs/ux/mockups/08-owner-home.svg`, route `decisions`; "The piece stays sellable while he decides" on `docs/ux/mockups/05-edit-propose-apply.svg`.
- **Non-functional checks:** Concurrency: the sale and an apply on the same piece are serialised by the piece row lock; whichever commits first wins and the other is refused with its sentence (epic section 13). Open decision A4: if a piece is instead frozen while an edit is open, this story changes to refusing the sale.
- **Depends on:** EP-25-S1, EP-25-S6, EP-25-S9, EP-22-S2, EP-22-S6, EP-22-S8, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S12: Staff can see the applied change live on stock screens

- **Story ID:** EP-25-S12
- **Status:** Not started
- **Title:** Staff can see the applied change live on stock screens
- **As a:** Staff
- **I want:** the new value on the stock list, search results, piece drawer and pure-gold total to appear within about 1 second of the owner applying, and my own proposal to show "Applied by Sanjay Seth"
- **So that:** nobody at the counter quotes the old weight after the tag has changed (FR-25-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma has TAG-8841 open in the drawer on `stock`, when Sanjay Seth applies ED-102, then within about 1 second the drawer shows gross 48.6100 g and pure gold 41.5500 g without a reload, and the edit history shows the change.
  2. Given Deepak Rao has the stock list open, when ED-102 is applied, then the TAG-8841 card shows 48.6100 g and the "pure gold on the floor" total drops by 0.0400 g.
  3. Given Rajesh's own proposal, when it is applied, then his screen shows "Applied by Sanjay Seth" with the time in Asia/Kolkata and "Edit tag" is enabled again.
  4. Given a karigar is signed in, when "Edit applied" is published, then the karigar's connection does not receive it (EP-07-S5).
  5. Given Rajesh's connection dropped during the apply, when it reconnects, then it catches up and shows 48.6100 g (EP-08-S10).
- **Rules enforced on the server:** "Edit applied" is published only after commit (EP-07-S1), only to Staff and Owner, and carries the piece version so clients ignore an older copy.
- **Live events emitted / consumed:** Consumed: "Edit applied" to refetch List Pieces, Read Piece, Stock totals and the proposer's proposal (EP-08-S8 event map).
- **Audit entry written:** No. Display only.
- **Data changes:** None in the product database. Adds "Edit applied" to the EP-08-S8 event map for the stock reads.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` (piece cards and drawer); "staff see it update in stock" on `docs/ux/mockups/05-edit-propose-apply.svg`.
- **Non-functional checks:** Performance: new value visible within about 1 second (epic section 13). Precision: grams shown to 4 decimals. Availability: missed events are recovered on reconnect.
- **Depends on:** EP-25-S7, EP-07-S1, EP-07-S5, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10, EP-22-S3, EP-22-S5, EP-22-S7, EP-22-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S13: Staff can see a piece's edit history

- **Story ID:** EP-25-S13
- **Status:** Not started
- **Title:** Staff can see a piece's edit history
- **As a:** Staff
- **I want:** an "Edit history · N entries" section in the piece drawer that lists every applied and refused proposal on the piece, newest first, with field, old and new value, proposer, reason, decision, who decided and when
- **So that:** anyone handling the piece can see every change made to its tag and every change the owner turned down (FR-25-17, BR-25-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 was applied and an earlier proposal on TAG-8841 was refused, when Rajesh Verma opens TAG-8841 on `stock`, then the drawer shows "Edit history · 2 entries" with "Gross 48.6500 → 48.6100 g · Rajesh Verma · Applied by Sanjay Seth" and the refused one below it.
  2. Given a proposal is still `proposed` or `token_sent`, when the history is read, then it is not listed as history; the drawer shows it as "Waiting for the owner" instead.
  3. Given a proposal voided by a sale, when the history of the billed piece is read, then it is listed as "Void · piece sold".
  4. Given Vijay Kumar (Karigar) calls List Piece edit history, when it reaches the server, then it is refused with `forbidden`.
  5. Given the history entry for ED-102, when it is shown, then it holds no token digits.
- **Rules enforced on the server:** List Piece edit history is Staff and Owner only (EP-05-S2). It returns `applied`, `refused` and `void` rows only. Weights are returned as integers and formatted to 4 decimals by the shared formatter. No token data is returned.
- **Live events emitted / consumed:** Consumed: "Edit applied" and "Edit proposed / token sent" to refetch the history of an open drawer.
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds List Piece edit history to the shared contract and feeds the "Edit history" section of Read Piece (EP-22-S5).
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Edit history · 2 entries").
- **Non-functional checks:** Precision: grams to 4 decimals from integers. Time: decided times in Asia/Kolkata. Security: no token data in the response. Personal data: reasons may name a customer and are shown only to Staff and Owner.
- **Depends on:** EP-25-S1, EP-25-S7, EP-25-S10, EP-25-S11, EP-22-S5, EP-05-S2, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-25-S14: System can audit every step without the plain token

- **Story ID:** EP-25-S14
- **Status:** Not started
- **Title:** System can audit every step without the plain token
- **As a:** System
- **I want:** propose, token request, apply, refuse and void to each write one audit entry in the same transaction, with the kinds `edit_proposed`, `edit_token_sent`, `edit_applied`, `edit_refused` and `edit_voided`, and a token reference that is the token record id, never the 6 digits
- **So that:** the owner can trace every tag change to the proposer, the reason and the token he used, and nobody can read a token from the log (FR-25-14, BR-25-8, BR-25-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth applies ED-102, when the entry is read on the Security log, then it shows action `edit_applied`, entity TAG-8841, gross before 48.6500 g and after 48.6100 g, net gold before 41.5900 g and after 41.5500 g, proposer Rajesh Verma, the reason, and "Token used", with no 6-digit token in summary, before, after or reason (EP-06-S4).
  2. Given Rajesh proposes ED-102 and Sanjay asks for a token, when the log is filtered by entity TAG-8841, then it shows `edit_proposed` and `edit_token_sent` entries in order, the second with a token reference and the EP-12 sent message id.
  3. Given ED-102 is voided by a sale, when the log is read, then an `edit_voided` entry has the seller as actor and void reason `sold`.
  4. Given the apply transaction fails after the audit insert, when it rolls back, then neither the piece change nor the audit entry is kept (EP-06-S2).
  5. Given the CI test runs every edit flow and searches all audit rows and log lines for the issued 6 digits, when it finishes, then no match is found (epic section 16 risk).
- **Rules enforced on the server:** Entries are written through the EP-06-S2 writer inside each operation's transaction. Before and after come from the locked rows (EP-06-S3). Weights in entries are integer units (EP-06-S5). The token reference is the `edit_tokens` id (EP-06-S4). The three new kinds are added to the EP-06-S7 action list. Entries cannot be edited or deleted (EP-06-S1).
- **Live events emitted / consumed:** None. The audited operations publish their own events.
- **Audit entry written:** Yes: actor, role, time, entity (edit id and tag number), action, before, after, proposer, reason, and token reference for `edit_token_sent` and `edit_applied`.
- **Data changes:** Inserts into `audit_entries`. Adds `edit_proposed`, `edit_token_sent` and `edit_voided` to the shared action list (EP-06-S7); `edit_applied` and `edit_refused` already exist.
- **UI reference:** No screen of its own. Entries are read on the Security log (EP-06-S9 to EP-06-S11, "Tag edits" filter).
- **Non-functional checks:** Audit: every state change audited, append-only (PRODUCTION-SCOPE §5). Security: no token value in any entry or log line. Precision: weights stored as integers in entries. Personal data: reasons in the append-only log may name a customer.
- **Depends on:** EP-25-S2, EP-25-S5, EP-25-S7, EP-25-S10, EP-25-S11, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S4, EP-06-S5, EP-06-S7, EP-06-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A4: does a piece stay sellable while an edit proposal is open, or is it frozen pending the edit? (EP-25-S2, EP-25-S11)
- G18: may the owner switch off the edit token (mockup 08 "Code before a tag edit · On"), given §5 requires it? (EP-25-S5, EP-25-S7)
- UX-SPEC Q5: may the owner approve a code request by replying on WhatsApp instead of opening the app? (EP-25-S5, EP-25-S7)
- D8: which provider and which approved template carries the token message? (EP-25-S5)
- May a piece have more than one open proposal at once, on the same or different fields? (EP-25-S1, EP-25-S2)
- May the proposer withdraw a proposal before the owner decides? (EP-25-S1, EP-25-S10)
- Must the owner give a reason when refusing? (EP-25-S10, EP-25-S14)
