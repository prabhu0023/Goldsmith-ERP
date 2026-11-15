# EP-37: Observability

## 1. Summary

Once the app is live, someone has to know when it breaks before the shop does. Observability collects logs from the
web app, the API, background jobs and integrations; tracks errors; checks from outside that the app is up; measures
how fast screens load and live events arrive; and alerts the people who run the system when a WhatsApp message fails
to send or a scheduled job fails. A failed OTP or edit-token send leaves staff waiting at the counter, and a failed
SLA job means a late lead nobody hears about, so these failures must raise an alert. Logs must never hold OTPs, edit
tokens or customer personal data.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: N/A. The prototype runs entirely in the browser with no server, no jobs and no real sends, so there is nothing to observe.

## 3. Roles involved

- Owner: receives a short alert when something the shop depends on is down, if decided; does not read logs.
- Staff: not involved directly; sees the user-facing error states that error tracking records.
- Karigar: not involved directly; the karigar portal's errors are tracked like the web app's.
- System: writes structured logs, reports errors, runs uptime checks, measures latency, and sends alerts to the operator on failed sends, failed jobs and breached targets.

## 4. In scope

- Structured logs from the API, the background jobs (EP-10), the notifications engine (EP-11), the WhatsApp integration (EP-12) and the live channel (EP-07), with a request id across them.
- Redaction: no OTP, edit token, session secret, phone number or customer name in any log line.
- Error tracking for the web app, the karigar portal and the API, with release version.
- Uptime checks against the health check from EP-03.
- Alert on failed WhatsApp sends (OTP, edit token, wishes, broadcasts, alerts) after retries are used up.
- Alert on failed background jobs (SLA breach, overdue jobs, token expiry, 9 am wishes).
- Measurement of screen load time and live-event delivery time against the §5 targets.
- Dashboards for request rate, error rate, job runs and send success.
- An alert route: who is alerted, by which channel, at which hours.
- Log retention period.

## 5. Out of scope

- The health check endpoint itself (EP-03).
- Retrying failed sends and jobs (EP-10, EP-11, EP-12).
- The audit log of business changes, which is not an application log (EP-06).
- Backups and restore (EP-38).
- Security monitoring beyond error and access logs, rate limiting and penetration testing (EP-39).
- In-app notifications to staff and owner about business events (EP-11).
- Environments and secrets for the tools (EP-01).

## 6. Current state in the prototype

- No server, no log output and no error tracking. Rules throw `DomainError` in `src/store/transitions.ts`, and `src/store/StoreProvider.tsx` turns them into `ActionResult {ok, error, id}` shown on screen; nothing is recorded.
- `src/store/StoreProvider.tsx` refreshes `now` every 30 s with `setInterval`; no live channel to measure.
- `package.json` lists `express` and `dotenv` but has no server file; the `clean` script removes a non-existent `server.js`.
- WhatsApp sends are simulated in `src/components/ui/OtpPanel.tsx`; nothing can fail.
- Reusable: the `DomainError` sentence as the user-facing message, which logs can carry as a rule refusal distinct from a system error; the `ActionResult` shape.
- Must be rebuilt server-side: all of it. Logging, redaction, error tracking, uptime checks, latency measurement and alerting are new.

## 7. Functional requirements

- FR-37-1. Every API request writes one structured log line with request id, operation, actor id, role, outcome and duration.
- FR-37-2. A log line never contains an OTP, an edit token, a session secret, a phone number or a customer name; a test proves the redaction.
- FR-37-3. A rule refusal (`DomainError`) is logged as a refusal, not as a system error.
- FR-37-4. An unhandled error in the web app, the karigar portal or the API is reported to error tracking with the release version and request id.
- FR-37-5. An uptime check calls the health check at a set interval and alerts the operator after the agreed number of failures.
- FR-37-6. A WhatsApp send that fails after its last retry raises an alert naming the message kind (OTP, edit token, wish, broadcast, alert) without the recipient's number.
- FR-37-7. A background job run that fails after its last retry raises an alert naming the job.
- FR-37-8. A scheduled job that does not run at its time (for example the 9 am wishes) raises an alert.
- FR-37-9. The system measures the time from publishing a live event to its delivery and alerts when the median exceeds 1 second over the agreed window.
- FR-37-10. The system measures screen load time on real devices and shows it against the 2-second target.
- FR-37-11. The operator can see dashboards of request rate, error rate, job runs and send success for the last 24 hours and 30 days.
- FR-37-12. Logs are kept for the agreed retention period and then deleted.

## 8. Business rules

- BR-37-1. Alert on failed WhatsApp sends and job failures. [PRODUCTION-SCOPE §6 EP-37]
- BR-37-2. OTP and edit tokens are never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-37-3. Secrets live in environment configuration, never in the repo. [PRODUCTION-SCOPE §5 Security]
- BR-37-4. Screens load under 2 seconds on a shop connection; live events arrive within about 1 second. [PRODUCTION-SCOPE §5 Performance]
- BR-37-5. Customer names and phones are personal data under the DPDP Act 2023. [PRODUCTION-SCOPE §5 Personal data]
- BR-37-6. Staff wait at the counter while an edit token is sent, so a failed token send matters at once. [PRODUCTION-SCOPE §1 "Edit proposed / token sent"]
- BR-37-7. Times are stored in UTC and shown in Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- Log line: time (UTC), request id, service, operation, actor id, role, outcome (ok, refused, error), duration in ms, redacted detail.
- Error report: time, service, release, request id, message, stack, user role (no personal data).
- Uptime check result: time, target, status, response time.
- Metric series: request count, error count, job runs and failures, send attempts and failures, live-event delivery time, screen load time.
- Alert: time, kind, severity, message, acknowledged by, acknowledged at.
- No weight or money fields. If a log line names a weight it uses integer, units of 0.0001 g, but logs should not carry business values.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Health | Uptime check target (provided by EP-03) | Uptime checker |
| Create | Client error report | Web app or karigar portal reports an unhandled error | Any signed-in client |
| Create | Client timing | Web app reports screen load and live-event arrival times | Any signed-in client |
| List | Alerts | Open and recent alerts | Operator |
| Update | Alert | Acknowledge an alert | Operator |
| Read | Dashboards | Request, error, job and send figures | Operator |

## 11. Live events

- None emitted or consumed as business events. The epic measures delivery time for every catalogue event that EP-07 publishes, but does not act on their content.

## 12. Screens and UX references

- No screen of its own for shop users. Operator dashboards live in the chosen tool.
- Screens that depend on it: every route reports its errors and load time, including `today`, `decisions`, `parcel-match`, `stock-out` and `k-jobs`.
- Mockups: none.

## 13. Non-functional requirements

- Security: logs and dashboards are visible only to operators; OTPs, edit tokens and session secrets are redacted at the logger, not by convention.
- Personal data: phone numbers and customer names are kept out of logs; where an id is needed, the internal id is logged.
- Performance: logging adds less than 5 ms to a request (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none); client timing reports are sampled so they do not slow the screen.
- Availability and recovery: alerting runs outside the main app so an app outage still raises an alert.
- Time: every log line and alert carries a UTC time; dashboards show Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03, EP-12
- Downstream: EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given an edit token send that fails after its last retry, when the failure is recorded, then the operator gets an alert naming "edit token" and no phone number or token value appears anywhere in logs or the alert.
2. Given the 9 am wishes job does not run, when the agreed grace period after 9 am Asia/Kolkata passes, then the operator gets an alert naming the job.
3. Given the API is down, when the uptime check fails the agreed number of times, then the operator is alerted.
4. Given a staff member signs in with an OTP, when the logs for that request are searched, then the OTP does not appear.
5. Given live events are published, when the median delivery time over the window passes 1 second, then the operator is alerted.
6. Done when the dashboards show request, error, job and send figures for staging and production.

## 16. Risks

- Risk: an OTP or token reaches logs through a generic request logger. Mitigation: redact by field name at the logger and test it in EP-40.
- Risk: too many alerts and the operator ignores them. Mitigation: alert only on exhausted retries and breached targets, and group repeats.
- Risk: nobody is named to receive alerts. Mitigation: agree the alert route before launch (EP-41 checklist).
- Risk: the monitoring tool stores data outside India. Mitigation: check its region against D10 and keep personal data out of it.

## 17. Open decisions and questions

- D1: on a managed platform, which logs and metrics come built in, and what still needs a separate tool?
- D10: does the monitoring tool need to store data in India?
- Who receives alerts (developer, owner, both), by which channel, and at which hours?
- How long are logs kept?
- How many failed uptime checks raise an alert?
- Should the owner see a short status line in the app when WhatsApp sending is down?

## 18. Candidate stories

1. EP-37-S1: System can write structured logs with a request id across services
2. EP-37-S2: System can redact OTPs, tokens, phones and names from every log line
3. EP-37-S3: System can report web, portal and API errors to error tracking
4. EP-37-S4: System can run uptime checks against the health check
5. EP-37-S5: Operator can receive an alert when a WhatsApp send fails after retries
6. EP-37-S6: Operator can receive an alert when a background job fails or does not run
7. EP-37-S7: System can measure live-event delivery time against the 1-second target
8. EP-37-S8: System can measure screen load time against the 2-second target
9. EP-37-S9: Operator can see request, error, job and send dashboards
10. EP-37-S10: Operator can acknowledge an alert
11. EP-37-S11: System can delete logs after the retention period
