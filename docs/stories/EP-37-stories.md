# EP-37: Observability · stories

Epic document: [EP-37 Observability](../epics/EP-37-observability.md)

Role note: this is a layer E operations epic with no shop-facing screen. Stories use "System" for the logger, error tracker, uptime checker, metrics and alerting acting on their own, and "Developer" for the operator, the person who runs the system and receives and acknowledges alerts. Who else receives alerts (for example the owner) is an open question, so no story assumes the Owner role reads logs or dashboards. Seed users named in criteria are Sanjay Seth (Owner), Rajesh Verma (Staff) and Lakshmi Devi (Karigar). Operator tools (logs, dashboards, alerts) live in the chosen monitoring tool; which parts come built in depends on the D1a cloud provider.

---

## EP-37-S1: System can write structured logs with a request id across services

- **Story ID:** EP-37-S1
- **Status:** Not started
- **Title:** System can write structured logs with a request id across services
- **As a:** System
- **I want:** every API request, background job run, notification delivery, WhatsApp send and live-channel publish to write structured log lines that share one request id
- **So that:** the operator can follow one counter action from the API through jobs, notifications and the WhatsApp provider when something breaks (FR-37-1, FR-37-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff) calls Propose edit on a piece, when the request ends, then exactly one API log line is written with time (UTC), request id, service `api`, operation name, actor id, role `staff`, outcome `ok` and duration in ms.
  2. Given that request causes an edit-token notification and a WhatsApp send, when the logs are searched by its request id, then the API line, the EP-11 notification line, the EP-12 send line and the EP-07 publish line all appear with the same request id.
  3. Given a request is refused by a rule (`DomainError`, for example a stock-out of a piece that is already sold), when it is logged, then the outcome is `refused` with the refusal code, and it is not counted as an error (FR-37-3).
  4. Given an unhandled exception in an operation, when it is logged, then the outcome is `error`, and the line carries the request id that the error report from EP-37-S3 also carries.
  5. Given a scheduled job run with no incoming request (for example the SLA breach job), when it runs, then it gets its own request id and its log lines name service `jobs` and the job name.
- **Rules enforced on the server:** The request id is created at the API boundary, or taken from a trusted internal caller, and never from a browser header without validation. Actor id and role come from the session (EP-03-S3), never from the request body. Outcome is one of `ok`, `refused` or `error`.
- **Live events emitted / consumed:** None. Publishes of the catalogue events are logged, but their content is not read.
- **Audit entry written:** No. Application logs are not the audit log (EP-06); no business state changes.
- **Data changes:** None in the product database. Adds a shared logger in `api` with the log line fields from epic section 9, and passes the request id into job, notification, WhatsApp and live-channel code.
- **UI reference:** No screen
- **Non-functional checks:** Performance: logging adds less than 5 ms to a request (proposed target, to confirm). Time: every line carries a UTC time (BR-37-7). Precision: log lines carry no business weights; if one ever must, it is an integer in units of 0.0001 g. D1 is decided (Option C): the Node API writes these logs itself and carries the request id in every line. Open decision D1a: which provider log service receives them.
- **Depends on:** EP-03-S3, EP-03-S4, EP-10-S2, EP-11-S13, EP-12-S3, EP-07-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S2: System can redact passwords, links, tokens, phones and names from every log line

- **Story ID:** EP-37-S2
- **Status:** Not started
- **Title:** System can redact passwords, links, tokens, phones and names from every log line
- **As a:** System
- **I want:** the logger itself to remove passwords, activation and reset links, edit tokens, session secrets, phone numbers, email addresses and customer names from every log line, by field name and by pattern, before the line leaves the process
- **So that:** secrets and personal data never reach logs, whatever a developer passes to the logger (FR-37-2, BR-37-2, BR-37-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a staff member signs in with phone and password, and another resets a password from an emailed link, when all logs for those requests are searched for the password and the link, then neither appears (epic acceptance criterion 4).
  2. Given Sanjay Seth agrees an edit proposal and an edit token is sent and then applied, when the logs for both requests are searched for the token value, then it does not appear; the line shows the token reference only.
  3. Given a log call that passes an object with fields `phone`, `email`, `password`, `link`, `token`, `sessionSecret`, `customerName` or `name` of a customer, when the line is written, then each of those values is replaced by `[redacted]` and the internal id is kept.
  4. Given a free-text detail that contains a 10-digit Indian mobile number, when the line is written, then the number is replaced by `[redacted]`.
  5. Given the redaction test suite, when it runs in CI, then it fails if any of the above values reaches the log output.
- **Rules enforced on the server:** Redaction runs inside the logger, not by convention at each call site (epic section 13). The redacted field list lives in one place in the shared package. Error reports (EP-37-S3) and alerts (EP-37-S5, EP-37-S6) use the same redaction.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No business state changes.
- **Data changes:** None in the product database. Adds the redaction list and the redacting step to the logger.
- **UI reference:** No screen
- **Non-functional checks:** Security: passwords, links, edit tokens and session secrets never logged in plain text (BR-37-2). Personal data: phones and customer names are personal data under the DPDP Act 2023 and stay out of logs; the internal id is logged instead (BR-37-5).
- **Depends on:** EP-37-S1, EP-04-S14, EP-12-S11, EP-06-S4, EP-01-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S3: System can report web, portal and API errors to error tracking

- **Story ID:** EP-37-S3
- **Status:** Not started
- **Title:** System can report web, portal and API errors to error tracking
- **As a:** System
- **I want:** every unhandled error in the web app, the karigar portal and the API to be reported to error tracking with time, service, release version, request id, message, stack and user role
- **So that:** the operator sees a crash on `parcel-match` or `k-jobs` before the shop phones about it (FR-37-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given an unhandled error in an API operation, when it happens, then one error report reaches error tracking with service `api`, the deployed release version, the request id from the matching log line, the message and the stack.
  2. Given Rajesh Verma is on the `stock-out` route and a script error happens, when the web app calls Create client error report, then the report holds service `web`, the release version, the route id `stock-out` and role `staff`, and no name or phone.
  3. Given Lakshmi Devi on the karigar portal `k-jobs` hits an unhandled error, when it is reported, then the report names service `portal` and role `karigar`.
  4. Given a rule refusal shown to the user as the `DomainError` sentence, when it happens, then no error report is created.
  5. Given a caller with no session, when it calls Create client error report, then the server refuses it.
- **Rules enforced on the server:** Create client error report requires a signed-in session (epic section 10). The server sets time, actor role and release from its own state, not from the payload. Payload size is capped and passed through the redaction from EP-37-S2.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Error reports are operational data, not business changes.
- **Data changes:** None in the product database. Adds Create client error report to the shared contract (EP-03-S1) and an error-reporting hook in `web`, the portal and `api`. Error reports are stored in the error tracking tool.
- **UI reference:** No screen. Every route reports, including `today`, `decisions`, `parcel-match`, `stock-out` and `k-jobs`.
- **Non-functional checks:** Personal data: reports carry user role only, no name, phone or customer data. Security: error tracking is visible only to operators. D10 is decided (India region) for the system's own hosting; whether the error tracking tool must also store data in India is open.
- **Depends on:** EP-37-S1, EP-37-S2, EP-03-S1, EP-03-S4, EP-08-S4, EP-20-S3, EP-01-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S4: System can run uptime checks against the health check

- **Story ID:** EP-37-S4
- **Status:** Not started
- **Title:** System can run uptime checks against the health check
- **As a:** System
- **I want:** an uptime checker outside the main app to call Read Health on staging and production at a set interval and alert the operator after the agreed number of failures in a row
- **So that:** the operator knows the API or database is down even when the app itself cannot send anything (FR-37-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the uptime checker is set for production, when it calls Read Health, then it stores a check result with time, target, status and response time.
  2. Given the API is down, when the uptime check fails the agreed number of times in a row, then the operator is alerted once with the target and the time of the first failure (epic acceptance criterion 3).
  3. Given Read Health reports database `down`, when the check runs, then it counts as a failure.
  4. Given the API recovers after an alert, when the next check passes, then a recovery notice is sent and the alert is marked resolved.
  5. Given the whole app host is down, when the checks fail, then the alert still arrives, because the checker and alert route run outside the main app.
- **Rules enforced on the server:** The checker calls only Read Health, which needs no session (EP-03-S10). One alert per outage, not one per failed check. The failure count and interval come from configuration, not code.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A health check changes no state.
- **Data changes:** None in the product database. Uptime check results are kept in the monitoring tool. Adds checker configuration for staging and production.
- **UI reference:** No screen
- **Non-functional checks:** Availability: alerting runs outside the main app so an app outage still raises an alert (epic section 13). Time: alerts carry UTC times and dashboards show Asia/Kolkata. Open question: how many failed uptime checks raise an alert; the criteria use "the agreed number".
- **Depends on:** EP-03-S10, EP-01-S6, EP-01-S12, EP-01-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S5: Operator can receive an alert when a WhatsApp send fails after retries

- **Story ID:** EP-37-S5
- **Status:** Not started
- **Title:** Operator can receive an alert when a WhatsApp send fails after retries
- **As a:** Developer
- **I want:** an alert when a WhatsApp send has failed after its last retry, naming the message kind (edit token, wish, broadcast, alert)
- **So that:** staff are not left waiting at the counter for an owner edit code that never arrives, and a lost alert does not go unnoticed (FR-37-6, BR-37-1, BR-37-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an edit token send that fails after its last retry, when the failure is recorded, then the operator gets an alert naming "edit token", and no phone number or token value appears in the alert or in any log (epic acceptance criterion 1).
  2. Given the edit token send to Sanjay Seth's registered mobile fails after its last retry, when the failure is reported by EP-12-S12, then the alert names "edit token", the template name and the error code, and severity is high.
  3. Given 30 wish sends fail in the same 9 am run, when they are reported, then the operator gets one grouped alert for "wish" with the count 30, not 30 alerts.
  4. Given a send fails on its first attempt and succeeds on retry, when it ends, then no alert is raised.
  5. Given a broadcast message reported failed by a later receipt (EP-12-S9), when the last retry is used up, then an alert names "broadcast".
- **Rules enforced on the server:** Alerts are raised only for exhausted retries (EP-11-S14, EP-12-S12), never for a first failure. Message kind is one of edit token, wish, broadcast, alert. Sign-in sends no WhatsApp message (D4). Alerts carry message id, template name and error code, and never recipient number, text or variables. Repeats within a short window are grouped.
- **Live events emitted / consumed:** None. Business events are not used; the failure report from EP-12-S12 is the input.
- **Audit entry written:** No. The failure is recorded on the OutboundMessage (EP-12) and in the alert.
- **Data changes:** None in the product database unless the tool cannot store alerts; then an Alert record (time, kind, severity, message, acknowledged by, acknowledged at). Adds an alert rule for failed sends.
- **UI reference:** No screen. The alert arrives by the agreed alert route.
- **Non-functional checks:** Personal data: no phone, customer name or message text in alerts. Security: no edit code or token value in alerts (BR-37-2). Availability: the alert route runs outside the main app. Open question: who receives alerts, by which channel and at which hours; the alert route cannot use WhatsApp alone, since WhatsApp may be what failed.
- **Depends on:** EP-37-S1, EP-37-S2, EP-12-S12, EP-11-S14, EP-25-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S6: Operator can receive an alert when a background job fails or does not run

- **Story ID:** EP-37-S6
- **Status:** Not started
- **Title:** Operator can receive an alert when a background job fails or does not run
- **As a:** Developer
- **I want:** an alert when a background job fails after its last retry, and when a scheduled job does not start by its time plus a grace period
- **So that:** a late lead, an overdue karigar job or the 9 am wishes are not missed silently (FR-37-7, FR-37-8, BR-37-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the SLA breach job fails on its last attempt (EP-10-S3), when the run is marked failed, then the operator gets an alert naming the job and the error text.
  2. Given the 9 am wishes job does not run, when the agreed grace period after 9:00 Asia/Kolkata passes with no run recorded, then the operator gets an alert naming the job (epic acceptance criterion 2).
  3. Given the token expiry job runs late but succeeds within the grace period, when it ends, then no alert is raised.
  4. Given the overdue karigar job check fails three days in a row, when each failure ends, then each day raises one alert, and repeats on the same day are grouped.
  5. Given the job runner itself is down, when a scheduled time passes, then the missed-run alert still arrives, because the check runs outside the job runner.
- **Rules enforced on the server:** A missed run is judged against the schedule computed in Asia/Kolkata (EP-10-S10) and the JobRun history (EP-10-S2). Alerts are raised only for exhausted retries or missed schedules. Alerts name the job and carry no customer data.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Job runs are already recorded by EP-10; alerts are operational.
- **Data changes:** None in the product database unless the tool cannot store alerts; then the Alert record from EP-37-S5. Adds expected-schedule entries for the SLA breach, overdue jobs, token expiry and 9 am wishes jobs.
- **UI reference:** No screen. Owner-side run history is EP-10-S13.
- **Non-functional checks:** Time: schedule and grace period use Asia/Kolkata; stored times are UTC (BR-37-7). Availability: the missed-run check runs outside the main app. Open question: who receives alerts and at which hours.
- **Depends on:** EP-10-S2, EP-10-S3, EP-10-S5, EP-10-S7, EP-10-S8, EP-10-S9, EP-10-S10, EP-37-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S7: System can measure live-event delivery time against the 1-second target

- **Story ID:** EP-37-S7
- **Status:** Not started
- **Title:** System can measure live-event delivery time against the 1-second target
- **As a:** System
- **I want:** to measure the time from publishing each catalogue event to its arrival in a client, and alert when the median passes 1 second over the agreed window
- **So that:** the "live events arrive within about 1 second" target is watched in production, not assumed (FR-37-9, BR-37-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given EP-07 publishes a "Piece sold" event with its publish time and sequence number, when a client receives it, then the client reports arrival through Create client timing with the event name, sequence number and delivery time in ms.
  2. Given client timing reports are sampled, when a busy counter receives many events, then only the sampled share is reported and the screen does not slow down.
  3. Given live events are published, when the median delivery time over the window passes 1 second, then the operator is alerted (epic acceptance criterion 5).
  4. Given a client was reconnecting and catches up from its last sequence number (EP-07-S7), when the caught-up events arrive, then they are reported as catch-up and left out of the median.
  5. Given a delivery time report, when it is stored, then it holds no event content, only name, sequence number, role and time.
- **Rules enforced on the server:** Create client timing requires a signed-in session. The server compares client arrival with its own publish time; client clock offset is estimated per connection so a wrong device clock does not skew the figure. The epic acts on event timing only, not on content.
- **Live events emitted / consumed:** Consumed (timing only): all 10 catalogue events from PRODUCTION-SCOPE section 1 as carried by EP-07. Emitted: none.
- **Audit entry written:** No. Timing is operational data.
- **Data changes:** None in the product database. Adds Create client timing to the shared contract and a live-event delivery time metric series in the monitoring tool.
- **UI reference:** No screen
- **Non-functional checks:** Performance: median delivery under 1 second (BR-37-4); sampling keeps reporting off the screen's critical path. Personal data: reports carry role, not user name. Open question: the length of the agreed window.
- **Depends on:** EP-07-S2, EP-07-S7, EP-07-S11, EP-08-S8, EP-03-S1, EP-37-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S8: System can measure screen load time against the 2-second target

- **Story ID:** EP-37-S8
- **Status:** Not started
- **Title:** System can measure screen load time against the 2-second target
- **As a:** System
- **I want:** the web app and karigar portal to report how long each route takes to show its data on real shop devices, and to show it against the 2-second target
- **So that:** slow screens on the shop connection are found from real use (FR-37-10, BR-37-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma opens the `today` route, when its data has loaded and the loading state from EP-08-S3 ends, then the client reports route id `today`, load time in ms and device type through Create client timing.
  2. Given Lakshmi Devi opens `k-jobs` on her phone, when it loads, then the report names service `portal` and route `k-jobs`.
  3. Given a week of reports, when the operator opens the screen load figure, then it shows the median and 90th percentile per route against the 2-second line.
  4. Given a route whose median passes 2 seconds over the agreed window, when the figure is computed, then the route is marked over target.
  5. Given reporting is sampled, when a screen loads, then the timing call is sent after the screen has shown and does not delay it.
- **Rules enforced on the server:** Create client timing requires a signed-in session. Route id must be one of the known route ids. Payload carries no names, phones or business values.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Timing is operational data.
- **Data changes:** None in the product database. Adds a screen load time metric series in the monitoring tool and the reporting hook in `web` and the portal.
- **UI reference:** No screen. Measured routes include `today`, `decisions`, `parcel-match`, `stock-out` and `k-jobs`.
- **Non-functional checks:** Performance: target under 2 seconds on a shop connection (BR-37-4); reports are sampled. Personal data: role only. Open question: whether a breached screen load target raises an alert or only shows on the dashboard; criteria only mark it over target.
- **Depends on:** EP-37-S7, EP-08-S3, EP-08-S12, EP-20-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S9: Operator can see request, error, job and send dashboards

- **Story ID:** EP-37-S9
- **Status:** Not started
- **Title:** Operator can see request, error, job and send dashboards
- **As a:** Developer
- **I want:** dashboards of request rate, error rate, job runs and send success for the last 24 hours and the last 30 days, for staging and production
- **So that:** I can see whether the system is healthy at a glance and spot a trend before it becomes an outage (FR-37-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given production has been running for a day, when the operator opens the dashboards, then they show request count and error count per operation for the last 24 hours, with refusals shown apart from errors.
  2. Given job runs recorded by EP-10, when the job panel is opened, then it shows runs and failures per job name for 24 hours and 30 days.
  3. Given WhatsApp sends, when the send panel is opened, then it shows attempts, successes and final failures per message kind (edit token, wish, broadcast, alert).
  4. Given the dashboards, when the time axis is read, then times are in Asia/Kolkata.
  5. Given Sanjay Seth, Rajesh Verma or Lakshmi Devi with a shop account only, when they try to open the dashboards, then access is refused.
  6. Given staging and production, when the dashboards are opened for each, then both show request, error, job and send figures (epic acceptance criterion 6).
- **Rules enforced on the server:** Dashboards are visible only to operators, by the monitoring tool's own access control, not by a product session. Dashboard figures are built from metrics and redacted logs, never raw personal data.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading dashboards changes nothing.
- **Data changes:** None in the product database. Adds dashboard definitions for staging and production in the monitoring tool.
- **UI reference:** No screen. Dashboards live in the chosen tool (epic section 12).
- **Non-functional checks:** Security: dashboards visible only to operators. Time: shown in Asia/Kolkata (BR-37-7). Personal data: no names or phones on any panel. Open decision D1a: which metrics the chosen cloud provider offers built in for the Node API and the managed PostgreSQL database. D10 is decided (India region); whether the monitoring tool must also be in India is open.
- **Depends on:** EP-37-S1, EP-37-S3, EP-37-S5, EP-37-S6, EP-37-S7, EP-37-S8, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S10: Operator can acknowledge an alert

- **Story ID:** EP-37-S10
- **Status:** Not started
- **Title:** Operator can acknowledge an alert
- **As a:** Developer
- **I want:** to list open and recent alerts and acknowledge one, recording who acknowledged it and when
- **So that:** two people do not chase the same failure and an unanswered alert is visible (epic section 10 List alerts, Update alert)
- **Acceptance criteria (Given / When / Then):**
  1. Given three open alerts, when the operator lists alerts, then they appear newest first with time, kind, severity and message.
  2. Given an open "edit token" send alert, when the operator acknowledges it, then it records acknowledged by and acknowledged at, and it leaves the open list.
  3. Given an alert that is already acknowledged, when a second operator acknowledges it, then the first acknowledgement is kept and the second is refused or ignored.
  4. Given an alert is not acknowledged within the agreed time, when that time passes, then it is sent again by the alert route.
  5. Given a caller who is not an operator, when it calls List alerts or Update alert, then it is refused.
- **Rules enforced on the server:** List alerts and Update alert are for operators only (epic section 10). Acknowledge is a one-way change from open to acknowledged. Acknowledged at is set from the server clock.
- **Live events emitted / consumed:** None
- **Audit entry written:** No in the product audit log, since alerts are not business changes; the alert itself keeps acknowledged by and acknowledged at.
- **Data changes:** None in the product database if the monitoring tool keeps alerts; otherwise an Alert record with acknowledged by and acknowledged at.
- **UI reference:** No screen. Alerts are handled in the chosen tool or alert channel.
- **Non-functional checks:** Time: acknowledged at stored in UTC and shown in Asia/Kolkata. Security: operators only. Open question: who receives alerts and at which hours, which decides the resend time.
- **Depends on:** EP-37-S4, EP-37-S5, EP-37-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-37-S11: System can delete logs after the retention period

- **Story ID:** EP-37-S11
- **Status:** Not started
- **Title:** System can delete logs after the retention period
- **As a:** System
- **I want:** log lines, error reports, uptime results and client timing data to be deleted once they pass the agreed retention period
- **So that:** operational data does not pile up and is kept no longer than needed (FR-37-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given the retention period is set in configuration, when a log line becomes older than it, then it is deleted by the tool's retention setting or a scheduled cleanup.
  2. Given logs older than the period, when the operator searches for them, then none are returned.
  3. Given logs within the period, when the cleanup runs, then they are kept.
  4. Given the cleanup, when it runs, then the product audit log (EP-06) is not touched, because it is not an application log.
- **Rules enforced on the server:** The retention period comes from configuration (EP-01-S6), one value per environment. Audit entries are append-only and outside this cleanup (EP-06-S1).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Deleting operational logs is not a business change.
- **Data changes:** None in the product database. Sets the retention period on the logging, error tracking and metrics stores.
- **UI reference:** No screen
- **Non-functional checks:** Personal data: shorter retention limits exposure even though logs hold no personal data by design. Open question: how long logs are kept; criteria use "the agreed retention period". D10 is decided (India region) for the system's own hosting; whether an outside log tool must also store logs in India is open.
- **Depends on:** EP-37-S1, EP-37-S3, EP-37-S4, EP-37-S7, EP-01-S6, EP-06-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D1a: which logs and metrics does the chosen cloud provider offer built in, and what still needs a separate tool? (EP-37-S1, S9)
- D10 is decided (India region): does the monitoring tool also need to store data in India? (EP-37-S3, S9, S11)
- Who receives alerts (developer, owner, both), by which channel, and at which hours? (EP-37-S5, S6, S10)
- How long are logs kept? (EP-37-S11)
- How many failed uptime checks raise an alert? (EP-37-S4)
- Should the owner see a short status line in the app when WhatsApp sending is down? (EP-37-S5)
