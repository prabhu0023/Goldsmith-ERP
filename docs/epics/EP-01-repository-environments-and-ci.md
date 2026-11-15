# EP-01: Repository, environments and CI

## 1. Summary

This epic sets up the code repository, the three environments (development, staging, production) and the
continuous integration pipeline. Today the prototype is one Vite package that runs in a browser on mock data. A live,
multi-user application needs a web app, a server and a shared package of business rules that both use, plus a safe
place for secrets and a pipeline that refuses broken code. Every later epic is built, tested and deployed through
what this epic provides, so it comes first.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Partial. A single-package Vite app exists with `npm run lint` (`tsc --noEmit`) and `npm run build`, but there is no monorepo, no environments, no CI and no secrets handling beyond `.env.example`.

## 3. Roles involved

- System: the CI service runs lint, typecheck, tests and build on every push and blocks merges that fail.
- Developer (not a product role): clones the repo, runs it locally, and deploys through the pipeline. Stories in this epic use "Developer can …".
- Owner, Staff, Karigar: not involved. Nothing in this epic is visible in the product.

## 4. In scope

- A monorepo with three packages: `web` (staff, owner and karigar front end), `api` (server), `shared` (types and domain rules).
- Moving `src/domain/**` and the types in `src/types/jewellery.ts` into the `shared` package so the server and the browser use one copy.
- Development, staging and production environments with separate configuration and separate data.
- Secrets in environment configuration only (WhatsApp, email, LLM and database credentials, `GEMINI_API_KEY`), never committed.
- A CI pipeline that runs lint, typecheck, tests and build on every push.
- Branch protection: a merge to the main branch needs a green CI run.
- A repeatable deploy of `web` and `api` to staging, and a promoted deploy to production.
- A decision record of the repository root location (see section 6).

## 5. Out of scope

- The database schema, migrations and seed scripts (EP-02).
- The API framework, error format and health check (EP-03).
- The content of the automated tests: domain, API, end-to-end and concurrency tests (EP-40).
- Logs, error tracking, uptime checks and alerting (EP-37).
- Backups and restore drills (EP-38).
- Secrets rotation and penetration testing (EP-39).
- Choice of cloud provider (D1a, open). D10 is decided (India region) and is recorded here as a constraint on where environments live.
- The production front-end foundation (design system package, API client, signed-in shell). Owned by EP-08 Front-end production foundation (was gap G1).

## 6. Current state in the prototype

- `package.json`: name `react-example`; scripts `dev` (`vite --port=3000 --host=0.0.0.0`), `build` (`vite build`), `preview`, `clean` (`rm -rf dist server.js`, but no `server.js` exists), `lint` (`tsc --noEmit`). There is no `test` script and no test runner.
- `package.json` dependencies already list `express` ^4.21.2, `dotenv` ^17.2.3, `@google/genai` ^2.4.0, and dev dependencies `tsx` ^4.21.0, `@types/express`. None of them is used by any file in `src/`. They fit the own Node API decided under D1 (Option C), which was never written.
- TypeScript is `typescript` ^7.0.2; `tsconfig.json` and `vite.config.ts` configure one browser package.
- `.env.example` holds `GEMINI_API_KEY` and `APP_URL`, both described as injected by AI Studio at runtime. `README.md` gives AI Studio run instructions. `metadata.json` is AI Studio metadata.
- `.gitignore` exists. The git root is the parent folder `/Users/prabhu.govindaraj/Documents/personalproject`, and this project is untracked inside it. The product repository must be created or re-rooted before CI can run on pushes.
- Source layout that maps onto the target packages (PRODUCTION-SCOPE §8): `src/domain/{weights,match,leads,edits,clock}.ts` and `src/types/jewellery.ts` go to `shared`; `src/components/**`, `src/nav.ts`, `src/App.tsx` go to `web`; `src/store/transitions.ts` becomes the `api` service layer; `src/data/seed.ts` and `seedRows.ts` become dev and staging seed data.
- Reusable: the Vite, React 19, Tailwind 4 and TypeScript configuration for `web`; the `tsc --noEmit` typecheck; the domain files as the starting content of `shared`.
- Must be rebuilt server-side: nothing in this epic runs on the server, but the `api` package, its build, and its deploy target are new. The pipeline, environments and secrets store are all new.

## 7. Functional requirements

- FR-01-1. A developer can clone one repository that contains the `web`, `api` and `shared` packages and install them with one command.
- FR-01-2. The `shared` package exports the domain rules now in `src/domain/` and the types now in `src/types/jewellery.ts`, and both `web` and `api` import them from `shared` rather than keeping copies.
- FR-01-3. One command starts `web` and `api` together for local development against a local or development database.
- FR-01-4. CI runs lint, typecheck, tests and build for every package on every push to any branch.
- FR-01-5. CI fails the run when any of the four steps fails, and the failing step is named in the result.
- FR-01-6. A merge into the main branch is blocked unless the latest CI run on that branch is green.
- FR-01-7. Development, staging and production each read their configuration from environment variables, and no environment can read another's secrets or data.
- FR-01-8. A secret value committed to the repository is detected by a CI check and fails the run.
- FR-01-9. A green main branch deploys `web` and `api` to staging without manual steps.
- FR-01-10. Production deploys only from a build already deployed to staging, by an explicit promotion step.
- FR-01-11. The repository includes an example environment file listing every variable name with no real values, replacing `.env.example`.

## 8. Business rules

- BR-01-1. Secrets live in environment configuration, never in the repository. [PRODUCTION-SCOPE §5 Security]
- BR-01-2. The repository is split into web, api and shared packages. [PRODUCTION-SCOPE §6 EP-01 scope]
- BR-01-3. CI runs lint, typecheck, tests and build on every push. [PRODUCTION-SCOPE §6 EP-01 scope]
- BR-01-4. `src/domain/**` moves to a shared package used by the server as the authority and by the client for instant feedback. [PRODUCTION-SCOPE §8]
- BR-01-5. `src/store/transitions.ts` becomes the server-side service layer, one function per endpoint, so the `api` package is where it lands. [PRODUCTION-SCOPE §8]
- BR-01-6. Environments are dev, staging and production. [PRODUCTION-SCOPE §6 EP-01 scope]
- BR-01-7. Hosting is in an India region, for latency and personal-data law (D10, decided); every environment runs in an India region of the D1a cloud provider. [PRODUCTION-SCOPE §4 D10]

## 9. Data

- No business entities. This epic creates no tables and changes no records.
- Configuration items per environment: database connection, object storage credentials, WhatsApp provider credentials, email inbox credentials, LLM key (today `GEMINI_API_KEY`), public app URL (today `APP_URL`), session signing secret.
- CI records: run id, commit, branch, step results. These live in the CI service, not in the product database.
- Weights do not appear in this epic. Where the shared package carries weight helpers, they use integer units of 0.0001 g (see EP-02 and gap G10).

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API. This epic
exposes no product operations; the table lists the pipeline operations only.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Run | CI pipeline | Lint, typecheck, test and build a commit | System (on every push) |
| Deploy | Staging environment | Release a green main-branch build to staging | System (CI) |
| Promote | Production environment | Release a build already on staging to production | Developer with deploy rights |
| Read | Environment configuration | Supply secrets to a running service | The service in that environment only |

## 11. Live events

None. This epic builds the repository and pipeline; no product state changes happen here, so nothing is emitted or
consumed.

## 12. Screens and UX references

No screen of its own. Every screen depends on it, because every route in `src/nav.ts` (from `today` and `decisions`
to `k-jobs`) is built and deployed through this pipeline. No mockup in `docs/ux/mockups/` applies.

## 13. Non-functional requirements

- Security: no secret in the repository or in CI logs; CI masks environment values; production secrets are readable only by the production services. [PRODUCTION-SCOPE §5 Security]
- Security: least privilege for deploy rights; only named developers can promote to production.
- Availability and recovery: staging and production are separate, so a broken staging deploy cannot affect the shop.
- Performance: the CI run for a typical change finishes in a time the team agrees, so the "green before merge" rule is followed rather than bypassed.
- Precision: the shared package must keep the typecheck green (`tsc --noEmit` passes today on `typescript` ^7.0.2), so weight helpers in integer units of 0.0001 g are type-safe in both `web` and `api`.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): —
- Downstream: EP-02, EP-41.

## 15. Epic acceptance criteria

1. Given a fresh machine, when a developer clones the repository and runs the install and dev commands, then `web` and `api` start and `web` shows the staff `today` screen.
2. Given a push that breaks a type, when CI runs, then the typecheck step fails and the merge into main is blocked.
3. Given a green main branch, when CI finishes, then the same build is running on staging without manual steps.
4. Given a commit that contains a secret value, when CI runs, then the run fails and names the file.
5. Given the production environment, when its configuration is inspected, then it contains no development or staging credentials.
6. Done when `web` and `api` both import domain rules from `shared` and no copy of `src/domain` remains in `web`.

## 16. Risks

- Risk: the project is untracked inside a parent git root, so history and CI hooks attach to the wrong repository. Mitigation: create a dedicated repository for the product as the first story and move the code into it.
- Risk: AI Studio injects `GEMINI_API_KEY` and `APP_URL` at runtime, and keeping that hosting couples the app to it. Mitigation: read all configuration from plain environment variables so hosting can change later.
- Risk: domain rules get copied into `web` and `api` and drift apart. Mitigation: CI fails when `web` or `api` contains a file that duplicates a `shared` module; review rule that domain changes go in `shared` only.
- Risk: the D1a cloud provider is chosen after the repo is set up and changes the deploy targets. Mitigation: settle D1a before the deploy stories start, and keep provider details in environment configuration.
- Risk: unused dependencies (`express`, `tsx`, `dotenv`) stay in `web` and bloat it. Mitigation: move each to the package that uses it, or drop it, when the packages are split.

## 17. Open decisions and questions

- D1a: which cloud provider hosts the environments? D1 is decided (Option C), so `api` is a Node + TypeScript server project.
- D10 is decided (India region). Does staging have to be in the same India region as production?
- Is AI Studio hosting kept for any environment, or replaced everywhere?
- Where does the product repository live, given the project is untracked under the parent folder `/Users/prabhu.govindaraj/Documents/personalproject`?
- Which CI service and which deploy targets are used? This depends on D1a.
- Does a preview deploy per branch help the team, or is staging enough?

## 18. Candidate stories

1. EP-01-S1: Developer can clone one product repository rooted at the project, not the parent folder
2. EP-01-S2: Developer can install and build the web, api and shared packages from the root
3. EP-01-S3: Developer can import domain rules and types from the shared package in web
4. EP-01-S4: Developer can import the same shared package in api
5. EP-01-S5: Developer can start web and api together with one dev command
6. EP-01-S6: Developer can configure each environment from environment variables only
7. EP-01-S7: System can run lint and typecheck on every push
8. EP-01-S8: System can run tests on every push
9. EP-01-S9: System can run the build for every package on every push
10. EP-01-S10: System can fail a run that contains a committed secret
11. EP-01-S11: System can block a merge into main without a green run
12. EP-01-S12: System can deploy a green main build to staging
13. EP-01-S13: Developer can promote a staging build to production
