# EP-13: Shop settings

## 1. Summary

This epic stores the shop's own rules. Decision D7 is one shop, no branches, so there are no branch records.
Settings are the few numbers and switches the owner sets once and changes rarely: how many hours before a lead is
late, who hears about a late lead first, which channels alerts go out on, whether the owner's code is asked before a
tag edit, whether birthday wishes send themselves, the ageing threshold for gold sitting too long, and the pricing
switch. Today these live in an in-memory `Settings` object that any role can change. The business needs them stored,
changed only by the right person, audited, and read by the server, because the lead timer, the notification rules and
the edit token all depend on them. The mockups say "All branches" on owner screens and "Main showroom" on staff
screens; with one shop and no branches (D7) these labels show the shop name. The epic was called "Branches and shop
settings" before D7 was decided; its branch story keeps its ID and is marked deferred.

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Partial. A `Settings` object and `setSetting` transition exist, the owner rules panel on `decisions` edits the lead timer, late-lead audience, channels and edit-token switch, and `wishes` flips auto-send; there is no owner check, no ageing threshold and no shop-hours calendar.

## 3. Roles involved

- Owner: reads and changes every setting; sees the change history.
- Staff: reads the settings that shape their screens (lead timer, auto-send state); whether staff may change any setting is open (G12).
- Karigar: not involved; the karigar portal reads no shop setting.
- System: validates each change, writes an audit entry, applies the new value to timers and alerts, and emits the proposed "Setting changed" event.

## 4. In scope

- One settings record for the shop, keyed by its shop ID (D7), with typed keys and defaults taken from the seed.
- The shop's single default location "Main shop" (created with the shop, EP-02-S3, EP-45): readable by owner and staff, shown where the mockups print "Main showroom". It cannot be added to, renamed into a branch or removed in v1.
- Lead SLA hours, minimum 1 hour, default 8. The setup wizard (EP-45) asks for it once at first run.
- Late-lead audience: `staff_then_owner` or `owner_only`.
- Notification channels: WhatsApp, in the app, email, each on or off.
- Edit-token rule `requireEditToken`, shown on mockup 08 as "Code before a tag edit · On" (its interaction with PRODUCTION-SCOPE §5 is open, G18).
- Auto-send wishes switch `autoSendWishes`, default off.
- Wish send time (the 9 am wishes run in EP-10 reads it).
- Ageing / dead-stock threshold in days, read by the owner alert in EP-32 (G5). The setting lives here; the value is a decision.
- Pricing switch `pricingEnabled`, owner-level, default off; this epic stores it, EP-42 decides what it turns on.
- Shop-hours calendar (opening and closing time per weekday, holidays) if A2 confirms the lead timer counts shop hours. The setup wizard (EP-45) asks for opening hours once at first run.
- A server-side permission check on every settings change.
- An audit entry for every change, including the pricing switch.
- A settings read operation every client and background job can call.

## 5. Out of scope

- Computing lead lateness and running the SLA timer (EP-28, EP-10).
- Sending alerts on the chosen channels and the escalation order (EP-11).
- The owner Decisions home and its rules panel layout (EP-32).
- The ageing alert card itself, "196.4 g not moved in 90 days" (EP-32).
- Sending the wishes (EP-33).
- What the pricing switch reveals: gold rate, piece value, budget, invoice amount (EP-42).
- The edit-token flow, token generation and expiry (EP-25).
- Scale records and counter assignment (EP-14).
- Shop details (name, address, GSTIN, logo) and the first-run setup wizard (EP-45).
- Branches: not in v1 (D7, one shop, no branches). Multi-shop is deferred (PRODUCTION-SCOPE §6 Later notes).
- The audit store and its viewer (EP-06).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Settings {pricingEnabled, leadSlaHours, requireEditToken, notifyChannels {whatsapp, app, email}, lateLeadAudience: 'staff_then_owner' | 'owner_only', autoSendWishes}`; part of `AppState.settings`.
- Seed (`src/data/seed.ts`): `pricingEnabled false`, `leadSlaHours 8`, `requireEditToken true`, `notifyChannels` WhatsApp and app on, email off, `lateLeadAudience staff_then_owner`, `autoSendWishes false`.
- `src/store/transitions.ts` `setSetting(key, value)`: rejects `leadSlaHours` below 1 with "The lead timer must be at least 1 hour."; writes audit kind `setting_changed` with summary "Rule changed: key = value"; skips the audit for `pricingEnabled`; has no `requireOwner` call.
- `src/components/home/OwnerDecisions.tsx` rules panel on route `decisions`: hours input, late-lead audience choice, three channel toggles, edit-token toggle.
- `src/components/marketing/Wishes.tsx` on route `wishes`: `actions.setSetting('autoSendWishes', !auto)` with no role check, so staff can flip it.
- `src/components/shell/AppShell.tsx`: a dev switch flips `pricingEnabled` for any role, with no audit.
- `src/components/stock/EditApply.tsx` reads `requireEditToken` to decide whether a token is asked.
- No branch entity, and none is needed (D7). Screens print "Main showroom" (mockups 02, 03) and "All branches" (mockups 08, 13, 22, 24, 25) as static text; in production both show the shop name.
- Reusable: the `Settings` key list and defaults, the 1-hour minimum rule and its sentence, the rules panel layout, the `setting_changed` audit kind.
- Must be rebuilt server-side: storage, the owner-only check (G12), audit of every key including the pricing switch, the shop-hours calendar, and the push of a changed value to open screens and jobs.

## 7. Functional requirements

- FR-13-1. The server stores one settings record for the shop, keyed by its shop ID, created with the seed defaults when the shop is created.
- FR-13-2. Any signed-in owner or staff user can read the current settings; karigar users cannot.
- FR-13-3. The owner can change the lead SLA hours to any value of 1 hour or more.
- FR-13-4. The server rejects a lead SLA below 1 hour with "The lead timer must be at least 1 hour."
- FR-13-5. The owner can set the late-lead audience to `staff_then_owner` or `owner_only`.
- FR-13-6. The owner can switch each notification channel (WhatsApp, in the app, email) on or off.
- FR-13-7. The owner can switch `requireEditToken` on or off, subject to the outcome of G18.
- FR-13-8. The owner can switch `autoSendWishes` on or off and set the daily wish send time.
- FR-13-9. The system supports an ageing threshold in days, set by the owner, that EP-32 reads to raise the "gold sitting too long" alert (G5).
- FR-13-10. The owner can switch `pricingEnabled`; the change is audited like every other setting.
- FR-13-11. The server refuses any settings change from a role that the permission matrix does not allow, with "Only the owner can change the shop rules." (the exact allowed set is G12).
- FR-13-12. Every accepted change writes an audit entry with key, old value, new value, actor and time.
- FR-13-13. A change to a setting reaches every open owner and staff screen within about 1 second (proposed event "Setting changed").
- FR-13-14. If A2 confirms shop hours, the owner can enter opening and closing times per weekday and mark holidays, and the lead timer reads them.
- FR-13-15. Deferred: no branches in v1 (D7). Was: the owner can create, rename and close a branch.
- FR-13-16. Deferred: no branches in v1 (D7). Was: a closed branch keeps its history.
- FR-13-17. The settings record is read and written only for the caller's own shop; the shop ID comes from the session, never from the request.
- FR-13-18. Read Settings also returns the shop's one location ("Main shop"); no operation creates, transfers between or closes locations in v1 (D7).

## 8. Business rules

- BR-13-1. The lead timer is at least 1 hour. [src/store/transitions.ts setSetting]
- BR-13-2. The lead timer default is 8 hours and counts shop hours, not clock hours, pending confirmation. [mockup 13; SCOPE-ANALYSIS App. A, A2; PRODUCTION-SCOPE §5 Time]
- BR-13-3. Staff hear about a late lead first, then the owner, pending confirmation. [mockup 13; SCOPE-ANALYSIS App. A, A3]
- BR-13-4. The parcel match rule has no setting: "A parcel comes to me when it does not match exactly". There is no tolerance field anywhere. [mockup 13; mockup 14; SCOPE-ANALYSIS App. D, App. E]
- BR-13-5. The pricing switch is owner-level and defaults off. [mockup 15; SCOPE-ANALYSIS App. G]
- BR-13-6. Every settings change is audited. [src/types/jewellery.ts AuditKind setting_changed; PRODUCTION-SCOPE §5 Audit]
- BR-13-7. Every permission is checked on the server; hiding the rules panel from staff is not a control. [PRODUCTION-SCOPE §5 Security]
- BR-13-8. One shop, no branches in v1: where the mockups say "All branches" or "Main showroom", the screen shows the shop name. [D7, decisions/tenancy-and-branches.md; mockups 08, 13, 02, 03]
- BR-13-9. Edit tokens are required by PRODUCTION-SCOPE; the prototype also offers an owner switch "Code before a tag edit". [PRODUCTION-SCOPE §5 Security; mockup 08; gap G18]
- BR-13-10. Times are stored in UTC and shown in Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- Settings: shop ID (unique, one row per shop), `leadSlaHours` (number, at least 1), `lateLeadAudience` (enum), `notifyChannels` (three booleans), `requireEditToken` (boolean), `autoSendWishes` (boolean), `wishSendTime` (local time of day), `ageingThresholdDays` (integer, nullable until decided), `pricingEnabled` (boolean, default false), updated at, updated by, version.
- ShopHours (if A2 confirms): shop ID, weekday, opens at, closes at (local time); Holiday: shop ID, date, label.
- No Branch entity and no branch key (D7). The single Location row ("Main shop") is created in EP-02-S3; this epic only reads it.
- No weight fields. No money fields; `pricingEnabled` only switches the `ValueSlot` sockets, and the money logic belongs to EP-42.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Settings | Current values for screens and jobs | Owner, Staff, System |
| Update | Setting | Change one key with validation and audit | Owner (set per G12) |
| List | Setting changes | History of changes, from the audit log | Owner |
| Read | Shop hours | Opening hours and holidays for the SLA clock | Owner, Staff, System |
| Update | Shop hours | Change opening hours or holidays | Owner |

## 11. Live events

- Emits (proposed, not in catalogue): "Setting changed" — when the owner changes any setting, so inboxes recompute the SLA, the Decisions rules panel refreshes and the pricing sockets appear or hide (gap G26; consumers EP-28, EP-31, EP-32, EP-42).
- Consumes: none. Settings change only by direct owner action.

## 12. Screens and UX references

- Route ids: `decisions` (rules panel in OwnerDecisions), `wishes` (auto-send toggle).
- Mockups: `13-notifications-escalation.svg` ("THE RULES BEHIND THESE ALERTS": "A lead is late after 8 hours, shop hours, not clock hours", "A parcel comes to me when it does not match exactly", "Who hears about a late lead · Staff first, then me"), `08-owner-home.svg` ("YOUR RULE · Code before a tag edit · On", "Gold sitting too long" alert, G5), `15-value-ready.svg` (pricing switch, owner-level, defaults off), `25-onboard-staff.svg` ("Which counter / branch"; the branch part is not used in v1, D7).
- The AppShell pricing dev switch is not a production screen; the switch moves to the settings page.
- Not yet designed (MOCKUP-COVERAGE §3): shop settings page (SLA hours, edit-token rule, ageing threshold, wish time). The shop-hours calendar is also undrawn.

## 13. Non-functional requirements

- Security: every settings write checks the caller's role on the server; the AppShell switch and the `wishes` toggle no longer bypass it.
- Audit: every key, including `pricingEnabled`, writes an append-only entry with old and new value.
- Concurrency: two owners saving the same setting at once are resolved by the version field; the second save gets "This rule was changed a moment ago. Check and save again."
- Time: `wishSendTime` and shop hours are local Asia/Kolkata times; the server converts to UTC when scheduling.
- Performance: settings are read on every screen load and by every SLA job; the read stays under 50 ms (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none) and may be cached until "Setting changed" arrives.
- Availability: a missing settings record falls back to the seed defaults, never to "everything off".

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-05, EP-08
- Downstream: EP-14, EP-40, EP-41, EP-45.

## 15. Epic acceptance criteria

1. Given the owner on the settings page, when they change the lead timer from 8 to 6 hours, then the value is stored, an audit entry reads "leadSlaHours 8 → 6" with their name, and open inboxes recompute lateness within about a second.
2. Given a staff user, when they call the update-setting operation directly for `leadSlaHours`, then the server refuses and nothing changes (or, if G12 allows staff some keys, only those keys succeed).
3. Given the owner, when they enter 0.5 hours, then the server refuses with "The lead timer must be at least 1 hour."
4. Given pricing is off, when the owner switches it on, then the change is audited and every open screen shows the value sockets on its next render.
5. Given one shop and no branches (D7), when any screen reads settings, then it gets the one settings row for the caller's shop, and no branch operation exists.
6. Done when no code path changes a setting without the server check and an audit entry.

## 16. Risks

- Risk: settings stay changeable by staff because the prototype allowed it on `wishes` and the AppShell switch. Mitigation: deny by default; open G12 is answered before stories start.
- Risk: the `requireEditToken` switch lets the owner turn off a control that PRODUCTION-SCOPE §5 requires. Mitigation: keep G18 open and do not ship the switch until it is answered.
- Risk: multi-shop is added later and settings need to be per shop. Mitigation: the settings row is keyed by shop ID from the start (D7), so a second shop adds a row, not a migration.
- Risk: shop hours are assumed (A2) and the SLA fires at night. Mitigation: build the calendar behind the A2 answer; until then the timer counts clock hours and says so.
- Risk: a cached settings value is stale after a change. Mitigation: the proposed "Setting changed" event invalidates caches.

## 17. Open decisions and questions

- D7 is decided: one shop, no branches; settings are one row per shop ([decision record](../decisions/tenancy-and-branches.md)).
- A2: does the 8-hour lead timer count shop hours or clock hours? If shop hours, what are the hours and holidays?
- A3: are staff warned about a late lead before the owner, and is that a setting or a fixed rule?
- G12: which settings may staff change (for example auto-send wishes), and which are owner-only?
- G18: should the owner be able to switch off the edit token (`requireEditToken`) when PRODUCTION-SCOPE §5 requires tokens?
- G5: what is the ageing threshold for "gold sitting too long", in days, and is it one number for all pieces?
- May the owner switch all three notification channels off at once, or must one stay on?
- What time of day do wishes go out (EP-10 says 9 am), and can the owner change it?
- G26: is "Setting changed" accepted into the live event catalogue?

## 18. Candidate stories

1. EP-13-S1: System can store shop settings with seed defaults
2. EP-13-S2: System can refuse a settings change from a role not allowed to make it
3. EP-13-S3: System can audit every settings change with old and new value
4. EP-13-S4: Owner can change the lead SLA hours
5. EP-13-S5: Owner can set who hears about a late lead first
6. EP-13-S6: Owner can switch notification channels on and off
7. EP-13-S7: Owner can switch auto-send wishes and set the send time
8. EP-13-S8: Owner can set the ageing threshold for gold sitting too long (G5)
9. EP-13-S9: Owner can switch the pricing flag, owner-only and audited
10. EP-13-S10: Owner can set the edit-token rule (after G18 is answered)
11. EP-13-S11: Owner can enter shop hours and holidays for the lead timer
12. EP-13-S12: Owner can create, rename and close branches (Deferred: no branches in v1, D7)
13. EP-13-S13: Owner can see all settings on one settings page
14. EP-13-S14: System can push a changed setting to open screens live
