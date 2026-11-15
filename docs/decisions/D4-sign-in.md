# D4: Sign-in method

Status: **Decided: phone number + password, with single-use email links for activation and password reset**. OTP sign-in is deferred.

## Decision

The owner chose **phone number + password** for every user: owner, staff and karigars.

- Users sign in with their phone number and a password. Phone numbers are unique within the shop.
- There is **no OTP sign-in in v1**. Sign-in sends no WhatsApp or SMS message. OTP sign-in is deferred and recorded as a Later note in PRODUCTION-SCOPE §6.
- **Every user has an email address**, karigars included. Email is how a user gets their first password and how they reset a forgotten one.
- Passwords are stored only as salted hashes made with a modern password-hashing algorithm. The library is chosen when EP-04 is built. Minimum length is 8 characters.
- Deactivating a user ends all their sessions at once (already in EP-05; unchanged).

This decision covers sign-in only. The owner edit code for tag edits (EP-25) is a separate control and keeps using WhatsApp; see "What stays on WhatsApp" below.

## The flow

**New user.**
1. The owner adds the user with name, phone, email and role (EP-05).
2. The system emails an **activation link** to that address. The link is single use and expires in 24 hours.
3. The user opens the link and sets their own password. The link then stops working.
4. If the link expires or the email is lost, the owner can resend it. A resend makes any earlier link stop working.

No temporary password is ever emailed.

**The very first owner.** The first owner account is created by the first-run shop setup wizard (EP-45). The wizard takes the owner's name, phone and email and sends the same activation email. There is no separate developer bootstrap command.

**Forgot password.**
1. On the sign-in screen the user taps "Forgot password" and enters their phone number.
2. If the number belongs to an active user, the system emails a **reset link** to the email address on that account. The link is single use and expires in 1 hour.
3. The screen always says "If that number is registered, we've sent an email", whether or not the number exists, so it never reveals which numbers are registered.
4. The user opens the link and sets a new password.

**Lockout.**
- 5 wrong passwords lock the account for 15 minutes.
- The owner can unlock an account sooner (EP-05).
- The locked screen does not say whether the phone number is registered.

## What was considered

| Option | For | Against |
| --- | --- | --- |
| Phone + WhatsApp OTP (the earlier recommendation) | Staff and karigars already use WhatsApp. No password to remember. | Every sign-in depends on WhatsApp delivery and an approved authentication template (D8). A per-message cost for every sign-in. A WhatsApp outage stops the whole shop signing in. |
| Phone + SMS OTP | Works on any phone, no WhatsApp needed. | In India, business SMS needs DLT registration of the sender and every message template with a telecom operator before the first message goes out. Per-message cost. Delivery delays at peak times. |
| Phone + password, with an emailed temporary password | Simple. The user activates the account from an email. | A working password sits in the user's inbox until they change it. Anyone who sees that email can sign in as them. |
| **Phone + password, with emailed single-use links (chosen)** | Simple for the shop. No message cost per sign-in. Sign-in keeps working if WhatsApp or SMS has a problem. The user sets their own password, so no password is ever sent anywhere. | Every user needs an email address. Email becomes a required channel, so an email provider is needed (open). Users must remember a password. |

**Why the activation link instead of a temporary password.** The owner first suggested that the system create a temporary password, email it, and let the user activate it. The activation link meets the same need: the email goes to the user, and the user activates the account themselves. The difference is that nothing usable sits in the inbox afterwards. The link works once, expires in 24 hours, and the password the user chooses is never written in any message.

**Why password and email links for v1.** The shop needs sign-in that works every day without depending on a messaging provider's template approval or delivery. Phone numbers are already unique and already collected at onboarding. Email links cover the two moments a password cannot: the first password and a forgotten one.

## What is deferred

- **OTP sign-in** (WhatsApp or SMS). Recorded as a Later note in PRODUCTION-SCOPE §6, not as an epic. If it is added later, it sits beside password sign-in and reuses the lockout and rate limits in EP-04.

## What stays on WhatsApp

The owner edit code is unchanged (EP-25, mockup 05):
1. Staff propose a change; the piece's real values are not changed.
2. The proposal is stored separately and goes to the owner.
3. Only the owner account can apply it.
4. When the owner applies it, a one-time code is sent as a WhatsApp message to the owner's registered mobile number, and he enters it to confirm. The code is single use, expires in 10 minutes, is rate-limited, and is never logged in plain text.

So EP-12 WhatsApp integration stays in v1. The owner edit code is a WhatsApp authentication-template use. Sign-in no longer uses WhatsApp.

## What changes in the epics

- **EP-04 Authentication:** password sign-in, activation link, forgot password, lockout, sessions. The sign-in OTP stories keep their IDs and are rewritten to their password equivalents.
- **EP-05 Users, roles and permissions:** the owner adds a user with email; the activation email goes out on add; the owner can resend it and can unlock a locked account.
- **EP-11 Notifications engine:** email becomes a required channel for activation and reset emails, sent whatever the owner's alert channel settings are.
- **EP-12 WhatsApp integration:** used for the owner edit code, alerts, wishes and broadcasts. Not used for sign-in.
- **EP-25 Edit proposals:** the flow above is confirmed.
- **EP-39 Security, EP-40 Testing:** password storage, lockout, link expiry and single use are hardened and tested.
- **EP-45 Shop setup wizard:** creates the first owner and sends the first activation email.

## Still open

- **Email provider.** Which service sends the activation and reset emails. Listed as an open decision in PRODUCTION-SCOPE §4. The sender sits behind one interface in EP-11, so the choice does not change the stories.
- Session length per device kind (EP-04 section 17).
