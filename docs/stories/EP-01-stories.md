# EP-01: Repository, environments and CI · stories

Epic document: [EP-01 Repository, environments and CI](../epics/EP-01-repository-environments-and-ci.md)

Role note: this is a layer A infrastructure epic with no end user. Stories use "Developer" for the person building and deploying the product, and "System" for the CI service acting on its own. "Rules enforced on the server" here means rules enforced by the repository host and the CI pipeline, because the epic exposes no product endpoints.

---

## EP-01-S1: Developer can clone one product repository rooted at the project, not the parent folder

- **Story ID:** EP-01-S1
- **Title:** Developer can clone one product repository rooted at the project, not the parent folder
- **As a:** Developer
- **I want:** a dedicated git repository whose root is the `jewelops---jewellery-enterprise-suite` project folder
- **So that:** history, branch protection and CI hooks attach to the product and not to the parent folder `/Users/prabhu.govindaraj/Documents/personalproject`, where the project is untracked today
- **Acceptance criteria (Given / When / Then):**
  1. Given the new product repository on the chosen git host, when a developer runs `git clone` and then `git rev-parse --show-toplevel` inside the clone, then the printed path is the clone folder itself and contains `package.json`, `docs/` and `src/` at its top level.
  2. Given the clone, when a developer runs `git log`, then the first commit contains the current prototype files (including `src/domain/`, `src/types/jewellery.ts`, `docs/epics/` and `.gitignore`) and no file from any sibling project in the parent folder.
  3. Given the clone, when a developer runs `git status` after a fresh clone, then it reports a clean working tree, so `.gitignore` already excludes `node_modules/`, `dist/` and local `.env` files.
  4. Given the parent folder repository, when its `git status` is inspected after the move, then the project folder is no longer reported as untracked content of the parent, or the decision record from criterion 5 explains why it still appears.
  5. Given the repository, when a developer opens `docs/decisions/` (or the agreed decision-record location), then a short record states where the repository lives and why, answering the open question on repository location.
- **Rules enforced on the server:** The git host holds the repository. Only named developers have write access; everyone else has no access (least privilege, PRODUCTION-SCOPE §5 Security). Branch protection itself is added in EP-01-S11.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes. Repository history is kept by git and the git host, not the product audit log (EP-06).
- **Data changes:** None in the product database. Creates the repository and its first commit. No tables, no migrations.
- **UI reference:** No screen
- **Non-functional checks:** Security: before the first commit, the working tree is checked for secret values (for example a filled-in `GEMINI_API_KEY`); only `.env.example` with empty values is committed (BR-01-1).
- **Depends on:** None
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S2: Developer can install and build the web, api and shared packages from the root

- **Story ID:** EP-01-S2
- **Title:** Developer can install and build the web, api and shared packages from the root
- **As a:** Developer
- **I want:** a monorepo with three packages, `web`, `api` and `shared`, that install with one command and build with one command from the repository root
- **So that:** every later epic has one agreed place for front-end code, server code and shared domain rules (BR-01-2, FR-01-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a fresh clone on a machine with only Node and the package manager installed, when a developer runs the single root install command (for example `npm install` with npm workspaces), then dependencies for `web`, `api` and `shared` are installed and the command exits with code 0.
  2. Given the installed repository, when a developer runs the root build command, then `shared` builds first, then `web` and `api`, and each package writes its output to its own build folder without errors.
  3. Given the root `package.json`, when it is inspected, then its name is no longer `react-example`, it declares the three packages, and the broken `clean` script (`rm -rf dist server.js`) is replaced by one that removes each package's build output.
  4. Given the current dependencies `express` ^4.21.2, `dotenv` ^17.2.3, `@google/genai` ^2.4.0, `tsx` ^4.21.0 and `@types/express`, when the packages are split, then each one sits only in the package that uses it or is removed, and none of them remains in `web` unless `web` imports it.
  5. Given the `web` package, when it is built, then it keeps the current Vite, React 19, Tailwind 4 and TypeScript setup from `vite.config.ts` and `tsconfig.json`.
- **Rules enforced on the server:** None at runtime. The root build fails if any package fails to build, so a broken package cannot produce a release artefact.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes.
- **Data changes:** None in the product database. Repository layout changes: new `web/`, `api/` and `shared/` package folders, a root workspace configuration and per-package `package.json` and `tsconfig.json`.
- **UI reference:** No screen
- **Non-functional checks:** Precision: `tsc --noEmit` stays green in every package after the split, on `typescript` ^7.0.2. D1 is decided (Option C): `api` is the team's own Node + TypeScript server package. It is created here as a minimal package that builds; its server code arrives in EP-03.
- **Depends on:** EP-01-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S3: Developer can import domain rules and types from the shared package in web

- **Story ID:** EP-01-S3
- **Title:** Developer can import domain rules and types from the shared package in web
- **As a:** Developer
- **I want:** `src/domain/{weights,match,leads,edits,clock}.ts` and the types in `src/types/jewellery.ts` moved into the `shared` package, with `web` importing them from `shared`
- **So that:** the browser uses the same rules the server will enforce, for instant feedback only, and no second copy can drift (BR-01-4, FR-01-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given the `shared` package, when its public exports are listed, then they include every function and constant now exported by `weights.ts`, `match.ts`, `leads.ts`, `edits.ts` and `clock.ts`, and every type now exported by `src/types/jewellery.ts`, with the same names.
  2. Given the `web` package, when a developer searches it for files named `weights.ts`, `match.ts`, `leads.ts`, `edits.ts`, `clock.ts` or `jewellery.ts`, then none is found, and every former relative import of them now imports from `shared`.
  3. Given the repository after the move, when the typecheck and build run for `web`, then both pass and the staff `today` screen renders as it did before the move.
  4. Given a file in `web` that duplicates a `shared` module, when CI runs, then the run fails and names the duplicate file (risk mitigation from section 16).
  5. Given `shared/weights.ts` after the move, when it is inspected, then its unit constant (`UNITS_PER_G = 100000` today) is unchanged by this story, and a code comment points to gap G10, which EP-02 settles in favour of integer units of 0.0001 g.
- **Rules enforced on the server:** None at runtime in this story. The `shared` package is the single source that `api` will use as the authority (EP-01-S4).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes.
- **Data changes:** None in the product database. Files move from `src/domain/` and `src/types/` into `shared/`. No tables, no migrations.
- **UI reference:** No screen. Behaviour check uses the existing `today` route.
- **Non-functional checks:** Precision: weight helpers keep integer arithmetic and stay type-safe; no helper is changed to floating-point grams. Performance: the `web` production bundle does not grow by more than the size of the moved files.
- **Depends on:** EP-01-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S4: Developer can import the same shared package in api

- **Story ID:** EP-01-S4
- **Title:** Developer can import the same shared package in api
- **As a:** Developer
- **I want:** the `api` package to import domain rules and types from `shared`, the same package `web` uses
- **So that:** the server is the authority for the match gate, edit tokens and lead rules using exactly the code the browser shows feedback from, and `src/store/transitions.ts` has a place to land as the server service layer (BR-01-4, BR-01-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the `api` package, when it imports a function from `shared` (for example the match verdict from `match.ts`) and a type from the former `jewellery.ts`, then the `api` typecheck and build pass.
  2. Given the `api` package, when a developer searches it for copies of `shared` modules, then none is found, and the duplicate check from EP-01-S3 covers `api` as well as `web`.
  3. Given a change to a function signature in `shared`, when the typecheck runs, then both `web` and `api` are checked against the new signature in the same run, and a mismatch in either fails the run.
  4. Given the `api` package, when its folder layout is inspected, then it has a service-layer folder reserved for the functions now in `src/store/transitions.ts`, one function per endpoint, with a README line saying the move itself happens in EP-03.
- **Rules enforced on the server:** The `api` package must take every domain rule from `shared`. No rule is reimplemented inside `api`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes.
- **Data changes:** None in the product database. Adds the `shared` dependency to `api/package.json`.
- **UI reference:** No screen
- **Non-functional checks:** Precision: integer weight helpers from `shared` compile in the `api` build without type casts. D1 is decided (Option C): `api` is the Node + TypeScript API, and the check runs against its build.
- **Depends on:** EP-01-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S5: Developer can start web and api together with one dev command

- **Story ID:** EP-01-S5
- **Title:** Developer can start web and api together with one dev command
- **As a:** Developer
- **I want:** one root command that starts `web` and `api` together for local development
- **So that:** a new developer can see the app running against a local or development database within minutes, without starting each package by hand (FR-01-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a fresh clone with dependencies installed and a filled-in local environment file, when a developer runs the root dev command, then `web` starts on port 3000 (as `vite --port=3000 --host=0.0.0.0` does today) and `api` starts on its own configured port, and both log that they are ready.
  2. Given both processes running, when the developer opens `http://localhost:3000`, then the staff `today` screen is shown (epic acceptance criterion 1).
  3. Given both processes running, when the developer edits a file in `shared`, then `web` reloads and `api` restarts with the change, without rerunning the dev command.
  4. Given one of the two processes crashes, when the developer looks at the terminal, then the crashed package is named in the output and the other process is stopped, so the developer is not left with a half-running app.
- **Rules enforced on the server:** `api` refuses to start when a required environment variable from `.env.example` is missing, and names the missing variable.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes.
- **Data changes:** None in the product database. The local or development database itself is set up in EP-02.
- **UI reference:** No screen. Smoke check uses the existing `today` route.
- **Non-functional checks:** Security: the dev command reads secrets only from the local environment file, which `.gitignore` excludes. D1 is decided (Option C): the dev command starts `web` and the Node `api` server; no platform emulator is involved.
- **Depends on:** EP-01-S3, EP-01-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S6: Developer can configure each environment from environment variables only

- **Story ID:** EP-01-S6
- **Title:** Developer can configure each environment from environment variables only
- **As a:** Developer
- **I want:** development, staging and production to read all configuration and secrets from environment variables, with an example file that lists every variable name and no real values
- **So that:** no secret is ever committed, and no environment can read another environment's secrets or data (BR-01-1, BR-01-6, FR-01-7, FR-01-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given the repository, when the example environment file that replaces `.env.example` is opened, then it lists, with empty values and a one-line comment each: database connection, object storage credentials, WhatsApp provider credentials, email inbox credentials, LLM key (today `GEMINI_API_KEY`), public app URL (today `APP_URL`) and session signing secret.
  2. Given the codebase, when a developer searches for configuration reads, then every value comes from environment variables through one config module per package, and no code path depends on AI Studio injecting `GEMINI_API_KEY` or `APP_URL` at runtime.
  3. Given the staging and production environments, when their configured values are compared, then the database connection, storage credentials and session signing secret differ, and the production configuration contains no development or staging credential (epic acceptance criterion 5).
  4. Given the staging service, when it tries to connect to the production database with its own credentials, then the connection is refused.
  5. Given a production secret, when a developer without production access lists the production configuration, then the value is not shown to them.
  6. Given the example file and the config module, when a new variable is added to the module but not to the example file, then CI fails and names the missing variable.
- **Rules enforced on the server:** Each service reads only its own environment's configuration. Production secrets are readable only by the production services and the named developers with production access (least privilege).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes. Access to production configuration is logged by the hosting or secrets service, not the product audit log.
- **Data changes:** None in the product database. Creates three environment configurations and the new example environment file. `.env.example` is replaced, and `README.md` run instructions are updated to match.
- **UI reference:** No screen
- **Non-functional checks:** Security: no secret in the repository or in logs; config loading never prints values. Availability: staging and production are separate, so a broken staging configuration cannot affect the shop. D10 is decided: every environment runs in an India region. The exact region follows the D1a cloud provider, so write it as a configuration value, not a code assumption. Open question: whether AI Studio hosting is kept for any environment.
- **Depends on:** EP-01-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S7: System can run lint and typecheck on every push

- **Story ID:** EP-01-S7
- **Title:** System can run lint and typecheck on every push
- **As a:** System
- **I want:** the CI service to run lint and typecheck for `web`, `api` and `shared` on every push to any branch
- **So that:** a type error or lint failure is caught before review, not in production (BR-01-3, FR-01-4, FR-01-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a push to any branch, when CI starts, then it runs a lint step and a typecheck step (`tsc --noEmit` per package) for all three packages, and the result appears on the commit within the run.
  2. Given a push that breaks a type in `shared`, when CI runs, then the typecheck step fails, the run is marked failed, and the result names the typecheck step and the package and file with the error (epic acceptance criterion 2).
  3. Given a push with a lint error in `web`, when CI runs, then the lint step fails and is named in the result, and the typecheck step still runs so both problems are reported in one run.
  4. Given a push with no errors, when CI runs, then both steps pass and the run shows them as green.
- **Rules enforced on the server:** The CI service runs the steps; developers cannot mark a failed step as passed. CI logs mask every environment value.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Run id, commit, branch and step results are kept by the CI service, not the product database.
- **Data changes:** None in the product database. Adds the CI pipeline definition file to the repository.
- **UI reference:** No screen
- **Non-functional checks:** Performance: the lint and typecheck steps finish within the time the team agrees for a typical change, so developers wait for green instead of bypassing it. Security: CI secrets are masked in logs. Open question: which CI service is used depends on D1a (cloud provider).
- **Depends on:** EP-01-S1, EP-01-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S8: System can run tests on every push

- **Story ID:** EP-01-S8
- **Title:** System can run tests on every push
- **As a:** System
- **I want:** a test runner and a `test` script in every package, run by CI on every push
- **So that:** the domain, API and end-to-end tests that EP-40 writes have a pipeline step to run in from the first day (BR-01-3, FR-01-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the repository, when a developer runs the root `test` command, then the tests of `web`, `api` and `shared` run, which fixes the missing `test` script in today's `package.json`.
  2. Given `shared`, when the test step runs, then at least one placeholder test exercises a real `shared` export (for example a function from `weights.ts`) and passes, proving the runner resolves the package.
  3. Given a push with a failing test, when CI runs, then the test step fails, the run is marked failed, and the result names the test step and the failing test.
  4. Given a package with no tests yet, when the test step runs, then that package reports zero tests and does not fail the run.
- **Rules enforced on the server:** CI runs the tests on its own machines; a local pass does not count. The content of the tests (porting the deleted prototype assertions, gap G11) belongs to EP-40.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Test results are kept by the CI service.
- **Data changes:** None in the product database. Adds a test runner as a dev dependency and a `test` script per package.
- **UI reference:** No screen
- **Non-functional checks:** Performance: the test step stays within the agreed CI time. Security: tests that need configuration read it from CI environment variables, never from committed values.
- **Depends on:** EP-01-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S9: System can run the build for every package on every push

- **Story ID:** EP-01-S9
- **Title:** System can run the build for every package on every push
- **As a:** System
- **I want:** CI to build `shared`, `web` and `api` on every push and keep the build output of main-branch runs
- **So that:** a change that type-checks but does not build is caught, and the exact build that passed can later be deployed (BR-01-3, FR-01-4, FR-01-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a push to any branch, when CI runs, then the build step builds `shared`, `web` and `api` in dependency order and reports each package's result.
  2. Given a push that breaks the `web` Vite build, when CI runs, then the build step fails and the result names the build step and the `web` package.
  3. Given a green run on the main branch, when it finishes, then the build output of `web` and `api` is stored as a release artefact tagged with the commit, for use by EP-01-S12.
  4. Given a CI run where lint, typecheck, tests and build all pass, when the result is shown, then the four steps appear by name and all are green.
- **Rules enforced on the server:** Only the CI service creates release artefacts. A developer's local build cannot be deployed.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Artefact records are kept by the CI service.
- **Data changes:** None in the product database. Adds the build step and artefact storage to the CI pipeline definition.
- **UI reference:** No screen
- **Non-functional checks:** Security: build output contains no secret values; environment values are injected at deploy time, not baked into the `web` bundle, except public values such as the app URL. Performance: the build step stays within the agreed CI time.
- **Depends on:** EP-01-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S10: System can fail a run that contains a committed secret

- **Story ID:** EP-01-S10
- **Title:** System can fail a run that contains a committed secret
- **As a:** System
- **I want:** a secret-scanning step in CI that fails the run when a commit contains a secret value
- **So that:** WhatsApp, email, LLM and database credentials never reach the repository unnoticed (BR-01-1, FR-01-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a commit that adds a file containing a real-looking API key assigned to `GEMINI_API_KEY`, when CI runs, then the secret-scanning step fails the run and names the file and line (epic acceptance criterion 4).
  2. Given a commit that adds a database connection string with a password, when CI runs, then the run fails and names the file.
  3. Given the example environment file with empty values, when CI runs, then the scan passes and does not report the variable names as secrets.
  4. Given a failed scan, when the CI log is read, then the log shows the file and line but masks the secret value itself.
- **Rules enforced on the server:** The scan runs in CI on every push and cannot be skipped by the developer. A failed scan blocks the merge through EP-01-S11.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Scan results are kept by the CI service.
- **Data changes:** None in the product database. Adds the scanning step and its allow-list (for example the example environment file) to the CI pipeline definition.
- **UI reference:** No screen
- **Non-functional checks:** Security: the scanned value is never printed in plain text in CI output. A leaked secret is rotated, not only removed; rotation itself belongs to EP-39.
- **Depends on:** EP-01-S6, EP-01-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S11: System can block a merge into main without a green run

- **Story ID:** EP-01-S11
- **Title:** System can block a merge into main without a green run
- **As a:** System
- **I want:** branch protection on the main branch that requires the latest CI run on the incoming branch to be green
- **So that:** main always holds code that passed lint, typecheck, tests, build and the secret scan, and only main is deployed (FR-01-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given a branch whose latest CI run failed the typecheck step, when a developer tries to merge it into main, then the git host blocks the merge and shows the failed check by name.
  2. Given a branch whose CI run is still in progress, when a developer tries to merge it, then the merge is blocked until the run finishes green.
  3. Given a branch whose latest run is green on all of lint, typecheck, tests, build and secret scan, when a developer merges it, then the merge is allowed.
  4. Given a developer with write access, when they try to push directly to main, then the push is rejected.
  5. Given a repository administrator, when they inspect the protection settings, then "require status checks to pass" lists the five CI steps by name and admin bypass is switched off or limited to named people recorded in the decision record.
- **Rules enforced on the server:** The git host enforces the protection rule, not the developer's machine. Direct pushes and force pushes to main are refused.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Merge history and protection-setting changes are kept by the git host.
- **Data changes:** None in the product database. Changes repository settings on the git host.
- **UI reference:** No screen
- **Non-functional checks:** Security: least privilege; only named people can change branch protection. Performance: the CI time agreed in EP-01-S7 keeps the rule practical so it is not bypassed.
- **Depends on:** EP-01-S7, EP-01-S8, EP-01-S9, EP-01-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S12: System can deploy a green main build to staging

- **Story ID:** EP-01-S12
- **Title:** System can deploy a green main build to staging
- **As a:** System
- **I want:** CI to deploy the `web` and `api` artefacts of every green main-branch run to staging with no manual steps
- **So that:** every merged change can be checked on a shared environment that is separate from the shop (FR-01-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a merge into main whose CI run is green, when the run finishes, then the `web` and `api` artefacts from EP-01-S9 for that commit are deployed to staging without any manual step (epic acceptance criterion 3).
  2. Given the staging deploy has finished, when a developer opens the staging URL, then `web` loads and shows the commit id of the deployed build in a place the team agrees (for example a version line in the page source or an `api` version response).
  3. Given a main-branch run that failed any step, when it finishes, then nothing is deployed and staging keeps the previous build.
  4. Given a staging deploy that fails part-way, when the failure is detected, then staging keeps or returns to the previous working build and the CI result names the failed deploy step.
  5. Given the staging services, when they start, then they read only staging configuration from EP-01-S6.
- **Rules enforced on the server:** Only the CI service can deploy to staging, and only artefacts built by CI from main.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Deploy records (commit, time, result) are kept by the CI service and hosting provider.
- **Data changes:** None in the product database. Creates the staging deploy target for `web` and `api`. Staging data and migrations arrive in EP-02.
- **UI reference:** No screen
- **Non-functional checks:** Availability: a failed staging deploy cannot affect production. Security: the deploy credential for staging cannot deploy to production. Open decision D1a: the deploy targets depend on the cloud provider, in an India region (D10, decided); write the steps against the chosen provider. Open question: whether a preview deploy per branch is needed in addition to staging.
- **Depends on:** EP-01-S6, EP-01-S9, EP-01-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-01-S13: Developer can promote a staging build to production

- **Story ID:** EP-01-S13
- **Title:** Developer can promote a staging build to production
- **As a:** Developer
- **I want:** an explicit promotion step that releases the exact build already running on staging to production
- **So that:** the shop only ever runs a build that was deployed and checked on staging first (FR-01-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a build running on staging, when a named developer with deploy rights runs the promotion step, then the same `web` and `api` artefacts (same commit id) are deployed to production, with no rebuild.
  2. Given a commit that was never deployed to staging, when anyone tries to promote it, then the promotion is refused with a message saying the build is not on staging.
  3. Given a developer without production deploy rights, when they try to run the promotion step, then it is refused.
  4. Given a promotion has finished, when a developer checks production, then it reports the promoted commit id and reads only production configuration.
  5. Given a promotion that fails part-way, when the failure is detected, then production keeps or returns to the previous build, and the result names the failed step.
- **Rules enforced on the server:** The CI service or hosting provider enforces that only builds already on staging can be promoted, and only by the named developers with production deploy rights.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Promotion records (who, when, commit, result) are kept by the CI service and hosting provider, not the product audit log.
- **Data changes:** None in the product database. Creates the production deploy target for `web` and `api`.
- **UI reference:** No screen
- **Non-functional checks:** Security: least privilege for deploy rights; production secrets readable only by production services. Availability: promotion keeps the previous build available to return to. Open decision D1a: the production target depends on the cloud provider, in an India region (D10, decided).
- **Depends on:** EP-01-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D1a: which cloud provider hosts the environments? D1 is decided (Option C), so `api` is a Node + TypeScript server project. (EP-01-S12, S13)
- D10 is decided (India region). Does staging have to be in the same India region as production? (EP-01-S6, S12, S13)
- Is AI Studio hosting kept for any environment, or replaced everywhere? (EP-01-S6)
- Where does the product repository live, given the project is untracked under the parent folder `/Users/prabhu.govindaraj/Documents/personalproject`? (EP-01-S1)
- Which CI service and which deploy targets are used? This depends on D1a. (EP-01-S7 to S13)
- Does a preview deploy per branch help the team, or is staging enough? (EP-01-S12)
