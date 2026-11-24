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
| Connected | Real WhatsApp messages (including the owner edit code), real email intake of POs, real activation and password-reset emails. |

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
 Staff & Owner web app ─┐                     ┌─► Database (managed PostgreSQL)
 Karigar phone (web) ───┼─► API  ◄──────────► │
 Scale / label printer ─┘    │                ├─► Object storage (photos)
                             │                └─► Audit log (append-only)
                             ├─► Live channel ──► pushes events to all open clients
                             ├─► Job scheduler (SLA timers, wishes, token expiry, overdue)
                             └─► Integrations
                                  ├─ WhatsApp Business (owner edit code, alerts, wishes, broadcast, inbound POs)
                                  ├─ Email sending (activation and password-reset links, email alerts)
                                  ├─ Email inbox (inbound POs)
                                  └─ LLM parser (PO text/image → lead fields)
```

The API is the team's own Node + TypeScript API (D1, Option C). The live channel, the job scheduler
and the integrations run inside it. The database is managed PostgreSQL in an India region, and the
object storage is S3-compatible, both from the same cloud provider as the API: AWS in the Mumbai region (D1a). Locally, SeaweedFS stands in for S3. The API reaches
them over the provider's private network. Browsers and the karigar phone talk only to the API on the
shop's own domain.

---

## 4. Decisions to make before EP-01

These shape the bottom layer. The recommended option is listed first; each is reversible only at cost.
D1, D1a, D2, D3, D4, D5, D6, D7 and D10 are decided. D4a (email provider), D8 and D9 are open.

| # | Decision | Options | Recommendation and reason |
| --- | --- | --- | --- |
| D1 | Backend approach | **Decided: Option C**, own Node + TypeScript API | All server logic (rules, sign-in, sessions, live channel, jobs, notifications, WhatsApp) runs in the team's own Node API; `express` is already in `package.json`. Managed PostgreSQL in an India region on the same cloud provider, reached over its private network. Managed backend platforms are not used. See [decisions/D1-backend-approach.md](decisions/D1-backend-approach.md). |
| D1a | Cloud provider | **Decided: AWS, Mumbai region (ap-south-1)** | Owner, 22 November 2026. Files in Amazon S3, the database in Amazon RDS for PostgreSQL, and the Node API on an AWS compute service chosen when deployment is built (EP-01-S12). All three in the same account and region, the API reaching RDS and S3 over the private network. Local development keeps SeaweedFS and Docker PostgreSQL. See [decisions/D1-backend-approach.md](decisions/D1-backend-approach.md). |
| D2 | Database | Relational (PostgreSQL class) / document | **Decided: PostgreSQL** (managed, per D1). The domain is ledgers, foreign keys and transactions. |
| D3 | Live transport | WebSocket / Server-Sent Events | Decided: Server-Sent Events over HTTP (owner, 22 Nov 2026); presence via HTTP heartbeats |
| D4 | Sign-in method | **Decided: phone number + password** | Phone numbers are unique. No OTP sign-in in v1 (deferred). The owner adds a user with name, phone, email and role; a single-use activation link (24 hours, resendable) lets the user set their own password. Forgot password sends a single-use reset link (1 hour) to the account's email. 5 wrong passwords lock the account for 15 minutes. Every user has an email address. See [decisions/D4-sign-in.md](decisions/D4-sign-in.md). |
| D4a | Email provider | Any transactional email service | **Open.** Sends the activation and password-reset emails (now a required channel) and email alerts (EP-11). The sender sits behind one interface. |
| D5 | Karigar app | Installable web app (PWA) / native app | **Decided: a React web app**, used in the phone's browser. Owner, 22 November 2026. One codebase with the staff app (React) and no app store. It is not a native app. Installing it to the home screen is not decided (EP-20 section 17). See [decisions/D5-D6-karigar-app.md](decisions/D5-D6-karigar-app.md). |
| D6 | Offline for karigars | None / read-only offline / queue updates offline | **Decided: online only**. Owner, 22 November 2026. v1 has no offline mode: no offline queue, no offline cache of jobs, no sync operation and no replay of queued updates. When the connection drops the app shows the reconnecting state (EP-08-S11), actions that need the server are disabled with a reason, and on reconnect the live channel catches up (EP-07-S7). EP-20-S12a and EP-20-S12b are deferred. See [decisions/D5-D6-karigar-app.md](decisions/D5-D6-karigar-app.md). |
| D7 | Branches | **Decided: one shop, no branches** | v1 is a single shop with one owner, its staff and karigars. Every business table still carries a shop ID from the first migration, uniqueness (tag number, HUID, phone) is scoped to the shop, and the server sets the shop from the signed-in user. Multi-shop is deferred. See [decisions/tenancy-and-branches.md](decisions/tenancy-and-branches.md). |
| D8 | WhatsApp provider | Meta Cloud API directly / a Business Solution Provider | Either. Outbound messages outside a conversation need pre-approved templates, so wishes, broadcasts and the owner edit code need template approval lead time. Verify current Meta terms. |
| D9 | Scale integration | Typed by hand / read directly from the balance | Read directly where the balance supports it (EP-36). It removes typing errors at the exact-match gate. |
| D10 | Hosting region | India / elsewhere | **Decided: India region**, for latency and personal-data law: AWS Mumbai (ap-south-1), per D1a. |

---

## 5. Non-functional requirements

These apply to every epic and belong in every story's acceptance criteria where relevant.

**Precision.** Store all weights as integers in units of 0.0001 g. Never store grams as floating point. The match gate compares integers.

**Concurrency.** Two staff selling the same piece must not both succeed. The second gets a clear "already taken" message. Use database transactions with row locks or version checks.

**Security.**
- Every permission is checked on the server. Hiding a button is not a control.
- No OTP is used for sign-in (D4). Users sign in with phone number and password; passwords are stored only as salted hashes with a modern algorithm, minimum length 8; 5 wrong passwords lock the account for 15 minutes.
- Owner edit code (edit token): sent as a WhatsApp message to the owner's registered mobile number when he applies an edit. 6 digits, single use, 10-minute expiry, rate-limited, never logged in plain text.
- Activation and password-reset links sent by email: single use, activation expires in 24 hours, reset in 1 hour, stored only as hashes, never logged.
- Every query is scoped to the signed-in user's shop; the shop ID is never taken from the client.
- Every record that holds or measures gold (pieces, parcels, trays, metal pool ledger entries, scales) carries a location ID. v1 has one location, "Main shop", created with the shop; the server sets the location ID, never the client.
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
| EP-02 | Database and data model | Full schema for every entity in `src/types/jewellery.ts` plus shops, users, sessions; a shop ID on every business table and shop-scoped uniqueness (D7); migrations; integer weight units; seed scripts for dev | EP-01 |
| EP-03 | API foundation | API framework, request validation, error format, pagination, API contract shared with the front end, health check | EP-02 |
| EP-04 | Authentication | Sign-in with phone number and password (D4), activation and password-reset links, sessions, sign-out, lockout after 5 wrong passwords, the one-time first-owner creation used by the setup wizard | EP-03 |
| EP-05 | Users, roles and permissions | Owner adds users with name, phone, email and role (activation email sent, resendable), edits, deactivates and reactivates users, and unlocks locked accounts; one owner per shop; assigns Owner / Staff / Karigar; server-side permission checks on every endpoint; replaces the demo role switcher with an account menu | EP-04 |
| EP-06 | Audit log | Append-only store, write-on-every-transition, owner view (the existing Security log screen) | EP-05 |
| EP-07 | Live channel | Push connection, per-user and per-role subscriptions, event catalogue (section 1), reconnect and catch-up after a dropped connection, presence on shared parcels | EP-05 |
| EP-08 | Front-end production foundation | Connect the screens to the real system: shared API client replacing `useStore()` reads, query cache and invalidation, live-subscription hooks, loading, error, reconnecting and offline states, signed-in app shell hosting the account menu | EP-03, EP-04, EP-05, EP-07 |
| EP-09 | File storage | Upload, resize and serve piece photos, reference images and PO attachments; access control on files | EP-03 |
| EP-10 | Background jobs | Scheduler for SLA breaches, overdue jobs, token expiry, 9 am wishes; retries; idempotency | EP-03 |
| EP-11 | Notifications engine | One service for in-app, WhatsApp and email; email sending for activation and password-reset links (provider open, D4a); templates; escalation rules (staff first, then owner); delivery status | EP-07, EP-10, EP-08 |
| EP-12 | WhatsApp integration | Provider connection, template registration, outbound send (owner edit code, alerts, wishes, broadcasts; not sign-in), inbound webhook, delivery and read receipts | EP-11 |

### Layer B: Master data

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-13 | Shop settings | Settings such as lead SLA hours, auto-send wishes, pricing flag; no branches (D7) | EP-05, EP-08 |
| EP-14 | Scale registry | Scales with readability, assignment to counters, the ceiling formula reading from it | EP-02, EP-13, EP-08 |
| EP-15 | Reference data | Categories, styles, purities, inclusion types, tag number and HUID format rules | EP-02, EP-08 |
| EP-16 | Karigar master | Onboard karigar, specialty, language (stored only; v1 is English only, see EP-44), wastage allowance, karigar user account link | EP-05, EP-08 |
| EP-17 | Customer master | Onboard customer, group, birthday, anniversary, WhatsApp consent, piece history | EP-05, EP-08 |
| EP-45 | Shop setup wizard | First-run wizard, shown once: shop details (name, address, GSTIN, logo), owner account and activation email, scales and their readability, basic settings (lead response time, opening hours), invite the first staff and karigars. Numbered EP-45 to avoid renumbering; belongs to Layer B and milestone M2 | EP-04, EP-05, EP-08, EP-09, EP-11, EP-13, EP-14 |

### Layer C: Core gold pipeline

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
The gold pipeline comes before leads. It carries the business risk, and it can run on jobs created
directly by staff before any lead exists.

| ID | Epic | Scope | Depends on |
| --- | --- | --- | --- |
| EP-18 | Metal pool ledger | Balance and ledger of gold issued, returned and recovered from scrap; transactional | EP-02, EP-06, EP-08 |
| EP-19 | Order copy and karigar jobs | Build an order copy (from a lead later, or directly now), assign karigar, due date, issue gold from the pool, job states, overdue tracking | EP-16, EP-18, EP-08 |
| EP-20 | Karigar portal | Phone web app (React, in the phone browser, online only per D5 and D6): own jobs only, accept, status updates, photos, raise a problem, hand over | EP-19, EP-07, EP-08 |
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
- OTP sign-in (WhatsApp or SMS): deferred, not in v1. v1 signs in with phone number and password (D4).
- Multi-shop (many shops in one installation, shop sign-up, staff or karigars in several shops): deferred, not in v1. v1 is one shop with no branches, and every business table already carries a shop ID (D7).
- Branches and locations: deferred, not in v1. Gold records already carry a location ID (one location, "Main shop"), but transfers between locations, a metal pool per location, staff assignment to a location and reports per location are all deferred (D7).

**Totals:** 45 epics. Layers A and B (18 epics, including EP-45) must come first. Apart from the EP-45 setup wizard, they contain no visible features.

---

## 7. Build order and milestones

| Milestone | Epics | What you can demonstrate |
| --- | --- | --- |
| M1 Platform | EP-01 to EP-12 | A user signs in with phone number and password, the owner (from the staging seed until EP-45 exists) adds a user who sets a password from the activation email, two browsers receive each other's events live, and screens show loading, error and reconnecting states |
| M2 Masters | EP-13 to EP-17, EP-45 | The shop is set up once through the first-run wizard; real karigars, customers and scales stored and editable |
| M3 Intake loop | EP-18 to EP-23 | Gold issued, karigar job done on a phone, parcel tagged by two staff at once, matched and released |
| M4 Exceptions | EP-24 to EP-27 | Stop the line, edit with token, stock-out without double-selling, scrap to pool |
| M5 Front door | EP-28 to EP-30 | Leads from counter, email and WhatsApp, converted per item |
| M6 Homes and outreach | EP-31 to EP-34 | Both dashboards live; wishes and broadcasts send for real |
| M7 Production ready | EP-36 to EP-41 | Monitored, backed up, tested, migrated, launched |
| M8 Insight | EP-35 | Reports |

Milestones follow epic numbers, so working bottom-up and working milestone by milestone are the same path. EP-45 Shop setup wizard is out of number order: it is numbered 45 to avoid renumbering, but it belongs to M2 and is built after EP-14. It depends only on lower-numbered epics, so the bottom-up rule still holds.

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
