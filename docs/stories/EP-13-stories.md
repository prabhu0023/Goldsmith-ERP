# EP-13: Branches and shop settings · stories

Epic document: [EP-13 Branches and shop settings](../epics/EP-13-branches-and-shop-settings.md)

Role note: stories where the server stores, checks, audits or pushes settings on its own use "System". Stories where a person changes a setting use "Owner". Staff only read settings in these stories; whether staff may change any key is open question G12.

---

## EP-13-S1: System can store shop settings with seed defaults

- **Story ID:** EP-13-S1
- **Title:** System can store shop settings with seed defaults
- **As a:** System
- **I want:** one typed settings record per shop, created on first start with the seed defaults (`pricingEnabled` false, `leadSlaHours` 8, `requireEditToken` true, `notifyChannels` WhatsApp on, app on, email off, `lateLeadAudience` `staff_then_owner`, `autoSendWishes` false, `wishSendTime` 09:00, `ageingThresholdDays` empty), and a Read Settings operation that owner and staff screens and background jobs can call
- **So that:** the lead timer, notification rules, wishes run and edit-token flow all read the same stored values instead of an in-memory object that resets on reload (FR-13-1, FR-13-2, BR-13-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty database after migrations, when the api starts for the first time, then exactly one settings row exists with `leadSlaHours` 8, `lateLeadAudience` `staff_then_owner`, `notifyChannels` {whatsapp: true, app: true, email: false}, `requireEditToken` true, `autoSendWishes` false, `wishSendTime` 09:00, `ageingThresholdDays` null, `pricingEnabled` false and version 1.
  2. Given the settings row already exists, when the api restarts, then no second row is created and no stored value is reset to its default.
  3. Given Sanjay Seth (Owner) or Rajesh Verma (Staff) is signed in, when either calls Read Settings, then the response holds every key above plus updated at and updated by.
  4. Given Vijay Kumar (Karigar) is signed in, when he calls Read Settings, then the server refuses with `forbidden` and returns no values.
  5. Given the settings row cannot be read, when a background job or screen asks for settings, then it gets the seed defaults and the failure is logged, never a record with every switch off (epic section 13, Availability).
- **Rules enforced on the server:** Read Settings is allowed for `owner`, `staff` and the System actor and refused for `karigar` (EP-05-S2). Each key has a fixed type: `leadSlaHours` a number of at least 1, `lateLeadAudience` one of `staff_then_owner` or `owner_only`, `notifyChannels` three booleans, `wishSendTime` a local time of day, `ageingThresholdDays` a whole number or null, the rest booleans. Defaults live in one place in the shared package.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Creating the default row is not a change by any person; later changes are audited in EP-13-S3.
- **Data changes:** Uses the `settings` table from EP-02-S12. Migration adds `wishSendTime`, `ageingThresholdDays` (nullable), updated at, updated by and version columns if EP-02-S12 did not create them. Adds Read Settings to the shared contract (EP-03-S1).
- **UI reference:** No screen
- **Non-functional checks:** Availability: a missing row falls back to the seed defaults, not to "everything off". Performance: Read Settings answers in under 50 ms (proposed target, to confirm) and may be cached until "Setting changed" arrives (EP-13-S14). Time: updated at stored in UTC. Open decision D7: one settings row per shop or one per branch; the row is keyed by shop or branch key so either fits.
- **Depends on:** EP-02-S12, EP-02-S3, EP-03-S1, EP-03-S2, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S2: System can refuse a settings change from a role not allowed to make it

- **Story ID:** EP-13-S2
- **Title:** System can refuse a settings change from a role not allowed to make it
- **As a:** System
- **I want:** one Update Setting operation that takes a key, a new value and the version the caller last read, checks the caller's role against the permission matrix for that key before anything else, and refuses with "Only the owner can change the shop rules." when the role is not allowed
- **So that:** hiding the rules panel from staff is no longer the only control, and the prototype paths that let any role flip `autoSendWishes` on `wishes` or `pricingEnabled` in the AppShell switch are closed (FR-13-11, BR-13-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff), when he calls Update Setting for `leadSlaHours` with value 6 directly, then the server refuses with code `forbidden` and the sentence "Only the owner can change the shop rules.", and `leadSlaHours` stays 8 (epic acceptance criterion 2).
  2. Given Rajesh, when he calls Update Setting for `autoSendWishes` or `pricingEnabled`, then the server refuses the same way, unless G12 places `autoSendWishes` in the staff list, in which case only that key succeeds.
  3. Given Vijay Kumar (Karigar), when he calls Update Setting for any key, then the server refuses with `forbidden`.
  4. Given Sanjay Seth (Owner) sends an unknown key `matchTolerance`, when the server checks it, then it is refused as a validation error, because there is no tolerance setting anywhere (BR-13-4).
  5. Given Sanjay saves `leadSlaHours` with version 3 while the stored version is 4, when the server checks it, then it is refused with "This rule was changed a moment ago. Check and save again." and nothing changes.
  6. Given an accepted change, when it commits, then the version goes up by 1 and updated at and updated by are set from the server clock and the session (EP-03-S3).
- **Rules enforced on the server:** The role check per key runs on the server before validation and before any write (deny by default, EP-05-S2). Only known keys are accepted, each validated against its type (EP-03-S2). The version check rejects a stale write (EP-02-S14). Actor and time come from the session and server clock, never from the request. The change runs in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None from this story. The accepted change emits "Setting changed" through EP-13-S14.
- **Audit entry written:** No for a refused change, because nothing changes. Accepted changes are audited by EP-13-S3.
- **Data changes:** Updates the settings row value, version, updated at and updated by. Adds Update Setting to the shared contract and its per-key entries to the permission matrix (EP-05-S1).
- **UI reference:** No screen of its own. The refusal sentence shows on any screen that calls Update Setting through EP-08-S5.
- **Non-functional checks:** Security: every settings write checks the role on the server; the AppShell pricing switch and the `wishes` toggle no longer bypass it (epic section 13). Concurrency: two owners saving the same key at once, the second gets "This rule was changed a moment ago. Check and save again." Open question G12: which keys staff may change; the matrix lists all keys as owner-only until it is answered.
- **Depends on:** EP-13-S1, EP-02-S14, EP-03-S2, EP-03-S3, EP-03-S4, EP-03-S5, EP-03-S6, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S3: System can audit every settings change with old and new value

- **Story ID:** EP-13-S3
- **Title:** System can audit every settings change with old and new value
- **As a:** System
- **I want:** every accepted Update Setting, for every key including `pricingEnabled`, to write a `setting_changed` audit entry in the same transaction, with the key, old value, new value, actor and time, and a List Setting changes operation for the owner that reads those entries
- **So that:** the owner can see who changed which rule and when, and no setting can change without a trace (FR-13-12, BR-13-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth changes `leadSlaHours` from 8 to 6, when the change commits, then one audit entry exists with kind `setting_changed`, ref `leadSlaHours`, before 8, after 6, actor Sanjay Seth and the server time, and its summary reads "leadSlaHours 8 → 6" (epic acceptance criterion 1).
  2. Given Sanjay switches `pricingEnabled` from false to true, when it commits, then an audit entry is written the same way, with no exception for the pricing key.
  3. Given the audit write fails, when the transaction ends, then the setting is not changed either.
  4. Given Sanjay calls List Setting changes, when it returns, then he sees setting changes newest first, one page at a time, each with key, before, after, actor and time; Rajesh Verma (Staff) calling it gets `forbidden`.
  5. Given a save whose new value equals the stored value, when it is processed, then no audit entry is written and the version does not change.
- **Rules enforced on the server:** The setting change and its audit entry share one transaction (EP-06-S2). The `pricingEnabled` skip from the prototype `setSetting` is not carried over (EP-06-S8). List Setting changes is Owner only and reads the append-only audit store (EP-06-S9, EP-06-S12). There is no update or delete path for these entries.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref (setting key), before (old value), after (new value).
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds List Setting changes to the shared contract. No schema change.
- **UI reference:** Not yet designed. The history is also visible in the security log built in EP-06.
- **Non-functional checks:** Audit: every key, including `pricingEnabled`, writes an append-only entry with old and new value (epic section 13). Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-13-S2, EP-03-S9, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S8, EP-06-S9, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S4: Owner can change the lead SLA hours

- **Story ID:** EP-13-S4
- **Title:** Owner can change the lead SLA hours
- **As a:** Owner
- **I want:** to change the number of hours after which a lead counts as late, from the "A lead is late after … hours" field in the rules panel
- **So that:** the shop's lead timer matches how fast the shop wants every enquiry opened (FR-13-3, FR-13-4, BR-13-1, BR-13-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `decisions` with `leadSlaHours` 8, when he enters 6 and saves, then the stored value is 6, an audit entry reads "leadSlaHours 8 → 6" with his name, and open lead inboxes recompute lateness within about a second (epic acceptance criterion 1).
  2. Given Sanjay enters 0.5, when the server checks it, then it refuses with "The lead timer must be at least 1 hour." and the stored value stays 8 (epic acceptance criterion 3).
  3. Given Sanjay enters 0, a negative number or text, when he saves, then the server refuses with the same sentence or a validation error and nothing changes.
  4. Given the value is now 6, when a new lead arrives, then the EP-10-S5 SLA job is scheduled at arrival plus 6 hours.
  5. Given leads already waiting when the value changes, when the change commits, then their lateness is recomputed against 6 hours on open screens; whether their scheduled SLA jobs are also moved is decided with EP-28.
- **Rules enforced on the server:** Owner only (EP-13-S2). `leadSlaHours` must be a number of at least 1; the refusal sentence is "The lead timer must be at least 1 hour." (prototype `setSetting`). Audited (EP-13-S3).
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `leadSlaHours`, before, after.
- **Data changes:** Updates `settings.leadSlaHours`, version, updated at, updated by.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("THE RULES BEHIND THESE ALERTS", "A lead is late after 8 hours, shop hours, not clock hours"). The shop settings page is not yet designed (EP-13-S13).
- **Non-functional checks:** Time: until A2 is answered the timer counts clock hours and the label must say so; "shop hours, not clock hours" shows only once EP-13-S11 is live. Concurrency: version check from EP-13-S2. Open decision A2: shop hours or clock hours.
- **Depends on:** EP-13-S2, EP-13-S3, EP-08-S5, EP-10-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S5: Owner can set who hears about a late lead first

- **Story ID:** EP-13-S5
- **Title:** Owner can set who hears about a late lead first
- **As a:** Owner
- **I want:** to choose "Staff first, then me" (`staff_then_owner`) or "Only me" (`owner_only`) under "Who hears about a late lead"
- **So that:** the late-lead alert reaches the people the owner wants, in the order he wants (FR-13-5, BR-13-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `decisions` with `lateLeadAudience` `staff_then_owner`, when he picks "Only me" and saves, then the stored value is `owner_only` and an audit entry reads "lateLeadAudience staff_then_owner → owner_only".
  2. Given `owner_only`, when the next lead passes its SLA, then EP-11-S3 picks only the owner as recipient and no staff notification is created.
  3. Given `staff_then_owner`, when the next lead passes its SLA, then staff are notified first and the owner after the EP-11-S7 wait.
  4. Given a request with value `staff_only`, when the server checks it, then it is refused as a validation error and nothing changes.
- **Rules enforced on the server:** Owner only (EP-13-S2). Value must be `staff_then_owner` or `owner_only`. The recipient picker reads the value when each event is processed, not when the lead arrived. Audited.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `lateLeadAudience`, before, after.
- **Data changes:** Updates `settings.lateLeadAudience`, version, updated at, updated by.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("Who hears about a late lead", "Staff first, then me", "Only me").
- **Non-functional checks:** Concurrency: version check from EP-13-S2. Open question A3: whether staff hearing first is a setting or a fixed rule; if fixed, this story ships as read-only display.
- **Depends on:** EP-13-S2, EP-13-S3, EP-11-S3, EP-11-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S6: Owner can switch notification channels on and off

- **Story ID:** EP-13-S6
- **Title:** Owner can switch notification channels on and off
- **As a:** Owner
- **I want:** three switches under "How it reaches me" for WhatsApp, In the app and Email, each stored in `notifyChannels`
- **So that:** owner alerts reach him only on the channels he wants (FR-13-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `decisions` with WhatsApp on, In the app on and Email off, when he switches Email on and saves, then `notifyChannels.email` is true and an audit entry records before {whatsapp: true, app: true, email: false} and after {whatsapp: true, app: true, email: true}.
  2. Given Email is now on, when the next parcel is stopped, then EP-11-S9 creates one Notification row for each of WhatsApp, app and email for the owner.
  3. Given Sanjay switches WhatsApp off, when the next edit is proposed, then no WhatsApp notification is created for him, while the edit-token message itself is still sent by EP-25, because a token is not an alert.
  4. Given Sanjay switches all three channels off, when he saves, then the server applies the rule chosen for the open question on all channels off, either refusing with a sentence that one channel must stay on, or saving it and warning him.
- **Rules enforced on the server:** Owner only (EP-13-S2). `notifyChannels` holds exactly the keys `whatsapp`, `app`, `email`, each boolean. The channel router reads the value when each event is processed (EP-11-S9). Audited.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `notifyChannels`, before, after.
- **Data changes:** Updates `settings.notifyChannels`, version, updated at, updated by.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("How it reaches me", "WhatsApp", "In the app", "Email").
- **Non-functional checks:** Concurrency: version check from EP-13-S2. Open question: may the owner switch all three channels off at once, or must one stay on; criterion 4 is written to fit either answer.
- **Depends on:** EP-13-S2, EP-13-S3, EP-11-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S7: Owner can switch auto-send wishes and set the send time

- **Story ID:** EP-13-S7
- **Title:** Owner can switch auto-send wishes and set the send time
- **As a:** Owner
- **I want:** to switch "Send wishes automatically at 9 am" on or off on `wishes` and set the daily send time `wishSendTime`, with the change checked and audited on the server
- **So that:** birthday and anniversary wishes go out on their own at the time the shop chooses, and staff can no longer flip the switch without the owner (FR-13-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `wishes` with `autoSendWishes` false, when he switches it on, then the stored value is true, an audit entry reads "autoSendWishes false → true", and the next wishes run sends Priya Malhotra's birthday wish.
  2. Given Rajesh Verma (Staff) on `wishes`, when he taps the switch, then the server refuses with "Only the owner can change the shop rules." and the switch returns to its stored state, unless G12 places `autoSendWishes` in the staff list.
  3. Given Sanjay sets `wishSendTime` to 10:30, when he saves, then the stored value is 10:30 Asia/Kolkata, the label reads "Send wishes automatically at 10:30", and the EP-10-S9 job for the next day runs at 10:30 Asia/Kolkata (05:00 UTC).
  4. Given Sanjay enters 25:00 or text, when he saves, then the server refuses it as a validation error and nothing changes.
  5. Given `autoSendWishes` is switched off at 08:55, when the run time arrives, then no wishes are sent that day (EP-10-S9 reads the value at run time).
- **Rules enforced on the server:** Owner only until G12 is answered (EP-13-S2). `autoSendWishes` boolean; `wishSendTime` a local time of day HH:MM between 00:00 and 23:59, stored as Asia/Kolkata local time and converted to UTC when scheduling. Audited.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `autoSendWishes` or `wishSendTime`, before, after.
- **Data changes:** Updates `settings.autoSendWishes`, `settings.wishSendTime`, version, updated at, updated by.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Send wishes automatically at 9 am"). The send-time field is not yet designed.
- **Non-functional checks:** Time: send time is local Asia/Kolkata; the server converts to UTC when scheduling (EP-10-S10). Security: the `wishes` toggle no longer changes the setting without the server check. Open question G12: whether staff may switch auto-send. Open question: whether the send time is changeable at all, or fixed at 9 am as EP-10 says; if fixed, criterion 3 drops and the label stays "9 am".
- **Depends on:** EP-13-S2, EP-13-S3, EP-10-S9, EP-10-S10, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S8: Owner can set the ageing threshold for gold sitting too long (G5)

- **Story ID:** EP-13-S8
- **Title:** Owner can set the ageing threshold for gold sitting too long (G5)
- **As a:** Owner
- **I want:** to set `ageingThresholdDays`, the number of days a piece may sit unsold before the "GOLD SITTING TOO LONG" alert counts it
- **So that:** the owner's ageing alert on the Decisions home uses his own limit, for example "196.4 g of gold has not moved in 90 days" (FR-13-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth with `ageingThresholdDays` empty, when he sets it to 90 and saves, then the stored value is 90 and an audit entry reads "ageingThresholdDays (empty) → 90".
  2. Given the value is 90, when EP-32 reads settings, then it receives 90 and counts only pieces in stock longer than 90 days.
  3. Given `ageingThresholdDays` is empty, when EP-32 reads settings, then it receives null and shows no ageing alert, rather than using a hidden number.
  4. Given Sanjay enters 0, a negative number or 12.5, when he saves, then the server refuses it as a validation error, because the threshold is a whole number of days greater than 0.
- **Rules enforced on the server:** Owner only (EP-13-S2). `ageingThresholdDays` is a whole number greater than 0 or null. This epic stores the value only; computing which pieces are old and drawing the alert is EP-32. Audited.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `ageingThresholdDays`, before, after.
- **Data changes:** Updates `settings.ageingThresholdDays` (nullable integer, added in EP-13-S1), version, updated at, updated by.
- **UI reference:** Not yet designed (shop settings page). The alert it feeds is on `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("GOLD SITTING TOO LONG", "196.4 g of gold has not moved in 90 days").
- **Non-functional checks:** Time: days counted on Asia/Kolkata dates (EP-10-S10). Open question G5: what the threshold is and whether it is one number for all pieces; if per style or category is wanted, this story needs a split.
- **Depends on:** EP-13-S1, EP-13-S2, EP-13-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S9: Owner can switch the pricing flag, owner-only and audited

- **Story ID:** EP-13-S9
- **Title:** Owner can switch the pricing flag, owner-only and audited
- **As a:** Owner
- **I want:** the "Pricing" switch, owner-level and off by default, moved from the AppShell dev switch to the settings page, with the change checked on the server and audited like every other setting
- **So that:** only the owner decides when value sockets appear, and the change leaves a trace (FR-13-10, BR-13-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given `pricingEnabled` false, when Sanjay Seth switches Pricing on, then the stored value is true, an audit entry reads "pricingEnabled false → true" with his name, and every open screen shows the value sockets on its next render (epic acceptance criterion 4).
  2. Given Rajesh Verma (Staff), when he calls Update Setting for `pricingEnabled`, then the server refuses with "Only the owner can change the shop rules." and the value stays false.
  3. Given a production build, when any role opens the app shell, then the AppShell `PricingToggle` dev switch is not present.
  4. Given Pricing is switched on or off, when a piece card such as TAG-8841 renders, then its weights (pure gold 41.590 g, gross 48.650 g, stones 7.060 g) and layout are unchanged; only the value sockets fill or collapse.
- **Rules enforced on the server:** Owner only; every other role is refused (EP-13-S2). Audited with no exception (EP-06-S8). This story stores the flag only; what it reveals (gold rate, piece value, budget) is EP-42. No price is computed here.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14; consumed by EP-42 screens.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `pricingEnabled`, before, after.
- **Data changes:** Updates `settings.pricingEnabled`, version, updated at, updated by. No money fields.
- **UI reference:** `docs/ux/mockups/15-value-ready.svg` ("ONE SWITCH, OWNER-LEVEL, DEFAULTS OFF", "Pricing · Off today"). The switch's place on the shop settings page is not yet designed (EP-13-S13).
- **Non-functional checks:** Security: the AppShell dev switch is removed from production builds (EP-08-S19), so the server check is the only path. Audit: `pricingEnabled` writes an entry like any other key. Precision: weights never depend on the flag.
- **Depends on:** EP-13-S2, EP-13-S3, EP-06-S8, EP-08-S19
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S10: Owner can set the edit-token rule (after G18 is answered)

- **Story ID:** EP-13-S10
- **Title:** Owner can set the edit-token rule (after G18 is answered)
- **As a:** Owner
- **I want:** the "YOUR RULE · Code before a tag edit" switch to set `requireEditToken`, within whatever limit the G18 answer sets
- **So that:** the owner's rule on whether staff need his WhatsApp code before a tag edit is stored and enforced on the server, not only shown (FR-13-7, BR-13-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given `requireEditToken` true, when Sanjay Seth opens `decisions`, then the rule card reads "Code before a tag edit · On" and "Staff must get your WhatsApp code first."
  2. Given G18 is answered "the owner may switch it off", when Sanjay switches it off and saves, then `requireEditToken` is false and an audit entry reads "requireEditToken true → false".
  3. Given G18 is answered "tokens are always required", when anyone calls Update Setting for `requireEditToken` with false, then the server refuses with a sentence saying the edit code is always required, and the card shows the rule as fixed with no switch.
  4. Given Rajesh Verma (Staff), when he calls Update Setting for `requireEditToken`, then the server refuses with "Only the owner can change the shop rules."
  5. Given any value, when the edit-apply flow in EP-25 runs, then it reads `requireEditToken` from the server settings, never from a client value.
- **Rules enforced on the server:** Owner only (EP-13-S2). Whether false is an allowed value depends on G18; until answered, the server accepts only true. Audited. Token generation and expiry are EP-25 and EP-10-S8, not this story.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), action (`setting_changed`), ref `requireEditToken`, before, after.
- **Data changes:** Updates `settings.requireEditToken`, version, updated at, updated by.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("YOUR RULE", "Code before a tag edit", "Staff must get your WhatsApp code first.").
- **Non-functional checks:** Security: PRODUCTION-SCOPE §5 requires 6-digit single-use edit tokens; the switch does not ship until G18 is answered (epic section 16 risk). Open question G18: should the owner be able to switch off the edit token.
- **Depends on:** EP-13-S2, EP-13-S3, EP-10-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S11: Owner can enter shop hours and holidays for the lead timer

- **Story ID:** EP-13-S11
- **Title:** Owner can enter shop hours and holidays for the lead timer
- **As a:** Owner
- **I want:** to enter an opening and closing time for each weekday, mark a weekday closed, and add holidays with a date and label, through Read Shop hours and Update Shop hours
- **So that:** the 8-hour lead timer counts shop hours, not clock hours, and does not fire overnight or on a holiday (FR-13-14, BR-13-2, BR-13-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given A2 confirms shop hours, when Sanjay Seth sets Monday to Saturday 10:00 to 20:00 and Sunday closed and saves, then seven ShopHours rows are stored in Asia/Kolkata local time and an audit entry records before and after.
  2. Given those hours and `leadSlaHours` 8, when a lead arrives on Monday at 18:00 Asia/Kolkata, then the due time read by the EP-10-S5 SLA job is Tuesday 16:00 Asia/Kolkata (2 hours on Monday, 6 on Tuesday).
  3. Given Sanjay adds the holiday Monday 2026-11-09 "Diwali", when a lead arrives on Saturday 2026-11-07 at 19:00 Asia/Kolkata, then no shop hours are counted on Sunday or on 2026-11-09, and the due time is Tuesday 2026-11-10 at 17:00 Asia/Kolkata.
  4. Given a weekday whose closing time is before its opening time, when Sanjay saves, then the server refuses it as a validation error and nothing changes.
  5. Given Rajesh Verma (Staff), when he calls Read Shop hours, then he gets the hours; when he calls Update Shop hours, then the server refuses with "Only the owner can change the shop rules."
  6. Given A2 is answered "clock hours", when this story is reviewed, then it is not built and the lead timer label says clock hours.
- **Rules enforced on the server:** Read Shop hours for Owner, Staff and System; Update Shop hours Owner only (EP-05-S2). Times are local Asia/Kolkata and converted to UTC when the due time is computed. One row per weekday; holiday dates unique. Audited in the same transaction.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14, so inboxes recompute lateness.
- **Audit entry written:** Yes: actor, time, entity (shop hours or holiday), action (`setting_changed`), before, after.
- **Data changes:** Migration adds ShopHours (weekday, opens at, closes at, closed flag) and Holiday (date unique, label). Replaces the EP-10-S5 replaceable due-time function with one that reads these tables.
- **UI reference:** Not yet designed (shop-hours calendar). The label it changes is on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("shop hours, not clock hours").
- **Non-functional checks:** Time: stored local, converted to UTC on the server; day boundaries in Asia/Kolkata (EP-10-S10). Open decision A2: shop hours or clock hours, and what the hours and holidays are; the whole story waits on it.
- **Depends on:** EP-13-S2, EP-13-S3, EP-13-S4, EP-10-S5, EP-10-S10, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S12: Owner can create, rename and close branches (if D7 multi-branch)

- **Story ID:** EP-13-S12
- **Title:** Owner can create, rename and close branches (if D7 multi-branch)
- **As a:** Owner
- **I want:** Create Branch, Update Branch (rename, close) and List Branches operations over branch records with id, name, short name and status `open` or `closed`
- **So that:** owner screens can show "All branches", staff screens can show their own showroom, and users, scales, parcels and leads can be attached to a branch (FR-13-15, FR-13-16, BR-13-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given D7 is multi-branch, when Sanjay Seth adds a branch named "Anna Nagar", then it is stored with status `open` and appears in the "Which counter / branch" picker on `staff-new` and in the "All branches" filter (epic acceptance criterion 5).
  2. Given an open branch "Main showroom" exists, when Sanjay creates or renames another branch to "Main showroom", then the server refuses with a sentence saying an open branch already has that name.
  3. Given Sanjay closes "Anna Nagar", when anyone then adds a user, scale or parcel to it, then the server refuses, and its past pieces, parcels and leads still show the branch name.
  4. Given Rajesh Verma (Staff), when he calls List Branches, then he gets the open branches; when he calls Create Branch or Update Branch, then the server refuses with `forbidden`.
  5. Given D7 is single shop, when the product runs, then exactly one branch row exists (from EP-02-S3), no create or close control is shown, and the operations are not exposed.
- **Rules enforced on the server:** Create and Update Branch Owner only; List Branches Owner and Staff (EP-05-S2). Names unique among open branches. Status moves `open` to `closed` only; a closed branch accepts no new users, scales or parcels and is never deleted. Each change is audited in the same transaction.
- **Live events emitted / consumed:** None in the catalogue. Branch changes are rare; screens pick them up on next read.
- **Audit entry written:** Yes: actor, time, entity (branch), action (branch created, renamed, closed), before, after.
- **Data changes:** Migration adds short name, status and created at to `branches` (EP-02-S3). Branch keys on users, scales, pieces, parcels and leads are added by EP-02 migrations if D7 is multi-branch. Adds the three operations to the shared contract.
- **UI reference:** `docs/ux/mockups/25-onboard-staff.svg`, route `staff-new` ("Which counter / branch", "Main showroom"); "All branches" header on mockups 08, 13 and 25. Branch management itself is not yet designed.
- **Non-functional checks:** Concurrency: two creates with the same name at once, one succeeds (unique constraint among open branches). Open decision D7: one shop or several, settings shop-wide or per branch, stock branch-scoped; the story is built only if D7 says multi-branch.
- **Depends on:** EP-02-S3, EP-02-S4, EP-03-S1, EP-03-S7, EP-05-S2, EP-06-S2, EP-06-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S13: Owner can see all settings on one settings page

- **Story ID:** EP-13-S13
- **Title:** Owner can see all settings on one settings page
- **As a:** Owner
- **I want:** one shop settings page that loads every setting from the server and lets me change the lead timer, late-lead audience, channels, auto-send wishes and send time, ageing threshold, pricing switch, edit-token rule and, where built, shop hours and branches, with loading, error and refusal states
- **So that:** the owner has one place for the shop rules instead of controls spread over `decisions`, `wishes` and the AppShell dev switch (FR-13-2, BR-13-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth opens the settings page, when the data arrives, then he sees the current value of every key from Read Settings and a link to the change history (EP-13-S3).
  2. Given the page is loading, when Read Settings has not answered, then a loading state shows (EP-08-S3); given it fails, then "Try again" shows (EP-08-S4).
  3. Given Sanjay saves a change the server refuses, such as 0.5 lead hours, when the answer arrives, then the server's sentence "The lead timer must be at least 1 hour." shows next to the field and the field returns to the stored value (EP-08-S5).
  4. Given Rajesh Verma (Staff), when he tries to open the settings route, then it is not in his rail and opening its address directly shows no settings controls (EP-08-S13).
  5. Given another owner session changes `leadSlaHours` while Sanjay has the page open, when the change arrives, then the field updates by itself within about a second (EP-13-S14).
- **Rules enforced on the server:** Every save goes through Update Setting with its role, type and version checks (EP-13-S2). Hiding the route from staff is a convenience; the server check is the control.
- **Live events emitted / consumed:** consumed: "Setting changed" (proposed, G26).
- **Audit entry written:** No from the page itself. Each accepted save is audited by EP-13-S3.
- **Data changes:** None in the product database. Adds the settings page route to the web app.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3: shop settings page for SLA hours, edit-token rule, ageing threshold, wish time). Existing controls to reuse: `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("THE RULES BEHIND THESE ALERTS"); `docs/ux/mockups/15-value-ready.svg` (pricing switch).
- **Non-functional checks:** Performance: the page loads in under 2 seconds on a shop connection. Security: owner-only route on the client, server check on every save. Open question G12: if staff may change some keys, a staff view of those keys is needed.
- **Depends on:** EP-13-S1, EP-13-S2, EP-13-S3, EP-13-S4, EP-13-S5, EP-13-S6, EP-13-S7, EP-13-S8, EP-13-S9, EP-13-S10, EP-08-S3, EP-08-S4, EP-08-S5, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-13-S14: System can push a changed setting to open screens live

- **Story ID:** EP-13-S14
- **Title:** System can push a changed setting to open screens live
- **As a:** System
- **I want:** every accepted settings, shop-hours or holiday change to publish a "Setting changed" event after its transaction commits, carrying the key, the new value and the version, to every open owner and staff connection, and to clear any cached settings read
- **So that:** inboxes recompute lead lateness, the Decisions rules panel refreshes and the pricing sockets appear or hide without a reload (FR-13-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's lead inbox is open, when Sanjay Seth changes `leadSlaHours` from 8 to 6, then the inbox recomputes lateness against 6 hours within about a second without a reload (epic acceptance criterion 1).
  2. Given Deepak Rao's stock screen is open, when Sanjay switches `pricingEnabled` on, then the value sockets show on its next render without a reload (epic acceptance criterion 4).
  3. Given the change transaction rolls back, when it ends, then no "Setting changed" event is published (EP-07-S1).
  4. Given Vijay Kumar (Karigar) is connected, when any setting changes, then he receives no "Setting changed" event.
  5. Given a server-side cache of settings, when "Setting changed" is published, then the next Read Settings and the next SLA job read the new value.
  6. Given Rajesh's connection was down during the change, when it reconnects, then he catches up from the last sequence number and sees the new value (EP-07-S7).
- **Rules enforced on the server:** Published only after commit (EP-07-S1), stamped with sequence number, entity id and version (EP-07-S2). Delivered to owner and staff roles only (EP-07-S5). Events carry no secret and no money amount.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26); consumers EP-28, EP-31, EP-32, EP-42.
- **Audit entry written:** No. The change itself is audited by EP-13-S3.
- **Data changes:** None in the product database. Adds "Setting changed" to the event list and the client event-to-read map (EP-08-S8).
- **UI reference:** No screen of its own. Effects show on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions`, and on the lead inbox.
- **Non-functional checks:** Performance: event reaches open screens within about 1 second. Concurrency: the version in the event lets a screen ignore an older value that arrives late. Open question G26: whether "Setting changed" is accepted into the live event catalogue.
- **Depends on:** EP-13-S2, EP-13-S3, EP-07-S1, EP-07-S2, EP-07-S4, EP-07-S5, EP-07-S7, EP-08-S8, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D7: is this one shop or several branches? Are settings shop-wide or per branch? Is stock branch-scoped? (EP-13-S1, S12)
- A2: does the 8-hour lead timer count shop hours or clock hours? If shop hours, what are the hours and holidays? (EP-13-S4, S11)
- A3: are staff warned about a late lead before the owner, and is that a setting or a fixed rule? (EP-13-S5)
- G12: which settings may staff change (for example auto-send wishes), and which are owner-only? (EP-13-S2, S7, S13)
- G18: should the owner be able to switch off the edit token (`requireEditToken`) when PRODUCTION-SCOPE §5 requires tokens? (EP-13-S10)
- G5: what is the ageing threshold for "gold sitting too long", in days, and is it one number for all pieces? (EP-13-S8)
- May the owner switch all three notification channels off at once, or must one stay on? (EP-13-S6)
- What time of day do wishes go out (EP-10 says 9 am), and can the owner change it? (EP-13-S7)
- G26: is "Setting changed" accepted into the live event catalogue? (EP-13-S4 to S11, S13, S14)
