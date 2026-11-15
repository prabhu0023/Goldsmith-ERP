# JGD Enterprise Suite: end-to-end production scope

This document defines what it takes to turn the current prototype into a live, multi-user,
real-time application. It supersedes `docs/EPICS.md` for production planning; that file describes
the prototype as built.

Detailed epic documents, one per epic with an index and coverage matrix: [epics/README.md](epics/README.md).

Epics are numbered **bottom-up**: EP-01 is the lowest layer. Build in number order. An epic only
depends on epics with a lower number.

---

## 1. What "real-time application" means here

| Property | Meaning for JGD |
| --- | --- |
| Persistent | Every lead, parcel, tag, edit and stock-out survives a reload, a crash and a redeploy. |
| Multi-user | Several staff, the owner and many karigars work at the same time on different devices. |
| Live | A change made by one person appears on everyone else's screen within about a second, with no refresh. |
| Authoritative | The server enforces every rule: the match gate, permissions, the edit token. The browser only displays. |
| Auditable | Every state change records who did it, when, and the before and after values. The record cannot be edited. |
| Connected | Real WhatsApp messages, real email intake of POs, real OTP delivery. |

### Live events the system must push

These are the moments where a delay costs money or trust.

| Event | Who must see it immediately | Why |
| --- | --- | --- |
| Piece billed by one staff member | Every other staff screen | Stops two people selling the same piece |
| Parcel stopped (mismatch or raised problem) | Owner | Pieces are frozen until he acts |
| Edit proposed / token sent | Owner | Staff are waiting at the counter |
| Edit applied | Proposing staff, stock screens | Weight on the tag has changed |
| Lead arrived / passed its SLA | Staff inbox, owner | 8-hour clock |
| Karigar job status changed | Staff, owner | Delivery tracking |
| Parcel handed over by karigar | Parcels-in screen | Intake can start |
| Tag saved on a shared parcel | Other staff tagging the same parcel | Avoids duplicate tagging |
| Metal pool changed | Order-copy screen | Gold available to issue |
| User deactivated or role changed | That user's open sessions | Access must end at once |

---

## 2. Where things stand

| Area | Prototype today | Production needs |
| --- | --- | --- |
| Front end | React 19 + Vite 8 + Tailwind 4, about 60 files, all screens built | Keep. Rewire from the in-memory store to the API and live channel |
| Business rules | Pure functions in `src/domain/` and `src/store/transitions.ts` | Move to the server as the authority. Keep shared copies only for instant UI feedback |
| Data | In-memory seed, resets on reload | Database, migrations, backups |
| Identity | Demo role switcher | Login, sessions, user management |
| Live updates | None | Push channel |
| WhatsApp / email | Simulated | Real providers |
| Files | Four bundled JPEGs | Object storage for photos |
| Hosting, monitoring, CI | None | All needed |

The prototype is the **UI contract**. Most screens survive; what changes underneath them is almost everything.

---

## 3. Target architecture

```
 Staff & Owner web app ─┐                     ┌─► Database (relational)
 Karigar phone (PWA) ───┼─► API  ◄──────────► │
 Scale / label printer ─┘    │                ├─► Object storage (photos)
                             │                └─► Audit log (append-only)
                             ├─► Live channel ──► pushes events to all open clients
                             ├─► Job scheduler (SLA timers, wishes, token expiry, overdue)
                             └─► Integrations
                                  ├─ WhatsApp Business (OTP, alerts, wishes, broadcast, inbound POs)
                                  ├─ Email inbox (inbound POs)
                                  └─ LLM parser (PO text/image → lead fields)
```

---

## 4. Decisions to make before EP-01

These shape the bottom layer. The recommended option is listed first; each is reversible only at cost.

| # | Decision | Options | Recommendation and reason |
| --- | --- | --- | --- |
| D1 | Backend approach | (a) Managed platform with database, auth, realtime and storage built in (b) Own Node + TypeScript API with a separate database | (a) for a small team: four infrastructure epics become configuration. Choose (b) if you need full control or self-hosting. `express` is already in `package.json` if you choose (b). |
| D2 | Database | Relational (PostgreSQL class) / document | Relational. The domain is ledgers, foreign keys and transactions. |
| D3 | Live transport | WebSocket / Server-Sent Events / database change feed | WebSocket or the managed platform's realtime feed. Needs two-way for presence. |
| D4 | Sign-in method | Phone + WhatsApp OTP / phone + password / email + password | Phone + WhatsApp OTP. Staff and karigars already live on WhatsApp, and you already use OTP for edits. Keep a password fallback for the owner. |
| D5 | Karigar app | Installable web app (PWA) / native app | PWA. One codebase, no app store, works on any phone. |
| D6 | Offline for karigars | None / read-only offline / queue updates offline | Queue status updates offline. Workshops often have weak signal. |
| D7 | Branches | Single shop / multiple branches | Decide now. The mockups say "All branches". Adding branches later means migrating every table. |
| D8 | WhatsApp provider | Meta Cloud API directly / a Business Solution Provider | Either. Outbound messages outside a conversation need pre-approved templates, so wishes, broadcasts and OTP need template approval lead time. Verify current Meta terms. |
| D9 | Scale integration | Typed by hand / read directly from the balance | Read directly where the balance supports it (EP-36). It removes typing errors at the exact-match gate. |
| D10 | Hosting region | India / elsewhere | India, for latency and personal-data law. |

---

## 5. Non-functional requirements

These apply to every epic and belong in every story's acceptance criteria where relevant.

**Precision.** Store all weights as integers in units of 0.0001 g. Never store grams as floating point. The match gate compares integers.

**Concurrency.** Two staff selling the same piece must not both succeed. The second gets a clear "already taken" message. Use database transactions with row locks or version checks.

**Security.**
- Every permission is checked on the server. Hiding a button is not a control.
- OTP and edit tokens: 6 digits, single use, 10-minute expiry, rate-limited, never logged in plain text.
- Sessions expire. Deactivating a user ends their sessions at once.
- Secrets live in environment configuration, never in the repo.

**Audit.** Append-only log of every state change: actor, time, entity, action, before, after, reason, token reference. No update or delete path, including for the owner.

**Personal data.** Customer names, phones, birthdays and anniversaries are personal data under India's Digital Personal Data Protection Act, 2023. Record consent for WhatsApp messaging, honour opt-out, and support deletion requests. Verify obligations with a professional.

**Availability and recovery.** Daily backups, point-in-time restore, a tested restore drill. Target recovery point under 1 hour.

**Performance.** Screens load under 2 seconds on a shop connection. Live events arrive within about 1 second.

**Time.** Store UTC. Display Asia/Kolkata. The 8-hour lead SLA counts shop hours (pending confirmation from Appendix A, A2).

---

## 6. Epics, bottom-up

### Layer A: Platform foundation

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-01 | Repository, environments and CI | Monorepo layout (web, api, shared), dev / staging / production environments, secrets management, CI running lint, typecheck, tests and build on every push | — |
| EP-02 | Database and data model | Full schema for every entity in `src/types/jewellery.ts` plus users, sessions, branches; migrations; integer weight units; seed scripts for dev | EP-01 |
| EP-03 | API foundation | API framework, request validation, error format, pagination, API contract shared with the front end, health check | EP-02 |
| EP-04 | Authentication | Sign-in (per D4), OTP send and verify, sessions, sign-out, lockout after failed attempts, first-owner bootstrap | EP-03 |
| EP-05 | Users, roles and permissions | Owner adds, edits, deactivates and reactivates users; assigns Owner / Staff / Karigar; server-side permission checks on every endpoint; replaces the demo role switcher with an account menu | EP-04 |
| EP-06 | Audit log | Append-only store, write-on-every-transition, owner view (the existing Security log screen) | EP-05 |
| EP-07 | Live channel | Push connection, per-user and per-role subscriptions, event catalogue (section 1), reconnect and catch-up after a dropped connection, presence on shared parcels | EP-05 |
| EP-08 | Front-end production foundation | Connect the screens to the real system: shared API client replacing `useStore()` reads, query cache and invalidation, live-subscription hooks, loading, error, reconnecting and offline states, signed-in app shell hosting the account menu | EP-03, EP-04, EP-05, EP-07 |
| EP-09 | File storage | Upload, resize and serve piece photos, reference images and PO attachments; access control on files | EP-03 |
| EP-10 | Background jobs | Scheduler for SLA breaches, overdue jobs, token expiry, 9 am wishes; retries; idempotency | EP-03 |
| EP-11 | Notifications engine | One service for in-app, WhatsApp and email; templates; escalation rules (staff first, then owner); delivery status | EP-07, EP-10, EP-08 |
| EP-12 | WhatsApp integration | Provider connection, template registration, outbound send, inbound webhook, delivery and read receipts | EP-11 |

### Layer B: Master data

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-13 | Branches and shop settings | Branch records if D7 says multi-branch; settings such as lead SLA hours, auto-send wishes, pricing flag | EP-05, EP-08 |
| EP-14 | Scale registry | Scales with readability, assignment to counters, the ceiling formula reading from it | EP-02, EP-13, EP-08 |
| EP-15 | Reference data | Categories, styles, purities, inclusion types, tag number and HUID format rules | EP-02, EP-08 |
| EP-16 | Karigar master | Onboard karigar, specialty, language (stored only; v1 is English only, see EP-44), wastage allowance, karigar user account link | EP-05, EP-08 |
| EP-17 | Customer master | Onboard customer, group, birthday, anniversary, WhatsApp consent, piece history | EP-05, EP-08 |

### Layer C: Core gold pipeline

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
The gold pipeline comes before leads. It carries the business risk, and it can run on jobs created
directly by staff before any lead exists.

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-18 | Metal pool ledger | Balance and ledger of gold issued, returned and recovered from scrap; transactional | EP-02, EP-06, EP-08 |
| EP-19 | Order copy and karigar jobs | Build an order copy (from a lead later, or directly now), assign karigar, due date, issue gold from the pool, job states, overdue tracking | EP-16, EP-18, EP-08 |
| EP-20 | Karigar portal (PWA) | Phone app: own jobs only, accept, status updates, photos, raise a problem, hand over; offline queue per D6 | EP-19, EP-07, EP-08 |
| EP-21 | Parcel intake and tagging | Arrival, bulk weights on a named scale, trays, manifest, tag each item, QC checks, multiple staff tagging one parcel live | EP-20, EP-14, EP-15, EP-09, EP-08 |
| EP-22 | Stock and piece lifecycle | In-stock list, piece detail, state machine enforced on the server (in stock goes to billed or scrapped; no holds in v1), double-sell prevention | EP-21, EP-08 |
| EP-23 | Exact-match gate and owner clearance | Server-side match verdict, staff release, owner send-back / re-check / accept-loss with reason | EP-21, EP-18, EP-08 |
| EP-24 | Stop the line | Raise a problem on parcel, job or piece; owner-only clear; live alert | EP-23, EP-11, EP-08 |
| EP-25 | Edit proposals | Staff propose, owner reads, token to owner's WhatsApp, owner applies, audit entry | EP-22, EP-12, EP-08 |
| EP-26 | Stock-out | Seller, reference, invoice-number string; locks the piece; live removal from other screens | EP-22, EP-08 |
| EP-27 | Scrap | Staff request, owner marks scrapped, gold returns to the pool | EP-22, EP-18, EP-08 |
| EP-28 | Leads: manual intake and inbox | Create lead by hand, inbox, SLA clock, states | EP-17, EP-10, EP-08 |
| EP-29 | Leads: automatic PO intake | Email inbox and WhatsApp inbound to lead; LLM parsing to fields with confidence; unreadable POs still create a flagged lead; review screen | EP-12, EP-28, EP-09, EP-08 |
| EP-30 | Lead conversion | Per-item routing: link a matching in-stock piece for reference (not reserved, still sellable to anyone) or make it via an order copy; converted only when every line is routed | EP-28, EP-22, EP-19, EP-08 |

### Layer D: Experience

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-31 | Staff Today home | Live "needs you now" cards, start tiles, showcase stats, birthdays | EP-18 to EP-30, EP-08 |
| EP-32 | Owner Decisions home | Live exception desk, running-late, went-through-without-you, rules panel | EP-23 to EP-30, EP-08 |
| EP-33 | Wishes | Daily birthday and anniversary queue, auto-send, two sender identities, consent respected | EP-17, EP-12, EP-10, EP-08 |
| EP-34 | Broadcast and catalogue share | Audience filter, templated message, attached in-stock pieces, preview, send, replies become leads | EP-33, EP-22, EP-29, EP-08 |
| EP-35 | Reports | Owner report per section in grams and counts: stock, karigars, leads, intake, outreach. **Needs UX design first** | EP-18 to EP-34, EP-08 |

### Layer E: Hardware, scale and operations

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-36 | Scale and printer hardware | Read weight directly from the balance where supported; print tag labels with barcode; scan tags at stock-out | EP-21, EP-26, EP-08 |
| EP-37 | Observability | Logs, error tracking, uptime checks, alerting on failed WhatsApp sends and job failures | EP-03, EP-12 |
| EP-38 | Backup and recovery | Automated backups, point-in-time restore, documented restore drill | EP-02 |
| EP-39 | Security and data protection | Rate limiting, penetration test, consent and deletion flows, access review, secrets rotation | EP-05, EP-17, EP-08 |
| EP-40 | Automated testing | Unit tests for the domain rules (port the 88 prototype assertions), API tests, end-to-end tests of the main flows, concurrency tests for double-selling | EP-03 onwards, run continuously |
| EP-41 | Launch and data migration | Load real karigars, customers and existing stock; staff training; parallel run with the paper register; go-live checklist | All above |

### Layer F: Later

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-42 | Pricing | Turn on the value sockets: gold rate source, piece value, customer budget and spend, invoice amount | EP-22, EP-26, EP-08 |
| EP-43 | Staff gamification | Scoring and leaderboards from attributed sales | EP-26, EP-08 |
| EP-44 | Localisation | Translate the UI (karigar phone first, possibly staff screens), the हिन्दी toggle (mockup 09) and language choice (mockup 24), per-user language preference, translated WhatsApp templates, number and date formatting per locale; weights stay in grams to four decimals. v1 is English only | EP-08, EP-20, EP-12 |

Notes for Later:

- Holds: deferred, not in v1.

**Totals:** 44 epics. Layers A and B (17 epics) contain no visible features and must come first.

---

## 7. Build order and milestones

| Milestone | Epics | What you can demonstrate |
| --- | --- | --- |
| M1 Platform | EP-01 to EP-12 | A user signs in with a WhatsApp OTP, the owner adds a user, two browsers receive each other's events live, and screens show loading, error and reconnecting states |
| M2 Masters | EP-13 to EP-17 | Real karigars, customers and scales stored and editable |
| M3 Intake loop | EP-18 to EP-23 | Gold issued, karigar job done on a phone, parcel tagged by two staff at once, matched and released |
| M4 Exceptions | EP-24 to EP-27 | Stop the line, edit with token, stock-out without double-selling, scrap to pool |
| M5 Front door | EP-28 to EP-30 | Leads from counter, email and WhatsApp, converted per item |
| M6 Homes and outreach | EP-31 to EP-34 | Both dashboards live; wishes and broadcasts send for real |
| M7 Production ready | EP-36 to EP-41 | Monitored, backed up, tested, migrated, launched |
| M8 Insight | EP-35 | Reports |

Milestones follow epic numbers exactly, so working bottom-up and working milestone by milestone are the same path.

---

## 8. Reuse from the prototype

| Prototype asset | Production use |
| --- | --- |
| `src/components/**` screens | Kept as the UI. Replace `useStore()` reads with API queries and live subscriptions (EP-08) |
| `src/components/ui/**` | Kept unchanged |
| `src/domain/**` | Moved to a shared package; the server uses it as the authority, the client for instant feedback |
| `src/store/transitions.ts` | Becomes the server-side service layer, one function per endpoint |
| `src/types/jewellery.ts` | Basis for the database schema and API contract |
| `src/data/seed.ts` | Dev and staging seed data |
| `docs/ux/**` | Acceptance reference for every UI story |

---

## Appendix: suggested story template

```
Story ID:      EP-xx-Sy
Title:         <role> can <action>
As a           <Owner | Staff | Karigar>
I want         <capability>
So that        <business outcome>

Acceptance criteria (Given / When / Then):
  1. Given … When … Then …
  2. …

Rules enforced on the server:   <permission, validation, state transition>
Live events emitted / consumed: <event names from section 1>
Audit entry written:            <yes/no, fields>
Data changes:                   <tables, migrations>
UI reference:                   docs/ux/mockups/<file>.svg
Non-functional checks:          <precision, concurrency, security, performance as relevant>
Depends on:                     <story IDs>
Definition of done:             code reviewed · tests pass · deployed to staging · acceptance criteria demoed
```
