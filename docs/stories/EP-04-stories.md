# EP-04: Authentication · stories

Epic document: [EP-04 Authentication](../epics/EP-04-authentication.md)

Role note: stories that describe sign-in from a person's view use Owner, Staff or Karigar. Stories where the server acts on its own (hashing passwords, issuing links, locking out, expiring sessions, writing audit entries) use "System".

Decision note: D4 is decided ([decision record](../decisions/D4-sign-in.md)). Users sign in with phone number and password. There is no OTP sign-in in v1. Stories that were written for OTP sign-in keep their IDs and are rewritten to the password equivalent: S1 (first owner, now created by the setup wizard), S2, S3, S4, S5, S7, S9, S10 and S14.

---

## EP-04-S1: System can create the first owner once when the shop has no owner

- **Story ID:** EP-04-S1
- **Title:** System can create the first owner once when the shop has no owner
- **As a:** System
- **I want:** a one-time Create First owner operation that makes one user with role `owner`, a name, a phone and an email, status `pending_activation` and no password, only while the shop holds no owner, and that is called only by the first-run setup wizard (EP-45)
- **So that:** a new installation has exactly one owner, who sets a password from the activation email (EP-04-S10) and then adds staff and karigars in EP-05, and nobody can create a second owner this way later; there is no separate developer bootstrap command (FR-04-13, BR-04-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given a shop record with no user of role `owner`, when the setup wizard calls Create First owner with name "Sanjay Seth", phone "+91 98410 33333" and email "sanjay@jgd-jewellers.example", then one user with role `owner`, status `pending_activation`, no password hash and that shop's ID exists, and the shop's first-owner marker is set (epic acceptance criterion 6).
  2. Given the first-owner marker is set, when Create First owner is called again with any name, phone and email, then it is refused with code `rule_refused` and the sentence "The first owner has already been created.", and no user is written (epic acceptance criterion 6).
  3. Given two Create First owner calls arriving at the same moment for a shop with no owner, when both are handled, then exactly one owner is created and the other call is refused.
  4. Given a Create First owner call with phone "98410" or email "sanjay@", when it is handled, then it returns code `validation` with field `phone` or `email` and no user is written.
  5. Given the owner was created, when the wizard goes on, then it asks EP-04-S10 to issue the activation link to "sanjay@jgd-jewellers.example"; until the password is set, sign-in for "+91 98410 33333" fails with the normal wrong-password message.
- **Rules enforced on the server:** Create First owner runs only while the shop has no user with role `owner` and its first-owner marker is unset. The check and the insert run in one transaction with a lock or unique constraint so that a race cannot create two owners. The operation is callable without a session only through the setup wizard path, which is open only while setup is not complete (EP-45); it is not a command-line tool. Phone is validated as an Indian mobile number in E.164 form; email is required and must be a valid address. The shop ID comes from the shop record the wizard created, never from the request body.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor "setup", time, entity user (new owner id), action `first_owner_created`, after (name, role `owner`, masked phone, masked email). No secret is recorded.
- **Data changes:** Inserts one row in `users` (EP-02-S3) with shop ID, email and status `pending_activation`. Migration adds the first-owner marker on the shop (created time and owner user id, or an equivalent unique row).
- **UI reference:** No screen of its own. The owner account step of the setup wizard (EP-45) calls it; that screen is not yet designed.
- **Non-functional checks:** Concurrency: two parallel calls create one owner only. Security: the setup path closes once the marker is set; no password is created or sent here. Personal data: the owner phone and email are masked in the audit entry. Time: marker time in UTC. Tenancy: the owner belongs to exactly one shop (D7).
- **Depends on:** EP-02-S3, EP-02-S11, EP-03-S2, EP-03-S6, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S2: System can store and check passwords as salted hashes

- **Story ID:** EP-04-S2
- **Title:** System can store and check passwords as salted hashes
- **As a:** System
- **I want:** a server module that turns a password into a salted hash with a modern password-hashing algorithm, refuses passwords shorter than 8 characters, and checks a submitted password against the stored hash with the results `ok` or `wrong`
- **So that:** a leaked database row does not reveal any user's password, and weak passwords are refused at the door (FR-04-3, FR-04-4, BR-04-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the password "gold2026!", when it is hashed twice, then the two stored hashes differ (each has its own salt) and both check as `ok` against "gold2026!".
  2. Given a stored hash, when "gold2026?" is checked against it, then the result is `wrong`.
  3. Given the password "gold26", when it is set, then it is refused with code `validation` and the sentence "Use at least 8 characters." and nothing is stored.
  4. Given a row in `users`, when it is inspected, then the password column holds only the hash with its algorithm and parameters, and no column holds the plain password.
  5. Given a check of any password, when the server log and the audit log are searched for it, then the plain password does not appear.
- **Rules enforced on the server:** The hashing algorithm is a modern, deliberately slow password-hashing algorithm with a per-password salt; the specific library is chosen when the story is built and its parameters are stored with each hash so they can be raised later. Minimum length is 8 characters. Hash comparison is constant-time. The plain password exists only in memory during the request.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This module only hashes and checks; outcomes are audited in EP-04-S14.
- **Data changes:** Migration adds `password hash` (nullable until set) and `password set at` to `users`.
- **UI reference:** No screen
- **Non-functional checks:** Security: salted hash, modern algorithm, constant-time compare, plain password never written to logs (BR-04-1). Performance: one hash check stays well under the 2-second sign-in budget on the API's hardware. D1 is decided (Option C): this module is built in the Node API; no managed auth service is used.
- **Depends on:** EP-02-S1, EP-02-S3, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S3: User can sign in with phone number and password

- **Story ID:** EP-04-S3
- **Title:** User can sign in with phone number and password
- **As a:** Staff
- **I want:** to type my phone number and my password on the sign-in screen and tap "Sign in"
- **So that:** I can sign in on the shop device or my own phone with the number recorded at onboarding (FR-04-1, FR-04-2, BR-04-3, BR-04-4, BR-04-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is an active Staff user with phone "+91 98410 11111" and a password set, when he enters "98410 11111" and the right password and taps "Sign in", then the check passes and EP-04-S5 creates his session.
  2. Given Rajesh enters a wrong password, when he taps "Sign in", then the screen shows "Phone number or password is wrong." and his failed count goes up by 1 (EP-04-S8).
  3. Given the phone "+91 90000 00000" belongs to no user, or belongs to a deactivated user, or to a user still `pending_activation`, when a password is entered, then the response and the screen are the same as for a wrong password (FR-04-2).
  4. Given the input "12345" as phone, when "Sign in" is tapped, then the screen shows a field error on the phone field and no request is sent; given the server receives it anyway, it returns `validation` with field `phone`.
  5. Given a karigar, Lakshmi Devi, with phone "+91 98400 10101", when she opens the job portal sign-in on her phone, then the same flow works there with 56 px touch targets (BR-04-5).
- **Rules enforced on the server:** The request is accepted without a session but passes the rate-limit hook from EP-03-S11 (values in EP-04-S9). The phone is normalised to E.164 and looked up within the shop. The lock check (EP-04-S8) runs before the password is compared. Unknown, deactivated and pending users get the same response shape and similar response time as a wrong password. No OTP is sent and no WhatsApp or SMS message is involved (D4).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes for known users only (through EP-04-S14): actor (the user), time, action `sign_in_failed` with reason `wrong_password` on failure. Unknown phones are not written to the audit log. No password.
- **Data changes:** Updates the failed count in the lockout record (EP-04-S8) on a wrong password.
- **UI reference:** Not yet designed (sign-in screen, MOCKUP-COVERAGE §3). The phone label follows `docs/ux/mockups/25-onboard-staff.svg` (the phone the person signs in with) and `docs/ux/mockups/24-onboard-karigar.svg` ("Phone · their job portal logs in with this"). Node `SIGN` in `docs/ux/mockups/10-navigation-map.mmd`. No route id exists yet in `src/nav.ts`.
- **Non-functional checks:** Security: the screen and response do not reveal whether a phone is registered; the password field is masked and never prefilled. Personal data: the phone is not shown in full after a failure. Performance: the sign-in screen loads under 2 seconds on a shop connection. Phone numbers are unique within the shop (D4, EP-02-S3).
- **Depends on:** EP-04-S2, EP-03-S2, EP-03-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S4: System can send account emails through a stub until email is live

- **Story ID:** EP-04-S4
- **Title:** System can send account emails through a stub until email is live
- **As a:** System
- **I want:** an account-email delivery interface (activation and reset emails) with one stub implementation that, in development and staging only, shows the email and its link in a developer mailbox page and the developer console
- **So that:** activation and forgot-password can be built and tested before EP-11 sends real email, without ever exposing links in production (FR-04-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given the staging environment with the delivery mode set to `stub`, when an activation link is issued for Rajesh Verma, then the stub mailbox shows an email to his masked address with the subject "Set your JGD password" and the link.
  2. Given the production environment, when the server starts with the delivery mode set to `stub`, then it refuses to start and logs that the stub is not allowed in production.
  3. Given the stub, when an email is delivered, then the link appears only in the stub mailbox, never in the server log, the audit log or the database in plain text.
  4. Given the delivery interface, when EP-11 later adds the real email sender (EP-11-S12), then it is chosen by an environment variable and no sign-in, activation or reset code changes.
- **Rules enforced on the server:** The stub is enabled only when the environment is `development` or `staging`. The delivery mode comes from environment variables (EP-01-S6). The plain link exists only in memory between issue and delivery. No WhatsApp or SMS message is sent for sign-in (D4).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The link issue is audited in EP-04-S7 and EP-04-S10; the link itself is never audited.
- **Data changes:** None in the product database. Adds the account-email interface and stub to `api`, and a delivery mode environment variable.
- **UI reference:** No product screen. The stub mailbox page exists only in development and staging.
- **Non-functional checks:** Security: the stub cannot run in production; links are redacted from all logs (epic section 16 risk). Open decision D4a: the email provider decides when the stub is replaced; that work is EP-11-S12.
- **Depends on:** EP-04-S3, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S5: User can get a session after entering the right password

- **Story ID:** EP-04-S5
- **Title:** User can get a session after entering the right password
- **As a:** Staff
- **I want:** to be signed in as soon as my phone number and password are accepted
- **So that:** the server knows for certain who I am, and every later action records me as the actor (FR-04-6, BR-04-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma enters his phone and the right password, when the check returns `ok`, then a session is created for his user with role `staff` and his shop ID, and the response sets the session credential (epic acceptance criterion 1).
  2. Given a successful sign-in, when the `sessions` table is inspected, then the new row holds shop ID, userId, role at issue, created at, expires at and device label, and the session secret is stored only as a hash.
  3. Given a session credential from this sign-in, when any API operation is called, then EP-03-S3 resolves the actor as Rajesh Verma and the shop from the session.
  4. Given the account is locked (EP-04-S8), when the right password is entered, then no session is created.
  5. Given the success, when the lockout record for Rajesh is read, then the failed count is 0.
- **Rules enforced on the server:** A session is issued only after EP-04-S2 returns `ok` for an active, unlocked user. The failed-count reset and the session insert run in one transaction. The session secret is long and random. The credential is sent so that browser scripts cannot read it, where the chosen method allows. The session's shop ID is copied from the user row.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor, time, entity session, action `signed_in`, role, device label. No password.
- **Data changes:** Inserts into `sessions`; resets the failed count. Migration adds columns `role at issue`, `end reason` and `device label` to `sessions` (EP-02-S3 created id, shop ID, userId, created, expires, ended).
- **UI reference:** Not yet designed (sign-in screen).
- **Non-functional checks:** Security: session tokens are random and unguessable and stored hashed; the password is never logged. Concurrency: two parallel sign-ins each get their own session; a lock reached in parallel stops both. Time: created at and expires at in UTC from the server clock. Open question: how the session is presented (cookie or bearer token); the criteria hold for either. D1 is decided (Option C): the Node API issues and checks the session itself.
- **Depends on:** EP-04-S2, EP-04-S3, EP-03-S3, EP-03-S6, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S6: User can land on their role's home after sign-in

- **Story ID:** EP-04-S6
- **Title:** User can land on their role's home after sign-in
- **As a:** Owner
- **I want:** to arrive on my own home screen straight after sign-in, and the app to know my name and role from a Read Current session call
- **So that:** each role starts where its work is, as the navigation map shows, without a role switcher (FR-04-6, BR-04-6, BR-04-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth (Owner) signs in, when the session is created, then the app opens route `decisions`.
  2. Given Rajesh Verma (Staff) signs in, when the session is created, then the app opens route `today` (epic acceptance criterion 1).
  3. Given Lakshmi Devi (Karigar) signs in on the job portal, when the session is created, then the app opens route `k-jobs`.
  4. Given a signed-in user reloads the page, when Read Current session is called, then it returns user id, name, role and landing route, and the user stays signed in without entering the password again.
  5. Given no valid session, when any app route such as `stock` is opened, then the app shows the sign-in screen instead.
- **Rules enforced on the server:** Read Current session returns the user and role from the session, never from the request. The landing route is derived from role using the mapping in `src/nav.ts` (`staff: 'today'`, `owner: 'decisions'`, `karigar: 'k-jobs'`), moved into the shared package. Only the three roles exist.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading the current session changes no state.
- **Data changes:** None in the product database. Moves `landingRoute` from `src/nav.ts` into the shared package; removes the use of `switchIdentity` from the sign-in path.
- **UI reference:** Node `SIGN` and its three arrows in `docs/ux/mockups/10-navigation-map.mmd`; routes `today`, `decisions` and `k-jobs`. The sign-in screen itself is not yet designed.
- **Non-functional checks:** Security: the browser cannot pick a role; the RoleChip identity switch is not reachable once real sign-in is on (the account menu that replaces it is EP-05). Performance: the landing screen starts loading within 2 seconds of a successful sign-in.
- **Depends on:** EP-04-S5, EP-01-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S7: User can reset a forgotten password from an emailed link

- **Story ID:** EP-04-S7
- **Title:** User can reset a forgotten password from an emailed link
- **As a:** Karigar
- **I want:** a "Forgot password" link on the sign-in screen where I enter my phone number, and an email with a link that lets me set a new password
- **So that:** I can get back in without asking the shop, and the screen never tells a stranger which numbers are registered (FR-04-14, BR-04-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi is active with phone "+91 98400 10101" and email "lakshmi.devi@example.com", when she enters her phone on "Forgot password", then the screen says "If that number is registered, we've sent an email" and one reset email with a link goes to her address (epic acceptance criterion 7).
  2. Given the phone "+91 90000 00000" belongs to no user or to a deactivated user, when it is entered, then the screen shows the same sentence, with similar response time, and no email is sent.
  3. Given the reset link was issued 50 minutes ago, when Lakshmi opens it and sets a new password of 8 or more characters, then the new hash is stored, the link is marked used, and all her open sessions end with reason `password_reset`.
  4. Given the reset link was issued 61 minutes ago, or was already used once, when it is opened, then the screen says "This link has expired. Ask for a new one." and no password changes.
  5. Given Lakshmi asks for a reset twice, when she opens the first link, then it is refused because the second one replaced it.
- **Rules enforced on the server:** The reset link secret comes from a secure random source, is stored only as a hash in `password_links` with purpose `reset`, expires 1 hour after issue on the server clock and succeeds at most once; `used at` is set in the same transaction as the password change. A new link for the same user and purpose replaces any earlier unused one. Reset requests pass the rate limits in EP-04-S9. The new password follows EP-04-S2. The response never reveals whether the phone is registered. The email goes to the address on the account, never to an address typed on the screen.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14) for known users only: actor (the user), time, action `password_reset_requested`, and later `password_reset` with the count of sessions ended. No link and no password.
- **Data changes:** Migration creates `password_links` (id, shop ID, userId, purpose `activation` or `reset`, secret hash, issued at, expires at, used at, replaced at) as in epic section 9. Updates `users.password hash` and `password set at`; ends rows in `sessions`.
- **UI reference:** Not yet designed (forgot-password and set-new-password screens, MOCKUP-COVERAGE §3). Karigar screens need 56 px touch targets (UX-SPEC §6).
- **Non-functional checks:** Security: single use, 1-hour expiry, hashed at rest, never logged; the message does not reveal whether the phone exists. Time: expiry judged on the server clock in UTC, not the phone clock. Open question: whether a successful reset also clears an active lockout (section 17).
- **Depends on:** EP-04-S5, EP-04-S3, EP-04-S2, EP-04-S4, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S8: System can lock out a phone after repeated failed attempts

- **Story ID:** EP-04-S8
- **Title:** System can lock out a phone after repeated failed attempts
- **As a:** System
- **I want:** to count wrong passwords per account and lock the account for 15 minutes once 5 wrong passwords are entered in a row, with an Unlock operation the owner can call sooner (EP-05)
- **So that:** nobody can guess a password by trying many times (FR-04-8, BR-04-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao with phone "+91 98410 22222" has 4 wrong passwords in a row, when the 5th wrong password is entered, then his account is locked until 15 minutes later (epic acceptance criterion 4).
  2. Given a locked account, when a password is entered, then the server refuses with `rule_refused` and the screen shows "Too many wrong passwords. Try again after HH:MM." in Asia/Kolkata time, even if the password is correct.
  3. Given the 15 minutes have passed, when Deepak enters the right password, then he is signed in and the failed count starts at 0.
  4. Given a right password before the 5th wrong one, when it is entered, then the failed count resets to 0.
  5. Given the account is locked, when Unlock is called for Deepak's user by the system on the owner's behalf (EP-05), then `locked until` is cleared, the failed count is 0 and he can sign in at once.
  6. Given an unknown phone, when 5 wrong passwords are entered for it, then the screen behaves the same as for a known locked phone, so lockout does not reveal which numbers exist.
- **Rules enforced on the server:** Failed counts are kept per account (user). The threshold is 5 and the lock lasts 15 minutes (D4). The lock is checked before the password is compared. Counting and locking run in one transaction so parallel guesses cannot bypass the threshold. Unlock is a server operation; who may call it is set in EP-05 (owner only).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor (the user if the phone is known), time, action `sign_in_locked`, locked until, device label; on unlock, action `account_unlocked` with the actor who unlocked. No password.
- **Data changes:** Migration creates `sign_in_lockouts` (userId, shop ID, failed count, locked until, unlocked by, unlocked at) as in epic section 9.
- **UI reference:** Not yet designed (locked-out state, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: lockout stops brute force; the message does not reveal whether the phone is registered. Concurrency: parallel wrong passwords are all counted. Time: `locked until` stored in UTC and shown in Asia/Kolkata. Risk: a stranger can lock an account by guessing; the per-device rate limit (EP-04-S9), the 15-minute limit and the owner unlock keep the cost low (epic section 16).
- **Depends on:** EP-04-S3, EP-04-S2, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S9: System can rate-limit sign-in attempts and reset-link requests per phone and device

- **Story ID:** EP-04-S9
- **Title:** System can rate-limit sign-in attempts and reset-link requests per phone and device
- **As a:** System
- **I want:** the EP-03-S11 rate-limit hook filled in for the sign-in and reset-link operations, counting requests per phone and per device
- **So that:** nobody can try passwords across many accounts from one device, or flood a person's inbox with reset emails (FR-04-9, BR-04-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a limit of R reset-link requests per phone per period (a configuration value), when the R+1th request for "+91 98410 11111" arrives inside the period, then it is refused with `rate_limited`, no email is sent, and the screen says "Too many requests. Wait a few minutes and try again."
  2. Given a limit per device, when one device tries passwords for many different phones, then attempts beyond the device limit are refused with `rate_limited` before any password is checked.
  3. Given a refused request, when it is handled, then no password is checked, no link is issued and nothing is sent.
  4. Given an unknown phone, when it exceeds the limit, then the refusal is the same as for a known phone.
  5. Given the period has passed, when a new request arrives, then it is allowed.
- **Rules enforced on the server:** Limits apply before any lookup, password check or email. Counters are kept per normalised phone and per device. Limit values come from environment variables; EP-39 sets the final values across the API. These limits sit beside the account lockout (EP-04-S8), which counts wrong passwords per account.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Refused requests are counted, not audited; repeated abuse is reported through EP-37 and EP-39.
- **Data changes:** None in the product database if counters are held in a cache shared by the Node API instances; otherwise a short-lived counter table in PostgreSQL. The Node API owns the counters either way (D1, Option C).
- **UI reference:** Not yet designed (sign-in and forgot-password screens).
- **Non-functional checks:** Security: per phone and per device limits stop password spraying and email flooding. Personal data: counters key on a hash of the phone, not the plain number. Availability: limits survive one server restart if more than one api instance runs. D1 is decided (Option C): the Node API enforces this limit; no platform limit is relied on.
- **Depends on:** EP-04-S3, EP-03-S11, EP-04-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S10: User can set their first password from an activation link

- **Story ID:** EP-04-S10
- **Title:** User can set their first password from an activation link
- **As a:** Staff
- **I want:** to open the activation link in the email the shop sent me, choose my own password and then sign in
- **So that:** I get into my new account without anyone ever emailing me a password (FR-04-5, FR-04-7, BR-04-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given the owner added Deepak Rao with email "deepak.rao@example.com" (EP-05) and the system issued an activation link 2 hours ago, when Deepak opens it and sets the password "counter-2026", then the hash is stored, his status becomes `active`, the link is marked used, and the screen says "Password set. Sign in with your phone number." (epic acceptance criterion 2).
  2. Given the link was already used, when it is opened again, then the screen says "This link has already been used." and nothing changes (epic acceptance criterion 2).
  3. Given the link was issued 25 hours ago, when it is opened, then the screen says "This link has expired. Ask the shop owner to send a new one." and nothing changes (epic acceptance criterion 3).
  4. Given the owner resent the activation (EP-05), when Deepak opens the older link, then it is refused because the new link replaced it.
  5. Given Deepak enters "gold26" (6 characters), when he saves, then the server refuses with "Use at least 8 characters." and the link stays unused.
- **Rules enforced on the server:** The Issue activation link operation is callable only by the server, on behalf of EP-05 (add user, resend) and EP-45 (first owner). The link secret comes from a secure random source, is stored only as a hash in `password_links` with purpose `activation`, expires 24 hours after issue and succeeds at most once. Issuing a new activation link marks any earlier unused one as replaced. The email goes to the address on the user record through the account-email interface (EP-04-S4). No temporary password is created or emailed. The new password follows EP-04-S2.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor "system" or the owner who caused it, time, entity user, action `activation_link_sent`; then actor the user, action `password_set`. No link and no password.
- **Data changes:** Inserts into `password_links` (created in EP-04-S7). Updates `users.password hash`, `password set at` and `status` (`pending_activation` to `active`).
- **UI reference:** Not yet designed (set-password screen from the activation link, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: single use, 24-hour expiry, hashed at rest, never logged; the screen does not show the full email or phone. Time: expiry judged on the server clock in UTC. Decision D4 replaces the earlier idea of an emailed temporary password with this link.
- **Depends on:** EP-04-S1, EP-04-S2, EP-04-S4, EP-04-S7, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S11: User can sign out

- **Story ID:** EP-04-S11
- **Title:** User can sign out
- **As a:** Staff
- **I want:** a "Sign out" action that ends my session on this device straight away
- **So that:** the next person using the shared shop device cannot act as me (FR-04-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao is signed in on the shop device, when he taps "Sign out", then his session row gets `ended at` set and `end reason` `sign_out`, and the app shows the sign-in screen.
  2. Given the ended session's credential, when any operation is called with it, then the server returns `unauthenticated`.
  3. Given Deepak Rao is also signed in on his own phone, when he signs out on the shop device, then the session on his phone stays active.
  4. Given the browser back button after sign-out, when it is pressed, then no screen with shop data is shown and the app stays on sign-in.
- **Rules enforced on the server:** Delete Current session ends only the caller's own session. Ended sessions are refused by EP-03-S3 on the next request. Sign-out clears the session credential on the device.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor, time, entity session, action `signed_out`, device label.
- **Data changes:** Updates `sessions.ended at` and `sessions.end reason`.
- **UI reference:** Not yet designed. The "Sign out" item sits in the account menu that replaces the RoleChip (EP-05); this story provides the action and the signed-out state.
- **Non-functional checks:** Security: sign-out takes effect on the next request with no grace period. Time: `ended at` in UTC.
- **Depends on:** EP-04-S5, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S12: System can expire idle sessions

- **Story ID:** EP-04-S12
- **Title:** System can expire idle sessions
- **As a:** System
- **I want:** every session to carry an `expires at` time, and requests after that time to be refused as unauthenticated
- **So that:** a device left signed in does not stay usable for ever (FR-04-10, BR-04-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a session with a lifetime of L (a configuration value), when a request arrives after `expires at`, then the server returns `unauthenticated` and the app shows the sign-in screen with "Your session has ended. Sign in again."
  2. Given an expired session, when it is first refused, then its row gets `ended at` and `end reason` `expiry`.
  3. Given a session that is in use, when a request arrives before `expires at`, then it is accepted, and the idle timer is extended if the chosen policy is sliding expiry.
  4. Given a user filling in a form when the session expires, when they submit, then the server refuses the request and nothing is saved; the app tells them to sign in again.
- **Rules enforced on the server:** Expiry is checked on every request by EP-03-S3 against the server clock. Lifetimes may differ for the shop device, the owner phone and karigar phones once section 17 decides. An expired session is never revived.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Expiry is a passive end; the `end reason` on the session row records it.
- **Data changes:** Updates `sessions.ended at` and `sessions.end reason` on first refusal. Optional cleanup of old ended sessions moves to EP-10 when it exists.
- **UI reference:** Not yet designed (signed-out state).
- **Non-functional checks:** Security: sessions expire (PRODUCTION-SCOPE §5). Time: expiry computed in UTC on the server clock. Open question: how long a session lasts, and whether it differs for the shop device, the owner and karigar phones (section 17). D6 is decided: karigars are online only, so D6 puts no extra session-lifetime need on EP-04.
- **Depends on:** EP-04-S5, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S13: System can end all sessions of a deactivated or re-roled user at once

- **Story ID:** EP-04-S13
- **Title:** System can end all sessions of a deactivated or re-roled user at once
- **As a:** System
- **I want:** a Delete All sessions of a user operation that ends every open session of one user, called when "User deactivated or role changed" happens, and the user's open screens sent back to sign-in
- **So that:** a person who leaves the shop or changes job cannot keep acting with an old session (FR-04-12, BR-04-2, BR-04-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar (Karigar) is signed in on two phones, when Delete All sessions is called for his user with reason `deactivated`, then both session rows get `ended at` and `end reason` `deactivated` in one transaction.
  2. Given those ended sessions, when either phone sends its next request, then the server returns `unauthenticated` and the phone shows the sign-in screen (epic acceptance criterion 5).
  3. Given Deepak Rao's role changes from `staff` to `karigar`, when Delete All sessions is called with reason `role_changed`, then his sessions end and his next sign-in carries role `karigar`.
  4. Given the live channel from EP-07 is running, when "User deactivated or role changed" is received for a user, then open screens of that user return to sign-in within about 1 second (PRODUCTION-SCOPE §5 Performance).
  5. Given Delete All sessions, when a Staff or Karigar session calls it directly, then it is refused; it runs only from the server on deactivation or role change.
- **Rules enforced on the server:** Only the system may call Delete All sessions; EP-05 calls it in the same transaction as deactivation or role change. Every open session of the user ends, whatever the device. A session whose `role at issue` differs from the user's current role is refused even if the end step was missed.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed" (emitted by EP-05; delivered by EP-07).
- **Audit entry written:** Yes (written through EP-04-S14): actor (the user making the change, or "system"), time, entity user, action `sessions_ended`, reason `deactivated` or `role_changed`, count of sessions ended.
- **Data changes:** Updates `sessions.ended at` and `sessions.end reason` for all open sessions of the user.
- **UI reference:** Not yet designed (signed-out state).
- **Non-functional checks:** Security: access ends at once; the check on `role at issue` is a second guard. Performance: screens return to sign-in within about 1 second once EP-07 delivers the event; before EP-07, the next request is refused. Concurrency: a request in flight while sessions end either completes before the end or is refused, never half-applied.
- **Depends on:** EP-04-S5, EP-04-S11, EP-03-S3, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S14: System can audit sign-in, failure, lockout and sign-out without the password

- **Story ID:** EP-04-S14
- **Title:** System can audit sign-in, failure, lockout and sign-out without the password
- **As a:** System
- **I want:** one helper that writes an audit entry for every sign-in event (signed in, sign-in failed, locked, unlocked, signed out, sessions ended, first owner created, activation link sent, password set, password reset requested, password reset) with actor and time, and with the password and link secret always left out
- **So that:** the owner can see who signed in and when, and no password or link ever sits in the audit log (BR-04-1, epic section 13 Audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signs in at 09:58 IST, when the audit log is read, then it has an entry with actor Rajesh Verma, time 04:28 UTC, action `signed_in`, role `staff` and device label.
  2. Given a wrong password, a lockout and a sign-out, when the audit log is read, then each has its own entry with action `sign_in_failed`, `sign_in_locked` and `signed_out`.
  3. Given any sign-in audit entry, when a test searches it and the server log for the password or the activation or reset link, then none appears.
  4. Given the sign-in action and its audit entry, when the action rolls back, then the audit entry is not written either, because both are in the same transaction (EP-03-S6).
  5. Given an entry, when it records a phone or email, then it is masked, for example "+91 ••••• 11111" or "r•••@example.com".
- **Rules enforced on the server:** Audit entries are append-only. The helper strips any field named password, token, link, secret or code before writing. Actor and time come from `Ctx` (EP-03-S3), or "setup" and "system" where no user is signed in. Request logging redacts the password and link fields.
- **Live events emitted / consumed:** None. Sign-in and sign-out are audited but are not catalogue events (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (user or session), action, reason where relevant, device label. Never the password or link.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). No schema change. The reader screens and filters are EP-06.
- **UI reference:** No screen in this story. Entries appear later on the audit screen built in EP-06.
- **Non-functional checks:** Audit: every sign-in outcome is recorded with actor and time. Security: password and link secrets redacted from audit and logs (epic section 16 risk; tested again in EP-40). Personal data: phones and emails masked. Time: stored in UTC.
- **Depends on:** EP-02-S11, EP-03-S3, EP-03-S6, EP-04-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D4 is decided: phone number + password, activation and reset links by email, no OTP sign-in in v1 (EP-04-S1 to S10, S14).
- D4a: which email provider sends activation and reset emails? (EP-04-S4)
- How long does a session last, and is it different for the shop device, the owner and karigar phones? (EP-04-S12)
- Does a successful password reset also clear an active lockout? (EP-04-S7, S8)
- What happens when the owner loses access to both their phone and their email: who can recover the owner account? (EP-04-S7)
