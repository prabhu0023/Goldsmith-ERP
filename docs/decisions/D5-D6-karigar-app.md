# D5 and D6: Karigar app and offline use
Status: **Decided 22 November 2026: D5, a React web app used in the phone's browser; D6, online only (no offline mode in v1)**.
## Decision
The owner decided two things for the karigar phone app (EP-20).
- **D5, karigar app: a React web app.** It uses the same stack as the staff app (React) and is opened in the phone's browser. It is not a native app. The owner did not ask for a PWA, and did not ask for installing it to the home screen.
- **D6, offline for karigars: online only.** v1 has no offline mode. There is no offline queue, no offline cache of jobs, no sync operation and no replay of queued updates.
When the connection drops:
- The app shows the connection-lost, reconnecting state (EP-08-S10, EP-08-S11). The connection-lost state stays in v1.
- Actions that need the server are disabled with a reason until the connection returns. Staff and karigar actions are refused with a reason. Nothing is queued.
- What is already on screen stays visible and read-only, marked as possibly out of date.
- When the connection returns, the live channel catches up (EP-07-S7). The server answers by sequence number if the gap is inside the retention window. Otherwise the client refetches everything.
## What was considered
| Option | For | Against |
| --- | --- | --- |
| **React web app in the phone browser (chosen)** | One React codebase with the staff app. No app store. Works on any phone with a browser. Ships with the rest of the web app. | The karigar opens it in the browser, not from an app icon unless the home-screen question (below) is later answered yes. |
| Installable web app (PWA) | Same codebase. Can sit on the home screen and open from cache. | The owner did not ask for it. Most of its value comes with offline use, which is not in v1. A service worker and cache add work and risk. |
| Native app | Best access to the phone's features. | A second codebase and a second stack. App store accounts, reviews and updates. Karigars must install and update it. |
| Offline: none (**chosen**) | Simple. The server is always the single source of truth. No stale or conflicting updates. | A karigar with no signal cannot send an update until the signal returns. |
| Offline: read-only | Karigars could read cached jobs with no signal. | Needs an on-device cache of jobs and a service worker. The cache needs rules for clearing it when a session ends. |
| Offline: queued updates | Weak signal never loses an update. | Large and risky. It needs an on-device queue, a Sync operation, idempotent replay in order, rules for an update that is no longer valid when it syncs, and queue survival across restarts and expired sessions. |
**Why a React web app.** One codebase with the staff app, no app store, and nothing for the karigar to install. It works on any phone.
**Why online only.** The offline queue is large and risky. A queued update can arrive after the owner stopped the job or after the session ended, and each case needs its own rule. The owner chose to ship v1 without it. The reconnecting state and the catch-up on reconnect already make a dropped signal visible and safe.
## What is deferred
- **Offline mode.** EP-20-S12a (install and open from cache) and EP-20-S12b (offline queue and sync) keep their story IDs and titles and are marked "Deferred: v1 is online only, D6". FR-20-12 and FR-20-13 are marked Deferred. The "Sync Queued updates" operation, the on-device queue (JobUpdate) and the service worker and cache are not built.
- **Install to the home screen.** Not decided. It is one open question in EP-20 section 17: should the karigar app be installable to the home screen? It needs only a web app manifest and icons, no offline support.
## What stays
- The connection-lost and reconnecting state and its disabled-action reasons (EP-08-S10, EP-08-S11).
- Catch-up on reconnect by sequence number, with a full refetch when the gap is past the retention window (EP-07-S7).
- The server checks every request again, so a hand-over sent after the owner stopped the job is refused with the stopped sentence.
## What changes in the epics
- **EP-20 Karigar portal:** title no longer says PWA; the file name and number are unchanged. Offline queue, sync status and install are out of scope. FR-20-12 and FR-20-13 are Deferred. EP-20-S12a and EP-20-S12b are Deferred. Epic acceptance criterion 3 and the weak-signal risk describe the online-only behaviour.
- **EP-08 Front-end production foundation:** the offline state stays. The D6 question is answered: no offline queue anywhere, and the web app is read-only while disconnected.
- **EP-07 Live channel:** the D6 question is answered by catch-up by sequence number or a full refetch. No offline queue assumption.
- **EP-04 Authentication:** offline sign-in for karigars is not in v1. Karigars are online only, so D6 puts no extra session-lifetime need on EP-04.
- **EP-24, EP-41, EP-44 and EP-40:** wording that assumed an offline queue, an install step or a PWA now says online only or web app.
## Still open
- Should the karigar app be installable to the home screen? It needs only a web app manifest and icons, no offline support (EP-20 section 17).
