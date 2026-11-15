# EP-04: Authentication · stories

Epic document: [EP-04 Authentication](../epics/EP-04-authentication.md)

Role note: stories that describe sign-in from a person's view use Owner, Staff or Karigar. Stories where the server acts on its own (generating codes, locking out, expiring sessions, writing audit entries) use "System".

---

## EP-04-S1: System can bootstrap the first owner once when no owner exists

- **Story ID:** EP-04-S1
- **Title:** System can bootstrap the first owner once when no owner exists
- **As a:** System
- **I want:** a one-time Create First owner operation that makes one active user with role `owner`, a name and a phone, only while the `users` table holds no owner
- **So that:** a new installation has exactly one person who can sign in and then add staff and karigars in EP-05, and nobody can create a second owner this way later (FR-04-13, BR-04-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty system with no user of role `owner`, when the setup operator runs Create First owner with name "Sanjay Seth" and phone "+91 98410 33333", then one user with role `owner` and status `active` exists and the bootstrap marker is set (epic acceptance criterion 6).
  2. Given the bootstrap marker is set, when Create First owner is called again with any name and phone, then it is refused with code `rule_refused` and the sentence "The first owner has already been created.", and no user is written (epic acceptance criterion 6).
  3. Given two Create First owner calls arriving at the same moment on an empty system, when both are handled, then exactly one owner is created and the other call is refused.
  4. Given a Create First owner call with phone "98410" (not a full mobile number), when it is handled, then it returns code `validation` with field `phone` and no user is written.
  5. Given the bootstrap has run, when the new owner requests a sign-in OTP for "+91 98410 33333", then the normal OTP flow in EP-04-S3 applies to them.
- **Rules enforced on the server:** Create First owner runs only while no user with role `owner` exists and the bootstrap marker is unset. The check and the insert run in one transaction with a lock or unique constraint so that a race cannot create two owners. The operation is callable without a session but only through the setup path (a one-time command or a setup secret from environment variables, not a public screen). Phone is validated as an Indian mobile number in E.164 form.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor "setup", time, entity user (new owner id), action `first_owner_bootstrapped`, after (name, role `owner`, masked phone). No code or secret is recorded.
- **Data changes:** Inserts one row in `users` (EP-02-S3). Migration adds a bootstrap marker (a single-row `system_bootstrap` table with created time and owner user id, or an equivalent unique row).
- **UI reference:** No screen. The bootstrap is a one-time setup step, not a shop screen.
- **Non-functional checks:** Concurrency: two parallel bootstrap calls create one owner only. Security: the setup path is disabled once the marker is set and the setup secret is never logged. Personal data: the owner phone is stored once and masked in the audit entry. Time: marker time in UTC. Open question: who runs the bootstrap and with which phone (section 17). Open decision D4: if a password fallback is adopted, the owner sets it after first sign-in in EP-04-S10, not here.
- **Depends on:** EP-02-S3, EP-02-S11, EP-03-S2, EP-03-S6, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S2: System can generate, hash and expire a 6-digit single-use OTP

- **Story ID:** EP-04-S2
- **Title:** System can generate, hash and expire a 6-digit single-use OTP
- **As a:** System
- **I want:** a server module that creates an OTP challenge with a 6-digit code from a secure random source, stores only a hash of the code, sets `expires at` to issue time plus 10 minutes, and checks a submitted code with the results `ok`, `wrong`, `expired` or `used`
- **So that:** sign-in codes cannot be guessed from a counter like the prototype `makeToken`, and a leaked database row does not reveal a usable code (FR-04-3, FR-04-4, FR-04-5, BR-04-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the module, when 10,000 challenges are generated in a test, then every code has exactly 6 digits (leading zeros kept, for example "004217"), and the codes do not follow a sequence.
  2. Given a challenge issued at 10:00:00 UTC, when the code is checked at 10:09:59 UTC, then the result is `ok`; when a fresh challenge issued at 10:00:00 is checked at 10:11:00 UTC, then the result is `expired` (epic acceptance criterion 3).
  3. Given a challenge whose code was already checked as `ok`, when the same code is checked again, then the result is `used` and no second success is possible (epic acceptance criterion 2).
  4. Given a stored challenge row in `otp_challenges`, when it is inspected, then it holds a code hash and no column holds the 6 plain digits.
  5. Given a wrong code, when it is checked, then the result is `wrong` and the challenge's attempt count goes up by 1.
- **Rules enforced on the server:** Codes come from the platform's cryptographic random generator, never from `makeToken` in `src/domain/edits.ts`. Expiry is 10 minutes from issue on the server clock. A challenge succeeds at most once; `used at` is set in the same transaction as the success. Code comparison is constant-time.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This module creates and checks challenges; the sign-in outcomes are audited in EP-04-S14.
- **Data changes:** Migration creates `otp_challenges` (id, userId, phone, code hash, issued at, expires at, used at, attempt count) as in epic section 9, with an index on phone and issued at.
- **UI reference:** No screen
- **Non-functional checks:** Security: secure random source, hashed at rest, constant-time compare, plain code never written to logs (BR-04-1). Time: issued at and expires at computed on the server clock in UTC. D1 is decided (Option C): this module is built in the Node API; no platform OTP service is used.
- **Depends on:** EP-02-S1, EP-02-S3, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S3: User can request a sign-in OTP by phone

- **Story ID:** EP-04-S3
- **Title:** User can request a sign-in OTP by phone
- **As a:** Staff
- **I want:** to type my phone number on the sign-in screen and tap "Send code" so a 6-digit code is sent to me
- **So that:** I can sign in on the shop device or my own phone with the number recorded at onboarding (FR-04-1, FR-04-2, BR-04-4, BR-04-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is an active Staff user with phone "+91 98410 11111", when he enters "98410 11111" and taps "Send code", then a challenge is created for his user and the screen moves to OTP entry saying the code was sent and is valid for 10 minutes.
  2. Given the phone "+91 90000 00000" belongs to no user, when it is entered and "Send code" is tapped, then the response and the screen are the same as for a known phone, and no code is delivered (FR-04-2).
  3. Given a deactivated user's phone, when "Send code" is tapped, then the response is the same as for a known phone and no challenge is delivered.
  4. Given the input "12345", when "Send code" is tapped, then the screen shows a field error on the phone field and no request is sent; given the server receives it anyway, it returns `validation` with field `phone`.
  5. Given a karigar, Lakshmi Devi, with phone "+91 98400 10101", when she opens the job portal sign-in on her phone, then the same request flow works there with 56 px touch targets (BR-04-5).
- **Rules enforced on the server:** The request is accepted without a session but passes the rate-limit hook from EP-03-S11 (values in EP-04-S9). The phone is normalised to E.164 before lookup. Unknown and deactivated phones get the same response shape and similar response time as known ones. A new request for the same phone replaces any earlier unused challenge.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes for known users only: actor (the user), time, entity user, action `sign_in_code_requested`, device label. No code. Unknown phones are not written to the audit log.
- **Data changes:** Inserts a row in `otp_challenges` for a known active user; marks any earlier unused challenge for that phone as replaced.
- **UI reference:** Not yet designed (sign-in screen, MOCKUP-COVERAGE §3). The phone label follows `docs/ux/mockups/25-onboard-staff.svg` ("Phone · they sign in and get OTPs here") and `docs/ux/mockups/24-onboard-karigar.svg` ("Phone · their job portal logs in with this"). Node `SIGN` in `docs/ux/mockups/10-navigation-map.mmd`. No route id exists yet in `src/nav.ts`.
- **Non-functional checks:** Security: the screen and response do not reveal whether a phone is registered. Personal data: the phone is not shown in full on the next screen; it is masked, for example "+91 ••••• 11111". Performance: the sign-in screen loads under 2 seconds on a shop connection. Open decision D4: this story assumes phone plus OTP; if D4 picks email plus password, this story is replaced. Open question: whether two karigars may share one phone (section 17); today `users.phone` is unique (EP-02-S3).
- **Depends on:** EP-04-S2, EP-03-S2, EP-03-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S4: System can deliver the OTP through a stub until WhatsApp is live

- **Story ID:** EP-04-S4
- **Title:** System can deliver the OTP through a stub until WhatsApp is live
- **As a:** System
- **I want:** an OTP delivery interface with one stub implementation that, in development and staging only, shows the code on the OTP screen in the simulated WhatsApp bubble of `OtpPanel` and in the developer console
- **So that:** sign-in can be built and tested before EP-12 sends real WhatsApp messages, without ever exposing codes in production (FR-04-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given the staging environment with the delivery mode set to `stub`, when Rajesh Verma requests a code, then the OTP screen shows the simulated WhatsApp bubble with "JGD: your sign-in code" and the 6 digits.
  2. Given the production environment, when the server starts with the delivery mode set to `stub`, then it refuses to start and logs that the stub is not allowed in production.
  3. Given the stub, when a code is delivered, then the code is returned only in the response to the device that requested it, never written to the server log, the audit log or the database in plain text.
  4. Given the delivery interface, when EP-12 later adds a WhatsApp implementation, then it is chosen by an environment variable and no sign-in code changes.
- **Rules enforced on the server:** The stub is enabled only when the environment is `development` or `staging`. The delivery mode comes from environment variables (EP-01-S6). The plain code exists only in memory between generation and delivery.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Delivery is part of the code request audited in EP-04-S3; the code itself is never audited.
- **Data changes:** None in the product database. Adds the delivery interface and stub to `api`, and a delivery mode environment variable.
- **UI reference:** `src/components/ui/OtpPanel.tsx` simulated WhatsApp bubble, on the OTP entry screen, which is not yet designed.
- **Non-functional checks:** Security: the stub cannot run in production; the code is redacted from all logs (epic section 16 risk). Open decision D8: the WhatsApp provider and template approval decide when the stub is replaced; that work is EP-12.
- **Depends on:** EP-04-S3, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S5: User can enter the OTP and get a session

- **Story ID:** EP-04-S5
- **Title:** User can enter the OTP and get a session
- **As a:** Staff
- **I want:** to type or paste the 6-digit code into the six boxes and be signed in
- **So that:** the server knows for certain who I am, and every later action records me as the actor (FR-04-6, BR-04-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma requested a code 3 minutes ago, when he enters the correct 6 digits, then a session is created for his user with role `staff`, and the response sets the session credential (epic acceptance criterion 1).
  2. Given the code is pasted as "482913" into the first box, when it is pasted, then all six boxes fill and the code is submitted once.
  3. Given a successful sign-in, when the `sessions` table is inspected, then the new row holds userId, role at issue, created at, expires at and device label, and the session secret is stored only as a hash.
  4. Given a session credential from this sign-in, when any API operation is called, then EP-03-S3 resolves the actor as Rajesh Verma.
  5. Given the code was already used once, when it is entered again on another device, then no session is created (epic acceptance criterion 2).
- **Rules enforced on the server:** A session is issued only after EP-04-S2 returns `ok` for an unexpired, unused challenge of an active user. The challenge is marked used and the session inserted in one transaction. The session secret is long and random. The credential is sent so that browser scripts cannot read it, where the chosen method allows.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor, time, entity session, action `signed_in`, role, device label. No code.
- **Data changes:** Updates `otp_challenges.used at`; inserts into `sessions`. Migration adds columns `role at issue`, `end reason` and `device label` to `sessions` (EP-02-S3 created id, userId, created, expires, ended).
- **UI reference:** Not yet designed (OTP entry screen). Reuses the six boxes and paste support of `src/components/ui/OtpPanel.tsx`.
- **Non-functional checks:** Security: session tokens are random and unguessable and stored hashed; the code is never logged. Concurrency: two devices submitting the same correct code at once create one session only. Time: created at and expires at in UTC from the server clock. Open decision D4: how the session is presented (cookie or bearer token); the criteria hold for either. D1 is decided (Option C): the Node API issues and checks the session itself.
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
  4. Given a signed-in user reloads the page, when Read Current session is called, then it returns user id, name, role and landing route, and the user stays signed in without a new code.
  5. Given no valid session, when any app route such as `stock` is opened, then the app shows the sign-in screen instead.
- **Rules enforced on the server:** Read Current session returns the user and role from the session, never from the request. The landing route is derived from role using the mapping in `src/nav.ts` (`staff: 'today'`, `owner: 'decisions'`, `karigar: 'k-jobs'`), moved into the shared package. Only the three roles exist.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading the current session changes no state.
- **Data changes:** None in the product database. Moves `landingRoute` from `src/nav.ts` into the shared package; removes the use of `switchIdentity` from the sign-in path.
- **UI reference:** Node `SIGN` and its three arrows in `docs/ux/mockups/10-navigation-map.mmd`; routes `today`, `decisions` and `k-jobs`. The sign-in screen itself is not yet designed.
- **Non-functional checks:** Security: the browser cannot pick a role; the RoleChip identity switch is not reachable once real sign-in is on (the account menu that replaces it is EP-05). Performance: the landing screen starts loading within 2 seconds of a successful code.
- **Depends on:** EP-04-S5, EP-01-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S7: User can see wrong-code and expired-code messages and ask for a new code

- **Story ID:** EP-04-S7
- **Title:** User can see wrong-code and expired-code messages and ask for a new code
- **As a:** Karigar
- **I want:** a clear message when my code is wrong or too old, and a "Send a new code" button
- **So that:** I know what to do next without asking the shop (FR-04-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi enters a code that does not match, when it is submitted, then the screen shows "Wrong code. Check the message and try again." under the boxes and the boxes are cleared.
  2. Given a code issued 11 minutes ago, when it is submitted, then the screen shows "Code expired." and a "Send a new code" button (epic acceptance criterion 3).
  3. Given she taps "Send a new code", when the request succeeds, then a new challenge replaces the old one and the old code no longer works.
  4. Given the server, when it answers a wrong or expired code, then it returns `rule_refused` with a reason of `wrong` or `expired`, and never says whether the phone is registered.
  5. Given the karigar phone screen, when the message and button are shown, then the button has a touch target of at least 56 px (UX-SPEC §6).
- **Rules enforced on the server:** Wrong and expired results come from EP-04-S2. Each wrong code increases the attempt count used by lockout in EP-04-S8. A new code request goes through the rate limits in EP-04-S9.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor (the user), time, action `sign_in_failed`, reason `wrong` or `expired`. No code.
- **Data changes:** Updates `otp_challenges.attempt count`; a new code inserts a new `otp_challenges` row.
- **UI reference:** Not yet designed (OTP entry screen). Error line placement follows the `error` prop of `src/components/ui/OtpPanel.tsx`.
- **Non-functional checks:** Security: messages do not reveal whether the phone exists. Time: expiry judged on the server clock in UTC, not the phone clock.
- **Depends on:** EP-04-S5, EP-04-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S8: System can lock out a phone after repeated failed attempts

- **Story ID:** EP-04-S8
- **Title:** System can lock out a phone after repeated failed attempts
- **As a:** System
- **I want:** to count failed code attempts per phone and per device, and refuse further sign-in for a set period once a threshold is reached
- **So that:** nobody can guess a 6-digit code by trying many times (FR-04-8, BR-04-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lockout threshold of N failed attempts (a configuration value), when the Nth wrong code is entered for "+91 98410 22222", then sign-in for that phone is locked until `locked until` (epic acceptance criterion 4).
  2. Given a locked phone, when a code is requested or entered, then the server refuses with `rule_refused` and the screen shows "Too many wrong codes. Try again after HH:MM." in Asia/Kolkata time, even if the code is correct.
  3. Given the lock period has passed, when the user requests a new code, then the request works and the failed count starts at 0.
  4. Given a successful sign-in before the threshold, when it completes, then the failed count for that phone resets to 0.
  5. Given someone guessing on the owner's phone from another device, when that device is locked, then the owner's own device can still use the password fallback from EP-04-S10, if D4 adopts it (epic section 16 risk).
- **Rules enforced on the server:** Failed counts are kept per phone and per device. The threshold and lock period come from environment variables until section 17 fixes them. The lock is checked before the code is compared. Counting and locking run in one transaction so parallel guesses cannot bypass the threshold.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor (the user if the phone is known), time, action `sign_in_locked`, locked until, device label. No code.
- **Data changes:** Migration creates `sign_in_lockouts` (phone or userId, device label, failed count, locked until) as in epic section 9.
- **UI reference:** Not yet designed (locked-out state, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: lockout stops brute force; the message does not reveal whether the phone is registered. Concurrency: parallel wrong codes are all counted. Time: `locked until` stored in UTC and shown in Asia/Kolkata. Open question: how many failed attempts trigger lockout, and for how long (section 17).
- **Depends on:** EP-04-S7, EP-04-S2, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S9: System can rate-limit OTP requests per phone and device

- **Story ID:** EP-04-S9
- **Title:** System can rate-limit OTP requests per phone and device
- **As a:** System
- **I want:** the EP-03-S11 rate-limit hook filled in for the Create OTP challenge operation, counting requests per phone and per device
- **So that:** nobody can flood a person's WhatsApp with codes or run up message costs (FR-04-9, BR-04-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a limit of R code requests per phone per period (a configuration value), when the R+1th request for "+91 98410 11111" arrives inside the period, then it is refused with `rate_limited` and the screen says "Too many codes requested. Wait a few minutes and try again."
  2. Given a limit per device, when one device requests codes for many different phones, then requests beyond the device limit are refused with `rate_limited`.
  3. Given a refused request, when it is handled, then no challenge is created and nothing is sent.
  4. Given an unknown phone, when it exceeds the limit, then the refusal is the same as for a known phone.
  5. Given the period has passed, when a new request arrives, then it is allowed.
- **Rules enforced on the server:** Limits apply before any lookup or delivery. Counters are kept per normalised phone and per device. Limit values come from environment variables; EP-39 sets the final values across the API.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Refused requests are counted, not audited; repeated abuse is reported through EP-37 and EP-39.
- **Data changes:** None in the product database if counters are held in a cache shared by the Node API instances; otherwise a short-lived counter table in PostgreSQL. The Node API owns the counters either way (D1, Option C).
- **UI reference:** Not yet designed (sign-in screen).
- **Non-functional checks:** Security: per phone and per device limits stop message flooding. Personal data: counters key on a hash of the phone, not the plain number. Availability: limits survive one server restart if more than one api instance runs. D1 is decided (Option C): the Node API enforces this limit; no platform limit is relied on.
- **Depends on:** EP-04-S3, EP-03-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S10: Owner can sign in with a password fallback

- **Story ID:** EP-04-S10
- **Title:** Owner can sign in with a password fallback
- **As a:** Owner
- **I want:** to set a password after my first OTP sign-in and use it with my phone number when the code does not arrive
- **So that:** the shop is not stuck if WhatsApp delivery fails or is delayed by template approval (FR-04-14, BR-04-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is signed in, when he sets a password of at least 12 characters, then only a slow salted hash is stored in the user's password hash field.
  2. Given he signs out and the code does not arrive, when he chooses "Use password" and enters phone "+91 98410 33333" and the correct password, then a session is created and he lands on `decisions`.
  3. Given a Staff or Karigar user, when they try the password route, then it is refused with the same message as a wrong password, and no session is created.
  4. Given 5 wrong passwords, when the lockout threshold from EP-04-S8 is reached, then the password route is locked for that device separately from the OTP route.
  5. Given D4 rejects the fallback, when the feature flag is off, then the "Use password" link is not shown and the operation refuses all calls.
- **Rules enforced on the server:** Only role `owner` may use the password route. Passwords are stored as a slow salted hash and never logged. The route has its own failed-attempt counter and lockout. Setting a password needs a current owner session.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (written through EP-04-S14): actor, time, action `password_set` or `signed_in` with method `password`, or `sign_in_failed` with reason `wrong_password`. No password.
- **Data changes:** Migration adds a nullable password hash column to `users`. Inserts into `sessions` on success.
- **UI reference:** Not yet designed (sign-in screen, password option).
- **Non-functional checks:** Security: slow salted hash, owner only, separate lockout so a stranger guessing codes cannot lock the owner out. Open decision D4: whether the password fallback is kept at all; this story is built behind a flag until D4 is decided. Open question: what happens when the owner loses their phone (section 17).
- **Depends on:** EP-04-S5, EP-04-S6, EP-04-S8, EP-04-S1
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
- **Non-functional checks:** Security: sessions expire (PRODUCTION-SCOPE §5). Time: expiry computed in UTC on the server clock. Open question: how long a session lasts, and whether it differs for the shop device, the owner and karigar phones (section 17). Open decision D6: karigar offline use (EP-20) may need a longer lifetime.
- **Depends on:** EP-04-S5, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-04-S13: System can end all sessions of a deactivated or re-roled user at once

- **Story ID:** EP-04-S13
- **Title:** System can end all sessions of a deactivated or re-roled user at once
- **As a:** System
- **I want:** a Delete All sessions of a user operation that ends every open session of one user, called when "User deactivated or role changed" happens, and the user's open screens sent back to sign-in
- **So that:** a person who leaves the shop or loses owner rights cannot keep acting with an old session (FR-04-12, BR-04-2, BR-04-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar (Karigar) is signed in on two phones, when Delete All sessions is called for his user with reason `deactivated`, then both session rows get `ended at` and `end reason` `deactivated` in one transaction.
  2. Given those ended sessions, when either phone sends its next request, then the server returns `unauthenticated` and the phone shows the sign-in screen (epic acceptance criterion 5).
  3. Given Deepak Rao's role changes from `staff` to `owner`, when Delete All sessions is called with reason `role_changed`, then his sessions end and his next sign-in carries role `owner`.
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

## EP-04-S14: System can audit sign-in, failure, lockout and sign-out without the code

- **Story ID:** EP-04-S14
- **Title:** System can audit sign-in, failure, lockout and sign-out without the code
- **As a:** System
- **I want:** one helper that writes an audit entry for every sign-in event (code requested, signed in, sign-in failed, locked, signed out, sessions ended, first owner bootstrapped, password set) with actor and time, and with the code and password always left out
- **So that:** the owner can see who signed in and when, and no code or password ever sits in the audit log (BR-04-1, epic section 13 Audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signs in at 09:58 IST, when the audit log is read, then it has an entry with actor Rajesh Verma, time 04:28 UTC, action `signed_in`, role `staff` and device label.
  2. Given a wrong code, a lockout and a sign-out, when the audit log is read, then each has its own entry with action `sign_in_failed`, `sign_in_locked` and `signed_out`.
  3. Given any sign-in audit entry, when a test searches it and the server log for the 6 digits of the code or the password, then neither appears.
  4. Given the sign-in action and its audit entry, when the action rolls back, then the audit entry is not written either, because both are in the same transaction (EP-03-S6).
  5. Given an entry, when it records a phone, then the phone is masked, for example "+91 ••••• 11111".
- **Rules enforced on the server:** Audit entries are append-only. The helper strips any field named code, token, otp or password before writing. Actor and time come from `Ctx` (EP-03-S3), or "setup" and "system" where no user is signed in. Request logging redacts the code field.
- **Live events emitted / consumed:** None. Sign-in and sign-out are audited but are not catalogue events (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (user or session), action, reason where relevant, device label. Never the code or password.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). No schema change. The reader screens and filters are EP-06.
- **UI reference:** No screen in this story. Entries appear later on the audit screen built in EP-06.
- **Non-functional checks:** Audit: every sign-in outcome is recorded with actor and time. Security: code and password redacted from audit and logs (epic section 16 risk; tested again in EP-40). Personal data: phones masked. Time: stored in UTC.
- **Depends on:** EP-02-S11, EP-03-S3, EP-03-S6, EP-04-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D4: phone plus WhatsApp OTP, phone plus password, or email plus password? Is a password fallback kept for the owner? (EP-04-S3, S5, S10)
- D8: which WhatsApp provider sends the OTP, and how long does template approval take? (EP-04-S4)
- How many failed attempts trigger lockout, and for how long? (EP-04-S8, S10)
- How long does a session last, and is it different for the shop device, the owner and karigar phones? (EP-04-S12)
- Can two karigars share one phone, and how does sign-in tell them apart? (EP-04-S3)
- What happens when the owner loses their phone: who can recover the account? (EP-04-S10)
- Who runs the first-owner bootstrap, and with which phone? (EP-04-S1)
