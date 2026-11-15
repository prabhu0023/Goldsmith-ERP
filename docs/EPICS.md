# JGD Enterprise Suite — epic breakdown

> **Prototype scope only.** For the live, multi-user production application, use
> [`PRODUCTION-SCOPE.md`](PRODUCTION-SCOPE.md), which has 45 epics numbered bottom-up.

A plan to work through the application one piece at a time. Each epic is a self-contained
slice you can pick up, verify, and close before moving to the next. Epics are ordered by
dependency: earlier ones underpin later ones, so top-to-bottom is a safe path, but E6–E10
can be reordered freely once E0–E5 are solid.

Status legend: **Built** = exists in the current React app (mock data), reviewed and lint/build green.
**Partial** = exists but has known gaps. **Not built** = designed or discussed, not yet coded.

Current foundation (already done this session):
- React 19 + Vite 8 + Tailwind 4, in-memory store, ~60 source files, lint + build green.
- Routes and screens live in `src/components/registry.tsx` and `src/nav.ts`.
- Rules in `src/domain/` and `src/store/transitions.ts`; seed in `src/data/seed.ts`.
- Mockups in `docs/ux/mockups/`; decisions in `docs/ux/SCOPE-ANALYSIS.md`.

---

## E0 — Foundation and shell · **Built**

The spine everything hangs on. Already in place; listed so the dependency graph is complete.

- Typed domain model (`src/types/jewellery.ts`), weight maths, clock, SLA, token helpers (`src/domain/`).
- In-memory store with pure transitions (`src/store/`), rich seed data (`src/data/`).
- UI library (`src/components/ui/`): StatusChip, WeightReadout, MatchGauge, AttentionCard,
  DetailDrawer, StepFrame, OtpPanel, QueueReview, RoleChip, ValueSlot, Rail, TopBar.
- App shell, rail navigation, role switcher, route registry.

Done-when: `npm run lint` and `npm run build` pass; app opens on Staff Today; role chip switches role. ✅

---

## E1 — Role model and navigation · **Built**

Three roles (Owner, Staff, Karigar), rail per role, landing per role, the avatar role switcher.

- Screens/files: `src/nav.ts`, `src/components/shell/AppShell.tsx`, `src/components/ui/Rail.tsx`, `RoleChip.tsx`.
- Rules: anyone can switch role for the demo; each role sees only its rail. No QC manager.

Done-when: switching to each of the five identities (Rajesh, Sanjay, and the three karigars)
lands on the right home with the right rail. ✅ (worth a live browser click-through — see E11.)

---

## E2 — Leads intake · **Built**

Turning an enquiry into a lead, from both sources.

- Screens: Lead inbox (`leads`), parsed-PO review (`lead-review`), manual create (`lead-create`).
- Mockups: 16, 17.
- Rules: two sources (auto-parsed PO with a confidence state; manual counter entry); an unreadable
  PO is still created, flagged "please check", never dropped; 8-hour configurable SLA; past it the
  lead is flagged.
- Flow: a lead enters at "needs a glance" (parsed) or "opened" (manual) and can be worked.

Done-when: a staff member can add a lead by hand and review a parsed one; SLA countdown shows and
flips past 8 h.

---

## E3 — Lead conversion and order copy · **Built**

Routing a lead into work, per item.

- Screens: convert fork (`lead-convert`), order-copy builder (`order-copy`).
- Mockups: 18, 19.
- Rules: conversion is per-item — each line either holds a matching in-stock piece or becomes an
  order copy to a karigar; a lead is "converted" only when every line is routed; the order copy
  carries images, brief, target weights, chosen karigar, due date, and gold issued from the metal pool.
- Flow: convert → order copy → on send, a karigar job is created and the pool is debited.

Done-when: a lead with a mix of items can be split (one held from stock, one sent to a karigar),
and the lead closes to "converted" only once both lines are routed.

---

## E4 — Karigar portal · **Built**

The artisan's phone-first view.

- Screen: `k-jobs` (`src/components/karigar/KarigarPhone.tsx`), phone frame.
- Mockup: 09.
- Rules: shows only the signed-in karigar's own jobs; target gross/net, gold issued, wastage window;
  no prices, no customers, no other karigar's work. Accept a job and confirm the date; status updates;
  mark ready; hand over (which creates the arriving parcel). Can raise a problem on their own job.
- States: Sent → Accepted → On the bench → Ready → Handed over; Overdue derived.

Done-when: as a karigar, accept a job, move it through the states, hand it over, and see the parcel
appear on the store side.

---

## E5 — Parcel intake and the exact-match gate · **Built** (the heart of the system)

Receiving a bulk parcel and proving the gold adds up.

- Screens: parcels list (`parcels`), arrival + manifest (`parcel-arrival`), tag one item (`parcel-tag`),
  QC check (`parcel-qc`), match + release (`parcel-match`), owner clears a mismatch (`parcel-clear`).
- Mockups: 20, 21, 07, 04, 14, 22.
- Rules: parcel records bulk gross/stone/derived-gold on a named scale; each item tagged with its own
  three weights, nothing pre-filled; matches when every manifest item is tagged AND all three sums
  agree within a ceiling computed from the scales used (½ × smallest step, summed over weighings);
  staff release an exact / last-digit match themselves; a mismatch stops and only the owner clears it
  (send back, re-check a tag, or accept the loss with a logged reason). Anyone can raise a problem;
  only the owner clears it. Trays supported for parcels too heavy for the fine balance.

Done-when: the seeded clean parcel (046) releases on staff action; the 138 mg parcel (044) stops and
only the owner can clear it; the ceiling and verdicts read correctly.

---

## E6 — Stock, editing, and leaving stock · **Built**

Living inventory and the two ways a piece leaves.

- Screens: showroom stock (`stock`), piece drawer, propose edit (`edit-propose`), apply edit
  (`edit-apply`), stock-out (`stock-out`), scrap decision (`scrap-decision`), metal pool view.
- Mockups: 03, 05, 06.
- Rules: stock cards lead with pure gold; edit = propose (staff) then apply (owner with a WhatsApp
  token), staff never touch the field, audit entry kept; stock-out records seller + reference +
  invoice-number string (no amount) and locks the piece to Billed; scrap is requested by staff and
  only the owner marks it scrapped, returning the gold to the metal pool.

Done-when: a staff edit proposal reaches the owner, a token applies it with an audit entry; a
product-out locks a piece; a scrap request, once owner-approved, raises the metal-pool balance.

---

## E7 — Role homes and the exception desk · **Built**

The two dashboards that orient each role.

- Screens: Staff Today (`today`), Owner Decisions (`decisions`).
- Mockups: 02, 08, 13.
- Rules: Staff Today = "needs you now" cards (stopped parcel, untagged parcel, lead nearing SLA),
  start-something tiles, showcase stats in grams, birthdays. Owner Decisions = only what nobody else
  can do (mismatched parcels, raised problems, proposed edits, scrap requests) plus running-late and
  a "went through without you" block; a rules panel with the editable lead SLA; karigars worst-first.
- Rule behind it: a matching parcel never reaches the owner.

Done-when: each home surfaces the live seeded exceptions, and every card action navigates into the
real screen.

---

## E8 — Onboarding · **Built**

Bringing people into the system (owner-level).

- Screens: customers + add (`customers`, `customer-new`), karigars + add (`karigars`, `karigar-new`),
  staff + add (`staff-directory`, `staff-new`).
- Mockups: 23, 24, 25.
- Rules: customer = contact, group, wish dates, piece history by weight, budget/spend as deferred
  value sockets; karigar = identity, specialty, bench language, and the wastage allowance (0.6–1.2%)
  that every parcel they make is judged against; staff = name, login, and a role that fixes the
  permission list (no checkboxes); sales counted to the staff member.

Done-when: each form adds a record to the store and it shows in the directory, the role switcher, and
the relevant pickers (e.g. a new karigar appears in the order-copy assignment).

---

## E9 — Settings: scales and security log · **Built**

The owner's control surface behind the match gate.

- Screens: scales & rules (`scales`), security log (`security`).
- Mockup: 14.
- Rules: a scale registry (name + smallest step) feeds the ceiling computation; the match rule is
  stated as having nothing to configure; the security log lists audit entries (edits, accepted losses,
  problems cleared), all weights at 4 decimals.

Done-when: adding or editing a scale changes a parcel's computed ceiling; the log shows the seeded
audit entries correctly.

---

## E10 — Marketing and outreach · **Built**

Point 10 of the brief.

- Screens: wishes (`wishes`), broadcast (`broadcast`), catalogue share (`catalogue`).
- Mockups: 26, 27, 28.
- Rules: wishes with an auto-send toggle and two sender identities, only opted-in customers counted;
  broadcast composer with audience filter, {name} templating, attached pieces, phone preview; replies
  become leads; catalogue share picks in-stock pieces only, shares by image + weight.

Done-when: a broadcast previews correctly and a simulated reply creates a lead; wishes queue reflects
seeded birthdays/anniversaries; catalogue share only offers in-stock pieces.

---

## E11 — Live verification pass · **Not built** (do this before trusting any "Built" above)

The one check the automated build could not do: open the app in a browser and click every flow.

- Run `npm run dev`, walk each epic's done-when as a real user across all five identities.
- Confirm the pricing dev toggle flips value sockets on/off with no layout shift.
- Confirm responsive behaviour (rail collapse, the karigar phone frame).
- Record any interaction bug as its own small task against the owning epic.

Done-when: every epic's done-when passes by hand, not just by lint/build.

---

## E12 — Pricing turned on · **Not built** (deferred by design)

The facility exists; the feature does not. When the business is ready for money.

- Flip `pricingEnabled`; fill the `ValueSlot` sockets already placed on pieces, customers, stock-out.
- Add the gold-rate source (feed or a manager-entered daily rate), per-piece value, customer budget
  and spend history, invoice amount.
- Mockup 15 shows the before/after.

Done-when: with pricing on, value appears in every reserved socket and nothing else in the layout moves.

---

## E13 — Reports · **Not built** (never designed)

PRD point 7: the owner's per-section report dashboard. Deliberately left out of the build because no
mockup exists yet.

- First: design the report hub and one reusable section layout (UX), in grams and counts.
- Then: build it against the store's existing data.

Done-when: the owner can open a report per section (stock, karigars, leads, intake) reading real
in-memory data.

---

## E14 — Persistence and real data · **Not built** (the step out of mock data)

Today everything is in-memory and resets on reload. The move to a real product.

- Backend decided: an own Node + TypeScript API (the repo already lists `express`, `@google/genai`, `dotenv`) with managed PostgreSQL in an India region. See `docs/decisions/D1-backend-approach.md` and PRODUCTION-SCOPE §4 (D1). The cloud provider (D1a) is still open.
- Replace the in-memory store's persistence with an API + database; keep the pure transitions.
- The PO auto-parse (email/WhatsApp → lead) becomes real here — currently simulated.
- WhatsApp sending (wishes, broadcast, OTP tokens) becomes real here — currently simulated.

Done-when: data survives a reload; a real PO can create a lead; a real token reaches the owner's phone.

---

## Suggested working order

1. **E11 first** — click through what's built, so you trust the foundation before extending it.
2. Then pick by need: **E13 (reports)** if the owner wants oversight next, or **E12 (pricing)** if
   money matters first, or **E14 (persistence)** if you want to leave mock data behind.
3. E2–E10 are built; treat those as "review and polish" rather than "build", using E11's findings.

Each epic can become its own Kiro spec (requirements → design → tasks) when you start it — say the word
and I'll scaffold the spec for whichever epic you pick up.
