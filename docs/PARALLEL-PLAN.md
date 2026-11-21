# Which epics can run in parallel

Worked out from the Depends-on column of `docs/PRODUCTION-SCOPE.md` section 6. An epic can start once
every epic it depends on is merged. Epics in the same wave do not depend on each other.

Status on 21 November 2026: EP-01 done (except deploy S12, S13), EP-02 merged, EP-03 in progress.

## Waves

| Wave | Epics that can run side by side | Waits for |
| --- | --- | --- |
| 1 | **EP-03 API foundation** (in progress) · EP-38 Backup and recovery (local part only) | EP-02 |
| 2 | **EP-04 Authentication** · EP-09 File storage · EP-10 Background jobs · EP-40 Automated testing | EP-03 |
| 3 | **EP-05 Users, roles and permissions** | EP-04 |
| 4 | **EP-06 Audit log** · **EP-07 Live channel** | EP-05 |
| 5 | **EP-08 Front-end production foundation** | EP-03, 04, 05, 07 |
| 6 | EP-11 Notifications · EP-13 Shop settings · EP-15 Reference data · EP-16 Karigar master · EP-17 Customer master · EP-18 Metal pool ledger | EP-08 (and their own lower deps) |
| 7 | EP-12 WhatsApp · EP-14 Scale registry · EP-19 Order copy and karigar jobs · EP-28 Leads: manual intake · EP-39 Security | wave 6 |
| 8 | EP-20 Karigar portal · EP-29 Leads: automatic PO intake · EP-33 Wishes · EP-37 Observability · EP-45 Shop setup wizard | wave 7 |
| 9 | **EP-21 Parcel intake and tagging** · EP-44 Localisation (Later) | EP-20, EP-14, EP-15, EP-09 |
| 10 | **EP-22 Stock and piece lifecycle** · **EP-23 Exact-match gate** | EP-21 |
| 11 | EP-24 Stop the line · EP-25 Edit proposals · EP-26 Stock-out · EP-27 Scrap · EP-30 Lead conversion · EP-34 Broadcast | wave 10 |
| 12 | EP-31 Staff Today · EP-32 Owner Decisions · EP-36 Scale and printer hardware · EP-42 Pricing (Later) · EP-43 Gamification (Later) | wave 11 |
| 13 | EP-35 Reports | everything in C and D |
| Last | EP-41 Launch and data migration | all of the above |

Bold epics are on the **critical path**: a single chain that sets the minimum number of steps. It runs
EP-03 → EP-04 → EP-05 → EP-07 → EP-08 → EP-16 → EP-19 → EP-20 → EP-21 → EP-23 → EP-24 → EP-32 → EP-35.
Delaying any epic on it delays the whole project. Epics off the path have slack.

## The narrow part, and where it opens up

Waves 2 to 5 are a bottleneck. Almost everything waits for **EP-08**, because every feature screen
needs sign-in, permissions and the live channel first. After EP-08, waves 6 to 8 are wide: up to six
epics at once.

## Limits on running things in parallel here

- **Local-first plan.** Cloud parts wait for D1a: EP-01-S12/S13 deploy, the cloud side of EP-38 backups,
  and EP-37 alerting. Their local parts can be built in their wave.
- **Shared files collide.** Parallel pull requests all add migrations, contract operations and route
  registrations. Migrations are numbered `0001`, `0002` … today, so two branches that both add `0013`
  will clash. Before running epics in parallel, switch new migrations to timestamp names
  (for example `20261121T1030_metal_pool.sql`) or reserve a number range per branch.
- **Review capacity.** Every pull request needs your merge. Two or three open at once is manageable;
  six is not.
- **Merge order.** When two parallel PRs are both green, merge one, then rebase the other onto the new
  main and let CI run again before merging it.

## Suggested lanes

| Lane | Now | After EP-03 merges | After EP-05 | After EP-08 |
| --- | --- | --- | --- | --- |
| A (critical path) | EP-03 | EP-04 → EP-05 | EP-07 → EP-08 | EP-16 → EP-19 → EP-20 → EP-21 … |
| B (support) | — | EP-10 Background jobs, then EP-09 File storage | EP-06 Audit log | EP-18, EP-17, EP-13, EP-15, EP-11 |
| C (quality, optional) | EP-38 local backup and restore script | EP-40 test tooling | — | EP-28 Leads manual intake |

Two lanes (A and B) is the practical maximum while you are the only reviewer.

Note: the PRODUCTION-SCOPE table lists EP-41's dependencies as "All above", which a script reads as no
dependencies. EP-41 is the last epic.
