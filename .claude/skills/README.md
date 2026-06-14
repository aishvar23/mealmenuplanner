# Project skills

Claude Code skills checked into this repo. They're auto-discovered at session
startup and invoked as slash commands (e.g. `/tracker-autopilot`).

| Skill                                                                     | Invoke                              | What it does                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`tracker-autopilot`](./tracker-autopilot/SKILL.md)                       | `/tracker-autopilot [tracker-path]` | **Project-agnostic.** Autonomously works through any checked-in implementation tracker: pick the next unblocked task → implement → open a PR → code-review → fix findings → merge, one task per iteration, until the backlog is blocked. Discovers the repo's tracker, quality gate, and conventions on first run. |
| [`meal-provider-autopilot-loop`](./meal-provider-autopilot-loop/SKILL.md) | `/meal-provider-autopilot-loop`     | The Meal Provider preset of the same loop, wired to the ADO work-item backlog and this repo's DoD gate (cloud-dev migrations, web↔mobile parity, surgical type patches).                                                                                                                                           |

## How they work

Both drive a **headless `claude -p` worker** once per loop step (implement →
review → fix → merge) and advance a deterministic state machine — the
orchestrating session never writes feature code itself. The skills encode the
non-obvious failure modes learned in practice (concurrency false-positives from
running claude-inside-claude, orphaned background tasks, account session-limit
handling, partial-task bookkeeping, and not clobbering hand-maintained generated
artifacts), plus a **resume-after-restart** procedure (reconcile open PRs /
branch WIP before picking new work).

See each `SKILL.md` for the full procedure, exact worker prompts, and the
`PR_RESULT:` / `FIX_RESULT:` / `MERGE_RESULT:` / `BACKLOG_BLOCKED:` sentinels.
