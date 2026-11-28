# EP-43: Staff gamification · stories

Epic document: [EP-43 Staff gamification](../epics/EP-43-staff-gamification.md)

Role note: this is a layer F (Later) epic. Stories where the server derives sales, computes scores or checks visibility on its own use "System". Stories on the performance view, the sales history, the scoring rules and the leaderboard use "Owner", and the self view uses "Staff". Karigars do not sell and are refused every operation here. No screen in this epic is drawn yet; the route ids `staff-performance`, `staff-sales` and `leaderboard` used below are proposed. The scoring formula, scrap counting, split sales, leaderboard visibility and periods are open (section 17), so those criteria are written neutrally and the stories flag them. Every figure is pieces, stock-outs or grams, never money (EP-42 must exist first). The seed people are Sanjay Seth (Owner, ST-03, "No sales counted"), Rajesh Verma (ST-01) and Deepak Rao (ST-02). Worked examples use TAG-8841 (pure gold 41.5900 g) and TAG-9040 (pure gold 12.6000 g), sold together as 54.1900 g. Weights are integers in units of 0.0001 g and shown to 4 decimals.

---

## EP-43-S1: System can derive attributed sales from stock-out records

- **Story ID:** EP-43-S1
- **Status:** Later
- **Title:** System can derive attributed sales from stock-out records
- **As a:** System
- **I want:** one server query that reads stock-out records and returns, per seller, each attributed sale with stock-out id, seller id, pieces, pure gold per piece and time, and per period the totals of pieces, stock-outs and pure gold
- **So that:** every figure in this epic comes from the records of what was sold, and no separate counter can drift from them (FR-43-1, BR-43-1, BR-43-3, BR-43-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma records one stock-out of TAG-8841 and TAG-9040 today, when the query runs for Rajesh and today, then it returns 2 pieces, 1 stock-out and pure gold 541900 units (54.1900 g).
  2. Given Rajesh records the stock-out with Deepak Rao as seller, when the query runs, then the sale is credited to Deepak and not to Rajesh, and the recorder Rajesh is returned beside it.
  3. Given the stock-out request is retried with the same idempotency key and only one stock-out id exists, when the query runs, then the sale is counted once (epic section 13).
  4. Given a stock-out refused with "already taken", when the query runs, then it contributes nothing to any seller.
  5. Given a period of 1 to 30 November in Asia/Kolkata, when the query runs, then only stock-outs whose `at` falls inside those Asia/Kolkata days are included, and pure gold is an integer sum with no rounding.
- **Rules enforced on the server:** Sales are read from `stock_outs` and their pieces only (EP-26-S1); there is no write path. One row per stock-out id, so a retry cannot count twice (EP-03-S8, EP-26-S2). Pure gold per piece is the piece's stored integer pure gold (EP-22-S1), summed in integers (EP-35-S2). Period boundaries are Asia/Kolkata days (EP-10-S10). `amountINR` is never read.
- **Live events emitted / consumed:** None in this story. Live refresh is EP-43-S11.
- **Audit entry written:** No. The query reads records and changes nothing.
- **Data changes:** None in the product database. Adds a read model or view over `stock_outs` and pieces, and an index on seller id and `at` if the query plan needs it (migration). Adds the attributed sale shape to the shared contract.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: pure gold is an integer sum in units of 0.0001 g (epic section 13). Concurrency: counted by stock-out id, so a retried request counts once. Time: periods are Asia/Kolkata days. Performance: a month of sales for all staff returns in well under the 2-second budget of EP-43-S3.
- **Depends on:** EP-26-S1, EP-26-S2, EP-26-S12, EP-22-S1, EP-35-S2, EP-10-S10, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S2: System can leave scrapped pieces out of sales unless scrap is decided to count

- **Story ID:** EP-43-S2
- **Status:** Later
- **Title:** System can leave scrapped pieces out of sales unless scrap is decided to count
- **As a:** System
- **I want:** the attributed sales query to exclude scrapped pieces by default, with one switch point that includes them, credited to the decided person, once the owner decides scrap counts
- **So that:** a melted piece is not counted as a sale unless the owner says scrap is a second sale type (FR-43-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth marks a piece scrapped through EP-27-S6, when the performance query runs for that day, then no staff member's pieces, stock-outs or pure gold include that piece while the decision is "scrap does not count" (epic acceptance criterion 2).
  2. Given the owner decides scrap counts, when the query runs, then each scrapped piece is added to the decided person's figures (for example the staff member who requested the scrap) and shown as a separate scrap figure beside sales.
  3. Given a scrap request is declined (EP-27-S7), when the query runs, then the piece is counted in neither case.
  4. Given a piece was scrapped by the owner directly with no staff request, when scrap counts, then it is credited only as the decision says, and never to a staff member who did not request it.
- **Rules enforced on the server:** A scrapped piece has no seller in the scrap records (EP-27-S1). The include rule is applied in the shared query (EP-43-S1), not in screens. Only pieces in `scrapped` state with an approved scrap decision are candidates. The decision value is part of the scoring rule version if it is made a rule (EP-43-S6).
- **Live events emitted / consumed:** consumed: "Piece scrapped" (proposed, G26) refreshes open views when scrap counts, through EP-43-S11.
- **Audit entry written:** No. The query changes nothing; a change to the include decision is audited with the scoring rule (EP-43-S6).
- **Data changes:** None in the product database. Reads scrap requests and decisions (EP-27-S1).
- **UI reference:** No screen.
- **Non-functional checks:** Precision: scrapped pure gold, if counted, is an integer sum in units of 0.0001 g. Open question: does a scrap count toward performance (SCOPE-ANALYSIS §3 calls scrap "a second sale type"), and if so who is credited.
- **Depends on:** EP-43-S1, EP-27-S1, EP-27-S6, EP-27-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S3: Owner can see pieces, stock-outs and pure gold per staff member for a period

- **Story ID:** EP-43-S3
- **Status:** Later
- **Title:** Owner can see pieces, stock-outs and pure gold per staff member for a period
- **As a:** Owner
- **I want:** a read-only staff performance view listing each staff member with pieces sold, stock-outs recorded and pure gold sold, for a period I pick (today, week, month or custom, as decided)
- **So that:** I can see who is selling, in pieces and in grams side by side, before any scoring rule exists (FR-43-2, BR-43-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma recorded a stock-out of 2 pieces with 54.190 g pure gold today, when Sanjay Seth opens the performance view for today, then Rajesh's row shows 2 pieces, 1 stock-out and 54.1900 g (epic acceptance criterion 1).
  2. Given Deepak Rao sold nothing in the chosen period, when the view loads, then his row shows 0 pieces, 0 stock-outs and 0.0000 g instead of being hidden.
  3. Given Sanjay changes the period from today to this month, when the view reloads, then every row shows the totals for the month to date in Asia/Kolkata days.
  4. Given Rajesh Verma (Staff) or Lakshmi Devi (Karigar) calls Read Staff performance, when the server checks the role, then it is refused with `forbidden`.
  5. Given the view is loading, when the server has not answered, then a loading state shows; given the read fails, then the error with "Try again" shows.
- **Rules enforced on the server:** Read Staff performance is Owner only (API table, EP-05-S2). Figures come from EP-43-S1 and EP-43-S2. The period is validated: start not after end, and a custom range no longer than the decided maximum. No amount field is returned.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" through EP-43-S11.
- **Audit entry written:** No. Reading the view changes nothing.
- **Data changes:** None in the product database. Adds Read Staff performance to the shared contract.
- **UI reference:** Not yet designed (staff performance view, SCOPE-ANALYSIS §5 group F; proposed route `staff-performance`, reached from the PEOPLE node "Staff performance, every sale has a seller" in `docs/ux/mockups/10-navigation-map.mmd`). The period picker reuses EP-35-S5.
- **Non-functional checks:** Performance: the view for a month loads in under 2 seconds (epic section 13). Precision: pure gold shown to 4 decimals. Security: owner only on the server. Time: Asia/Kolkata days. Open question: which periods are offered (week, month, festival season). Open question: whether the owner's own selling counts, given "No sales counted" today (BR-43-6).
- **Depends on:** EP-43-S1, EP-43-S2, EP-05-S2, EP-35-S5, EP-08-S2, EP-08-S3, EP-08-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S4: Owner can open one staff member's sales history

- **Story ID:** EP-43-S4
- **Status:** Later
- **Title:** Owner can open one staff member's sales history
- **As a:** Owner
- **I want:** to open one staff member from the performance view and see each attributed sale with piece, tag, pure gold, reference and time, newest first, with the recorder shown when it differs from the seller
- **So that:** I can check what a figure is made of and spot credit moved to another person (FR-43-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma sold TAG-8841 and TAG-9040 under reference "REF-2026-1182", when Sanjay Seth opens Rajesh's sales history, then two rows show TAG-8841 41.5900 g and TAG-9040 12.6000 g with that reference and the stock-out time in Asia/Kolkata.
  2. Given Rajesh recorded a sale with Deepak Rao as seller, when Sanjay opens Deepak's history, then the row shows "recorded by Rajesh Verma" beside the sale (epic section 16).
  3. Given the history has more rows than one page, when Sanjay scrolls, then the next page loads with a cursor.
  4. Given Sanjay opens a row, when he taps the tag, then the piece drawer for that piece opens (EP-22-S5).
  5. Given Deepak Rao (Staff) calls Read Staff sales history for Rajesh, when the server checks, then it is refused with `forbidden`.
- **Rules enforced on the server:** Read Staff sales history is Owner for any staff member; Staff only for themselves and only if allowed (EP-43-S10). The staff id is checked against the session, not trusted from the client. Rows come from EP-43-S1 and respect the period. Lists are paged with a cursor (EP-03-S9). No amount field is returned.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" adds a new row while the history is open, through EP-43-S11.
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Adds Read Staff sales history to the shared contract.
- **UI reference:** Not yet designed (one staff member's sales history; proposed route `staff-sales`).
- **Non-functional checks:** Security: a staff member can read only their own history (epic section 13). Precision: grams to 4 decimals. Time: times shown in Asia/Kolkata. Performance: first page under 2 seconds.
- **Depends on:** EP-43-S1, EP-43-S3, EP-22-S5, EP-03-S9, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S5: System can keep the staff directory count equal to the derived count

- **Story ID:** EP-43-S5
- **Status:** Later
- **Title:** System can keep the staff directory count equal to the derived count
- **As a:** System
- **I want:** the "{n} sales" figure on `staff-directory` to come from the same derived query as the performance view, and the stored `salesCount` column to stop being the source of any figure
- **So that:** the directory and the performance view never disagree, and a counter cannot drift from the records (FR-43-4, BR-43-6, BR-43-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's derived count for the directory period is 38 pieces, when Sanjay Seth opens `staff-directory`, then Rajesh's row shows "38 sales" and the performance view for the same period shows 38 pieces.
  2. Given the stored `salesCount` for Deepak Rao is changed by hand in the database to 99, when the directory loads, then it still shows the derived count.
  3. Given Sanjay Seth (Owner), when the directory renders his row, then it shows "No sales counted" while the decision on owner selling is open.
  4. Given the migration runs on staging with seed data, when it compares each stored `salesCount` with the derived count, then any difference is listed in the migration log before the column is retired.
  5. Given Rajesh Verma (Staff) opens `staff-directory`, when the server checks, then it is refused as in EP-05-S11.
- **Rules enforced on the server:** The directory count is the derived pieces count from EP-43-S1 for the directory's period (all time unless decided otherwise). The atomic increment of EP-26-S9 is no longer read by any screen; whether it is removed or kept as a cache is checked against the derived count. Only the owner sees the directory (EP-05-S11).
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" refetches the directory count while it is open (EP-08-S9).
- **Audit entry written:** No. Reading and the reconciliation report change no business record.
- **Data changes:** Migration that reconciles and then retires `staff.salesCount` as a stored figure (epic section 9: "salesCount becomes derived; no stored counter"). List Users in EP-05-S11 returns the derived count.
- **UI reference:** Route `staff-directory` (`src/components/people/StaffDirectory.tsx`), "{n} sales" and "No sales counted". `docs/ux/mockups/25-onboard-staff.svg` ("Sales will be counted to Deepak — used later for gamification").
- **Non-functional checks:** Concurrency: no stored counter, so parallel stock-outs cannot lose a count. Performance: the directory still loads under 2 seconds with the derived count. Open question: does the owner's own selling count, given "No sales counted" today.
- **Depends on:** EP-43-S1, EP-26-S9, EP-05-S11, EP-02-S1, EP-02-S4, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S6: Owner can define a versioned scoring rule

- **Story ID:** EP-43-S6
- **Status:** Later
- **Title:** Owner can define a versioned scoring rule
- **As a:** Owner
- **I want:** to save a scoring rule with a description, its parameters (for example points per piece and points per gram of pure gold, as decided) and an effective-from date, as a new version, and see the current and past versions
- **So that:** scores follow rules I set, a change is never applied backwards by accident, and I can see which rule produced a score (FR-43-6, FR-43-11, BR-43-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given no rule exists, when Sanjay Seth saves version 1 with a description, parameters and effective from 1 November, then a ScoringRule row is stored with version 1, the parameters, effective from 1 November in Asia/Kolkata, and set by Sanjay.
  2. Given version 1 is current, when Sanjay saves version 2 effective from 1 December, then version 1 stays unchanged and List Scoring rules shows both, newest first.
  3. Given Sanjay sets an effective-from date earlier than the current version's date, when he saves, then the server refuses it with a sentence naming the rule, unless backdating is decided to be allowed.
  4. Given a parameter that refers to money value while EP-42 pricing is off, when Sanjay saves, then the server refuses it (epic section 5).
  5. Given Rajesh Verma (Staff) calls Create Scoring rule, when the server checks, then it is refused with `forbidden` and nothing is stored.
- **Rules enforced on the server:** Create and List Scoring rules are Owner only (API table). Versions are append-only; a rule is never edited, only replaced by a new version. Effective-from is an Asia/Kolkata day. Parameters are validated against the decided parameter list. Idempotency key on create (EP-03-S8).
- **Live events emitted / consumed:** None. The owner's own open leaderboard is refetched after the save (EP-08-S7).
- **Audit entry written:** Yes: actor, time, entity (scoring rule), action (new kind, for example `scoring_rule_set`), before (previous version), after (version, parameters, effective from).
- **Data changes:** New table `scoring_rules` with id, version, description, parameters, effective from, set by, set at (migration). New audit kind. Adds Create and List Scoring rules to the shared contract.
- **UI reference:** Not yet designed (scoring rules page for the owner).
- **Non-functional checks:** Audit: rule changes are appended with before and after (epic section 13). Time: effective-from is an Asia/Kolkata day. Open question: what the rules count (pieces, stock-outs, pure gold, leads converted, or a mix; SCOPE-ANALYSIS §7 defers this); the parameter list is fixed only when it is answered. Open question: is a score ever based on value once EP-42 is on. Open question: are wishes sent, leads handled or parcels tagged part of performance.
- **Depends on:** EP-05-S2, EP-03-S8, EP-06-S2, EP-06-S3, EP-10-S10, EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S7: System can compute a score per staff member for a period

- **Story ID:** EP-43-S7
- **Status:** Later
- **Title:** System can compute a score per staff member for a period
- **As a:** System
- **I want:** one shared function that takes a staff member's derived figures for each day of a period and the scoring rule version in force on that day, and returns the score with the rule version or versions used
- **So that:** every screen shows the same score, and a rule change applies only from its stated date (FR-43-6, FR-43-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given version 1 is effective from 1 November and version 2 from 1 December, when the score is computed for December, then it uses version 2, and November uses version 1 (epic acceptance criterion 4).
  2. Given a period that spans 25 November to 5 December, when the score is computed, then each day uses the version in force that day and the result names both versions.
  3. Given the rule "1 point per piece" (example only), when Rajesh Verma sold 2 pieces in the period, then his score is 2; given a pure-gold parameter, the computation reads integer units of 0.0001 g and rounds once at the end.
  4. Given no rule exists for a day in the period, when the score is computed, then that day contributes no score and the result says "no rule" instead of 0.
  5. Given the function is unit tested with the signed-off examples, when the shared package suite runs, then every example passes.
- **Rules enforced on the server:** Scores are computed on the server only from EP-43-S1 figures and EP-43-S6 versions. Integer arithmetic; one rounding step at the end. If StaffScore is cached, the cache key includes period and rule version, and a cached row is rebuilt when a new sale or rule falls inside its period.
- **Live events emitted / consumed:** None in this story.
- **Audit entry written:** No. Computing a score changes no business record.
- **Data changes:** None in the product database if computed on read. If cached, new table `staff_scores` with staff id, period, pieces, stock-outs, pure gold (integer, units of 0.0001 g), score, rule version (migration). Adds the score function to the shared package.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: pure gold inputs are integers in units of 0.0001 g. Time: days are Asia/Kolkata. Open question: what the scoring rules count; this story is not built until the owner signs off the rule and worked examples (BR-43-4).
- **Depends on:** EP-43-S1, EP-43-S2, EP-43-S6, EP-40-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S8: Owner can see the leaderboard

- **Story ID:** EP-43-S8
- **Status:** Later
- **Title:** Owner can see the leaderboard
- **As a:** Owner
- **I want:** a leaderboard for a chosen period that ranks staff by score, with pieces and pure gold shown beside each score
- **So that:** I can see who leads under the rule I set without losing sight of the grams behind it (FR-43-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given scores for this month of Rajesh Verma above Deepak Rao, when Sanjay Seth opens the leaderboard for this month, then Rajesh is rank 1 and Deepak rank 2, each with score, pieces and pure gold to 4 decimals.
  2. Given two staff have the same score, when the leaderboard is built, then they share a rank and are ordered by the decided tie-break (for example pure gold).
  3. Given no scoring rule exists for the period, when Sanjay opens the leaderboard, then it shows "No scoring rule for this period" and the pieces and pure gold figures without ranks.
  4. Given the period changes from this month to last month, when the leaderboard reloads, then it uses last month's rule version and figures.
  5. Given Lakshmi Devi (Karigar) calls Read Leaderboard, when the server checks, then it is refused with `forbidden`.
- **Rules enforced on the server:** Read Leaderboard is Owner, and Staff only if allowed (EP-43-S9). Ranks and scores come from EP-43-S7. The response names the rule version used. No amount field.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" through EP-43-S11.
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Adds Read Leaderboard to the shared contract.
- **UI reference:** Not yet designed (leaderboard; proposed route `leaderboard`).
- **Non-functional checks:** Performance: loads in under 2 seconds for a month. Precision: grams to 4 decimals. Time: Asia/Kolkata days. Open question: what periods the leaderboard uses (week, month, festival season).
- **Depends on:** EP-43-S7, EP-43-S3, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S9: Owner can choose whether staff see the leaderboard

- **Story ID:** EP-43-S9
- **Status:** Later
- **Title:** Owner can choose whether staff see the leaderboard
- **As a:** Owner
- **I want:** a leaderboard visibility setting with two values, "Owner only" and "Staff too", defaulting to "Owner only"
- **So that:** I decide whether staff compare themselves before a public ranking can cause friction (FR-43-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given visibility is "Owner only", when Deepak Rao asks for the leaderboard, then the server refuses (epic acceptance criterion 3).
  2. Given Sanjay Seth changes visibility to "Staff too", when Deepak asks for the leaderboard, then it is returned.
  3. Given Rajesh Verma (Staff) calls Update Leaderboard visibility, when the server checks, then it is refused with "Only the owner can change the shop rules." and the value is unchanged.
  4. Given Sanjay changes visibility, when the audit log is read, then a `setting_changed` entry shows before "Owner only" and after "Staff too".
  5. Given Deepak has the leaderboard open with "Staff too", when Sanjay switches back to "Owner only", then Deepak's next read is refused and his screen shows the server's sentence.
- **Rules enforced on the server:** Update Leaderboard visibility is Owner only, through the settings role check (EP-13-S2). Every leaderboard and staff-self read checks the setting on the server (epic section 13). Default "Owner only" until the owner chooses.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14, so open staff screens re-check access.
- **Audit entry written:** Yes: actor, time, entity (settings), entity id `leaderboardVisibility`, action (`setting_changed`), before, after.
- **Data changes:** Adds `leaderboardVisibility` to settings with default "Owner only" (migration, EP-13-S1).
- **UI reference:** Not yet designed; the switch sits on the settings page (EP-13-S13).
- **Non-functional checks:** Security: visibility checked on the server for every read. Audit: visibility changes appended with before and after. Open question: who sees the leaderboard, the owner only or all staff.
- **Depends on:** EP-13-S1, EP-13-S2, EP-13-S3, EP-13-S13, EP-13-S14, EP-43-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S10: Staff can see their own figures and the leaderboard when allowed

- **Story ID:** EP-43-S10
- **Status:** Later
- **Title:** Staff can see their own figures and the leaderboard when allowed
- **As a:** Staff
- **I want:** to see my own pieces, stock-outs, pure gold and sales history for a period, and the leaderboard, when the owner allows it
- **So that:** I know what has been counted to me and can check a sale I made was credited (FR-43-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given visibility allows staff, when Deepak Rao opens his own figures for this month, then he sees his pieces, stock-outs and pure gold, matching the owner's performance view row for him.
  2. Given Deepak calls Read Staff sales history with Rajesh Verma's id, when the server checks, then it is refused with `forbidden`.
  3. Given visibility is "Owner only", when Deepak opens the app, then no leaderboard entry appears in his rail and Read Leaderboard is refused.
  4. Given visibility allows staff, when Deepak opens the leaderboard, then he sees the ranks for the period and no other staff member's sales history.
  5. Given Deepak recorded a sale with Rajesh as seller, when Deepak reads his own history, then that sale is not in it.
- **Rules enforced on the server:** Staff read their own figures and history only; the staff id comes from the session (EP-03-S3). Whether own figures need the visibility setting or are always shown is as decided. The leaderboard needs "Staff too" (EP-43-S9). Karigars are refused.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" and "Setting changed" (proposed, G26) through EP-43-S11 and EP-08-S9.
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Adds a staff-self read to the shared contract.
- **UI reference:** Not yet designed (staff's own figures and leaderboard; place on `today` or a separate route not decided).
- **Non-functional checks:** Security: a staff member can read only their own history (epic section 13). Performance: under 2 seconds. Open question: who sees the leaderboard, the owner only or all staff.
- **Depends on:** EP-43-S4, EP-43-S8, EP-43-S9, EP-03-S3, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S11: System can refresh the leaderboard live after a stock-out

- **Story ID:** EP-43-S11
- **Status:** Later
- **Title:** System can refresh the leaderboard live after a stock-out
- **As a:** System
- **I want:** open performance views, sales histories, own-figure screens and leaderboards to refetch when "Piece billed by one staff member" arrives for a period they show
- **So that:** the figures are current within about a second of a sale, without a reload (FR-43-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has the leaderboard for this month open, when Deepak Rao's stock-out commits, then Sanjay's leaderboard shows Deepak's new figures within about 1 second (epic acceptance criterion 5).
  2. Given Sanjay has the performance view for last month open, when a sale commits today, then the view does not change.
  3. Given a stock-out is refused with "already taken", when the request ends, then no event is published and no screen refetches.
  4. Given Sanjay's connection drops during two sales, when it reconnects and catches up, then the leaderboard reflects both sales once.
  5. Given a staff user without leaderboard access, when the event arrives, then their client does not fetch the leaderboard.
- **Rules enforced on the server:** The event is published only after the stock-out commits (EP-07-S1) and filtered by the receiver's permissions (EP-07-S5). Figures are always refetched from the server; the event payload is not added up in the browser.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member"; also "Piece scrapped" (proposed, G26) when scrap counts (EP-43-S2).
- **Audit entry written:** No. Refreshing a screen changes nothing.
- **Data changes:** None in the product database. Maps the event to the performance, history and leaderboard reads in the client event map (EP-08-S8).
- **UI reference:** Not yet designed (the screens of EP-43-S3, S4, S8, S10).
- **Non-functional checks:** Performance: the leaderboard refreshes within about 1 second of a sale (epic section 13). Concurrency: catch-up by sequence number counts each sale once (EP-07-S7).
- **Depends on:** EP-43-S3, EP-43-S4, EP-43-S8, EP-43-S10, EP-07-S1, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-26-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-43-S12: System can credit a split sale by share (if Q10 allows it)

- **Story ID:** EP-43-S12
- **Status:** Later
- **Title:** System can credit a split sale by share (if Q10 allows it)
- **As a:** System
- **I want:** when a stock-out names two sellers with shares, each seller to be credited their share of pieces and pure gold, with shares stored per stock-out
- **So that:** a sale made by two staff together is credited fairly and still counted once in total (FR-43-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a stock-out of TAG-8841 and TAG-9040 (541900 units) split 50/50 between Rajesh Verma and Deepak Rao, when the performance view is read, then each is credited by the decided share rule and the two shares add up to exactly 541900 units with no unit lost to rounding.
  2. Given a split sale, when the total stock-outs for the shop are read, then the stock-out counts once in total.
  3. Given shares that do not add up to the whole, when the stock-out is saved, then the server refuses it with a sentence naming the rule.
  4. Given a split sale, when the audit entry of the stock-out is read, then both sellers and their shares are recorded.
- **Rules enforced on the server:** Built only if SCOPE-ANALYSIS Q10 allows splits. Shares are stored with the stock-out in the same transaction (EP-26-S2). The rounding remainder goes to one decided seller so integer totals match. Each seller must be an active staff user.
- **Live events emitted / consumed:** None new. The stock-out still emits "Piece billed by one staff member" (EP-26-S11).
- **Audit entry written:** Yes: within the `stock_out` entry (EP-26-S12): sellers and shares added to after.
- **Data changes:** New table `sale_shares` with stock-out id, staff id, share (migration). The stock-out form gains a second seller field (EP-26-S6).
- **UI reference:** Not yet designed (second seller on `stock-out`, `docs/ux/mockups/06-stock-out.svg` "Who sold it" shows one seller only).
- **Non-functional checks:** Precision: shares of pure gold are integers in units of 0.0001 g that sum to the whole. Open question SCOPE-ANALYSIS Q10: is a sale one staff member only, or can it be split between two; if one only, this story is not built.
- **Depends on:** EP-43-S1, EP-43-S3, EP-26-S2, EP-26-S6, EP-26-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- SCOPE-ANALYSIS Q10: is a sale one staff member only, or can it be split between two? (EP-43-S12)
- What do the scoring rules count: pieces, stock-outs, pure gold, leads converted, or a mix (SCOPE-ANALYSIS §7 defers this)? (EP-43-S6, S7)
- Is a score ever based on value, once EP-42 is on? (EP-43-S6)
- Who sees the leaderboard: the owner only, or all staff? (EP-43-S9, S10)
- What periods does the leaderboard use (week, month, festival season)? (EP-43-S3, S8)
- Does a scrap count toward performance (SCOPE-ANALYSIS §3 calls scrap "a second sale type")? (EP-43-S2)
- Does the owner's own selling count, given "No sales counted" today? (EP-43-S3, S5)
- Are wishes sent, leads handled or parcels tagged part of performance, or only sales? (EP-43-S6)
