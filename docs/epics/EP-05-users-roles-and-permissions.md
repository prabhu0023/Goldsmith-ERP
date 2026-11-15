# EP-05: Users, roles and permissions

## 1. Summary

This epic gives the owner a real user management mechanism and makes the server check permissions on every
operation. The user asked for this directly: "We don't need role switching at all… We need to add a user, and we need
all the roles. There should be a user management mechanism as well." The shop has three roles with fixed
permission lists: Owner, Staff and Karigar. The owner adds, edits, deactivates and reactivates users and assigns one
of the three roles. Under D4 the owner adds a user with name, phone, email and role, and the system emails a
single-use activation link so the user sets their own password. The shop has exactly one owner (D7, one shop).
The demo role switcher is replaced by an account menu. Without server-side checks, anyone who can
call the API could clear a mismatch or scrap a piece, so this epic is what makes the owner's signature mean something.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Partial. Roles, per-role rails (`navFor`), landing routes, `requireOwner` on 12 transitions, `onboardStaff` and the `staff-directory` and `staff-new` screens exist; there is no edit, deactivate or reactivate, karigars are a separate entity from staff, and anyone can switch identity.

## 3. Roles involved

- Owner: adds users with name, phone, email and role, resends activation links, edits name, phone and email, changes a role between staff and karigar, deactivates and reactivates users, unlocks locked accounts, and holds every permission staff has plus clearing, applying edits, scrap, onboarding and rules.
- Staff: uses the staff permission list; cannot manage users; sees their own account in the account menu.
- Karigar: uses the karigar permission list on the phone portal; sees only their own jobs.
- System: checks the caller's role on every operation, filters data by role, and emits "User deactivated or role changed".

## 4. In scope

- A permission matrix per role, defined once in the shared package and fixed by role (no per-user ticks).
- A server-side permission check on every operation from EP-03 and on every later feature operation.
- Data filtering by role: a karigar reads only their own jobs and the reference images of those jobs.
- Owner adds a user with name, phone, email and role (D4); the user is created in the owner's shop with status `pending_activation`, and the activation email goes out at once (EP-04-S10).
- Owner resends the activation link while the user has not activated; a resend replaces the earlier link.
- Owner unlocks an account locked after 5 wrong passwords, before the 15 minutes end (EP-04-S8).
- Owner edits a user's name, phone and email.
- Owner changes a user's role between staff and karigar. The shop has exactly one owner, so no change makes a second owner and the owner cannot be demoted.
- Owner deactivates and reactivates a user.
- Deactivation or role change ends the user's sessions at once (through EP-04) and emits the live event.
- An account menu (who am I, sign out) replacing the `RoleChip` identity switcher.
- A user directory listing users with role and status.
- A guard that keeps exactly one active owner per shop: the owner cannot be deactivated or demoted, and no second owner can be added or promoted (D7: one shop, one owner; an owner has exactly one shop).
- Every user belongs to the one shop; the server sets the shop ID from the owner's session, never from the request (D7).
- Linking a karigar user account to a Karigar record (account side; the karigar record itself is EP-16).

## 5. Out of scope

- Sign-in, password checks, activation and reset links, and session issue (EP-04).
- Karigar master fields: specialty, language, wastage allowance (EP-16).
- Customer records (EP-17); customers are not users.
- Shop settings (EP-13). Branches are not in v1 (D7).
- The first owner, created by the setup wizard (EP-45) through EP-04.
- Audit entries for user changes; this epic calls the audit writer, EP-06 owns it.
- Sales attribution counts and leaderboards (EP-43).
- Access review and rate limiting (EP-39).
- Bulk loading of real staff for launch (EP-41).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `RoleId = 'staff' | 'owner' | 'karigar'`; `StaffMember {id, name, role: owner|staff, login, phone, salesCount}`; `Identity.karigarId` links a karigar identity to a `Karigar` record.
- `src/nav.ts`: `navFor(role)` returns staff sections Work and Outreach, owner sections Oversight and Outreach, and no rail for the karigar; `landingRoute` sends staff to `today`, owner to `decisions`, karigar to `k-jobs`.
- `src/components/people/permissions.ts`: `ROLES` with `can` and `cannot` lists per role. Its header says "The permission list is fixed by the role. Nobody ticks boxes. (Mockups 11 and 25.)"
- `src/components/people/OnboardStaff.tsx` (route `staff-new`) and `StaffDirectory.tsx` (route `staff-directory`).
- `src/store/transitions.ts`: `requireOwner(by, what)` throws "Only the owner can …". It guards ownerSendBack, ownerRecheckTag, ownerAcceptLoss, clearProblem, ownerAgreeEdit, applyEdit, refuseEdit, ownerScrap, ownerDeclineScrap, onboardKarigar, onboardStaff and upsertScale. `setSetting`, `onboardCustomer`, `sendWishes`, `sendBroadcast` and all staff flows have no guard (gap G12 for settings).
- `releaseParcel` refuses a mismatch for staff by verdict, not by role check alone.
- `src/components/ui/RoleChip.tsx` switches identity for anyone; `StoreProvider.switchIdentity` has no check.
- Reusable: `ROLES` as the starting permission matrix; `navFor` and `landingRoute`; the `staff-new` form and `staff-directory` list; `requireOwner` sentences as error text.
- Must be rebuilt server-side: the permission check per operation, data filtering per role, user lifecycle (add with activation email, edit, deactivate, reactivate, unlock), one-owner guard, and session ending on change.

## 7. Functional requirements

- FR-05-1. The shared package defines, for each of Owner, Staff and Karigar, the list of operations that role may call.
- FR-05-2. The server refuses any operation the caller's role does not allow, with a sentence such as "Only the owner can clear a mismatch."
- FR-05-3. The server refuses the same operations whether or not the screen shows the button.
- FR-05-4. A karigar can read only jobs whose `karigarId` is linked to their user, and never reads prices, customers, leads or stock.
- FR-05-5. The owner can add a user with name, phone, email and the role staff or karigar; phone and email are required, and the phone must be unique within the shop among users who are not deactivated (D4). Adding the user sends the activation email (EP-04-S10).
- FR-05-6. A staff or karigar user who tries to add a user or change a role is refused.
- FR-05-7. The owner can edit a user's name, phone and email.
- FR-05-8. The owner can change a user's role between staff and karigar, and the change takes effect on the user's next request.
- FR-05-9. The owner can deactivate a user; the user's sessions end at once and they cannot sign in.
- FR-05-10. The owner can reactivate a deactivated user, who can then sign in again.
- FR-05-11. The server keeps exactly one active owner per shop: it refuses to deactivate or demote the owner, and refuses to add or promote a second owner.
- FR-05-12. Deactivation and role change emit "User deactivated or role changed".
- FR-05-13. The account menu shows the signed-in user's name and role and offers sign-out; it offers no identity switch.
- FR-05-14. The user directory lists every user with name, phone, role and status, and only the owner can open it.
- FR-05-15. A karigar user is linked to exactly one Karigar record.
- FR-05-16. Every user lifecycle change writes an audit entry with before and after values.
- FR-05-17. The owner can resend the activation link to a user who has not yet activated.
- FR-05-18. The owner can unlock a locked account; the user can then sign in at once.

## 8. Business rules

- BR-05-1. Three roles, no in-between; the permission list is fixed by the role and nobody ticks boxes. [mockup 25]
- BR-05-2. Only the owner can add staff or change a role. [mockup 25; src/store/transitions.ts onboardStaff]
- BR-05-3. Every permission is checked on the server; hiding a button is not a control. [PRODUCTION-SCOPE §5 Security]
- BR-05-4. Staff cannot release a parcel whose weights disagree, apply their own edit, or scrap a piece. [mockup 11]
- BR-05-5. The owner can do everything staff can, plus clear a mismatch or problem, apply an edit with a token, mark scrap, send a parcel back, onboard staff and karigars, set the lead timer and rules, and read every report. [mockup 11]
- BR-05-6. A karigar sees only the jobs issued to him, and never sees prices, margins, invoices, customers, leads, stock, or any other karigar's work or scorecard. [mockup 11]
- BR-05-7. Anyone can stop the line; only the owner can start it again. [mockup 11; docs/ux/mockups/README.md]
- BR-05-8. Deactivating a user ends their sessions at once. [PRODUCTION-SCOPE §5 Security]
- BR-05-9. The demo role switcher is replaced by an account menu. [PRODUCTION-SCOPE §6 EP-05 scope]
- BR-05-10. The QC manager role is removed; checking is a stage inside the staff flow. [SCOPE-ANALYSIS §6 Q1, App. A; mockup 11]
- BR-05-11. Staff land on Today, owner on Decisions, karigar on My jobs. [mockup 25; src/nav.ts landingRoute]
- BR-05-12. Every user has an email address, karigars included; no temporary password is ever emailed. [D4]
- BR-05-13. One shop has one owner, and an owner has exactly one shop; every user belongs to that shop. [D7; decisions/tenancy-and-branches.md]

## 9. Data

- User: id, shop ID, name, phone (unique within the shop), email (required), role (`owner`, `staff`, `karigar`), status (`pending_activation`, `active`, `deactivated`), karigarId (nullable, set for karigar users), created at, deactivated at, version. No branch key (D7).
- StaffMember (prototype) merges into User for owner and staff; `salesCount` stays as a derived count for EP-43.
- Permission matrix: role → allowed operations; lives in code in the shared package, not in a table, because it is fixed by role.
- No weights and no money fields in this epic.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | User | Add a user with name, phone, email, role; sends the activation email | Owner |
| Create | Activation link (resend) | Send a new activation link to a user who has not activated | Owner |
| Update | Account lock | Unlock a locked account | Owner |
| Update | User profile | Change name, phone or email | Owner |
| Update | User role | Change role between staff and karigar | Owner |
| Update | User status | Deactivate or reactivate | Owner |
| List | Users | Directory with role and status | Owner |
| Read | Current user | Account menu data and permission list | Any signed-in user |
| Check | Permission | Decide whether the caller may run an operation (internal, on every request) | System |

## 11. Live events

- Emits: "User deactivated or role changed" — when the owner deactivates a user or changes their role; EP-04 ends the sessions, EP-07 drops the subscriptions, EP-20 signs the karigar phone out.
- Consumes: none.

## 12. Screens and UX references

- Route ids: `staff-directory` (StaffDirectory), `staff-new` (OnboardStaff).
- Mockups: `11-roles-and-permissions.svg` (CAN, CANNOT and NEVER SEES lists), `25-onboard-staff.svg` (role picker, "Which counter / branch" (no branch in v1, D7), "Only the owner can add staff or change a role."; the form gains an email field), `10-navigation-map.mmd` (three role homes).
- The `RoleChip` at the rail foot becomes the account menu.
- Not yet designed (MOCKUP-COVERAGE §3): user list with status (awaiting activation, locked), add and edit user with email, resend activation, unlock, deactivate and reactivate, account menu replacing the role switcher.

## 13. Non-functional requirements

- Security: every operation checks the role on the server; a karigar request for another karigar's job returns not-found, not the record.
- Security: deactivation ends sessions within about 1 second through the live event.
- Audit: add, edit, role change, deactivate and reactivate write audit entries with before and after values.
- Personal data: user phones are personal data; only the owner sees the full directory.
- Concurrency: two sessions of the owner changing one user at once are resolved by the version check; the one-owner guard runs inside the same transaction.
- Tenancy: every user read and write is scoped to the owner's shop ID from the session (D7).
- Performance: the permission check adds no noticeable delay; screens load under 2 seconds.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-04
- Downstream: EP-06, EP-07, EP-08, EP-13, EP-16, EP-17, EP-39, EP-40, EP-41, EP-45.

## 15. Epic acceptance criteria

1. Given a signed-in staff member, when they call the clear-mismatch operation directly, then the server refuses with "Only the owner can …" and nothing changes.
2. Given the owner, when they add Deepak Rao with phone +91 90030 71145, email deepak.rao@example.com and role Staff, then an activation email goes to that address, and after Deepak sets his password he can sign in and lands on `today`.
3. Given a signed-in karigar KG-04, when they request a job assigned to KG-01, then the server returns not-found.
4. Given a signed-in staff member on two devices, when the owner deactivates them, then both devices return to sign-in within about a second.
5. Given the shop's one owner, when that owner tries to demote or deactivate themselves, or to add a second owner, then the server refuses.
6. Done when no screen offers an identity switch and the account menu shows only the signed-in user.

## 16. Risks

- Risk: an operation added in a later epic forgets its permission entry and is open to all. Mitigation: the server denies any operation not in the matrix by default, and EP-40 tests every operation for every role.
- Risk: unguarded prototype operations (`setSetting`, `onboardCustomer`, `sendWishes`, `sendBroadcast`) keep their open behaviour. Mitigation: list them as open questions (G12) and decide before EP-13 and EP-33.
- Risk: karigar data leaks through shared lists such as parcels or stock. Mitigation: karigar role has no list operation except own jobs.
- Risk: the only owner loses access and nobody can manage users. Mitigation: the one-owner guard, the password reset by email (EP-04-S7) and the owner recovery question in EP-04.
- Risk: a user's email is wrong, so the activation email never arrives. Mitigation: the owner can correct the email and resend the link.
- Risk: merging StaffMember and Karigar into one user table breaks prototype ids (`ST-01`, `KG-04`). Mitigation: keep those as references on the user and karigar records.

## 17. Open decisions and questions

- D4 is decided: the owner enters name, phone, email and role; the activation email follows ([decision record](../decisions/D4-sign-in.md)).
- D7 is decided: one shop, no branches; users are not assigned to a branch ([decision record](../decisions/tenancy-and-branches.md)).
- One shop has exactly one owner. How is ownership handed over if the owner changes (not in v1 scope)?
- How is a karigar user linked to a Karigar record when the karigar is onboarded in EP-16: one step or two?
- G12: who may change which setting, given `setSetting` has no owner check today?
- Should staff ids be kept on sales for attribution (EP-43 and SCOPE-ANALYSIS Q10)?
- Phone numbers are unique (D4), so two users cannot share one phone; a karigar without a phone of their own cannot have an account.

## 18. Candidate stories

1. EP-05-S1: System can define the fixed permission list for each of the three roles in the shared package
2. EP-05-S2: System can refuse any operation the caller's role does not allow
3. EP-05-S3: System can limit a karigar's reads to their own jobs
4. EP-05-S4: Owner can add a user with name, phone and role
5. EP-05-S5: Owner can edit a user's name and phone
6. EP-05-S6: Owner can change a user's role
7. EP-05-S7: Owner can deactivate a user
8. EP-05-S8: Owner can reactivate a user
9. EP-05-S9: System can refuse to remove the last active owner
10. EP-05-S10: System can end a user's sessions live when they are deactivated or re-roled
11. EP-05-S11: Owner can see the user directory with role and status
12. EP-05-S12: User can open an account menu that replaces the role switcher
13. EP-05-S13: Owner can link a karigar user to a karigar record
14. EP-05-S14: System can audit every user lifecycle change
