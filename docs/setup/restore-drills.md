# Restore drills

One row per restore drill, added by `npm run drill:record` after the drill in [restore-drill.md](restore-drill.md). Read a row left to right: the day, the environment, the restore point used, how long the drill took in minutes, whether that is within the target (60 minutes until the owner decides the number, so every default-target row says provisional), which of the eight steps passed, who ran it and any notes. Do not edit rows by hand.

| Date | Environment | Restore point | Duration (min) | Against target | Steps | Run by | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-28 | development | backup db-20261128T085924Z-eab6 taken 2026-11-28T08:59:24Z | 2 | within 60 min (provisional) | 8 of 8 pass | prabhu.govindaraj (lane c) | Lane c, seeded plus one API upload (FILE-2026-00005); damaged copy failed the check as it must; smoke test as owner passed after drill doc fixes; owner approval = this task |
