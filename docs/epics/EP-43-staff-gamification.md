# EP-43: Staff gamification

## 1. Summary

Every stock-out already records which staff member sold the pieces, and the staff form says sales "will be counted
to Deepak — used later for gamification". This epic uses that attribution. It keeps a full history of attributed
sales per staff member, gives the owner a staff performance view, adds scoring rules once the owner defines them,
and shows a leaderboard. The scoring rules were deliberately deferred during design, so this epic starts with the
history and a read-only view and leaves the scoring formula to the owner.

## 2. Layer, milestone, status

- Layer: F · Later
- Milestone: None (Layer F, later; not in a PRODUCTION-SCOPE §7 milestone)
- Prototype status: Partial. `stockOut` records `sellerId` and adds the number of pieces to `StaffMember.salesCount`, and `staff-directory` shows the count; there is no sales history view, no scoring and no leaderboard.

## 3. Roles involved

- Owner: defines the scoring rules, reads the staff performance view, decides who sees the leaderboard.
- Staff: are credited for their sales; see their own figures and the leaderboard if the owner allows it.
- Karigar: not involved; karigars do not sell.
- System: keeps attributed sales from stock-out records, computes counts and scores for a period, and refreshes the leaderboard when a sale is recorded.

## 4. In scope

- Attributed sales history per staff member, read from stock-out records: pieces, pure gold, time, reference.
- A staff performance view for the owner, read-only first (SCOPE-ANALYSIS §5 group F "staff performance view (gamification-ready, read-only for now)").
- A period picker for the view (week, month, custom, as decided).
- Scoring rules defined by the owner (deferred in design; SCOPE-ANALYSIS §7).
- A leaderboard ranked by the decided score.
- A staff member's own figures, if the owner allows it.
- Handling of a split sale between two staff, if SCOPE-ANALYSIS Q10 says sales can be split.

## 5. Out of scope

- Recording the seller on a stock-out (EP-26).
- Staff accounts and roles (EP-05).
- Any score based on money value (EP-42 must exist first; the rule is decided here only after pricing is on).
- Owner reports per section (EP-35).
- Rewards, bonuses or pay linked to scores; no epic owns them.

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `StockOutRecord { pieceIds, sellerId, sellerName, ref, invoiceNo, at, amountINR }`; `StaffMember.salesCount: number`.
- `src/store/transitions.ts` `stockOut`: the seller defaults to the actor (`a.sellerId ?? a.by.id`) and `salesCount` grows by the number of pieces in the stock-out (`m.salesCount + ids.length`), so the count is pieces, not stock-outs. No audit of the count change beyond the `stock_out` entry.
- `src/components/stock/StockOut.tsx` (route `stock-out`): "Who sold it" picker; mockup 06 "goes to their count, for later gamification".
- `src/components/people/StaffDirectory.tsx` (route `staff-directory`, owner only): shows "{n} sales" per staff member and "No sales counted" for the owner.
- `src/data/seed.ts`: ST-01 Rajesh Verma 38, ST-02 Deepak Rao 26, ST-03 Sanjay Seth 0; seeded `StockOutRecord` rows with seller ids.
- `docs/ux/mockups/10-navigation-map.mmd`: node `PEOPLE["Staff performance<br/>every sale has a seller"]`, reached from the owner and from a sale.
- Reusable: the seller on every stock-out record, the directory row, the stock-out seller picker.
- Must be rebuilt server-side: the count as a query over stock-out records (not a stored counter that can drift), the performance view, the scoring rules and the leaderboard.

## 7. Functional requirements

- FR-43-1. The system derives each staff member's sales from stock-out records, not from a separate counter.
- FR-43-2. The owner can see, per staff member, pieces sold, stock-outs recorded and pure gold sold for a chosen period.
- FR-43-3. The owner can open one staff member's sales history with piece, tag, pure gold, reference and time.
- FR-43-4. The staff directory count matches the performance view for the same period.
- FR-43-5. A scrapped piece, which has no seller in the prototype (`requestScrap`, `ownerScrap`), is counted or not counted as the owner decides (see section 17).
- FR-43-6. The owner can define scoring rules once they are decided, and the system computes a score per staff member for a period.
- FR-43-7. The system shows a leaderboard ranked by score for the chosen period.
- FR-43-8. A staff member can see their own figures and the leaderboard only if the owner allows it.
- FR-43-9. A new stock-out updates open performance views and the leaderboard within about 1 second.
- FR-43-10. If a sale can be split between two staff (Q10), the system credits each by the decided share.
- FR-43-11. A change to the scoring rules is audited and applies from a stated date.

## 8. Business rules

- BR-43-1. Every sale is counted to the staff member who made it. [mockup 25]
- BR-43-2. The seller's count is used later for gamification. [mockup 06; mockup 25]
- BR-43-3. Every sale has a seller. [10-navigation-map.mmd PEOPLE node]
- BR-43-4. Gamification scoring rules are deferred. [SCOPE-ANALYSIS §7]
- BR-43-5. The staff performance view is gamification-ready and read-only for now. [SCOPE-ANALYSIS §5 group F]
- BR-43-6. The owner shows "No sales counted". [src/components/people/StaffDirectory.tsx]
- BR-43-7. The count grows by the number of pieces in a stock-out. [src/store/transitions.ts stockOut]
- BR-43-8. Only the owner sees the staff directory. [src/components/people/StaffDirectory.tsx]
- BR-43-9. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Attributed sale (derived from StockOutRecord, EP-26): stock-out id, seller id, pieces, pure gold per piece (integer, units of 0.0001 g), at.
- SaleShare (only if Q10 allows splits): stock-out id, staff id, share.
- ScoringRule: id, version, description, parameters, effective from, set by.
- StaffScore (computed or cached): staff id, period, pieces, stock-outs, pure gold (integer, units of 0.0001 g), score, rule version.
- LeaderboardVisibility setting: owner only, or staff too.
- `StaffMember.salesCount` becomes derived; no stored counter.
- `StockOutRecord.amountINR` stays a nullable value socket, unused until EP-42.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Staff performance | Pieces, stock-outs and pure gold per staff for a period | Owner |
| Read | Staff sales history | One staff member's attributed sales | Owner; Staff for self if allowed |
| Create | Scoring rule | Define a new version of the scoring rules | Owner |
| List | Scoring rules | Current and past versions | Owner |
| Read | Leaderboard | Ranked scores for a period | Owner; Staff if allowed |
| Update | Leaderboard visibility | Choose who sees the leaderboard | Owner |

## 11. Live events

- Consumes: "Piece billed by one staff member" — to add the sale to the seller's figures and refresh the leaderboard.
- Emits: none.

## 12. Screens and UX references

- Route ids: `staff-directory` (sales count per staff member), `stock-out` ("Who sold it").
- Mockups: `25-onboard-staff.svg` ("Sales will be counted to Deepak — used later for gamification"), `06-stock-out.svg` ("Who sold it", "goes to their count, for later gamification"), `10-navigation-map.mmd` ("Staff performance, every sale has a seller").
- Not yet designed: the staff performance view, one staff member's sales history and the leaderboard (SCOPE-ANALYSIS §5 group F lists the view; no mockup draws it).

## 13. Non-functional requirements

- Precision: pure gold sold is an integer sum in units of 0.0001 g.
- Concurrency: a sale counts once even if the stock-out request is retried, using the stock-out id.
- Security: the performance view and leaderboard are checked on the server against the visibility setting; a staff member can read only their own history.
- Audit: scoring rule changes and visibility changes are appended with before and after.
- Performance: the performance view for a month loads in under 2 seconds; the leaderboard refreshes within about 1 second of a sale.
- Time: periods are Asia/Kolkata days.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-26, EP-08
- Downstream: None.

## 15. Epic acceptance criteria

1. Given Rajesh records a stock-out of 2 pieces with 54.190 g pure gold, when the owner opens the performance view for today, then Rajesh shows 2 pieces, 1 stock-out and 54.1900 g.
2. Given a piece is scrapped, when the performance view is read, then the scrapped piece is counted or left out as the owner decided (section 17).
3. Given the leaderboard is set to owner only, when Deepak asks for it, then the server refuses.
4. Given the owner saves a new scoring rule effective from 1 December, when the leaderboard for December is read, then it uses the new rule and November uses the old one.
5. Given Deepak records a stock-out while the owner has the leaderboard open, when it commits, then the owner's leaderboard updates within about 1 second.

## 16. Risks

- Risk: a stored counter drifts from the stock-out records. Mitigation: derive counts from records only.
- Risk: scoring by pieces rewards selling many light pieces over one heavy piece. Mitigation: show pieces and pure gold side by side until the owner decides the rule.
- Risk: a public leaderboard causes friction between staff. Mitigation: the owner decides visibility before build (section 17).
- Risk: staff pick another person as seller to move credit. Mitigation: audit the seller on every stock-out and show the recorder alongside the seller.

## 17. Open decisions and questions

- SCOPE-ANALYSIS Q10: is a sale one staff member only, or can it be split between two?
- What do the scoring rules count: pieces, stock-outs, pure gold, leads converted, or a mix (SCOPE-ANALYSIS §7 defers this)?
- Is a score ever based on value, once EP-42 is on?
- Who sees the leaderboard: the owner only, or all staff?
- What periods does the leaderboard use (week, month, festival season)?
- Does a scrap count toward performance (SCOPE-ANALYSIS §3 calls scrap "a second sale type")?
- Does the owner's own selling count, given "No sales counted" today?
- Are wishes sent, leads handled or parcels tagged part of performance, or only sales?

## 18. Candidate stories

1. EP-43-S1: System can derive attributed sales from stock-out records
2. EP-43-S2: System can leave scrapped pieces out of sales unless scrap is decided to count
3. EP-43-S3: Owner can see pieces, stock-outs and pure gold per staff member for a period
4. EP-43-S4: Owner can open one staff member's sales history
5. EP-43-S5: System can keep the staff directory count equal to the derived count
6. EP-43-S6: Owner can define a versioned scoring rule
7. EP-43-S7: System can compute a score per staff member for a period
8. EP-43-S8: Owner can see the leaderboard
9. EP-43-S9: Owner can choose whether staff see the leaderboard
10. EP-43-S10: Staff can see their own figures and the leaderboard when allowed
11. EP-43-S11: System can refresh the leaderboard live after a stock-out
12. EP-43-S12: System can credit a split sale by share (if Q10 allows it)
