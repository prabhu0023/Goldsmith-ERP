# D1: Backend approach

Status: **Decided: Option C (own Node API, managed PostgreSQL in an India region on the same cloud provider)**. Decided 15 November 2026.

## Decision

The owner chose **Option C: own Node + TypeScript API**.

- All server logic runs in the team's own Node + TypeScript API: request handling, every business rule (match gate, permissions, edit token, double-sell prevention, metal-pool transactions), sign-in, sessions, the live push channel, background jobs, notifications and WhatsApp calls. `express` is already in `package.json`; any further framework choice is not made here.
- The database is managed PostgreSQL from a major cloud provider, in an India region. This also settles D2 (PostgreSQL) and D10 (India region).
- The API runs on the same cloud provider as the database and reaches it over the provider's private network. File storage (EP-09) uses the same provider's S3-compatible object storage.
- Browsers and the karigar phone app talk only to the Node API on the shop's own domain. They never connect to the database or to storage directly.
- The prototype rules in `src/domain/` and `src/store/transitions.ts` move into the Node API as the server-side authority, through the shared package described in PRODUCTION-SCOPE section 8.

The owner first asked about using Node for the APIs with Supabase as the database only. After weighing the India access risk below, he chose Option C. Supabase and other managed backend platforms (Firebase and similar) are not used. Keeping everything on one cloud provider also removes a second vendor from the path between the shop and its data.

Still open:

- ~~D1a: which cloud provider~~ **Decided 22 November 2026: AWS, Mumbai region (ap-south-1).** Files in Amazon S3, the database in Amazon RDS for PostgreSQL, and the Node API on an AWS compute service picked when deployment is built (EP-01-S12), all in one account and region. Locally, SeaweedFS stands in for S3 and Docker runs PostgreSQL; the S3 adapter (`@aws-sdk/client-s3`) needs only configuration to point at real S3.
- D3 (WebSocket or Server-Sent Events) stays open. Under Option C it is built in the Node API, not taken from a platform.
- D4 (sign-in) and D7 (branches) were decided later: see [D4-sign-in.md](D4-sign-in.md) and [tenancy-and-branches.md](tenancy-and-branches.md). D5, D6, D8 and D9 are still open.

The comparison below is kept as the record of why.

## What the backend must do

From `docs/PRODUCTION-SCOPE.md` and the epics:

1. Relational database with transactions. The metal pool, stock-out and match gate need all-or-nothing writes (D2).
2. Sign-in by phone number and password, with single-use activation and reset links sent by email; no OTP sign-in in v1 (D4, decided; EP-04). This item first read "sign-in by phone with a WhatsApp OTP", the recommendation before D4 was decided.
3. Live push to every open screen within about a second (EP-07).
4. Business rules enforced on the server, not the browser: the match gate, permissions, the edit token, double-sell prevention.
5. File storage for piece photos and PO attachments (EP-09).
6. Background jobs: lead SLA timers, 9 am wishes, token expiry (EP-10).
7. Hosted in India (D10).

The prototype already has the rules as TypeScript: `src/domain/` and `src/store/transitions.ts`. Whichever option runs TypeScript on the server can reuse them.

## Option A: Supabase (managed platform), historical

Historical: this option was compared before the decision and was not chosen. The wording below is kept as it was written then. Its sign-in row assumes WhatsApp OTP sign-in, which D4 later replaced with phone number and password.

One service provides a PostgreSQL database, sign-in, live updates, file storage and server functions.

| Need | How it is met |
| --- | --- |
| Relational + transactions | PostgreSQL |
| WhatsApp OTP sign-in | Built in, but the WhatsApp channel only works with Twilio as the provider ([Supabase docs](https://supabase.com/docs/reference/javascript/auth-signinwithotp)). Other providers are SMS only |
| Live push | Supabase Realtime |
| Server-side rules | Edge Functions (TypeScript, so `src/domain/` can be reused) or database functions |
| Files | Supabase Storage |
| Background jobs | Scheduled functions / database cron |
| India hosting | Mumbai region (ap-south-1) is available ([Supabase docs](https://supabase.com/docs/guides/functions/regional-invocation)) |
| Cost | Pro plan from $25 a month plus usage ([Supabase pricing](https://supabase.com/docs/pricing/)) |

**For:** about four platform epics (EP-04 sign-in, EP-07 live channel, EP-09 storage, EP-10 jobs) become mostly configuration instead of building. Fastest path to milestone M1.

**Against:**
- **India access risk.** From 24 February to 3 March 2026, Jio, Airtel and ACT blocked `*.supabase.co` under a government order. Sign-in, data and live updates all stopped for affected users. Access was restored on 3 March ([TechYorker](https://techyorker.com/supabase-blocked-on-jio-in-india-what-happened-and-how-to-fix-it/), [Analytics India Magazine](https://analyticsindiamag.com/ai-news/india-restores-access-to-supabase-after-isp-level-block)). A shop app must keep working, so with this option the app should reach Supabase through **your own domain**, not `*.supabase.co`.
- WhatsApp OTP ties you to Twilio for sign-in messages, while EP-12 may use a different WhatsApp provider for wishes and broadcasts.
- Rules split between Edge Functions and database policies, which is a new pattern to learn.

## Option B: Firebase

Its main database, Firestore, stores documents, not related tables. Firebase also offers SQL Connect, a managed PostgreSQL service behind a GraphQL layer ([mefmobile](https://mefmobile.org/supabase-vs-firebase-relational-databases-are-gaining-ground-not-taking-over/)).

**Not recommended.** Firestore doesn't fit the ledger and transaction needs, and SQL Connect adds a GraphQL layer this project doesn't need. Option A gives PostgreSQL more directly.

## Option C: Own Node API

A Node + TypeScript API (Express is already in `package.json`) with a managed PostgreSQL database, a WebSocket server for live push, S3-compatible storage, and a job queue, all hosted in an India region of a major cloud.

**For:**
- Full control. No dependency on one vendor's domain being reachable.
- `src/domain/` and `src/store/transitions.ts` move almost directly into the API.
- Any WhatsApp provider for both OTP and outreach. (Written before D4. Sign-in no longer uses WhatsApp; the provider now carries the owner edit code and outreach.)
- Standard architecture that most developers know.

**Against:**
- EP-04, EP-07, EP-09 and EP-10 are real build work, not configuration. Milestone M1 takes noticeably longer.
- You own security patches, scaling, backups and on-call.

## Recommendation (made before the decision)

This was the recommendation put to the owner. He chose Option C; see the Decision section at the top.

**Option A (Supabase), on your own domain**, if the team is small and speed to a working M1 matters most. Its database is standard PostgreSQL, so moving to Option C later is a migration, not a rewrite.

**Choose Option C** if any of these is true:
- The 2026 India block makes the owner uncomfortable relying on one vendor's network access.
- Someone on the team already runs Node APIs in production.
- You want one WhatsApp provider for everything.

## What changes in the epics after the decision

Option C applies. The epics and the stories flagged with D1 have been made specific to it.

- **A:** EP-04, EP-07, EP-09 and EP-10 stories shrink to setup and configuration. EP-03 becomes "Edge Functions plus database policies". A custom-domain story is added to EP-01.
- **C:** stories stay as written. EP-03 is a Node API.

Either way, the 577 stories were written neutrally, so they keep their IDs. Only the stories flagged with D1 need their acceptance criteria made specific.

## Questions for the owner

Answered by the decision above (Option C, 15 November 2026). The questions are kept as the record of what was asked.

1. How many developers will build this, and do they already know Node APIs or Supabase?
2. Is a short outage of a hosted service acceptable, or must the shop keep working regardless?
3. Is there a monthly budget ceiling for hosting?

_Sources checked 15 November 2026. Content was rephrased for compliance with licensing restrictions._
