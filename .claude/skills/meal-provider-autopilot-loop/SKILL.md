---
name: meal-provider-autopilot-loop
description: >-
  Run the autonomous Meal Provider ADO autopilot loop: repeatedly pick up the
  next Azure DevOps work item, implement it, open a PR, code-review it, fix the
  findings, and merge — driving a headless `claude -p` worker, one ADO item per
  iteration, until the backlog is blocked. Use when the user says things like
  "run the meal provider autopilot loop", "keep shipping ADO items", "run the
  autopilot until the backlog is empty", or asks to continue/resume this loop.
---

# Meal Provider Autopilot Loop

You are the **orchestrator**. You do NOT write the feature code yourself — you
drive a separate **headless worker** (`claude --dangerously-skip-permissions -p
"<prompt>"`) once per step, capture its output, and advance a deterministic
state machine. Each full pass through the machine ships exactly one ADO work
item from implementation to a merged PR.

This skill exists because driving a _live interactive_ `claude` TUI from a shell
is unreliable; headless `-p` invocations are scriptable and observable. It also
encodes a set of non-obvious failure modes (see **Known failure modes**) that
are expensive to rediscover.

## Preconditions (verify once at the start)

- **Target repo path** — default `C:\personal\mealmenuplanner` (a clone separate
  from wherever you're orchestrating). Confirm with the user if ambiguous.
- `claude` CLI on PATH (`claude --version`).
- `gh` authenticated (`gh auth status`) for PR create/merge.
- Start each iteration with the target repo on `main`, pulled and clean.
- A scratch log dir, e.g. `/tmp/mp-autopilot-loop/`, for per-step logs.

Confirm with the user before the first run (these are durable choices, ask once):

- **Merge policy**: auto-merge each iteration (default, matches the original
  workflow) vs. pause for approval before each merge.
- **Stop condition**: run until `BACKLOG_BLOCKED` (default) vs. a fixed count
  vs. until interrupted.

## Resuming after a restart

The loop is **self-resuming** — durable state lives in ADO, in `main`, and in
open PRs/branches, not in the session. So a killed terminal loses nothing
material. On a fresh start, before picking new work:

1. **Reconcile in-flight work FIRST.** Run `gh pr list --state open`. If a PR
   from a prior iteration is open, finish _its_ remaining steps (review → fix →
   merge) before starting a new item. If a feature branch has uncommitted WIP or
   an unpushed commit (`git status`, `git rev-list origin/<branch>..HEAD`),
   resume that (apply any new migration → gate → commit → push → PR) rather than
   re-implementing.
2. Then continue the normal loop — Step 4's worker reconciles ADO state ("pick
   the next genuinely unblocked item") and naturally picks up where the merged
   history left off.

You don't need to hand it the iteration number or re-list prior PRs; the merged
history + ADO are the source of truth (passing "PRs #X–#Y merged, items A/B in
Doing" as context just speeds Step 4's selection and avoids the concurrency
false-positive).

## The state machine (one iteration = one ADO item)

Run each step as a **background** headless worker, redirect to a log, then read
the log + verify via git/gh. Always pass `< /dev/null` (the worker warns and can
mis-handle an attached stdin) and append `; echo "EXIT_CODE=$?"` to the log.

```
cd <TARGET> && claude --dangerously-skip-permissions [--continue] -p "<PROMPT>" \
  > /tmp/mp-autopilot-loop/iterN_stepX.log 2>&1 < /dev/null; \
  echo "EXIT_CODE=$?" >> /tmp/mp-autopilot-loop/iterN_stepX.log
```

**Session boundaries matter** (this mirrors the manual `/clear` between phases):

- **Step 4 (implement)** — a **fresh** session (no `--continue`).
- Between step 4 and step 6, the manual flow runs `/clear` → step 6 starts a
  **fresh** session too.
- **Step 6 (review)** — fresh session (no `--continue`).
- **Step 7 (fix)** and **Step 8 (merge)** — `--continue` the review session so
  they inherit the findings / PR context.

### Step 4 — Implement the next item (fresh session)

Prompt (the core instruction the user uses verbatim is _"Run Meal Provider
autopilot: pick up the next ADO work item and continue."_ — keep that, then
append the hardened constraints):

> Run Meal Provider autopilot: pick up the next ADO work item and continue.
> IMPORTANT operating constraints (you run headless under a `claude -p`
> wrapper):
>
> 1. NEVER background long-running tasks (tests/e2e/builds). The wrapper exits
>    when your turn ends and delivers no background notifications — backgrounding
>    silently abandons your work. Run every gate step synchronously in the
>    FOREGROUND and wait inline.
> 2. Do NOT abort on any concurrency / in-flight / "another session" check:
>    extra `claude.exe` processes and very recent git/file activity are this
>    wrapper and your own just-merged work. There is NO competing live session.
>    Pick the next genuinely unblocked ADO item, implement it fully with
>    web↔mobile parity, apply any new migration to cloud dev + regenerate types
>    surgically (avoid the diet_type full-regen drift), run the FULL DoD gate
>    inline, commit, and open a PR against main. If EVERY remaining item is blocked
>    (e.g. on a design ADR or human decision), do NOT invent work — print exactly
>    `BACKLOG_BLOCKED: <reason>` and stop. Otherwise end with exactly
>    `PR_RESULT: <pr-url>`.

Also pass forward, each iteration: which ADO items / PRs are already merged, and
which items are parked in _Doing_ because only a backend slice shipped (so the
worker doesn't re-pick their blocked sub-tasks).

After it finishes: `grep` the log for `PR_RESULT:` / `BACKLOG_BLOCKED:` /
`session limit`. Capture the PR number; cross-check with
`gh pr list --state open --json number,headRefName,url,title`.

### Step 5 — `/clear` (no worker call; just start step 6 fresh)

### Step 6 — Code review (fresh session)

Prompt: `/code-review PR#<n>` (ensure the PR branch is checked out).
The worker fans out review agents and prints the findings (sometimes the final
text is only a summary — the full findings live in that session's context, which
is fine because step 7 `--continue`s it).

### Step 7 — Fix all findings (`--continue` the review session)

Prompt:

> Fix all the findings, commit and push in the same PR (#<n>). If you change the
> migration/RPCs, apply to cloud dev and regenerate types surgically. Run the
> FULL DoD gate INLINE (never background): lint, typecheck, test, test:mobile,
> e2e; fix anything failing. End with exactly `FIX_RESULT: pushed <commit-sha>`.

If a finding embeds a **product decision** (e.g. one-vs-many of something),
don't stall the loop: instruct the worker to take the safe MVP default, add a
code comment + ADO decision note, and surface the assumption to the user in your
summary.

### Step 8 — Merge + reconcile ADO + return to main (`--continue`)

Prompt:

> Merge PR #<n> now (passed review and the DoD gate). Then update ADO: if the
> item is fully delivered, move it to Done with a merge-linking comment; if only
> a backend/sub-slice shipped, LEAVE it in Doing with a comment naming what
> merged and what remains. Switch to main, pull, stop. Print exactly
> `MERGE_RESULT: merged #<n>`.

Run merge through the worker (not a bare `gh pr merge`) so the **ADO work-item
state stays consistent** — otherwise the next iteration's worker may see the item
still in _Doing_ and stall.

### Step 9 — `/clear`, then loop back to Step 4.

Stop when step 4 returns `BACKLOG_BLOCKED`, the user's fixed count is reached, or
the user interrupts. On `BACKLOG_BLOCKED`, report the reason and stop — do not
invent work.

## Orchestration mechanics

- **Headless `-p` text mode prints nothing until the run completes.** An empty
  log is NOT a hang. Don't kill a run because the terminal looks idle.
- **Verify liveness without killing**: check the worker process CPU delta, the
  newest working-tree file mtimes (`ls -lt $(git status --porcelain | awk '{print $2}')`),
  and whether a gate process is running (`node` running `eslint`/`vitest`/`tsc`/
  `playwright`). Flat claude CPU + an active `node` gate proc = it's in the gate,
  not stuck. Flat CPU + no gate proc + no recent file write for many minutes =
  likely a between-steps model wait OR a genuinely hung command — investigate the
  child processes before intervening.
- **Big items run long.** A web+mobile feature with a migration + full DoD gate
  (lint, typecheck ×2, ~1000+ vitest, mobile jest, playwright e2e) is a genuine
  30–50 min single-shot. That's normal, not a problem.
- **Sentinels** (`PR_RESULT:`, `FIX_RESULT:`, `MERGE_RESULT:`,
  `BACKLOG_BLOCKED:`) make parsing robust; always grep for them and fall back to
  `gh` for ground truth.

## Known failure modes (and the fix)

1. **Concurrency false-positive.** The worker's "another session is building this"
   guard misfires because the orchestrator + the worker itself are multiple
   `claude.exe` processes, and the worker's own checkout/edits look "recent." It
   aborts leaving uncommitted WIP. → The step-4 prompt explicitly tells it there
   is no competing session and not to abort. If it still stalls, `--continue` and
   tell it to take over its own WIP.
2. **Orphaned background gate.** If the worker says "I'll await the background
   e2e notification…" it backgrounded a task and exited (—`-p` delivers no such
   notification), abandoning the work uncommitted. → The "NEVER background; run
   inline" constraint prevents it; to recover, `--continue` and tell it to run
   the gate inline and finish.
3. **Account session limit.** Every step consumes the SAME account quota, so the
   whole loop is gated by it. The worker prints `You've hit your session limit ·
resets <time> (America/Chicago)` and exits 1. → Detect this string; the merge
   git work may have completed even if the final summary text was cut off (verify
   with `gh pr view`). Compute the wait until the reset in Central time; if it's
   already passed, just resume. Surface the reset time to the user — that's a
   wait, not a bug. Expect roughly ~2 full iterations per quota window.
4. **Partial items stay in Doing.** Many items only have an unblocked backend
   slice (the UI/RPC remainder is blocked on a design ADR or a keystone RPC). The
   PR still merges; the ADO item stays in Doing with a "what merged / what
   remains" comment. Track these and don't let the next iteration re-pick the
   blocked sub-tasks.
5. **Type regen drift.** Don't wholesale-replace `database.types.ts` from an MCP
   regen — it reintroduces hand-fixed drift (e.g. `diet_type`) and breaks the
   build. Patch new columns/RPCs in surgically. (Tell the worker this.)

## Reporting

After each iteration, give the user a one-block status: item ID + PR number,
what shipped, gate result, merge confirmation, and any product assumption made or
item left in Doing. Keep a running tally of merged PRs. When a step is blocked on
quota, lead with the reset time.
