# EP-44: Localisation

## 1. Summary

This epic lets people use the app in a language other than English. The owner decided that v1 ships in English only
and that other languages are handled later; this epic is that later work. The mockups already point at it: the karigar
phone (mockup 09) shows a हिन्दी toggle, and the karigar onboarding form (mockup 24) offers தமிழ் / हिन्दी / English as the
language the karigar's app should speak. Karigars work at the bench, often in Tamil or Hindi, so the karigar phone is
the first candidate; staff screens may follow. The scope covers translating the UI, the language toggle and the
per-user language preference, translated WhatsApp templates, and number and date formatting per locale, while weights
stay in grams to four decimals everywhere. Which languages and which screens are open decisions.

## 2. Layer, milestone, status

- Layer: F · Later
- Milestone: None (later)
- Prototype status: Not built. All text is English and written inline in the components; the `हिन्दी` chip in `KarigarPhone.tsx` is static, and the language picked on `karigar-new` is stored on the karigar record but nothing reads it.

## 3. Roles involved

- Owner: chooses which languages the shop supports (once decided), sets or changes a user's language, approves translated WhatsApp templates.
- Staff: may choose their own language for staff screens, if staff screens are in scope.
- Karigar: sees the phone app in their language and can switch it with the toggle.
- System: serves the text for the user's language, falls back to English for any missing text, formats numbers and dates per locale, and sends WhatsApp messages with the template in the recipient's language.

## 4. In scope

- Moving every user-facing string of the in-scope screens out of the components into message catalogues keyed by language, with English as the source and the fallback.
- Translating the karigar phone (`k-jobs`) first; staff and owner screens if decided.
- The language toggle on the karigar phone (the हिन्दी chip on mockup 09), switching the app language at once.
- The language choice on `karigar-new` (mockup 24 தமிழ் / हिन्दी / English) and on the karigar edit form, writing the karigar's stored language preference (EP-16).
- A per-user language preference for staff and owner (if staff screens are in scope), read by the shell after sign-in.
- Translated WhatsApp templates for the messages each recipient gets (OTP, job alerts, wishes, broadcast, catalogue share), registered and approved per language through EP-12, and chosen by the recipient's language.
- Number and date formatting per locale (digit grouping, date order, month names, weekday names), always in Asia/Kolkata time.
- Weights stay in grams to four decimals in every language (for example 186.4000 g); the unit is not translated into another unit, and the digits used for weights are decided with the language list.
- Right fonts for Tamil and Devanagari script at the UX-SPEC §6 text sizes, and layouts that fit longer translated text.
- A check that no in-scope screen shows an untranslated string other than the English fallback.

## 5. Out of scope

- v1: the application ships in English only; nothing in this epic is part of v1.
- Translating customer-entered content (names, notes, PO text) or the audit log.
- Changing how weights are stored or compared (integers in units of 0.0001 g, EP-02).
- Voice notes and speech recognition in any language (gap G16, EP-20).
- Lead parsing of POs written in other languages (EP-29).
- Money and currency formatting (EP-42).
- Choosing the WhatsApp provider or template approval process itself (EP-12, D8).

## 6. Current state in the prototype

- `src/components/karigar/KarigarPhone.tsx` (route `k-jobs`): a static `हिन्दी` chip; all job sheet, tab and button text is inline English.
- `src/components/people/OnboardKarigar.tsx` (route `karigar-new`): `LANGUAGES` தமிழ் / हिन्दी / English; the chosen value is saved by `onboardKarigar` in `src/store/transitions.ts`.
- `src/types/jewellery.ts` `Karigar.language`; seed karigars KG-01 Lakshmi Devi (Tamil), KG-02 Mahesh Soni (Hindi), KG-04 Vijay Kumar (Hindi). No staff or owner language field.
- Every screen in `src/components/**` and the refusal sentences in `src/store/transitions.ts` are English strings written inline; there is no message catalogue.
- Number formats: `ValueSlot` uses `Intl.NumberFormat('en-IN')`; weights are formatted by the display helpers in `src/domain/weights.ts` and `WeightReadout`.
- In v1 production: EP-16 keeps the karigar's language as a stored field (default English) that nothing reads; EP-20 shows English only; EP-12 templates are English only.
- Reusable: the language list on the karigar form, the stored karigar language, the `en-IN` formatting habit, the weight display helpers.
- Must be built: message catalogues and extraction of strings, translations, the toggle, per-user preferences, translated templates, locale formatting rules and a missing-translation check.

## 7. Functional requirements

- FR-44-1. Every user-facing string on an in-scope screen comes from a message catalogue; English is the source and the fallback.
- FR-44-2. A karigar sees the phone app in the language stored on their record.
- FR-44-3. A karigar can switch the phone app language with the toggle, and the choice is saved to their preference.
- FR-44-4. The owner can set a karigar's language on `karigar-new` and the karigar edit form, from the decided language list.
- FR-44-5. If staff screens are in scope, each staff member and the owner can choose their own language, and the shell uses it after sign-in.
- FR-44-6. A string missing in the chosen language shows in English, and the missing key is reported to the team.
- FR-44-7. Dates and numbers are formatted per the user's locale, in Asia/Kolkata time.
- FR-44-8. Weights are shown in grams to four decimals in every language, computed from integers in units of 0.0001 g.
- FR-44-9. Each WhatsApp message is sent with the template in the recipient's language, falling back to English when no approved template exists in that language.
- FR-44-10. The server's refusal sentences are returned as message keys with parameters, so the screen shows them in the user's language.
- FR-44-11. A change of a user's language is audited with old and new value.

## 8. Business rules

- BR-44-1. v1 ships in English only; other languages come later. [owner decision, gap G2 resolved]
- BR-44-2. The karigar phone offers a language toggle. [mockup 09 हिन्दी toggle]
- BR-44-3. The karigar's language is chosen when they are onboarded. [mockup 24 தமிழ் / हिन्दी / English]
- BR-44-4. Weights are integers in units of 0.0001 g and are shown in grams to four decimals. [PRODUCTION-SCOPE §5 Precision]
- BR-44-5. Outbound WhatsApp messages outside a conversation need pre-approved templates, so each language needs its own approved template. [PRODUCTION-SCOPE §4 D8]
- BR-44-6. Store UTC, display Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]
- BR-44-7. Karigar text is at least 15 px with 56 px touch targets, in every script. [UX-SPEC §6]

## 9. Data

- Language: code, display name in its own script (for example தமிழ், हिन्दी, English), enabled flag.
- Message catalogue: language, key, text with parameters, updated at, translated by.
- User language preference: user id, language code (default English). The karigar's existing stored language (EP-16) becomes this preference for karigars.
- WhatsApp template translation: template id (EP-12), language, body, provider template id, approval status.
- Locale format rules per language: date order, digit grouping, digits used.
- No weight or money fields change; weights stay integers in units of 0.0001 g.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Languages | Enabled languages for pickers and the toggle | Any signed-in user |
| Read | Message catalogue | Texts for one language and screen set | Any signed-in user |
| Update | My language | Save the user's own language (toggle) | Any signed-in user |
| Update | User language | Set a staff member's or karigar's language | Owner |
| Update | Message catalogue | Load or correct translations | Owner, or the team per decision |
| Create | Template translation | Register a WhatsApp template in a language (through EP-12) | Owner |

## 11. Live events

- Consumes: "User deactivated or role changed" — through EP-08, which signs the user out; no language-specific handling.
- Emits: none from the catalogue. A language change refreshes only the user's own screens.

## 12. Screens and UX references

- Route ids: `k-jobs` (KarigarPhone, the toggle and the translated app), `karigar-new` (language choice), and, if staff screens are in scope, every staff and owner route in `src/nav.ts` plus the account menu (language preference).
- Mockups: `09-karigar-phone.svg` (हिन्दी toggle), `24-onboard-karigar.svg` (language தமிழ் / हिन्दी / English).
- Not yet designed: the language toggle's choices beyond हिन्दी, the staff language preference, and translated layouts for longer text.

## 13. Non-functional requirements

- Performance: switching language takes effect at once on the open screen; message catalogues load with the screen within the 2-second target.
- Precision: weights keep four decimals and are formatted from integers in every language.
- Accessibility: Tamil and Devanagari fonts meet the UX-SPEC §6 sizes; the language toggle is a 56 px target on the karigar phone.
- Security: only the owner may set another user's language or load translations; translations cannot inject markup.
- Audit: language changes and translation loads are audited.
- Time: dates are shown in Asia/Kolkata in every locale.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-08, EP-20, EP-12
- Downstream: None.

## 15. Epic acceptance criteria

1. Given KG-02 Mahesh Soni's language is Hindi and Hindi is enabled, when he opens `k-jobs`, then every label on the phone is in Hindi and gold with him still shows in grams to four decimals.
2. Given a karigar on `k-jobs`, when they tap the language toggle and pick English, then the app switches at once and stays in English after sign-in again.
3. Given a key missing from the Tamil catalogue, when a Tamil-language karigar opens the screen, then that text shows in English and the missing key is reported.
4. Given a Tamil-language karigar and an approved Tamil job-alert template, when a job is sent to them, then the WhatsApp message uses the Tamil template.
5. Given the owner on `karigar-new`, when they pick தமிழ், then the karigar's language is stored as Tamil and audited.
6. Done when every in-scope screen passes the missing-translation check for every enabled language.

## 16. Risks

- Risk: strings stay scattered in components and translations miss some. Mitigation: extract to catalogues screen by screen with a missing-key check in EP-40.
- Risk: translated WhatsApp templates wait weeks for approval (D8). Mitigation: fall back to English and request templates early.
- Risk: longer translated text breaks layouts on the karigar phone. Mitigation: test each screen at the longest language before release.
- Risk: different digits in a language confuse weight readings at the bench. Mitigation: decide the digits used for weights with the karigars before translating.
- Risk: refusal sentences from the server stay English. Mitigation: return message keys with parameters (FR-44-10).

## 17. Open decisions and questions

- Which languages: Tamil and Hindi as on mockups 09 and 24, others, or a different set (UX-SPEC §7 Q4)?
- Which screens: the karigar phone only, or staff and owner screens too?
- Which WhatsApp messages need translated templates, and does a customer get a language preference?
- Are weights shown with Latin digits in every language, or with the language's own digits?
- Who translates and approves the texts, and who keeps them up to date when screens change?
- Is the language a per-user setting only, or also a per-device setting for shared shop devices?

## 18. Candidate stories

1. EP-44-S1: System can store languages, message catalogues and per-user language preferences
2. EP-44-S2: Developer can extract every string of a screen into the English catalogue
3. EP-44-S3: System can fall back to English and report missing translations
4. EP-44-S4: System can return refusal sentences as message keys with parameters
5. EP-44-S5: System can format dates and numbers per locale with weights in grams to four decimals
6. EP-44-S6: Owner can set a karigar's language on the onboarding and edit forms
7. EP-44-S7: Karigar can see the phone app in their language
8. EP-44-S8: Karigar can switch the app language with the toggle
9. EP-44-S9: Staff can choose their own language for staff screens
10. EP-44-S10: Owner can register a WhatsApp template in another language
11. EP-44-S11: System can send each WhatsApp message in the recipient's language
12. EP-44-S12: System can audit language changes and translation loads
