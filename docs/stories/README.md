# JGD Enterprise Suite: user stories

One stories file per epic. Each story uses the template in the appendix of `docs/PRODUCTION-SCOPE.md`.
Story IDs follow `EP-xx-Sy` and match the candidate list in section 18 of each epic document in `docs/epics/`.
A story may depend only on stories in the same epic or a lower-numbered epic, so the files can be built in order from EP-01.

Decisions these stories follow:

- Three roles: Owner, Staff and Karigar. Real sign-in and user management; there is no demo role switcher.
- No hold mechanism in v1. A piece is sellable until it is sold. Double-sell prevention stays.
- English only in v1. Translation is EP-44 (Later).
- No money in v1. Only EP-42 Pricing has price logic.
- Weights are stored as integers in units of 0.0001 g and shown to 4 decimals.
- Sign-in is decided (D4): phone number and password; the owner adds a user with name, phone, email and role, and a single-use activation link (24 hours) lets the user set a password; forgot password sends a single-use reset link (1 hour) to the account's email; 5 wrong passwords lock the account for 15 minutes. No OTP sign-in in v1. Every user has an email address. See `docs/decisions/D4-sign-in.md`.
- The owner edit code stays: when the owner applies a staff edit, a one-time code goes as a WhatsApp message to his registered mobile number (EP-25).
- One shop, no branches (D7). One owner per shop. Every business table carries a shop ID, and uniqueness (tag number, HUID, phone) is per shop. Multi-shop is deferred. See `docs/decisions/tenancy-and-branches.md`.
- The first shop and owner are created by the first-run setup wizard (EP-45). Stories made out of scope by these decisions keep their IDs and say "Deferred".
- Backend is decided (D1, Option C): the team's own Node + TypeScript API runs every rule, sign-in, sessions, the live channel and background jobs. The database is managed PostgreSQL (D2) in an India region (D10), with S3-compatible file storage, both on the same cloud provider as the API and reached only by the API over its private network. Browsers and the karigar phone talk only to the API. The cloud provider is decided (D1a): AWS, Mumbai region, with S3 for files and RDS for PostgreSQL. Stories still flagged "Open decision D1a" are resolved for AWS when they are built. See `docs/decisions/D1-backend-approach.md`.

Layers: A Platform foundation, B Master data, C Core gold pipeline, D Experience, E Hardware, scale and operations, F Later.

| Epic | Title | Layer | Milestone | Stories | Stories file |
| --- | --- | --- | --- | --- | --- |
| EP-01 | Repository, environments and CI | A | M1 Platform | 13 | [EP-01-stories.md](./EP-01-stories.md) |
| EP-02 | Database and data model | A | M1 Platform | 14 | [EP-02-stories.md](./EP-02-stories.md) |
| EP-03 | API foundation | A | M1 Platform | 12 | [EP-03-stories.md](./EP-03-stories.md) |
| EP-04 | Authentication | A | M1 Platform | 14 | [EP-04-stories.md](./EP-04-stories.md) |
| EP-05 | Users, roles and permissions | A | M1 Platform | 14 | [EP-05-stories.md](./EP-05-stories.md) |
| EP-06 | Audit log | A | M1 Platform | 12 | [EP-06-stories.md](./EP-06-stories.md) |
| EP-07 | Live channel | A | M1 Platform | 12 | [EP-07-stories.md](./EP-07-stories.md) |
| EP-08 | Front-end production foundation | A | M1 Platform | 19 | [EP-08-stories.md](./EP-08-stories.md) |
| EP-09 | File storage | A | M1 Platform | 13 | [EP-09-stories.md](./EP-09-stories.md) |
| EP-10 | Background jobs | A | M1 Platform | 13 | [EP-10-stories.md](./EP-10-stories.md) |
| EP-11 | Notifications engine | A | M1 Platform | 14 | [EP-11-stories.md](./EP-11-stories.md) |
| EP-12 | WhatsApp integration | A | M1 Platform | 12 | [EP-12-stories.md](./EP-12-stories.md) |
| EP-13 | Shop settings | B | M2 Masters | 14 | [EP-13-stories.md](./EP-13-stories.md) |
| EP-14 | Scale registry | B | M2 Masters | 12 | [EP-14-stories.md](./EP-14-stories.md) |
| EP-15 | Reference data | B | M2 Masters | 12 | [EP-15-stories.md](./EP-15-stories.md) |
| EP-16 | Karigar master | B | M2 Masters | 13 | [EP-16-stories.md](./EP-16-stories.md) |
| EP-17 | Customer master | B | M2 Masters | 14 | [EP-17-stories.md](./EP-17-stories.md) |
| EP-18 | Metal pool ledger | C | M3 Intake loop | 12 | [EP-18-stories.md](./EP-18-stories.md) |
| EP-19 | Order copy and karigar jobs | C | M3 Intake loop | 14 | [EP-19-stories.md](./EP-19-stories.md) |
| EP-20 | Karigar portal | C | M3 Intake loop | 15 | [EP-20-stories.md](./EP-20-stories.md) |
| EP-21 | Parcel intake and tagging | C | M3 Intake loop | 14 | [EP-21-stories.md](./EP-21-stories.md) |
| EP-22 | Stock and piece lifecycle | C | M3 Intake loop | 11 | [EP-22-stories.md](./EP-22-stories.md) |
| EP-23 | Exact-match gate and owner clearance | C | M3 Intake loop | 14 | [EP-23-stories.md](./EP-23-stories.md) |
| EP-24 | Stop the line | C | M4 Exceptions | 14 | [EP-24-stories.md](./EP-24-stories.md) |
| EP-25 | Edit proposals | C | M4 Exceptions | 14 | [EP-25-stories.md](./EP-25-stories.md) |
| EP-26 | Stock-out | C | M4 Exceptions | 13 | [EP-26-stories.md](./EP-26-stories.md) |
| EP-27 | Scrap | C | M4 Exceptions | 11 | [EP-27-stories.md](./EP-27-stories.md) |
| EP-28 | Leads: manual intake and inbox | C | M5 Front door | 14 | [EP-28-stories.md](./EP-28-stories.md) |
| EP-29 | Leads: automatic PO intake | C | M5 Front door | 14 | [EP-29-stories.md](./EP-29-stories.md) |
| EP-30 | Lead conversion | C | M5 Front door | 9 | [EP-30-stories.md](./EP-30-stories.md) |
| EP-31 | Staff Today home | D | M6 Homes and outreach | 12 | [EP-31-stories.md](./EP-31-stories.md) |
| EP-32 | Owner Decisions home | D | M6 Homes and outreach | 13 | [EP-32-stories.md](./EP-32-stories.md) |
| EP-33 | Wishes | D | M6 Homes and outreach | 13 | [EP-33-stories.md](./EP-33-stories.md) |
| EP-34 | Broadcast and catalogue share | D | M6 Homes and outreach | 16 | [EP-34-stories.md](./EP-34-stories.md) |
| EP-35 | Reports | D | M8 Insight | 13 | [EP-35-stories.md](./EP-35-stories.md) |
| EP-36 | Scale and printer hardware | E | M7 Production ready | 12 | [EP-36-stories.md](./EP-36-stories.md) |
| EP-37 | Observability | E | M7 Production ready | 11 | [EP-37-stories.md](./EP-37-stories.md) |
| EP-38 | Backup and recovery | E | M7 Production ready | 10 | [EP-38-stories.md](./EP-38-stories.md) |
| EP-39 | Security and data protection | E | M7 Production ready | 15 | [EP-39-stories.md](./EP-39-stories.md) |
| EP-40 | Automated testing | E | M7 Production ready | 13 | [EP-40-stories.md](./EP-40-stories.md) |
| EP-41 | Launch and data migration | E | M7 Production ready | 14 | [EP-41-stories.md](./EP-41-stories.md) |
| EP-42 | Pricing | F | None (later) | 15 | [EP-42-stories.md](./EP-42-stories.md) |
| EP-43 | Staff gamification | F | None (later) | 12 | [EP-43-stories.md](./EP-43-stories.md) |
| EP-44 | Localisation | F | None (later) | 12 | [EP-44-stories.md](./EP-44-stories.md) |
| EP-45 | Shop setup wizard | B | M2 Masters | 9 | [EP-45-stories.md](./EP-45-stories.md) |

Total stories: 586
