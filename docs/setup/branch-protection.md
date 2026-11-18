# Branch protection for main (EP-01-S11)

CI (`.github/workflows/ci.yml`, workflow name `CI`) reports five checks on every push and pull request. GitHub shows each one by its job name:

| Required check | What it runs |
| --- | --- |
| `Lint` | Biome lint on all packages, then the shared-duplicate check |
| `Typecheck` | `tsc --noEmit` for shared, web and api (one step each) |
| `Test` | Vitest for shared, web and api (one step each) |
| `Build` | build of shared, then web, then api; on main it stores the `release-<commit sha>` artefact |
| `Secret scan` | gitleaks over the full history, values redacted |

GitHub only offers a check in the settings after it has run once, so push the branch (or open a pull request) and let CI finish before step 4.

## Settings (repository administrator)

Repository: `prabhu0023/Goldsmith-ERP`.

1. Open the repository on GitHub, then **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. **Ruleset name:** `Protect main`. **Enforcement status:** `Active`.
3. **Bypass list:** leave it empty. If someone must be able to bypass, add only that named person and record the name and the reason in `docs/setup/repository.md` (EP-01-S11 criterion 5).
4. **Target branches:** **Add target → Include default branch** (main).
5. Under **Branch rules**, tick:
   - **Restrict deletions**.
   - **Require a pull request before merging** (this rejects direct pushes to main). Required approvals: `0` while there is one developer, raise it when there are more.
   - **Require status checks to pass**, with **Require branches to be up to date before merging** ticked. Click **Add checks** and add, with source **GitHub Actions**: `Lint`, `Typecheck`, `Test`, `Build`, `Secret scan`.
   - **Block force pushes**.
6. Click **Create**.

If you prefer classic protection (**Settings → Branches → Add classic branch protection rule**): branch name pattern `main`; tick **Require a pull request before merging**, **Require status checks to pass before merging** (add the same five checks), **Require branches to be up to date before merging**, and **Do not allow bypassing the above settings**; leave **Allow force pushes** and **Allow deletions** unticked.

## Who may change these settings

Only repository administrators can change rulesets. Keep administrator access to the named owners recorded in `docs/setup/repository.md`; give every other developer the **Write** role.

## How to check it works

1. **Failed check blocks the merge:** open a pull request with a deliberate type error in `packages/shared`. The `Typecheck` check fails and the merge button says the required check failed, naming `Typecheck`.
2. **Running check blocks the merge:** open a pull request and look before CI finishes. The checks show as pending and merging is blocked.
3. **Green run allows the merge:** fix the error. When all five checks are green the merge button is enabled.
4. **Direct push is rejected:** `git push origin main` from a local commit fails with a message that the branch is protected.
5. **Settings inspected:** the ruleset lists the five checks by name and the bypass list is empty (or lists only the people named in `docs/setup/repository.md`).

## Adding a deploy step later

The staging deploy (EP-01-S12) waits for decision D1a (cloud provider). Add it as a new job in `ci.yml` with `needs: [lint, typecheck, test, build, secret-scan]` and `if: github.ref == 'refs/heads/main'`, downloading the `release-<sha>` artefact. The five required checks above do not change.
