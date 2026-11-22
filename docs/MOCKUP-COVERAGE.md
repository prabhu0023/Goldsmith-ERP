# Mockups vs production epics: coverage check

Checked every labelled element on mockups 01–28 and the navigation map against the 45 epics in
`PRODUCTION-SCOPE.md`. Result: every screen maps to at least one epic, but the screens contain
features no epic owns, and several epics need screens that were never drawn.

## 1. Screen → epic map

| Mockup | Main epic | Elements that land in other epics |
| --- | --- | --- |
| 01 foundations | EP-08 (gap G1 resolved) | State words → EP-22; status colours used everywhere |
| 02 staff home | EP-31 | Gold out today → EP-26; parcel short → EP-23; untagged → EP-21; quote expiring → out of scope, no holds in v1 (gap G6 resolved); birthdays → EP-33; start tiles → EP-26, EP-21, EP-17 |
| 03 showroom stock | EP-22 | Edit tag → EP-25; edit history → EP-06; inclusions → EP-15, EP-21; add to sale → EP-26; share → EP-34; "Sold out · Order another from Vijay" → gap G3 |
| 04 parcel match | EP-23 | Item checklist → EP-21; "Print parcel sheet" → EP-36 (gap G8); last-digit middle case → open Q5d |
| 05 edit propose / apply | EP-25 | Token to WhatsApp → EP-12; audit → EP-06 |
| 06 stock-out | EP-26 | Scan tag → EP-36; value column → EP-42; scrap exit → EP-27 |
| 07 QC check | EP-21 | "Send this tag back to Deepak" → EP-21 |
| 08 owner home | EP-32 | "Code before a tag edit · On" → EP-13 + EP-25; parcel → EP-23; code request → EP-25; "Gold sitting too long" → gap G5; "Push on WhatsApp" → EP-34; "Melt and remake" → EP-27 + EP-19; gold location → EP-18; karigars worst-first, ledger → gap G4 |
| 09 karigar phone | EP-20 | Gold with me → EP-18; हिन्दी toggle → EP-44, later; v1 English only (gap G2 resolved); photo → EP-09; message to desk → EP-11 |
| 10 navigation map | all | — |
| 11 roles | EP-05 | Stop the line → EP-24 |
| 12 lifecycles | EP-28, EP-19, EP-21, EP-22, EP-25 | "Held for a customer" → out of scope, no holds in v1 (gap G6 resolved) |
| 13 notifications | EP-32 | Raise / clear → EP-24; late leads → EP-28, EP-10; overdue jobs → EP-19; "staff first, then me", channels → EP-11 |
| 14 match rule | EP-23 | Scale registry → EP-14; trays → EP-21 |
| 15 value ready | EP-42 | — |
| 16 lead inbox | EP-28 | WhatsApp / email sources, "please check" → EP-29 |
| 17 lead review / create | EP-29, EP-28 | "Not an order" → EP-29; "known customer" match → gap G7 |
| 18 convert lead | EP-30 | Stock → EP-30 links the line to an in-stock piece for reference, not reserved; "Hold TAG-8841 for them" → out of scope for v1 (gap G6 resolved); make → EP-19 |
| 19 order copy | EP-19 | Images → EP-09; gold issued → EP-18; karigar picker → EP-16 |
| 20 parcel arrival | EP-21 | Scale picker → EP-14 |
| 21 tag one item | EP-21 | HUID / tag format → EP-15 |
| 22 owner clear mismatch | EP-23 | "Is this like him?" history → gap G4 |
| 23 onboard customer | EP-17 | Wish dates → EP-33; budget / spend → EP-42 |
| 24 onboard karigar | EP-16 | Language → EP-44, later; v1 English only (gap G2 resolved); wastage → EP-16, EP-18 |
| 25 onboard staff | EP-05 | Sales counted → EP-43 |
| 26 wishes | EP-33 | Consent → EP-17, EP-39 |
| 27 broadcast | EP-34 | "Schedule for Deepavali eve" → EP-10; delivery and replies → EP-12 |
| 28 catalogue share | EP-34 | "Copy a link" → gap G9; replies become leads → EP-29 |

## 2. Features on the mockups that no epic owns

| Gap | Seen on | What is missing | Suggested home |
| --- | --- | --- | --- |
| G1 | All screens; 01 | **Resolved → became EP-08 Front-end production foundation.** Was: front-end foundation for production (shared design system, API client, signed-in app shell, live-subscription hooks, loading / error / reconnecting / offline states); no epic rewired the prototype UI to the API | EP-08 (Layer A, M1, before every feature epic) |
| G2 | 09, 24 | **Resolved → deferred to EP-44; v1 English only.** Was: localisation, Hindi and Tamil for the karigar app, possibly for staff | EP-44 Localisation (Layer F, Later) |
| G3 | 03 | **Design master and reorder**: "Sold out" is a fact about a design, not a piece; "Order another from Vijay" creates an order copy from a past piece | Extend EP-15 (design master) and EP-19 (reorder entry point) |
| G4 | 08, 22 | **Karigar scorecard**: loss %, days late, rating, last-six-parcel gaps. Rating formula undefined | Extend EP-16, with figures from EP-18 and EP-19 |
| G5 | 08 | **Ageing / dead-stock alert**: "196.4 g not moved in 90 days"; threshold setting | Extend EP-32 (alert) and EP-13 (threshold) |
| G6 | 02 | **Resolved: no holds in v1.** If the shop can sell a piece, nobody can hold it, so there is no hold expiry; the "Quotation expires today" card is out of scope. Was: hold expiry with no rule defined | Decided; EP-22, EP-30, EP-31 updated; "Holds: deferred, not in v1" in PRODUCTION-SCOPE §6 Later notes |
| G7 | 17 | **Customer matching**: recognise a known customer by phone when a PO or manual lead arrives; avoid duplicates | Extend EP-17 and EP-29 |
| G8 | 04 | **Parcel sheet printing** (not just tag labels) | Extend EP-36 |
| G9 | 28 | **Public catalogue link**: a customer opens a shared showcase without signing in. A new public surface with its own security | Extend EP-34, with security review in EP-39 |

## 3. Epics that need screens no mockup shows

| Epic | Missing screen |
| --- | --- |
| EP-04 Authentication | Sign-in (phone and password), set password from the activation link, forgot password and reset, signed-out and locked-out states |
| EP-08 Front-end foundation | Loading, read-error, reconnecting, offline and session-ended states |
| EP-05 Users | User list (awaiting activation, locked), add / edit user with email, resend activation, unlock, deactivate, account menu replacing the role switcher |
| EP-06 Audit log | Security log list and filters |
| EP-11 Notifications | Notification centre for staff; per-user channel preferences |
| EP-13 Settings | Shop settings page (SLA hours, edit-token rule, ageing threshold, wish time) |
| EP-14 Scale registry | Add / edit scale (mockup 14 explains the rule but is not a form) |
| EP-16 Karigar master | Karigar list and ledger / scorecard page |
| EP-17 Customer master | Customer directory and customer detail |
| EP-18 Metal pool | Pool balance and ledger page |
| EP-19 Karigar jobs | Job tracker board with overdue lane ("See tracker" on 13) |
| EP-20 Karigar portal | "Gold" and "Me" tabs (no offline or sync status screen in v1, D6) |
| EP-21 Parcel intake | Parcels-in list; tray entry |
| EP-35 Reports | Everything (never designed) |
| EP-45 Shop setup wizard | Everything (never designed): setup key, shop details, owner account and "check your email", scales, basic settings, invite, finish |

The prototype built simple versions of several of these without a mockup (parcels list, customers,
karigars, staff, scales, security log, metal pool). They need a design pass before production.
