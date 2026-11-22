# EP-04: Authentication

## 1. Summary

This epic lets real people sign in. The prototype has no login: a chip at the foot of the rail lets anyone become the
owner, a staff member or a karigar with one click. The user asked for "a proper user authentication mechanism"
instead of role switching. Because only the owner may clear a mismatch, apply a tag edit or scrap a piece, the shop
needs to know for certain who is acting. D4 is decided: users sign in with their **phone number and a password**.
There is no OTP sign-in in v1. This epic covers password storage, sign-in, the single-use activation link a new user
opens to set their first password, the forgot-password reset link, lockout after 5 wrong passwords, sessions,
sign-out, and the one-time creation of the first owner that the setup wizard (EP-45) calls.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. Identity is chosen from the `RoleChip` menu through `StoreProvider.switchIdentity`; there is no login, no password and no session.

## 3. Roles involved

- Owner: signs in with phone and password; the first owner is created once by the setup wizard (EP-45) and sets a password from the activation email.
- Staff: signs in with phone and password on the shop device or their own; sets the first password from the activation email.
- Karigar: signs in to the job portal on their phone with phone and password; every karigar has an email address for activation and reset.
- System: stores password hashes, checks passwords, issues and checks activation and reset links, sends the account emails, issues and expires sessions, locks an account after 5 wrong passwords, ends sessions when a user is deactivated or changes role.

## 4. In scope

- Sign-in, password checks, links and sessions are built in the team's own Node + TypeScript API (D1, Option C); no managed auth service is used.
- Sign-in with phone number and password (D4). Phone numbers are unique within the shop.
- Password storage as salted hashes with a modern password-hashing algorithm; minimum length 8.
- Activation link: single use, expires in 24 hours; the user sets their own password with it. The owner adds the user and can resend the link (EP-05).
- Forgot password: the user enters their phone number; a reset link (single use, expires in 1 hour) goes to the email on the account; the screen always says "If that number is registered, we've sent an email".
- Account emails (activation and reset) through a delivery stub until EP-11 sends real email.
- Lockout: 5 wrong passwords lock the account for 15 minutes; the owner can unlock sooner (the unlock action is EP-05).
- Rate limits on sign-in attempts and reset-link requests per phone and per device.
- Sessions: issue on correct password, expire after a set time, end on sign-out.
- First-owner creation: one owner account created once, only while the shop has no owner, called by the setup wizard (EP-45). There is no separate developer bootstrap command.
- Landing route per role after sign-in: staff `today`, owner `decisions`, karigar `k-jobs`.
- Ending all of a user's sessions at once when they are deactivated or their role changes.
- Signed-out, sign-in, set-password, forgot-password and locked-out states.

## 5. Out of scope

- Adding, editing, deactivating users, assigning roles, resending activation links and unlocking accounts from the user directory (EP-05).
- The account menu that replaces the role switcher (EP-05).
- Permission checks per operation (EP-05).
- Real email delivery of activation and reset links (EP-11); this epic uses a delivery stub until EP-11 exists. The email provider is open (D4a).
- The setup wizard screens (EP-45).
- The owner edit code sent on WhatsApp for tag edits (EP-25). It is a separate control and is not used for sign-in.
- OTP sign-in by WhatsApp or SMS: deferred, not in v1 (D4; PRODUCTION-SCOPE §6 Later notes).
- Rate-limit values across the whole API and penetration testing (EP-39).
- Offline sign-in for karigars: not in v1 (D6 decided, online only).

## 6. Current state in the prototype

- `src/components/ui/RoleChip.tsx`: "Avatar chip showing who is signed in; its menu switches between the staff, owner and karigar identities." It calls `switchIdentity` from `useStore()`.
- `src/store/StoreProvider.tsx`: `switchIdentity(id)` picks an identity from `identities()` and changes `identity`; the route jumps to the role's landing route. There is no credential check.
- `src/store/selectors.ts`: `identities()` builds the list of `Identity` records from staff and karigars; `actorOf()` turns the picked identity into the `Actor` passed to every transition.
- `src/types/jewellery.ts`: `Actor {id, name, role}`; `Identity extends Actor {initials, subtitle, karigarId?}`.
- `src/nav.ts`: `landingRoute = { staff: 'today', owner: 'decisions', karigar: 'k-jobs' }`.
- `src/components/ui/OtpPanel.tsx`: six boxes for code entry and a simulated WhatsApp bubble. Used today by `edit-apply` for the owner edit code (EP-25); sign-in does not use it.
- `src/domain/edits.ts`: `makeToken` (6 digits) for the edit token. It derives digits from a counter and must not be used for any secret, including activation and reset links.
- Mockup `25-onboard-staff.svg`: "Phone · they sign in and get OTPs here". With D4 the phone is the sign-in name and the label becomes "Phone · they sign in with this". Mockup `24-onboard-karigar.svg`: "Phone · their job portal logs in with this". `10-navigation-map.mmd`: node `SIGN["Sign in"]` leads to the three homes.
- Reusable: `landingRoute` for post-sign-in routing.
- Must be rebuilt server-side: password hashing, sign-in, activation and reset links, attempt counting, lockout, session issue and expiry, first-owner creation.

## 7. Functional requirements

- FR-04-1. A user can sign in by entering their phone number and password on the sign-in screen.
- FR-04-2. A wrong password, an unknown phone and a deactivated user all get the same message, "Phone number or password is wrong.", so the screen does not reveal which numbers exist.
- FR-04-3. Passwords are stored only as salted hashes made with a modern password-hashing algorithm; the plain password never appears in the database, logs or audit.
- FR-04-4. A password must be at least 8 characters.
- FR-04-5. The server can issue an activation link for a user: single use, expires 24 hours after issue, stored only as a hash. Issuing a new link makes any earlier unused link for that user stop working.
- FR-04-6. A correct password for an active user creates a session and lands the user on `today` (staff), `decisions` (owner) or `k-jobs` (karigar).
- FR-04-7. A user who opens a valid activation link can set their own password; the link then stops working and the user can sign in.
- FR-04-8. After 5 wrong passwords in a row, the account is locked for 15 minutes and the screen says so; the owner can unlock it sooner (EP-05).
- FR-04-9. Sign-in attempts and reset-link requests per phone and per device are rate limited.
- FR-04-10. A session expires after a set time and the next request returns unauthenticated.
- FR-04-11. A user can sign out, which ends that session at once.
- FR-04-12. When "User deactivated or role changed" is received for a user, every session of that user ends and open screens return to sign-in.
- FR-04-13. While the shop has no owner, the system allows exactly one first-owner creation, called by the setup wizard (EP-45), and refuses it afterwards.
- FR-04-14. On "Forgot password" the user enters their phone number; if it belongs to an active user, a reset link (single use, expires in 1 hour) is emailed to the address on the account. The screen always says "If that number is registered, we've sent an email".
- FR-04-15. Until EP-11 sends real email, activation and reset emails go through a stub visible only in development and staging.

## 8. Business rules

- BR-04-1. Passwords: minimum 8 characters, stored only as salted hashes with a modern algorithm, never logged. Activation and reset links: single use, activation 24 hours, reset 1 hour, stored only as hashes, never logged. [D4 decision record; PRODUCTION-SCOPE §5 Security]
- BR-04-2. Sessions expire; deactivating a user ends their sessions at once. [PRODUCTION-SCOPE §5 Security]
- BR-04-3. Sign-in is phone number plus password. No OTP sign-in in v1. [PRODUCTION-SCOPE §4 D4; decisions/D4-sign-in.md]
- BR-04-4. Staff sign in with the phone recorded at onboarding. [mockup 25; D4]
- BR-04-5. The karigar job portal logs in with the karigar's phone. [mockup 24]
- BR-04-6. Sign-in leads to one of three homes. [mockup 10-navigation-map.mmd; src/nav.ts landingRoute]
- BR-04-7. 5 wrong passwords lock the account for 15 minutes; the owner can unlock sooner. [D4]
- BR-04-8. Access must end at once when a user is deactivated or changes role. [PRODUCTION-SCOPE §1 live events]
- BR-04-9. There are three roles only. [SCOPE-ANALYSIS App. A]
- BR-04-10. Every user has an email address, karigars included; no temporary password is ever emailed. [D4]
- BR-04-11. The first owner is created by the setup wizard; there is no separate developer bootstrap command. [EP-45; D4]
- BR-04-12. The forgot-password screen never reveals whether a phone number is registered. [D4]

## 9. Data

- User (created in EP-02, read here): shop ID, phone (unique within the shop), email, role, status (`pending_activation`, `active`, `deactivated`), password hash (null until the user sets one), password set at.
- PasswordLink: id, shop ID, userId, purpose (`activation`, `reset`), link secret hash, issued at, expires at (activation plus 24 hours, reset plus 1 hour), used at, replaced at.
- Session: id, shop ID, userId, role at issue, created at, expires at, ended at, end reason (sign-out, expiry, deactivated, role changed, password reset), device label.
- Lockout: userId, failed count, locked until (failed count reaches 5: locked for 15 minutes), unlocked by, unlocked at.
- No weights and no money fields in this epic.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Password session | Sign in with phone number and password | Anyone (rate limited) |
| Create | Activation link | Issue or reissue a single-use activation link and email it | System (called by EP-05 add user and resend, and EP-45 setup) |
| Update | Password (activation) | Set the first password from an activation link | Anyone holding a valid link |
| Create | Reset link | Request a reset link by phone number | Anyone (rate limited) |
| Update | Password (reset) | Set a new password from a reset link | Anyone holding a valid link |
| Read | Current session | Who am I, my role, my landing route | Signed-in user |
| Delete | Current session | Sign out | Signed-in user |
| Delete | All sessions of a user | End access at once | System (on deactivation, role change or password reset) |
| Create | First owner | One-time owner creation when the shop has no owner | Setup wizard (EP-45), once |

## 11. Live events

- Consumes: "User deactivated or role changed" — ends every open session of that user at once and sends their open screens back to sign-in.
- Emits: none. Sign-in, sign-out, password set and lockout are recorded in the audit log (EP-06) but are not catalogue events. No live event exists for sign-in.

## 12. Screens and UX references

- No route id exists for sign-in in `src/nav.ts`. After sign-in the user lands on `today`, `decisions` or `k-jobs`.
- Not yet designed (MOCKUP-COVERAGE §3): sign-in screen (phone and password), set-password screen from the activation link, forgot-password and reset screens, signed-out state and locked-out state.
- Mockups: `10-navigation-map.mmd` (node `SIGN["Sign in"]`), `25-onboard-staff.svg` (phone used to sign in), `24-onboard-karigar.svg` (phone used by the job portal).
- Karigar screens need 56 px touch targets (UX-SPEC §6).

## 13. Non-functional requirements

- Security: passwords hashed with salt using a modern password-hashing algorithm, minimum 8 characters, never logged; activation and reset links single use, short-lived, random and unguessable, stored only as hashes; session tokens random and unguessable; sign-in, lockout and forgot-password responses do not reveal whether a phone is registered.
- Security: deactivation or role change ends sessions within about 1 second, the live event target. [PRODUCTION-SCOPE §5 Performance]
- Security: every user, link and session row carries the shop ID; the server takes the shop from the user record or session, never from the request (D7).
- Audit: sign-in success, failure, lockout, unlock, password set, sign-out and first-owner creation are written to the audit log with actor and time, never with the password or link.
- Personal data: phone numbers and email addresses are personal data; they are not shown in full on any sign-in or reset screen.
- Performance: sign-in screen loads under 2 seconds on a shop connection.
- Time: link expiry, lockout and session expiry are computed on the server clock in UTC.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03
- Downstream: EP-05, EP-08, EP-40, EP-41, EP-45.

## 15. Epic acceptance criteria

1. Given an active staff member with phone P and a password, when they enter P and the right password, then they are signed in and land on `today`.
2. Given a new user added by the owner, when they open the activation link within 24 hours and set a password of 8 or more characters, then they can sign in; when the same link is opened again, then it is refused.
3. Given an activation link issued 25 hours ago, when it is opened, then the screen says the link has expired and to ask the owner for a new one.
4. Given 5 wrong passwords in a row for one account, when the fifth is entered, then further attempts are refused for 15 minutes, even with the right password.
5. Given a signed-in karigar, when the owner deactivates them, then their phone returns to sign-in within about a second.
6. Given a shop with no owner, when the setup wizard creates the first owner, then a second first-owner creation is refused.
7. Given a user who forgot their password, when they enter their phone on "Forgot password", then the screen says "If that number is registered, we've sent an email", a reset link valid for 1 hour goes to their email, and the same message shows for an unknown number.

## 16. Risks

- Risk: an activation or reset link leaks (forwarded email, shared inbox). Mitigation: single use, short expiry (24 hours and 1 hour), a new link replaces the old, and a password reset ends the user's open sessions.
- Risk: a user has no working email, so they cannot activate or reset. Mitigation: every user must have an email address (D4); the owner can correct the address (EP-05) and resend.
- Risk: lockout lets anyone lock out the owner by guessing on their phone number. Mitigation: per-device rate limits slow guessing, lockout lasts 15 minutes only, and a reset link from the owner's email still works.
- Risk: passwords or link secrets leak into logs through request logging. Mitigation: redact password and link fields in all logs and test it in EP-40.
- Risk: the email provider (D4a) is not chosen in time, blocking activation in staging and production. Mitigation: the stub covers development and staging; choose the provider before EP-11.
- Risk: the prototype token generator `makeToken` is reused for link secrets and is predictable. Mitigation: a secure random generator in the server only.

## 17. Open decisions and questions

- D4 is decided: phone number + password, activation and reset links by email, no OTP sign-in in v1 ([decision record](../decisions/D4-sign-in.md)).
- D4a: which email provider sends activation and reset emails? Open.
- How long does a session last, and is it different for the shop device, the owner and karigar phones?
- Does a successful password reset also clear an active lockout? (Proposed: yes, because the user proved they own the email.)
- What happens when the owner loses access to both their phone and their email: who can recover the owner account?

## 18. Candidate stories

1. EP-04-S1: System can create the first owner once when the shop has no owner
2. EP-04-S2: System can store and check passwords as salted hashes
3. EP-04-S3: User can sign in with phone number and password
4. EP-04-S4: System can send account emails through a stub until email is live
5. EP-04-S5: User can get a session after entering the right password
6. EP-04-S6: User can land on their role's home after sign-in
7. EP-04-S7: User can reset a forgotten password from an emailed link
8. EP-04-S8: System can lock out a phone after repeated failed attempts
9. EP-04-S9: System can rate-limit sign-in attempts and reset-link requests per phone and device
10. EP-04-S10: User can set their first password from an activation link
11. EP-04-S11: User can sign out
12. EP-04-S12: System can expire idle sessions
13. EP-04-S13: System can end all sessions of a deactivated or re-roled user at once
14. EP-04-S14: System can audit sign-in, failure, lockout and sign-out without the password

</content>
</file>
<invoke name="execute_bash">
<parameter name="command">cd /Users/prabhu.govindaraj/Documents/personalproject/jewelops---jewellery-enterprise-suite/docs && git show HEAD:docs/epics/EP-04-authentication.md | sed -n '/## 14/,/## 15/p'; grep -n "Lakshmi\|Sanjay\|Rajesh\|Deepak\|Vijay" stories/EP-05-stories.md | head -3