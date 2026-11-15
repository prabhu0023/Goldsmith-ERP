# EP-45: Shop setup wizard

## 1. Summary

This epic sets the shop up the first time the system is installed. A new installation has no shop record, no owner,
no scales and no rules, and nobody can sign in. The owner asked for "a full onboarding" for the very first owner
account, "an onboarding of a store kind of thing". The first-run setup wizard runs once and walks through five steps:
(1) shop details: name, address, GSTIN and logo; (2) the owner account: name, phone and email, followed by the
activation email; (3) the shop's scales and their readability, which the exact-match rule needs; (4) basic settings:
lead response time (default 8 hours) and opening hours; (5) inviting the first staff and karigars. When it is finished
it is never shown again. The very first owner account is created through this wizard; there is no separate developer
bootstrap command.

It is numbered EP-45 so that no existing epic or story is renumbered. It belongs to Layer B (Master data) and to
milestone M2, and it is built after EP-14. It depends only on lower-numbered epics, so the bottom-up rule holds.

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Not built. The prototype starts from seed data in `src/data/seed.ts`; there is no first-run state, no shop record and no setup flow.

## 3. Roles involved

- Owner: runs the wizard. Enters the shop details and his own account in steps 1 and 2 before any account exists, then activates his account from the email, signs in, and completes steps 3 to 5 as the signed-in owner.
- Staff: not involved in the wizard; invited in step 5 and receive an activation email (EP-05, EP-04).
- Karigar: not involved in the wizard; invited in step 5 and receive an activation email. Their karigar master record is added later on `karigars` (EP-16).
- System: shows the wizard only while setup is not complete, refuses every setup call once it is, creates the shop record, calls the first-owner creation (EP-04-S1), records progress per step, and writes an audit entry for each step.

## 4. In scope

- A first-run state: the system knows whether setup is complete, from the shop record's `setup completed at`.
- A setup gate: while setup is not complete, every route opens the wizard; once complete, the wizard route and every setup operation are refused.
- A one-time setup key from environment configuration that the wizard asks for before step 1, so a stranger who reaches a fresh installation cannot claim it (proposed; see section 17).
- Step 1, shop details: name (required), address (required), GSTIN (optional, format-checked), logo image (optional). Creates the one shop record and its default location "Main shop" (D7).
- Step 2, owner account: name, phone and email; creates the owner through EP-04-S1 and sends the activation email through EP-04-S10 and EP-11.
- Resuming the wizard at step 3 after the owner activates his account and signs in.
- Step 3, scales: register each balance with name, readability and capacity through EP-14; at least one scale is required.
- Step 4, basic settings: lead response time (default 8 hours, minimum 1) through EP-13, and opening hours per weekday through EP-13.
- Step 5, invite the first staff and karigars with name, phone, email and role through EP-05; each gets an activation email. Step 5 may be skipped.
- Finish: sets `setup completed at`; the wizard is never shown again.
- Saved progress per step, so closing the browser does not lose finished steps.
- An audit entry for every step.

## 5. Out of scope

- Password storage, activation links and sign-in (EP-04).
- Adding users after setup, resend activation and unlock (EP-05).
- The settings page and later changes to settings (EP-13).
- Scale editing, retiring and counter assignment after setup (EP-14).
- Karigar master fields (specialty, wastage allowance) and linking a karigar user to a karigar record (EP-16, EP-05).
- Customers, stock, the opening pool balance and other launch imports (EP-41).
- Image storage and resizing for the logo (EP-09).
- Real email delivery and the choice of email provider (EP-11, D4a).
- A second shop, shop sign-up or multi-shop: deferred (D7; PRODUCTION-SCOPE §6 Later notes).
- A developer bootstrap command: not provided; the wizard is the only way to create the first owner.
- Running the wizard again after completion, or resetting a shop.

## 6. Current state in the prototype

- No first-run state. `src/data/seed.ts` fills the in-memory store with a shop that already has staff (ST-01 Rajesh Verma, ST-02 Deepak Rao, ST-03 Sanjay Seth as owner), karigars (KG-01, KG-02, KG-04), scales (Bench balance 0.0001 g up to 600 g, Platform scale 0.01 g up to 30 kg) and settings (`leadSlaHours 8`).
- No shop entity: the shop name is not stored; screens print "Main showroom" and "All branches" as static text.
- Reusable: `src/components/people/OnboardStaff.tsx` (route `staff-new`) as the pattern for the invite step; `src/components/settings/ScalesRules.tsx` (route `scales`) for the scale step; the rules panel fields on `decisions` for the lead timer; `StepFrame` from `src/components/ui/StepFrame.tsx` for the step layout.
- Must be built: the first-run gate, the shop record, the setup key check, step progress, resume after activation, and the finish rule.

## 7. Functional requirements

- FR-45-1. While setup is not complete, opening any route shows the setup wizard; no other screen or operation is available except sign-in, activation and the wizard itself.
- FR-45-2. Before step 1, the wizard asks for the setup key; a wrong key is refused and nothing is created.
- FR-45-3. Step 1 stores the shop name and address (required), GSTIN (optional; if given, 15 characters in the GSTIN format) and logo (optional image) in the one shop record, and creates the default location "Main shop" in the same transaction.
- FR-45-4. Step 2 creates the owner account with name, phone and email through EP-04-S1 and sends the activation email; it can run only once.
- FR-45-5. After the owner activates his account and signs in, the wizard resumes at step 3 for him only.
- FR-45-6. Step 3 registers one or more scales with name, readability and capacity; the wizard cannot move on with no scale.
- FR-45-7. Step 4 stores the lead response time (default 8 hours, minimum 1 hour) and the opening hours per weekday.
- FR-45-8. Step 5 invites staff and karigars with name, phone, email and role; each gets an activation email; the step may be skipped.
- FR-45-9. Finishing sets `setup completed at`; from then on the wizard route and every setup operation are refused, and nobody sees the wizard again.
- FR-45-10. Each finished step is saved; reopening the wizard returns to the first unfinished step.
- FR-45-11. Every step writes an audit entry.
- FR-45-12. There is exactly one shop and one owner after setup (D7).

## 8. Business rules

- BR-45-1. The setup wizard runs once when the system is installed and is never shown again after completion. [owner decision, shop setup]
- BR-45-2. The very first owner account is created through this wizard; there is no separate developer bootstrap command. [owner decision; D4]
- BR-45-3. The steps are, in order: shop details; owner account and activation email; scales and their readability; basic settings; invite the first staff and karigars. [owner decision, shop setup]
- BR-45-4. One shop, no branches; one shop has one owner. [D7; decisions/tenancy-and-branches.md]
- BR-45-5. The owner receives an activation link, never a password. [D4; decisions/D4-sign-in.md]
- BR-45-6. Scales and their readability are needed by the exact-match rule, so at least one scale is registered before setup finishes. [owner decision; mockup 14; EP-14]
- BR-45-7. The lead response time defaults to 8 hours and is at least 1 hour. [mockup 13; src/store/transitions.ts setSetting]
- BR-45-8. Every user has an email address, karigars included. [D4]
- BR-45-9. Every permission is checked on the server; the setup gate is a server rule, not a hidden screen. [PRODUCTION-SCOPE §5 Security]

## 9. Data

- Shop (table created in EP-02-S3): id, name, address, GSTIN (nullable), logo file id (nullable, EP-09), setup completed at (nullable), created at.
- Location (table created in EP-02-S3): one row, "Main shop", created with the shop in step 1. Scales registered in step 3 carry its id.
- SetupProgress: shop ID, step (1 to 5), completed at, completed by (actor "setup" for steps 1 and 2, the owner for steps 3 to 5), skipped flag (step 5 only).
- Reads and writes through other epics: User (EP-04-S1, EP-05-S4), PasswordLink (EP-04-S10), Scale (EP-14-S3), Settings and ShopHours (EP-13-S4, EP-13-S11).
- Scale readability and capacity are integers in units of 0.0001 g (PRODUCTION-SCOPE §5), entered in grams to four decimals.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Setup status | Whether setup is complete and which step is next | Anyone (returns only the status) |
| Check | Setup key | Open the wizard for steps 1 and 2 | Anyone holding the setup key, while setup is not complete |
| Create | Shop | Step 1: store shop details and logo | Setup key holder, once |
| Create | First owner | Step 2: create the owner and send the activation email (calls EP-04-S1 and EP-04-S10) | Setup key holder, once |
| Create | Scale | Step 3 (calls EP-14 Create Scale) | Owner, while setup is not complete |
| Update | Setting, Shop hours | Step 4 (calls EP-13 Update Setting and Update Shop hours) | Owner, while setup is not complete |
| Create | User | Step 5 (calls EP-05 Create User) | Owner, while setup is not complete |
| Update | Setup | Finish setup | Owner, once |

## 11. Live events

- Emits: none from the catalogue. The steps that change settings emit the proposed "Setting changed" event through EP-13 (gap G26).
- Consumes: none.

## 12. Screens and UX references

- No route id exists; the wizard needs a new route shown only while setup is not complete.
- Not yet designed (MOCKUP-COVERAGE §3): the setup wizard (setup key, shop details, owner account, scales, basic settings, invite, finish), and the "check your email" screen after step 2.
- Mockups to reuse for single steps: `25-onboard-staff.svg` (invite step fields, plus email), `14-match-rule-any-parcel.svg` (why readability matters, for the scale step), `13-notifications-escalation.svg` ("A lead is late after 8 hours", for the settings step), `01-foundations.svg` (design system).
- Component to reuse: `StepFrame` from `src/components/ui/StepFrame.tsx`.

## 13. Non-functional requirements

- Security: the setup gate and the setup key are checked on the server on every setup call; once `setup completed at` is set, every setup operation returns `forbidden` and the setup key no longer works. The setup key lives in environment configuration only and is never logged.
- Security: the shop ID for every record created in setup comes from the shop record on the server, never from the browser (D7).
- Concurrency: two browsers running step 1 or step 2 at once create one shop and one owner; the second gets "Setup is already in progress or done."
- Audit: each step writes an audit entry with actor ("setup" or the owner), time, step and the values stored (phone and email masked).
- Personal data: the owner's and invited users' phones and emails are personal data; they are masked in audit entries and logs.
- Performance: each step loads under 2 seconds on a shop connection.
- Time: completion times stored in UTC; opening hours entered and shown in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-04, EP-05, EP-08, EP-09, EP-11, EP-13, EP-14
- Downstream: EP-41 refers to it for launch (the first shop and owner come from the wizard), although EP-41 has a lower number; no epic depends on it formally.

## 15. Epic acceptance criteria

1. Given a fresh installation, when anyone opens the app, then the setup wizard shows and asks for the setup key; no other screen opens.
2. Given the right setup key, when Sanjay Seth enters the shop name "JGD Jewellers", an address and GSTIN "33ABCDE1234F1Z5", then one shop record is stored.
3. Given step 2 with name "Sanjay Seth", phone "+91 98410 33333" and email "sanjay@jgd-jewellers.example", when he saves, then one owner exists with status `pending_activation` and an activation email goes to that address.
4. Given Sanjay activated his account and signed in, when the app opens, then the wizard resumes at step 3.
5. Given step 3 with no scale registered, when Sanjay tries to go on, then the wizard refuses with "Add at least one scale."
6. Given steps 3 and 4 done and step 5 skipped, when Sanjay taps "Finish setup", then `setup completed at` is set, he lands on `decisions`, and the wizard never shows again for anyone.
7. Given setup is complete, when anyone calls a setup operation directly, even with the setup key, then the server refuses and nothing changes.

## 16. Risks

- Risk: a stranger reaches a fresh installation before the owner and claims the shop. Mitigation: the setup key from environment configuration; the installation is not public until setup is done, where hosting allows.
- Risk: the activation email does not arrive (wrong address, email provider not ready), so the owner cannot get past step 2. Mitigation: the "check your email" screen lets the setup key holder correct the email and resend while the owner has not activated; the stub mailbox covers staging (EP-04-S4).
- Risk: wrong scale readability entered at setup makes the match gate wrong from day one. Mitigation: the scale step shows the readability rule from mockup 14 and EP-41 checks the true readabilities before launch.
- Risk: the wizard is built after M1 but sign-in tests need an owner. Mitigation: the seed (EP-02-S13) provides an owner in development and staging; the wizard is the only path in production.
- Risk: setup is left half done. Mitigation: progress is saved per step and the gate keeps every other screen closed until finish.

## 17. Open decisions and questions

- Setup key: confirm that a one-time key from environment configuration is acceptable as the guard for steps 1 and 2 (proposed).
- Is GSTIN required, or optional for a shop that is not yet registered? (Proposed: optional, format-checked when given.)
- Opening hours: are they used by the lead timer (A2: shop hours or clock hours), or only stored for display until A2 is answered?
- Can the owner change the shop details (name, address, GSTIN, logo) after setup, and on which screen? (Proposed: on the shop settings page, EP-13; not designed.)
- Should step 5 also create the karigar master record (specialty, allowance), or only the karigar's user account? (Proposed: account only; the record is added on `karigars`, EP-16.)
- D4a: which email provider sends the activation emails?

## 18. Candidate stories

1. EP-45-S1: System can show the setup wizard only until setup is complete
2. EP-45-S2: Owner can enter the shop details: name, address, GSTIN and logo
3. EP-45-S3: Owner can create the owner account and get the activation email
4. EP-45-S4: Owner can resume setup after activating his account and signing in
5. EP-45-S5: Owner can register the shop's scales and their readability
6. EP-45-S6: Owner can set the lead response time and opening hours
7. EP-45-S7: Owner can invite the first staff and karigars
8. EP-45-S8: Owner can finish setup so the wizard is never shown again
9. EP-45-S9: System can audit every setup step
