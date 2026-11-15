# JGD Enterprise Suite: epic documents

One document per epic of the production scope in [../PRODUCTION-SCOPE.md](../PRODUCTION-SCOPE.md), numbered
bottom-up: build in number order, and an epic depends only on lower-numbered epics. Each document has the same 18
sections, from summary to candidate stories. The candidate stories are titles only, ordered bottom-up within the
epic, ready for the story template in the appendix of PRODUCTION-SCOPE.

Sources used for every document:

- `docs/PRODUCTION-SCOPE.md`: titles, scope lines, dependencies, live events (§1), decisions D1 to D10 (§4), non-functional requirements (§5), milestones (§7).
- `docs/ux/SCOPE-ANALYSIS.md`: open questions, assumptions A1 to A5 and appendices A to I.
- `docs/ux/UX-REDESIGN-SPEC.md` and the mockups in `docs/ux/mockups/`.
- `docs/MOCKUP-COVERAGE.md`: the screen to epic map, gaps G1 to G9 and the screens never designed.
- `docs/EPICS.md`: the prototype's own epic status.
- The prototype code in `src/` (types, transitions, selectors, screens, seed).

Status in prototype means what exists on mock data today. Server, persistence and live push are missing
everywhere and do not count.

- **Built**: every user-facing behaviour in the epic's scope exists on mock data.
- **Partial**: some of it exists.
- **Not built**: none of it exists.
- **N/A**: an operational epic with no prototype analogue.

Weights in every document are integers in units of 0.0001 g (PRODUCTION-SCOPE §5), with the unit conflict recorded
as gap G10. Money appears only in EP-42; other epics mention the nullable value sockets and `ValueSlot` only.

## Index

| ID | Title (link) | Layer | Milestone | Depends on | Status in prototype |
| --- | --- | --- | --- | --- | --- |
| EP-01 | [Repository, environments and CI](EP-01-repository-environments-and-ci.md) | A | M1 Platform | — | Partial |
| EP-02 | [Database and data model](EP-02-database-and-data-model.md) | A | M1 Platform | EP-01 | Partial |
| EP-03 | [API foundation](EP-03-api-foundation.md) | A | M1 Platform | EP-02 | Not built |
| EP-04 | [Authentication](EP-04-authentication.md) | A | M1 Platform | EP-03 | Not built |
| EP-05 | [Users, roles and permissions](EP-05-users-roles-and-permissions.md) | A | M1 Platform | EP-04 | Partial |
| EP-06 | [Audit log](EP-06-audit-log.md) | A | M1 Platform | EP-05 | Partial |
| EP-07 | [Live channel](EP-07-live-channel.md) | A | M1 Platform | EP-05 | Not built |
| EP-08 | [Front-end production foundation](EP-08-front-end-production-foundation.md) | A | M1 Platform | EP-03, EP-04, EP-05, EP-07 | Not built |
| EP-09 | [File storage](EP-09-file-storage.md) | A | M1 Platform | EP-03 | Not built |
| EP-10 | [Background jobs](EP-10-background-jobs.md) | A | M1 Platform | EP-03 | Not built |
| EP-11 | [Notifications engine](EP-11-notifications-engine.md) | A | M1 Platform | EP-07, EP-10, EP-08 | Not built |
| EP-12 | [WhatsApp integration](EP-12-whatsapp-integration.md) | A | M1 Platform | EP-11 | Not built |
| EP-13 | [Branches and shop settings](EP-13-branches-and-shop-settings.md) | B | M2 Masters | EP-05, EP-08 | Partial |
| EP-14 | [Scale registry](EP-14-scale-registry.md) | B | M2 Masters | EP-02, EP-13, EP-08 | Partial |
| EP-15 | [Reference data](EP-15-reference-data.md) | B | M2 Masters | EP-02, EP-08 | Partial |
| EP-16 | [Karigar master](EP-16-karigar-master.md) | B | M2 Masters | EP-05, EP-08 | Partial |
| EP-17 | [Customer master](EP-17-customer-master.md) | B | M2 Masters | EP-05, EP-08 | Partial |
| EP-18 | [Metal pool ledger](EP-18-metal-pool-ledger.md) | C | M3 Intake loop | EP-02, EP-06, EP-08 | Partial |
| EP-19 | [Order copy and karigar jobs](EP-19-order-copy-and-karigar-jobs.md) | C | M3 Intake loop | EP-16, EP-18, EP-08 | Partial |
| EP-20 | [Karigar portal (PWA)](EP-20-karigar-portal-pwa.md) | C | M3 Intake loop | EP-19, EP-07, EP-08 | Partial |
| EP-21 | [Parcel intake and tagging](EP-21-parcel-intake-and-tagging.md) | C | M3 Intake loop | EP-20, EP-14, EP-15, EP-09, EP-08 | Partial |
| EP-22 | [Stock and piece lifecycle](EP-22-stock-and-piece-lifecycle.md) | C | M3 Intake loop | EP-21, EP-08 | Partial |
| EP-23 | [Exact-match gate and owner clearance](EP-23-exact-match-gate-and-owner-clearance.md) | C | M3 Intake loop | EP-21, EP-18, EP-08 | Partial |
| EP-24 | [Stop the line](EP-24-stop-the-line.md) | C | M4 Exceptions | EP-23, EP-11, EP-08 | Built |
| EP-25 | [Edit proposals](EP-25-edit-proposals.md) | C | M4 Exceptions | EP-22, EP-12, EP-08 | Built |
| EP-26 | [Stock-out](EP-26-stock-out.md) | C | M4 Exceptions | EP-22, EP-08 | Built |
| EP-27 | [Scrap](EP-27-scrap.md) | C | M4 Exceptions | EP-22, EP-18, EP-08 | Partial |
| EP-28 | [Leads: manual intake and inbox](EP-28-leads-manual-intake-and-inbox.md) | C | M5 Front door | EP-17, EP-10, EP-08 | Partial |
| EP-29 | [Leads: automatic PO intake](EP-29-leads-automatic-po-intake.md) | C | M5 Front door | EP-12, EP-28, EP-09, EP-08 | Partial |
| EP-30 | [Lead conversion](EP-30-lead-conversion.md) | C | M5 Front door | EP-28, EP-22, EP-19, EP-08 | Partial |
| EP-31 | [Staff Today home](EP-31-staff-today-home.md) | D | M6 Homes and outreach | EP-18 to EP-30, EP-08 | Partial |
| EP-32 | [Owner Decisions home](EP-32-owner-decisions-home.md) | D | M6 Homes and outreach | EP-23 to EP-30, EP-08 | Partial |
| EP-33 | [Wishes](EP-33-wishes.md) | D | M6 Homes and outreach | EP-17, EP-12, EP-10, EP-08 | Partial |
| EP-34 | [Broadcast and catalogue share](EP-34-broadcast-and-catalogue-share.md) | D | M6 Homes and outreach | EP-33, EP-22, EP-29, EP-08 | Partial |
| EP-35 | [Reports](EP-35-reports.md) | D | M8 Insight | EP-18 to EP-34, EP-08 | Not built |
| EP-36 | [Scale and printer hardware](EP-36-scale-and-printer-hardware.md) | E | M7 Production ready | EP-21, EP-26, EP-08 | Not built |
| EP-37 | [Observability](EP-37-observability.md) | E | M7 Production ready | EP-03, EP-12 | N/A |
| EP-38 | [Backup and recovery](EP-38-backup-and-recovery.md) | E | M7 Production ready | EP-02 | N/A |
| EP-39 | [Security and data protection](EP-39-security-and-data-protection.md) | E | M7 Production ready | EP-05, EP-17, EP-08 | Not built |
| EP-40 | [Automated testing](EP-40-automated-testing.md) | E | M7 Production ready | EP-03 onwards, run continuously | Not built |
| EP-41 | [Launch and data migration](EP-41-launch-and-data-migration.md) | E | M7 Production ready | All above | N/A |
| EP-42 | [Pricing](EP-42-pricing.md) | F | None (later) | EP-22, EP-26, EP-08 | Partial |
| EP-43 | [Staff gamification](EP-43-staff-gamification.md) | F | None (later) | EP-26, EP-08 | Partial |
| EP-44 | [Localisation](EP-44-localisation.md) | F | None (later) | EP-08, EP-20, EP-12 | Not built |

Layers: A Platform foundation, B Master data, C Core gold pipeline, D Experience, E Hardware, scale and operations,
F Later. Totals by status: Built 3, Partial 25, Not built 13, N/A 3 (44 epics).

## Coverage matrix

### Route ids in `src/nav.ts` to epics

All 30 route ids are covered. The main epic is listed first. EP-08 (front-end production foundation) covers the
cross-cutting behaviour of every route below: loading from the server, loading, error, reconnecting and offline
states, and live updates. The table lists the feature epics that own each route's content.

| Route id | Screen (`src/components/registry.tsx`) | Epics |
| --- | --- | --- |
| `today` | StaffToday | EP-31, EP-42 (rate chip) |
| `decisions` | OwnerDecisions | EP-32, EP-13 (rules panel), EP-24 (clear), EP-42 (value band) |
| `leads` | LeadInbox | EP-28, EP-29 |
| `lead-review` | LeadReview | EP-29 |
| `lead-create` | LeadCreate | EP-28 |
| `lead-convert` | ConvertLead | EP-30 |
| `order-copy` | OrderCopyBuilder | EP-19, EP-30 |
| `stock` | ShowroomStock + PieceDrawer + MetalPool | EP-22, EP-18, EP-25, EP-27, EP-42 (value line) |
| `stock-out` | StockOut | EP-26, EP-36 (scan), EP-42 (value column), EP-43 (seller) |
| `edit-propose` | EditPropose | EP-25 |
| `edit-apply` | EditApply | EP-25 |
| `scrap-decision` | ScrapDecision | EP-27 |
| `parcels` | ParcelsList | EP-21 |
| `parcel-arrival` | ParcelArrival | EP-21, EP-14, EP-36 (balance reading) |
| `parcel-tag` | TagItem | EP-21, EP-15, EP-36 (balance reading, label print) |
| `parcel-qc` | QcCheck | EP-21 |
| `parcel-match` | ParcelMatch | EP-23, EP-36 (parcel sheet, G8) |
| `parcel-clear` | OwnerClearMismatch | EP-23 |
| `customers` | Customers | EP-17, EP-39 (consent, deletion), EP-42 (budget and spend) |
| `customer-new` | OnboardCustomer | EP-17, EP-39 (consent wording) |
| `karigars` | Karigars | EP-16, EP-19 |
| `karigar-new` | OnboardKarigar | EP-16, EP-44 (language choice, later) |
| `staff-directory` | StaffDirectory | EP-05, EP-43 |
| `staff-new` | OnboardStaff | EP-05 |
| `scales` | ScalesRules | EP-14, EP-36 (device setup) |
| `security` | SecurityLog | EP-06 |
| `wishes` | Wishes | EP-33 |
| `broadcast` | Broadcast | EP-34 |
| `catalogue` | CatalogueShare | EP-34, EP-39 (public link review, G9) |
| `k-jobs` | KarigarPhone | EP-20, EP-44 (language toggle, later) |

Epics that need a screen with no route id today: EP-04 (sign-in), EP-11 (notification centre, G21), EP-35 (report
hub), EP-39 (access review), EP-41 (imports, parallel run, go-live checklist), EP-43 (staff performance view).
Layer A, B and E epics without a screen say so in their section 12.

### Mockup files in `docs/ux/mockups/` to epics

All 28 mockup files are covered. Elements that land in other epics follow `docs/MOCKUP-COVERAGE.md` §1.

| File | Main epic | Also |
| --- | --- | --- |
| `01-foundations.svg` | EP-22 (state words) | EP-08 (loading, error, reconnecting and offline states), all UI epics |
| `02-staff-home.svg` | EP-31 | EP-26, EP-23, EP-21, EP-33, EP-17, EP-42 (rate chip); "Quotation expires today" out of scope (G6 resolved) |
| `03-showroom-stock.svg` | EP-22 | EP-25, EP-06, EP-15, EP-21, EP-26, EP-34, EP-42, G3 |
| `04-parcel-match.svg` | EP-23 | EP-21, EP-36 (G8), EP-40 |
| `05-edit-propose-apply.svg` | EP-25 | EP-12, EP-06, EP-40 |
| `06-stock-out.svg` | EP-26 | EP-36, EP-42, EP-27, EP-43 |
| `07-qc-check.svg` | EP-21 | None |
| `08-owner-home.svg` | EP-32 | EP-13, EP-25, EP-23, EP-34, EP-27, EP-19, EP-18, EP-16 (G4), EP-35, EP-42, G5 |
| `09-karigar-phone.svg` | EP-20 | EP-18, EP-09, EP-11, EP-44 (हिन्दी toggle, later; v1 English only) |
| `10-navigation-map.mmd` | EP-05 (three role homes) | EP-04 (sign in), EP-08 (signed-in shell), EP-35 (reports), EP-43 (staff performance), all pipeline epics |
| `11-roles-and-permissions.svg` | EP-05 | EP-24, EP-35, EP-40, EP-42 |
| `12-state-lifecycles.svg` | EP-22 | EP-28, EP-19, EP-21, EP-23, EP-25, EP-27 |
| `13-notifications-escalation.svg` | EP-32 | EP-11, EP-24, EP-28, EP-10, EP-19, EP-13, EP-35 (Reports rail item) |
| `14-match-rule-any-parcel.svg` | EP-23 | EP-14, EP-21, EP-36, EP-40, EP-41 |
| `15-value-ready.svg` | EP-42 | EP-13 |
| `16-lead-inbox.svg` | EP-28 | EP-29 |
| `17-lead-create.svg` | EP-29 | EP-28, EP-17 (G7) |
| `18-convert-lead.svg` | EP-30 (hold button out of scope for v1) | EP-22, EP-19 |
| `19-order-copy-builder.svg` | EP-19 | EP-09, EP-18, EP-16 |
| `20-parcel-arrival.svg` | EP-21 | EP-14, EP-36 |
| `21-tag-one-item.svg` | EP-21 | EP-15, EP-36 |
| `22-owner-clear-mismatch.svg` | EP-23 | EP-16 (G4), EP-40 |
| `23-onboard-customer.svg` | EP-17 | EP-33, EP-39, EP-41, EP-42 |
| `24-onboard-karigar.svg` | EP-16 | EP-18, EP-41, EP-44 (language choice, later; v1 English only) |
| `25-onboard-staff.svg` | EP-05 | EP-04, EP-13, EP-39, EP-41, EP-43 |
| `26-wishes.svg` | EP-33 | EP-17, EP-39 |
| `27-broadcast.svg` | EP-34 | EP-10, EP-12, EP-29, EP-39 |
| `28-catalogue-share.svg` | EP-34 | EP-29, EP-39 (G9), EP-42 |

Mockup 01's design system is reused as it is; EP-08 applies it to the loading, error, reconnecting and offline states
(gap G1, resolved). The "Quotation expires today" card on mockup 02, the "Hold TAG-8841 for them" button on mockup 18
and the "Held for a customer" segment on mockup 12 are out of scope for v1 (no holds, gap G6 resolved).

### Live events (PRODUCTION-SCOPE §1) to epics

All 10 catalogue events have at least one emitter and one consumer. EP-07 transports every event and lists each
with its audience; EP-08 consumes every event on behalf of the screens; EP-40 tests every event. The former "Piece
held for a lead" event was removed with holds (gap G6 resolved). "Via" means the epic causes the event through another epic's
operation.

| Event | Emitted by | Consumed by |
| --- | --- | --- |
| Piece billed by one staff member | EP-26 | EP-22, EP-25, EP-26, EP-30, EP-31, EP-32, EP-34, EP-42, EP-43 |
| Parcel stopped (mismatch or raised problem) | EP-23, EP-24 | EP-11, EP-21, EP-22, EP-31, EP-32 |
| Edit proposed / token sent | EP-25 | EP-11, EP-32 |
| Edit applied | EP-25 | EP-22, EP-31 |
| Lead arrived / passed its SLA | EP-28, EP-29, EP-10 (SLA half); EP-12 and EP-34 via EP-29 | EP-11, EP-28, EP-31, EP-32 |
| Karigar job status changed | EP-19, EP-20 | EP-11, EP-19, EP-20, EP-31, EP-32 |
| Parcel handed over by karigar | EP-20 | EP-21, EP-31 |
| Tag saved on a shared parcel | EP-21 | EP-21, EP-23, EP-31 |
| Metal pool changed | EP-18; EP-27 and EP-41 via EP-18 | EP-19, EP-30, EP-32 |
| User deactivated or role changed | EP-05; EP-39 via EP-05 | EP-04, EP-07, EP-20 |

Proposed events not in the catalogue are listed under gap G26.

## Gaps found

Scope that no epic owns, or conflicts found while writing the epics. Two gaps became epics (G1 became EP-08; G2 was
deferred to EP-44) and G6 was resolved by a decision; every other gap names a suggested owner and no epic was created
for it. G1 to G9 come from `docs/MOCKUP-COVERAGE.md` §2; G10 to G26 were found in the code and documents.

| Gap | What | Seen on | Suggested owning epic |
| --- | --- | --- | --- |
| G1 | Resolved → became EP-08 Front-end production foundation. Was: front-end foundation for production (shared design system, API client, signed-in app shell, live-subscription hooks, loading, error, reconnecting and offline states); no epic rewired the prototype UI to the API. | All screens; mockup 01 | EP-08 |
| G2 | Resolved → deferred to EP-44; v1 English only. Was: localisation, Hindi and Tamil for the karigar app, possibly for staff. | Mockups 09, 24 | EP-44 (Later); EP-16 and EP-20 say v1 is English only |
| G3 | Design master and reorder: "Sold out" is a fact about a design; "Order another from Vijay" creates an order copy from a past piece. | Mockup 03 | EP-15 (design master), EP-19 (reorder entry point) |
| G4 | Karigar scorecard: loss %, days late, rating, last-six-parcel gaps. Rating formula undefined. | Mockups 08, 22 | EP-16, with figures from EP-18 and EP-19 |
| G5 | Ageing or dead-stock alert ("196.4 g not moved in 90 days") and its threshold setting. | Mockup 08 | EP-32 (alert), EP-13 (threshold) |
| G6 | Resolved: no holds in v1. If the shop can sell a piece, nobody can hold it, so there is no hold expiry; the "Quotation expires today" card (mockup 02) and the hold on mockup 18 are out of scope. Was: hold expiry with no rule defined. | Mockup 02 | Decided; reflected in EP-22, EP-30, EP-31 and PRODUCTION-SCOPE §6 Later notes |
| G7 | Customer matching by phone when a PO or manual lead arrives; avoid duplicates. | Mockup 17 | EP-17, EP-29, and the EP-28 manual form |
| G8 | Parcel sheet printing, not just tag labels. | Mockup 04 | EP-36 |
| G9 | Public catalogue link that a customer opens without signing in; a new public surface. | Mockup 28 | EP-34, with security review in EP-39 |
| G10 | Weight-unit conflict: PRODUCTION-SCOPE §5 says integers of 0.0001 g, but the ceiling adds half-steps (½ × 0.0001 g = 0.00005 g), and the prototype uses 0.00001 g units (`UNITS_PER_G = 100000` in `src/domain/weights.ts`). | `src/domain/weights.ts`; mockup 14; `.agents/tasks/jgd-redesign/review.md` issue 1 | Decision in EP-02, with EP-14 and EP-23; also EP-36, EP-40 |
| G11 | The prototype domain assertions that EP-40 must port (88 in PRODUCTION-SCOPE, 72 in review.md) were deleted with `scripts/verify-domain.ts`; the repo has no test runner. | `package.json`; `.agents/tasks/jgd-redesign/review.md` | EP-40 rewrites them |
| G12 | No server-side owner guard on settings: `setSetting` has no `requireOwner`; `Wishes.tsx` lets staff flip `autoSendWishes`; the `PricingToggle` dev switch in `AppShell.tsx` flips `pricingEnabled` for any role and is not audited. | `src/store/transitions.ts`; `src/components/marketing/Wishes.tsx`; `src/components/shell/AppShell.tsx` | EP-13 (who may change which setting), EP-42 (pricing switch), EP-39 (enforcement review) |
| G13 | A stock-out records no customer, so `Customer.history` and customer spend have no live source. | `src/types/jewellery.ts` `StockOutRecord` | EP-26 (open question), EP-17, EP-42, EP-41 |
| G14 | One hand-over carrying many jobs (mockup 12) versus a single `Parcel.jobId`. | Mockup 12; `src/types/jewellery.ts` | EP-20, EP-21, data in EP-02 |
| G15 | Per-tray stop and partial release ("Stops at tray 14 only… The rest release") are not modelled; needs a tray-to-piece link. | Mockup 14 | EP-23, EP-21 |
| G16 | Bench voice notes ("Type or speak"). | Mockup 09 | EP-20, storage in EP-09 |
| G17 | Broadcast scheduling and delivered, opened and replied tracking. | Mockup 27 | EP-34, EP-10, EP-12 |
| G18 | The `requireEditToken` setting ("Code before a tag edit · On") would let the owner switch off the token that PRODUCTION-SCOPE §5 requires. | Mockup 08; `src/types/jewellery.ts` `Settings` | EP-25, EP-13 |
| G19 | Customer groups differ: the type has VIP Bridal, High net worth, Regular, Wholesale; mockups show Festive collector, Collectors, "Bought in last 6 months". | Mockups 26, 27; `src/types/jewellery.ts` | EP-17, EP-15, EP-34 |
| G20 | "Priya (Manager)" appears as a wish sender while only three roles exist. | Mockup 26 | EP-33, EP-12 |
| G21 | The notification centre has no route id, although the navigation map shows it for all three roles; MOCKUP-COVERAGE §3 lists the staff notification centre as missing. | `10-navigation-map.mmd`; mockup 13 | EP-11 |
| G22 | DPDP deletion requests versus the append-only audit log, which holds customer names. | PRODUCTION-SCOPE §5 Audit and Personal data | EP-39, EP-06; also EP-17, EP-38 |
| G23 | Reconciliation B (gold issued versus net returned versus karigar wastage; "flagged to you") has no explicit scope line. | SCOPE-ANALYSIS App. C; mockup 24 | EP-19, with the ledger in EP-18 |
| G24 | PRODUCTION-SCOPE inconsistencies, not fixed here: the Layer C table header is printed twice; EP-41 "All above" includes EP-35 although EP-35 is M8, after the M7 launch; "EP-03 onwards" for EP-40 does not say whether EP-41 to EP-44 are included (read as EP-03 to EP-39). | `docs/PRODUCTION-SCOPE.md` §6, §7 | Owner of PRODUCTION-SCOPE; affects EP-35, EP-40, EP-41 |
| G25 | Lead "Lost / expired": no expiry rule. | Mockup 12 | EP-28 |
| G26 | Proposed live events not in the catalogue, each listed in the named epics' section 11 as "proposed": "Parcel released into stock" (EP-23 emits on release, EP-22 emits as pieces go in_stock; EP-31, EP-32 consume); "Problem raised on a job or piece" and "Problem cleared" (EP-24 emits; EP-20, EP-22, EP-32 consume); "Scrap requested" and "Piece scrapped" (EP-27 emits; EP-32, EP-22 consume); "Job passed its agreed date" (EP-19 through EP-10; EP-32, EP-20 consume); "Setting changed" (EP-13 emits; EP-28, EP-31, EP-32, EP-42 consume); "Gold rate changed" (EP-42 emits; open stock, stock-out and Decisions screens consume). | PRODUCTION-SCOPE §1 catalogue | EP-07 (catalogue), with each emitting epic |

## Open decisions

Decisions from PRODUCTION-SCOPE §4 and the epics that list them in section 17. D1, D2 and D10 are decided; the rest are open.

| # | Decision | Listed in |
| --- | --- | --- |
| D1 | Backend approach. **Decided: Option C**, own Node + TypeScript API with managed PostgreSQL in an India region on the same cloud provider ([decision record](../decisions/D1-backend-approach.md)) | EP-01, EP-03, EP-04, EP-07, EP-08, EP-09, EP-10, EP-37, EP-38, EP-40 |
| D1a | Cloud provider for the API, database and S3-compatible storage. **Open** | EP-01, EP-02, EP-03, EP-09, EP-37, EP-38 |
| D2 | Database. **Decided: PostgreSQL** (managed, per D1) | EP-02 |
| D3 | Live transport | EP-07, EP-08 |
| D4 | Sign-in method | EP-04, EP-05, EP-16, EP-20 |
| D5 | Karigar app: PWA or native | EP-20 |
| D6 | Offline for karigars | EP-07, EP-08, EP-20 |
| D7 | Branches: single shop or multiple | EP-02, EP-05, EP-07, EP-08, EP-13, EP-17, EP-18, EP-19, EP-21, EP-22, EP-24, EP-26, EP-28, EP-31, EP-32, EP-33, EP-35, EP-41 |
| D8 | WhatsApp provider and template approval | EP-04, EP-11, EP-12, EP-24, EP-25, EP-29, EP-30, EP-33, EP-34 |
| D9 | Scale integration: typed or read from the balance | EP-14, EP-21, EP-36 |
| D10 | Hosting region. **Decided: India region**; the exact region follows D1a | EP-01, EP-02, EP-09, EP-12, EP-29, EP-37, EP-38, EP-39 |

Other open items and where they are listed:

| Item | Question | Listed in |
| --- | --- | --- |
| A2 | Shop hours or clock hours for the 8-hour lead SLA | EP-10, EP-13, EP-28, EP-32 |
| A3 | Staff warned first, then owner, and by which channel | EP-11, EP-13, EP-19, EP-24, EP-28, EP-31, EP-32 |
| A4 | Is a piece sellable while an edit proposal is open | EP-22, EP-25, EP-26, EP-30 |
| A5 | Scrap assumptions | EP-27 |
| Q5b | Is intake only reconciliation A, with karigar wastage handled against the job (SCOPE-ANALYSIS App. C) | EP-18, EP-19 |
| Q5c | Largest and smallest parcel realistically received (SCOPE-ANALYSIS App. C) | EP-21, EP-23 |
| Q5d | The last-digit middle case | EP-14, EP-23, EP-40 |
| App. B sub-question 1 | Does the metal pool already exist in the books; opening balance | EP-18, EP-41 |
| App. B sub-question 2 | Stone weight recovered or written off on scrap | EP-18, EP-27 |
| App. B sub-question 3 | Is scrap ever sold to a refiner | EP-27 |
| UX-SPEC §7 Q1 | Gold rate source | EP-42 |
| UX-SPEC §7 Q4 | Hindi and other bench languages (karigar language); v1 is English only | EP-44 |
| UX-SPEC §7 Q5 | Approve code requests by WhatsApp reply | EP-12, EP-25 |
| SCOPE-ANALYSIS Q10 | One seller per sale, or split | EP-05, EP-26, EP-43 |
| Real scale readabilities | True readability and capacity of the shop's scales | EP-14, EP-36, EP-41 |
