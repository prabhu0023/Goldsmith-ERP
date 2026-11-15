# EP-25: Edit proposals

## 1. Summary

Once a piece is in stock, staff cannot change its tag. If a weight, stone count, purity, HUID or name is wrong, a staff
member proposes the change with a reason. The owner reads it, asks for a one-time token that arrives on his own
WhatsApp, and applies the change by typing that token. The two factors are his signed-in session and the phone he
holds. Every applied or refused change is kept in the audit log with the old value, the new value, the proposer, the
reason and a token reference. The business needs this because a tag weight is the record of how much gold is on the
floor, and nobody should be able to quietly shave milligrams off it.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M4 Exceptions
- Prototype status: Built. `proposeEdit`, `ownerAgreeEdit`, `applyEdit`, `refuseEdit` and the screens `edit-propose` and `edit-apply` work on mock data with a locally generated token; real WhatsApp delivery, server checks, rate limiting and token hashing are absent.

## 3. Roles involved

- Staff: proposes a change to one field of an in-stock piece with a reason; sees the result when the owner decides; never edits the field.
- Owner: reads the proposal, agrees and asks for a token, or refuses; enters the token and applies the change; may also propose.
- Karigar: not involved.
- System: validates the proposal, issues and sends the token through EP-12, checks it once within 10 minutes, applies the change, voids open proposals when a piece is sold or scrapped, and writes the audit entry.

## 4. In scope

- Proposal on one field of one in-stock piece: `grossG`, `stoneG`, `stoneCount`, `purity`, `huid`, `name`.
- Reason of at least 3 characters, shown to the owner.
- Refusal when the new value equals the current one ("That is already the {field}.").
- Proposal states: proposed, token_sent, applied, refused, void.
- Owner agreement that issues a 6-digit token, single use, valid 10 minutes, rate-limited, sent to the owner's WhatsApp.
- Owner apply with the token; refusal of a wrong, expired or reused token.
- Owner refuse without a token.
- Re-validation at apply time: piece still in_stock, stones not heavier than gross.
- Automatic void of open proposals when the piece is sold (EP-26) or scrapped (EP-27).
- Audit entry with field, before, after, proposer, reason, net gold before and after, and a token reference (never the token in plain text).
- Live notice to the owner on proposal and to the proposer and stock screens on apply.
- The `requireEditToken` setting and its conflict with PRODUCTION-SCOPE §5 (G18): recorded, not decided.

## 5. Out of scope

- Sending the WhatsApp message and template approval (EP-12).
- Notification routing and in-app alerts (EP-11).
- The setting store and who may change `requireEditToken` (EP-13, G12, G18).
- The audit log store and viewer (EP-06).
- Tagging a piece for the first time inside an open parcel (EP-21); that is not an edit.
- Changing a billed piece: never allowed (EP-26 locks it).
- The Decisions card layout (EP-32).
- Owner sign-in OTP (EP-04); this token is separate.

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `EditableField = 'grossG' | 'stoneG' | 'stoneCount' | 'purity' | 'huid' | 'name'`; `EditStatus = 'proposed' | 'token_sent' | 'applied' | 'refused' | 'void'`; `PieceEdit { id, pieceId, field, from, to, reason, proposedBy, proposedAt, status, token, tokenIssuedAt, decidedAt }`; `Settings.requireEditToken`.
- `src/domain/edits.ts`: `TOKEN_TTL_MS = 10 * MIN`; `makeToken(seq)` derives 6 digits from the store counter; `checkToken` returns ok, wrong, expired or none; `formatToken` shows "480 913".
- `src/store/transitions.ts`:
  - `proposeEdit` requires `in_stock` ("{id} is not in stock, so it cannot be edited."), a reason ("Say why. The owner will read this."), and a changed value.
  - `ownerAgreeEdit` (owner only) sets `token_sent` and a fresh token; calling it again re-issues.
  - `applyEdit` (owner only) checks `requireEditToken`, the token ("That token has expired. Ask for a new one.", "That token is not right. Check the code on your WhatsApp."), refuses billed ("{id} is billed. Its weights are frozen."), checks stones not above gross, and audits `edit_applied` with "Token {token}" in the detail. The plain token in the audit must not be carried into production.
  - `refuseEdit` (owner only) audits `edit_refused`.
  - `stockOut` and `ownerScrap` set open proposals to `void`.
- `proposeEdit` and `ownerAgreeEdit` are not audited. A token is never actually single-use: a second apply fails only because the status is then `applied`.
- Selectors: `openEditFor(s, pieceId)`; `ownerQueues.pendingEdits` counts all open edits as one blocking card.
- Components: `src/components/stock/EditPropose.tsx` (route `edit-propose`, param `pieceId`), `src/components/stock/EditApply.tsx` (route `edit-apply`, param `editId`), `src/components/ui/OtpPanel.tsx`, the "Propose edit" button (mockup 03 calls it "Edit tag"; disabled while an edit is open on the piece) and edit history in `PieceDrawer.tsx`, the toggle in `OwnerDecisions.tsx` rules panel.
- Seed: ED-101 and ED-102 (mockup 13 "2 edits proposed").
- Reusable: the field list, state list, sentences, propose and apply screens, OTP panel.
- Must be rebuilt server-side: token generation with a secure random source, hashed storage, single use, rate limit, delivery through EP-12, owner check, transactional apply with a row lock on the piece, audit of every step without the plain token.

## 7. Functional requirements

- FR-25-1. A staff member can propose a new value for one editable field of an in-stock piece with a reason of at least 3 characters.
- FR-25-2. The server refuses a proposal on a piece that is not in_stock.
- FR-25-3. The server refuses a proposal whose new value equals the current one.
- FR-25-4. The server validates the new value for its field: weights are positive integers in units of 0.0001 g, stone weight does not exceed gross, stone count is a whole number, purity is one of the purities in reference data (EP-15), and a new HUID is not used on another piece.
- FR-25-5. The owner sees each open proposal with the piece, field, old and new values, the change in mg for weights, the effect on pure gold, the proposer and the reason.
- FR-25-6. The owner can agree, which issues a 6-digit token and sends it to the owner's registered WhatsApp number.
- FR-25-7. The token is single use and expires 10 minutes after issue.
- FR-25-8. Token requests and token attempts are rate-limited per owner and per proposal.
- FR-25-9. The owner can apply the change by entering the token; the server rejects a wrong, expired or already used token.
- FR-25-10. At apply time the server re-checks that the piece is in_stock and that stones do not exceed gross.
- FR-25-11. The owner can refuse a proposal without a token.
- FR-25-12. A decided proposal (applied, refused or void) cannot be decided again.
- FR-25-13. Selling or scrapping the piece voids every open proposal on it in the same transaction.
- FR-25-14. Every proposal, token request, apply, refuse and void writes an audit entry; the apply entry has before, after, proposer, reason and a token reference, never the token itself.
- FR-25-15. The proposer and every stock screen see the new value within about 1 second of apply.
- FR-25-16. The server refuses agree, apply and refuse from any role other than owner.
- FR-25-17. The piece's edit history lists all applied and refused proposals.

## 8. Business rules

- BR-25-1. Staff describe the change and the reason but never touch the field. [mockup 05]
- BR-25-2. The owner applies an approved edit, with a token from his own WhatsApp. [SCOPE-ANALYSIS App. B Q4; mockup 05]
- BR-25-3. Token: 6 digits, single use, 10-minute expiry, rate-limited, never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-25-4. Two factors: the owner is signed in and holds the phone. [mockup 05 "Two factors: you are signed in, and you hold the phone. Valid 10 minutes."]
- BR-25-5. The piece stays sellable while the owner decides, and the proposal voids itself if the piece sells. [SCOPE-ANALYSIS App. A A4, still an assumption; mockup 05 "The piece stays sellable while he decides"]
- BR-25-6. A billed piece's weights are frozen. [mockup 06 "No edit, not even by the owner"; mockup 12]
- BR-25-7. Only an in_stock piece can be edited. [src/store/transitions.ts proposeEdit, applyEdit]
- BR-25-8. The change is kept against the proposer's name, the owner's token, the old and new values. [mockup 05 "AFTER YOU APPLY"]
- BR-25-9. Every state change is audited, append-only. [PRODUCTION-SCOPE §5 Audit]
- BR-25-10. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- PieceEdit: id, piece id, field, from value, to value (weights as integers, units of 0.0001 g; text fields as strings), reason, proposed by (user id), proposed at, status, decided by, decided at, void reason (sold or scrapped).
- EditToken: edit id, token hash, issued at, expires at (issued at + 10 minutes), used at (nullable), attempts count, sent message id from EP-12.
- Piece: the edited field; derived net gold (integer, units of 0.0001 g).
- Audit entries: `edit_proposed` (new kind), `edit_token_sent` (new kind), `edit_applied`, `edit_refused`, `edit_voided` (new kind).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Edit proposal | Propose a new value for one field with a reason | Staff, Owner |
| List | Open edit proposals | Owner's queue | Owner |
| Read | Edit proposal | Details, old and new values, pure-gold effect | Owner, the proposer |
| Create | Edit token | Agree and send a token to the owner's WhatsApp | Owner |
| Update | Apply edit | Apply with the token | Owner |
| Update | Refuse edit | Refuse the proposal | Owner |
| List | Piece edit history | Applied and refused edits on one piece | Staff, Owner |

## 11. Live events

- Emits: "Edit proposed / token sent" — when a staff member proposes, and again when the owner asks for a token, for the owner's Decisions card and the proposer's screen.
- Emits: "Edit applied" — when the owner applies, for the proposer and every stock screen.
- Consumes: "Piece billed by one staff member" — to void open proposals on that piece and update the owner's card.

## 12. Screens and UX references

- Route ids: `edit-propose` (EditPropose, param pieceId), `edit-apply` (EditApply, param editId), `stock` (PieceDrawer "Propose edit" and edit history), `decisions` (pending edits card).
- Mockups: `05-edit-propose-apply.svg` (TAG-8841 48.6500 to 48.6100 g, "taking off 40 mg", pure gold 41.590 to 41.550 g, token "480 913", "Valid 10 minutes"), `03-showroom-stock.svg` ("Edit tag", edit history), `08-owner-home.svg` ("STAFF WANTS A CODE · Send the code / Refuse"; "YOUR RULE · Code before a tag edit · On"), `12-state-lifecycles.svg` (edit rail), `13-notifications-escalation.svg` ("2 edits proposed on tags in stock").

## 13. Non-functional requirements

- Security: the token is generated from a secure random source, stored hashed, used once, expires after 10 minutes, and attempts are rate-limited; owner role checked on the server for agree, apply and refuse.
- Audit: proposal, token request, apply, refuse and void each write an entry; the token reference is an id or hash, never the 6 digits.
- Concurrency: apply locks the piece row; a stock-out and an apply on the same piece cannot both succeed; the loser gets a clear message.
- Precision: weight values are integers in units of 0.0001 g; the mg change and pure-gold effect are computed from integers.
- Performance: the token arrives on WhatsApp within the provider's normal delivery time; the owner card appears within about 1 second of a proposal.
- Personal data: the owner's phone number is used only for token delivery.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-22, EP-12, EP-08
- Downstream: EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given TAG-8841 is in_stock at 48.6500 g gross, when Rajesh proposes 48.6100 g with a reason, then the owner sees "48.6500 → 48.6100 g (−40 mg)" and the piece is unchanged.
2. Given the owner agrees, when the token is issued, then a 6-digit token reaches the owner's WhatsApp and only a hash is stored.
3. Given a token issued 11 minutes ago, when the owner enters it, then the server rejects it as expired and the field is unchanged.
4. Given the owner applied the change with a token, when the same token is entered again for another proposal, then it is rejected.
5. Given an open proposal on TAG-8841, when another staff member stocks the piece out, then the proposal becomes void and the owner's card disappears.
6. Given a staff user calls apply directly, when the request reaches the server, then it is refused and the piece is unchanged.

## 16. Risks

- Risk: the token leaks through logs, as in the prototype's audit detail. Mitigation: store a hash, log a reference only, test that no log line holds 6 digits from a token.
- Risk: the owner switches off `requireEditToken` and the second factor disappears. Mitigation: settle G18 before build; until then keep the token mandatory as §5 says.
- Risk: WhatsApp delivery is slow and staff wait at the counter. Mitigation: show token status, allow re-request within the rate limit, monitor send failures (EP-37).
- Risk: a piece sells while the owner is applying. Mitigation: row lock on the piece and void-on-sale in the same transaction.
- Risk: A4 is overturned and a seventh state "frozen pending edit" is needed. Mitigation: keep the piece state machine in EP-22 open to a new state.

## 17. Open decisions and questions

- A4: does a piece stay sellable while an edit proposal is open, or is it frozen pending the edit?
- G18: may the owner switch off the edit token (mockup 08 "Code before a tag edit · On"), given §5 requires it?
- UX-SPEC Q5: may the owner approve a code request by replying on WhatsApp instead of opening the app?
- D8: which provider and which approved template carries the token message?
- May a piece have more than one open proposal at once, on the same or different fields?
- May the proposer withdraw a proposal before the owner decides?
- Must the owner give a reason when refusing?

## 18. Candidate stories

1. EP-25-S1: System can store edit proposals with their states
2. EP-25-S2: Staff can propose a change to one field of an in-stock piece
3. EP-25-S3: System can validate the proposed value for its field
4. EP-25-S4: Owner can see open proposals with old value, new value and reason
5. EP-25-S5: Owner can agree and receive a token on WhatsApp
6. EP-25-S6: System can store the token hashed with a 10-minute expiry
7. EP-25-S7: Owner can apply a change with the token
8. EP-25-S8: System can reject a wrong, expired or reused token
9. EP-25-S9: System can rate-limit token requests and attempts
10. EP-25-S10: Owner can refuse a proposal
11. EP-25-S11: System can void open proposals when a piece is sold or scrapped
12. EP-25-S12: Staff can see the applied change live on stock screens
13. EP-25-S13: Staff can see a piece's edit history
14. EP-25-S14: System can audit every step without the plain token
