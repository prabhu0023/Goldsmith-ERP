# EP-44: Localisation · stories

Epic document: [EP-44 Localisation](../epics/EP-44-localisation.md)

Role note: this is a layer F (Later) epic and nothing in it is part of v1, which ships in English only (BR-44-1). Stories where the server stores, serves, falls back, formats or sends on its own use "System". The string extraction story uses "Developer" for the person moving text out of components. The karigar phone (`k-jobs`) is the first screen set; staff and owner screens are in scope only if decided (section 17), so EP-44-S9 is written neutrally. Which languages are enabled is open; examples use Tamil (தமிழ்) and Hindi (हिन्दी) as on mockups 09 and 24. Seed karigars are KG-01 Lakshmi Devi (Tamil), KG-02 Mahesh Soni (Hindi) and KG-04 Vijay Kumar (Hindi); the owner is Sanjay Seth and staff are Rajesh Verma and Deepak Rao. Weights are integers in units of 0.0001 g and shown in grams to 4 decimals in every language (for example 186.4000 g). No price or rupee text is translated here; money formatting belongs to EP-42.

---

## EP-44-S1: System can store languages, message catalogues and per-user language preferences

- **Story ID:** EP-44-S1
- **Title:** System can store languages, message catalogues and per-user language preferences
- **As a:** System
- **I want:** tables for languages (code, display name in its own script, enabled flag), message catalogue entries (language, key, text with parameters, updated at, translated by), per-user language preference (user id, language code, default English) and locale format rules per language, with the karigar's stored language from EP-16 moved into the user preference
- **So that:** every later story reads one source for which languages exist, what each string says in each language and which language each person uses (FR-44-1, FR-44-2, FR-44-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `languages` is inspected, then it holds `en` "English" enabled, and `ta` "தமிழ்" and `hi` "हिन्दी" with `enabled` false until the owner's language list is decided.
  2. Given the migrations have run, when `message_catalogue` is inspected, then each row has `language`, `key`, `text`, `updated_at` and `translated_by`, and a unique index on (`language`, `key`) refuses a second row for the same key in one language.
  3. Given the seed karigars KG-01 Lakshmi Devi (Tamil), KG-02 Mahesh Soni (Hindi) and KG-04 Vijay Kumar (Hindi) with linked user accounts, when the data migration runs, then their `user_language` rows hold `ta`, `hi` and `hi`, and every other user holds `en`.
  4. Given a user with no `user_language` row, when the server reads their language, then it returns `en`.
  5. Given a client calls List Languages while signed in, when the server answers, then only enabled languages are returned with code and display name; given no session, then the call is refused as unauthenticated.
- **Rules enforced on the server:** List Languages and Read Message catalogue need a signed-in user (EP-04-S5). A preference may only name an enabled language. `text` is stored as plain text with named parameters such as `{grams}`; it is never treated as markup. English rows are the source; a non-English row whose key has no English row is refused. The `karigars.language` enum (EP-16-S1) is kept in step with the karigar's user preference or retired by the migration, as decided at build time; it is not a second source.
- **Live events emitted / consumed:** None. A language change refreshes only the user's own screens (epic section 11).
- **Audit entry written:** No. Creating tables and seeding defaults is a migration; changes made later through these tables are audited in EP-44-S12.
- **Data changes:** New tables `languages`, `message_catalogue`, `user_language`, `locale_format_rules` (date order, digit grouping, digits used) (migrations). Data migration from `karigars.language` to `user_language` for karigars linked through `users.karigarId` (EP-05-S13). Adds List Languages and Read Message catalogue to the shared contract. No weight or money column changes.
- **UI reference:** No screen.
- **Non-functional checks:** Security: catalogue text is plain text, so a translation cannot inject markup (epic section 13). Precision: no weight column is touched; weights stay integers in units of 0.0001 g (EP-02). Open question: which languages are enabled (UX-SPEC §7 Q4). Open question: is the language a per-user setting only, or also per device for shared shop devices.
- **Depends on:** EP-02-S1, EP-02-S3, EP-16-S1, EP-05-S13, EP-03-S1, EP-04-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S2: Developer can extract every string of a screen into the English catalogue

- **Story ID:** EP-44-S2
- **Title:** Developer can extract every string of a screen into the English catalogue
- **As a:** Developer
- **I want:** a documented way to replace each inline English string of one screen with a catalogue key, add the English text to the catalogue, and render it through one translation helper, starting with `k-jobs` (`KarigarPhone.tsx`)
- **So that:** every user-facing string on an in-scope screen comes from the catalogue and can be translated without touching the component again (FR-44-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given `KarigarPhone.tsx` after extraction, when its source is searched for user-facing English literals, then none remain and labels such as "My jobs", "GOLD WITH ME", "Make it weigh", "Gold inside, after stones", "Due today", "Where is it now?", "Gold received", "Working on it", "Ready for checking", "Sent to the showroom", "Add a photo (optional)", "Anything to tell the desk?" and "Send the update" come from keys.
  2. Given the English catalogue after extraction, when `k-jobs` is opened with language `en`, then the screen looks and reads the same as before extraction (a visual comparison of the before and after screens shows no text change).
  3. Given a string with a value inside it, such as "across 2 jobs · 0.8% wastage allowed", when it is extracted, then the catalogue text uses named parameters (`{jobs}`, `{allowance}`) and the component passes the values, not a joined string.
  4. Given a string that changes with a count, such as "14 delivered this year", when it is extracted, then the catalogue entry has the plural forms the helper needs, so "1 delivered this year" also reads correctly.
  5. Given the extraction pattern is written down, when a developer follows it for `karigar-new`, then the "Language for their phone" label and the chip names come from the catalogue too.
- **Rules enforced on the server:** None at request time. The catalogue rows are loaded through Update Message catalogue (EP-44-S12 audits the load). The lint rule added in EP-44-S3 fails a build that adds a user-facing literal to an extracted screen.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Writing code changes no business record; loading the English rows is audited as a translation load (EP-44-S12).
- **Data changes:** English rows added to `message_catalogue` for `k-jobs` and `karigar-new`. No schema change.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`; `docs/ux/mockups/24-onboard-karigar.svg`, route `karigar-new`.
- **Non-functional checks:** Performance: the catalogue for a screen loads with the screen inside the 2-second target (epic section 13). Open question: which screens are in scope beyond the karigar phone; each further screen repeats this pattern.
- **Depends on:** EP-44-S1, EP-08-S17, EP-20-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S3: System can fall back to English and report missing translations

- **Story ID:** EP-44-S3
- **Title:** System can fall back to English and report missing translations
- **As a:** System
- **I want:** the translation helper to show the English text when a key has no text in the user's language, report each missing key once to error tracking, and a build check that lists every key missing for each enabled language on each in-scope screen
- **So that:** nobody sees a blank or a raw key, the team learns what to translate, and a release cannot ship an in-scope screen with gaps (FR-44-6, epic acceptance criteria 3 and 6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the key for "Due today" is missing from the Tamil catalogue, when KG-01 Lakshmi Devi (Tamil) opens `k-jobs`, then that label shows "Due today" in English and every other label shows in Tamil (epic acceptance criterion 3).
  2. Given that missing key, when the screen renders, then one report reaches error tracking with language `ta`, the key and the route `k-jobs`, and it is not repeated on every render in the same session.
  3. Given a key missing in both Tamil and English, when the screen renders, then the helper shows the key name inside the English fallback marker in staging, and the build check fails before production.
  4. Given Tamil is enabled and three `k-jobs` keys have no Tamil text, when the missing-translation check runs in CI, then it fails and lists the three keys with their screen.
  5. Given every key on every in-scope screen has text in every enabled language, when the check runs, then it passes (epic acceptance criterion 6).
- **Rules enforced on the server:** Read Message catalogue returns the language's rows plus the English rows for the same screen set, so the fallback works without a second call. The report call carries no personal data: language, key and route only. The CI check reads the catalogue and the extracted keys and blocks the merge on failure (EP-40-S13).
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Showing a fallback and reporting a missing key change no business record.
- **Data changes:** None in the product database. Adds the missing-key report to the error tracking setup and the missing-translation check to the CI pipeline.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` (the screen where the fallback is first seen).
- **Non-functional checks:** Personal data: the report holds no name, phone or customer text (EP-37-S2). Availability: a missing catalogue load falls back to the English rows bundled with the app, so the screen still reads.
- **Depends on:** EP-44-S1, EP-44-S2, EP-37-S2, EP-37-S3, EP-40-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S4: System can return refusal sentences as message keys with parameters

- **Story ID:** EP-44-S4
- **Title:** System can return refusal sentences as message keys with parameters
- **As a:** System
- **I want:** every rule refusal and error from the server to carry a message key and its parameters next to the English sentence, so the screen shows the sentence from the catalogue in the user's language
- **So that:** a karigar who reads Hindi sees why an action was refused in Hindi, and the server's English sentence stays the fallback (FR-44-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a refusal today returns code, sentence "Only the owner can add a karigar or change their wastage allowance.", when the response format is extended, then it also returns `messageKey` (for example `refusal.karigar.owner_only`) and `params` as an object, and the English sentence is unchanged.
  2. Given KG-02 Mahesh Soni (Hindi) and a refusal with a Hindi catalogue row, when the screen shows the refusal (EP-08-S5), then the Hindi sentence is shown with the parameters filled in.
  3. Given a refusal whose key has no Hindi row, when it reaches Mahesh's screen, then the English sentence from the server is shown and the missing key is reported (EP-44-S3).
  4. Given a refusal parameter holds a weight such as 0.5000 g, when it is sent, then the parameter is the integer 5000 in units of 0.0001 g with a weight type, and the screen formats it through EP-44-S5.
  5. Given the contract tests run, when every refusal code in the shared package is checked, then each has a message key and an English catalogue row.
- **Rules enforced on the server:** Each `DomainError` in the shared package (EP-03-S4) declares its key and parameter names; the server fills parameters from data the caller may already see, so a parameter never leaks another karigar's or customer's data. The English sentence is built from the same key and parameters, so both always agree.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. A refusal changes no business record.
- **Data changes:** None in the product database. Extends the error shape in the shared contract (EP-03-S4, EP-03-S5) with `messageKey` and `params`. English rows for every refusal key added to `message_catalogue`.
- **UI reference:** No screen of its own; the sentence shows where EP-08-S5 shows refusals, for example on `k-jobs`.
- **Non-functional checks:** Security: parameters carry only data the caller is allowed to read (EP-05-S3). Precision: weight parameters are integers in units of 0.0001 g.
- **Depends on:** EP-03-S4, EP-03-S5, EP-08-S5, EP-44-S1, EP-44-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S5: System can format dates and numbers per locale with weights in grams to four decimals

- **Story ID:** EP-44-S5
- **Title:** System can format dates and numbers per locale with weights in grams to four decimals
- **As a:** System
- **I want:** one set of formatting helpers in the shared package that format counts, percentages, dates, month names and weekday names per the user's locale in Asia/Kolkata time, and format weights from integer units of 0.0001 g as grams to 4 decimals in every language
- **So that:** dates read naturally in each language while a weight reads the same at every bench (FR-44-7, FR-44-8, BR-44-4, BR-44-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the stored weight 1864000 units, when it is formatted for `en`, `ta` and `hi`, then each shows 186.4000 with the unit g, never rounded to fewer decimals and never converted to another unit (epic acceptance criterion 1).
  2. Given a due date stored as 2026-11-30T19:00:00Z, when it is formatted for a Hindi user, then it shows 1 December 2026 in Hindi month name and date order, because 19:00 UTC is 00:30 on 1 December in Asia/Kolkata.
  3. Given a count of 14 and an allowance of 80 basis points, when they are formatted for each enabled locale, then the grouping and decimal mark follow that locale's rules in `locale_format_rules`.
  4. Given the decided digits for weights are Latin digits, when a weight is formatted for `hi`, then it uses 0 to 9 even if dates use the language's own digits; given the decision is the language's own digits, then the helper uses the digits stored for that language.
  5. Given the weight helpers from EP-02-S2, when the formatting tests run, then every weight case formats from integers with no floating-point step.
- **Rules enforced on the server:** Times are stored in UTC and formatted in Asia/Kolkata only (EP-10-S10). Weights are formatted only from integers through the EP-02-S2 helpers; the helper refuses a non-integer input. The locale comes from the user's preference (EP-44-S1), not from the device, unless a per-device setting is decided.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Formatting changes no record.
- **Data changes:** Rows in `locale_format_rules` for each enabled language. Adds the locale formatting helpers to the shared package.
- **UI reference:** No screen of its own; used on `k-jobs` ("GOLD WITH ME", "Make it weigh", "Gold inside, after stones") and every in-scope screen.
- **Non-functional checks:** Precision: weights keep four decimals and are formatted from integers in every language (epic section 13). Time: dates shown in Asia/Kolkata in every locale. Open question: are weights shown with Latin digits in every language, or with the language's own digits.
- **Depends on:** EP-02-S2, EP-10-S10, EP-44-S1, EP-40-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S6: Owner can set a karigar's language on the onboarding and edit forms

- **Story ID:** EP-44-S6
- **Title:** Owner can set a karigar's language on the onboarding and edit forms
- **As a:** Owner
- **I want:** the "Language for their phone" chips on `karigar-new` and on the karigar edit form, listing the enabled languages in their own script, with my choice saved as the karigar's language preference
- **So that:** a karigar's phone speaks their language from the first sign-in (FR-44-4, BR-44-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `karigar-new` with தமிழ், हिन्दी and English enabled, when he picks தமிழ் and taps "Add this karigar", then the karigar's language is stored as Tamil and an audit entry records it (epic acceptance criterion 5).
  2. Given Sanjay opens the edit form for KG-02 Mahesh Soni, when he changes the language from हिन्दी to English and saves, then Mahesh's preference becomes `en` and the audit entry shows before `hi` and after `en`.
  3. Given only English is enabled, when Sanjay opens `karigar-new`, then the chips are not shown and the karigar is stored with English, as in v1 (EP-16-S3).
  4. Given Rajesh Verma (Staff) calls Update User language for a karigar, when the server checks, then it is refused with "Only the owner can add a karigar or change their wastage allowance." or the decided owner-only sentence, and nothing changes.
  5. Given the request names a language that is not enabled, when the server validates it, then it is refused and the stored language is unchanged.
- **Rules enforced on the server:** Update User language for another user is Owner only (EP-05-S2, EP-16-S2). The language must be enabled (EP-44-S1). On create, the language is part of the same transaction as the karigar record (EP-16-S3) and is stored on the linked user once linked (EP-16-S6). Edits carry the record version (EP-02-S14). Audited in the same transaction (EP-06-S2).
- **Live events emitted / consumed:** None from the catalogue. If the karigar is signed in, their own screens pick up the change on next catalogue read (EP-44-S7).
- **Audit entry written:** Yes: actor, time, entity (karigar or user), entity id, action (`language_changed`), before, after.
- **Data changes:** Writes `user_language` for the karigar's user, or the karigar's stored language until a user is linked. Adds Update User language to the shared contract. No new table.
- **UI reference:** `docs/ux/mockups/24-onboard-karigar.svg`, route `karigar-new` ("Language for their phone", chips தமிழ் / हिन्दी / English). The edit form uses the same chips (EP-16-S4).
- **Non-functional checks:** Security: only the owner may set another user's language (epic section 13). Audit: language changes audited with old and new value. Open question: which languages appear as chips.
- **Depends on:** EP-16-S2, EP-16-S3, EP-16-S4, EP-16-S6, EP-05-S2, EP-06-S2, EP-06-S3, EP-02-S14, EP-44-S1, EP-44-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S7: Karigar can see the phone app in their language

- **Story ID:** EP-44-S7
- **Title:** Karigar can see the phone app in their language
- **As a:** Karigar
- **I want:** the phone app to open in the language stored on my record, with every label, status, button and refusal in that language and my weights in grams to 4 decimals
- **So that:** I can read my jobs at the bench without needing English (FR-44-2, BR-44-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-02 Mahesh Soni's language is Hindi and Hindi is enabled, when he signs in and opens `k-jobs`, then every label on the phone is in Hindi and "GOLD WITH ME" shows his gold as grams to 4 decimals, for example 186.4000 g (epic acceptance criterion 1).
  2. Given Mahesh's job sheet, when it renders in Hindi, then "Make it weigh" 18.2000 g, "Gold inside, after stones" 15.1000 g and the ± 500 mg allowance show with the same numbers as in English.
  3. Given the Tamil and Devanagari fonts are loaded, when the job sheet renders, then body text is at least 15 px and every tappable control is at least 56 px tall in every script.
  4. Given the longest enabled language, when each `k-jobs` view (jobs list, job sheet, status update, gold, me) is shown on a 5-inch screen, then no label is cut off or overlaps another control.
  5. Given Mahesh's account is deactivated while he is signed in, when "User deactivated or role changed" arrives, then he is signed out as in EP-08-S15 with the sign-in screen in his language.
- **Rules enforced on the server:** The language comes from the signed-in user's preference (EP-44-S1); a karigar reads only their own preference and jobs (EP-20-S1). Catalogue reads are limited to the karigar screen set for a karigar. Customer names, notes and PO text are shown as entered and not translated (epic section 5).
- **Live events emitted / consumed:** consumed: "User deactivated or role changed" through EP-08-S15; no language-specific handling.
- **Audit entry written:** No. Reading screens changes nothing.
- **Data changes:** Translated rows in `message_catalogue` for the karigar screen set in each enabled language. Tamil and Devanagari font files added to the portal build.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("My jobs", "GOLD WITH ME", "Make it weigh", "Gold inside, after stones", "Where is it now?", "Send the update"). Translated layouts for longer text are not yet designed.
- **Non-functional checks:** Accessibility: Tamil and Devanagari text meets the UX-SPEC §6 sizes, 15 px text and 56 px targets (BR-44-7). Precision: weights shown to 4 decimals from integers. Performance: the catalogue loads with the screen within 2 seconds. Open question: who translates and approves the texts, and who keeps them up to date when screens change.
- **Depends on:** EP-20-S1, EP-20-S2, EP-20-S3, EP-20-S9, EP-08-S15, EP-44-S1, EP-44-S2, EP-44-S3, EP-44-S4, EP-44-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S8: Karigar can switch the app language with the toggle

- **Story ID:** EP-44-S8
- **Title:** Karigar can switch the app language with the toggle
- **As a:** Karigar
- **I want:** to tap the language chip in the phone header (the हिन्दी chip on mockup 09), pick one of the enabled languages, and see the app switch at once and stay switched
- **So that:** I can change to the language I read best without asking the owner (FR-44-3, BR-44-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-04 Vijay Kumar on `k-jobs` in Hindi, when he taps the language chip and picks English, then every label on the open screen changes to English at once, without a reload (epic acceptance criterion 2).
  2. Given Vijay switched to English, when he signs out and signs in again, then the app opens in English, because Update My language saved `en` to his preference (epic acceptance criterion 2).
  3. Given the chip on the header, when it is measured, then it is a 56 px target and shows the current language in its own script.
  4. Given Vijay's phone is disconnected, when he taps the language chip, then the EP-08-S11 state shows, the chip is disabled with the reason, the language does not change, and nothing is queued (D6 decided: online only).
  5. Given Vijay sends Update My language with a language that is not enabled, when the server validates it, then it is refused and his preference is unchanged.
- **Rules enforced on the server:** Update My language changes only the caller's own preference; the user id comes from the session (EP-03-S3). The language must be enabled. Audited (EP-44-S12). Retries carry an idempotency key (EP-03-S8).
- **Live events emitted / consumed:** None. The change refreshes only the karigar's own screens (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (user), entity id, action (`language_changed`), before, after.
- **Data changes:** Writes `user_language` for the caller. Adds Update My language to the shared contract.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` (हिन्दी chip in the header). The list of choices beyond हिन्दी is not yet designed.
- **Non-functional checks:** Performance: switching takes effect at once on the open screen (epic section 13). Accessibility: the toggle is a 56 px target. Open question: is the language per user only, or also per device for shared shop devices. The dependencies on EP-20-S12a and EP-20-S12b are kept and are deferred (D6).
- **Depends on:** EP-44-S7, EP-03-S3, EP-03-S8, EP-20-S12a, EP-20-S12b
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S9: Staff can choose their own language for staff screens

- **Story ID:** EP-44-S9
- **Title:** Staff can choose their own language for staff screens
- **As a:** Staff
- **I want:** a language choice in the account menu that saves my own preference, so the shell and every in-scope staff screen open in that language after sign-in
- **So that:** staff who read Tamil or Hindi better can use the counter screens in that language, if staff screens are decided to be in scope (FR-44-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given staff screens are in scope and Hindi is enabled, when Deepak Rao opens the account menu and picks हिन्दी, then the rail labels and the open screen switch to Hindi at once.
  2. Given Deepak chose Hindi, when he signs in again on another device, then the shell reads his preference after sign-in and opens in Hindi.
  3. Given Sanjay Seth (Owner) chooses English for himself, when he opens `decisions`, then it is in English while Deepak still sees Hindi on his own device.
  4. Given staff screens are not in scope, when Deepak opens the account menu, then no language choice is shown and the staff screens stay English.
  5. Given a staff screen is in scope but a key is untranslated, when Deepak opens it, then that text shows in English and the key is reported (EP-44-S3).
- **Rules enforced on the server:** Update My language as in EP-44-S8, for any signed-in user. Only enabled languages. Read Message catalogue returns only the screen sets the caller's role may open (EP-05-S2). Customer names and lead text are not translated.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed" through EP-08-S15; no language-specific handling.
- **Audit entry written:** Yes: actor, time, entity (user), entity id, action (`language_changed`), before, after.
- **Data changes:** Writes `user_language` for the caller. English and translated rows for every in-scope staff and owner screen set in `message_catalogue`, extracted by the EP-44-S2 pattern.
- **UI reference:** Not yet designed (language choice in the account menu, EP-05-S12 and EP-08-S14; staff and owner routes in `src/nav.ts` if in scope).
- **Non-functional checks:** Performance: switching takes effect at once; catalogues load within 2 seconds. Open question: which screens are in scope, the karigar phone only or staff and owner screens too; this story is built only if staff screens are in scope. Open question: is the language per user only, or also per device for shared shop devices.
- **Depends on:** EP-05-S12, EP-08-S12, EP-08-S14, EP-08-S15, EP-44-S2, EP-44-S3, EP-44-S5, EP-44-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S10: Owner can register a WhatsApp template in another language

- **Story ID:** EP-44-S10
- **Title:** Owner can register a WhatsApp template in another language
- **As a:** Owner
- **I want:** to add a translation of an existing WhatsApp template (owner edit code, job alert, wish, broadcast or catalogue share) in an enabled language, have it registered with the provider through EP-12, and see its approval status per language
- **So that:** each language has its own approved template, as the provider requires for messages sent outside a conversation (FR-44-9, BR-44-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the English job-alert template is approved, when Sanjay Seth adds a Tamil body with the same variables and submits it, then a template translation row is stored with language `ta`, the body, status "pending" and the provider template id returned by EP-12-S2.
  2. Given the provider approves the Tamil job-alert template, when the status is updated, then the row shows "approved" and the owner's template list shows Tamil approved beside English.
  3. Given the Tamil body leaves out a variable the English template has, such as `{job}`, when Sanjay submits it, then the server refuses it with a sentence naming the missing variable.
  4. Given the provider rejects the template, when the status is updated, then the row shows "rejected" with the provider's reason, and messages keep using the English template.
  5. Given Rajesh Verma (Staff) calls Create Template translation, when the server checks, then it is refused with `forbidden` and nothing is sent to the provider.
- **Rules enforced on the server:** Create Template translation is Owner only (API table, EP-05-S2). The language must be enabled. Variables must match the source template's variables exactly. Registration and status go through EP-12-S2; this story does not call the provider directly. Idempotency key on create (EP-03-S8). No price variable is allowed while pricing is off (EP-40-S10).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (template translation), entity id, action (new kind, for example `template_translation_created`), after (template id, language, body, status).
- **Data changes:** New table `template_translations` with template id (EP-12), language, body, provider template id, approval status, reason (migration). Adds Create and List Template translations to the shared contract.
- **UI reference:** Not yet designed (template translations on the template page of EP-12-S2).
- **Non-functional checks:** Security: owner only on the server. Audit: template translations audited. Open question: which WhatsApp messages need translated templates, and does a customer get a language preference. Open question: who translates and approves the texts.
- **Depends on:** EP-12-S2, EP-05-S2, EP-03-S8, EP-06-S2, EP-44-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S11: System can send each WhatsApp message in the recipient's language

- **Story ID:** EP-44-S11
- **Title:** System can send each WhatsApp message in the recipient's language
- **As a:** System
- **I want:** every WhatsApp send through EP-12-S3 to pick the approved template in the recipient's language, and to use the approved English template when none exists in that language
- **So that:** a Tamil-speaking karigar gets job alerts in Tamil without any send failing for lack of a translation (FR-44-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-01 Lakshmi Devi's language is Tamil and the Tamil job-alert template is approved, when a job is sent to her, then the WhatsApp message uses the Tamil template with her job's variables (epic acceptance criterion 4).
  2. Given KG-02 Mahesh Soni's language is Hindi and the Hindi job-alert template is still "pending", when a job is sent to him, then the English template is used and the send record notes the fallback.
  3. Given a weight variable such as 18.2000 g, when the Tamil message is built, then the weight is formatted from integers to 4 decimals through EP-44-S5.
  4. Given an edit code is sent to an owner whose language is Hindi, when the Hindi edit-token template is approved, then the Hindi template is used and the code is not written to any log or stored message (EP-12-S11).
  5. Given a wish or broadcast to a customer, when customer language preference is not decided, then the English template is used and the consent check still runs (EP-12-S5).
- **Rules enforced on the server:** The template is chosen on the server at send time from the recipient's preference and the approval status (EP-44-S10). Only "approved" translations are used. Consent checks (EP-12-S5, EP-39-S6) and dedupe (EP-11-S1) run as before; the language choice never bypasses them. Customer-entered text is not translated.
- **Live events emitted / consumed:** None from the catalogue. The sends are triggered by the existing notification and wish flows (EP-11-S13, EP-33-S9, EP-34-S7).
- **Audit entry written:** No. Sends are recorded with delivery status by EP-12-S9 and EP-11-S13; this story adds the language used and the fallback flag to that record, not an audit entry.
- **Data changes:** Adds `language` and `fell_back_to_english` to the outbound message record (migration on the EP-12 send table). No new table.
- **UI reference:** No screen.
- **Non-functional checks:** Security: edit code values stay out of logs and stored messages in every language (EP-12-S11). Precision: weight variables formatted from integers to 4 decimals. Availability: a missing or pending translation never blocks a send. Open question: which WhatsApp messages need translated templates, and does a customer get a language preference.
- **Depends on:** EP-12-S3, EP-12-S5, EP-12-S9, EP-12-S11, EP-11-S8, EP-11-S13, EP-04-S4, EP-33-S9, EP-34-S7, EP-39-S6, EP-44-S5, EP-44-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-44-S12: System can audit language changes and translation loads

- **Story ID:** EP-44-S12
- **Title:** System can audit language changes and translation loads
- **As a:** System
- **I want:** an audit entry for every change of a user's language and every load or correction of catalogue rows, written in the same transaction, with the owner able to filter the log by these kinds
- **So that:** the owner can see who changed whose language and who changed which text, and when (FR-44-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth sets a new karigar's language to தமிழ் on `karigar-new`, when the audit log is read, then a `language_changed` entry shows actor Sanjay, the karigar, before none and after `ta` (epic acceptance criterion 5).
  2. Given KG-04 Vijay Kumar switches himself from Hindi to English with the toggle, when the log is read, then a `language_changed` entry shows actor Vijay, before `hi` and after `en`.
  3. Given the owner or the decided translator loads 120 Tamil rows for `k-jobs`, when the load commits, then one `translations_loaded` entry records actor, time, language `ta`, screen set, rows added and rows changed, with before and after text for each changed key.
  4. Given the audit write fails, when the language change or load runs, then the whole change is rolled back and nothing is stored (EP-06-S2).
  5. Given Rajesh Verma (Staff) calls Update Message catalogue, when the server checks, then it is refused with `forbidden` unless the team role decision allows it, and no rows or audit entry are written.
- **Rules enforced on the server:** Audit entries are append-only (EP-06-S1) and written in the same transaction as the change (EP-06-S2). Update Message catalogue is Owner only, or the team as decided. Loaded text is plain text; a row containing markup is refused. Audit reads stay owner only (EP-06-S12).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (user or message catalogue), entity id, action (`language_changed` or `translations_loaded`), before, after.
- **Data changes:** New audit kinds `language_changed` and `translations_loaded` in the audit kind list and the kind-group filter (EP-06-S10). Adds Update Message catalogue to the shared contract.
- **UI reference:** Route `security` ("Security log"), filter by kind group (EP-06-S10). The translation load itself has no screen yet (not yet designed).
- **Non-functional checks:** Audit: language changes and translation loads are audited (epic section 13). Security: only the owner may load translations unless decided otherwise; translations cannot inject markup. Open question: who translates and approves the texts, and who keeps them up to date when screens change.
- **Depends on:** EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S10, EP-06-S12, EP-05-S2, EP-44-S1, EP-44-S6, EP-44-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Which languages: Tamil and Hindi as on mockups 09 and 24, others, or a different set (UX-SPEC §7 Q4)? (EP-44-S1, S6)
- Which screens: the karigar phone only, or staff and owner screens too? (EP-44-S2, S9)
- Which WhatsApp messages need translated templates, and does a customer get a language preference? (EP-44-S10, S11)
- Are weights shown with Latin digits in every language, or with the language's own digits? (EP-44-S5)
- Who translates and approves the texts, and who keeps them up to date when screens change? (EP-44-S7, S10, S12)
- Is the language a per-user setting only, or also a per-device setting for shared shop devices? (EP-44-S1, S8, S9)
