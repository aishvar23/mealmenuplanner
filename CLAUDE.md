# CLAUDE.md

Guidance for working in this repository.

## What this is

**Home Meal Planner** — a shared, household-first meal-planning app that answers
"What should we eat today?" It recommends practical meals from household
preferences (diet, cuisine, family size, cooking time, variety rules, prep
requirements) and supports weekly plans, grocery lists, advance-prep reminders,
multi-member collaboration, and notifications.

## Current state

A working **Next.js 16 app** is committed and runs against a **cloud dev**
Supabase project. Progress lives in `IMPLEMENTATION_TRACKER.md`: phases **P0–P8
are essentially complete** (about 74 of 82 tasks); what remains is the **prod**
Supabase project (task `P0-3`) and **P9 beta hardening**. The code is real —
don't re-scaffold — and keep the docs in sync as designs evolve.

Three sources of truth, all authoritative:

- **`docs/`** — the _product_ specs (vision, requirements, flows, data model,
  API shapes). Stable product truth; see the map below.
- **`design/`** — the _engineering_ design the code implements. The schema in
  `design/01_database_design.md` is the source of truth for table and column
  names. Start at `design/00_design_index.md`.
- **`IMPLEMENTATION_TRACKER.md`** — the task list driving the build. Tasks have
  stable IDs (e.g. `P5-2`); saying "work on P5-2" scopes a unit of work. Tick a
  box and update the progress summary when a task is done and verified.

The **native mobile app** (React Native + Expo) has its own pair:
`design/10_mobile_app_design.md` (engineering design — it consumes the existing
`/api/*` backend) and `MOBILE_IMPLEMENTATION_TRACKER.md` (task list, IDs `M0-1`
… `M3-7`). It is **feature-complete for the household app** (phases M0–M2 done;
only the account-bound store-launch tasks in M3 remain) and lives in `mobile/`.

**Web ↔ mobile parity is a hard, non-negotiable rule.** The mobile app must stay
at full feature parity with web. Every new feature — including the **Meal Provider
Workspace** — ships its web and mobile UI **together, in the same PR**, and is not
`Done` until both exist and are tested. This overrides the earlier "mobile provider
screens are out of MVP scope" carve-out (ADR-16, since amended): provider screens
are in scope on mobile too. See the mobile-parity rule in **Testing & Definition of
Done** and Track C of
`design/planning/meal-provider/05_two_developer_implementation_tracker.md`.

## Work tracking (Azure DevOps — source of truth)

**Azure DevOps is the source of truth for every work item and bug going forward.**
Project **mymealtoday** — <https://dev.azure.com/aishvarsuhane/mymealtoday>. It uses
the **Basic** process: **Epic ▸ Issue ▸ Task**, where **Issue is the story type**.
There is no Bug work-item type, so **log bugs as Issues tagged `bug`**. The
`*_TRACKER.md` files and `design/planning/**` stay as _planning detail_, but **ADO
holds the live status and the audit trail.** (Meal Provider Workspace lives under
Epic **#15**, Issues **#16–#28**; the CLAUDE.md policy itself is Issue **#29**.)

Interact via the **Azure CLI** — `az login` already authenticates this
**MSA-backed** org; install the extension once with
`az extension add --name azure-devops`, then
`az devops configure --defaults organization=https://dev.azure.com/aishvarsuhane project=mymealtoday`.
Caveat: raw ADO REST with an AAD token is rejected (302) on this MSA org and the
CLI can't remove a `Hyperlink` relation — prefer `az boards` commands (and
delete-and-recreate over a REST PATCH) for work-item edits.

**Mandatory conventions:**

- **Work item first.** Create the ADO Issue (under the right Epic) before writing
  code: `az boards work-item create --type Issue --title "…" --description "…"`,
  then add its parent (`az boards work-item relation add --id <issue> --relation-type Parent --target-id <epic>`).
- **The PR description must reference its work item(s)** — include the
  `…/_workitems/edit/<id>` URL and id; if the Azure Boards GitHub app is connected,
  also use an `AB#<id>` mention to auto-link. Aim for one work item ↔ one focused PR.
- **Track progress with work-item comments**, not just state — add a comment at
  each milestone with `az boards work-item update --id <id> --discussion "…"`:
  e.g. `Branch feature/x started`, `PR #NN opened, in review`, `PR #NN merged`,
  `blocked on …`.
- **Audited state changes.** Whenever you change an item's **State** (e.g. To Do →
  Doing as it enters implementation, or → Done), in the **same command** add a
  comment giving **(a) the plan** and **(b) why the state is changing**:
  `az boards work-item update --id <id> --state "Doing" --discussion "Moving To Do -> Doing. Plan: …; Reason: …"`.
  This exists so that if the machine reboots or context is lost, the work item, on
  its own, explains what is being done and why.
- Basic-process states are **To Do → Doing → Done**. Don't move to **Doing**
  without the plan comment; don't move to **Done** without a comment linking the
  merged PR.

## Autopilot mode (autonomous execution)

For long-running build-out (currently the **Meal Provider Workspace**, Epic **#15**)
the work runs autonomously from the ADO board, with the human involved **only for
PR review and design decisions**. The board (see _Work tracking_ above) is both the
queue and the resume point, so **one prompt per session** continues or resumes the
work even after a reboot or lost context.

**Kickoff prompt — paste at the start of any session:**

> Run Meal Provider autopilot: pick up the next ADO work item and continue.

**On that prompt, run this loop:**

1. **Resume first.** Look for an `mp-autopilot` Issue already in state **Doing**. If
   one exists, read its latest comments (the recorded plan) and **continue that
   item** — never start a new one while one is in flight.
2. **Else select next.** Among Issues tagged `mp-autopilot` that are **not** `Done`
   and **not** tagged `decision` / `decision-gated`, pick the lowest **`seq-NN`**
   whose checkpoint (`cpN`) predecessors are all `Done`
   (CP1 → CP2 → … → CP5; see `design/planning/meal-provider/06_integration_plan.md`).
3. **Open the item.** Move **To Do → Doing** with a plan+reason comment, then
   implement its underlying `MP-*` tasks
   (`design/planning/meal-provider/05_two_developer_implementation_tracker.md`),
   honouring the contracts (`03_contracts.md`) and DB/RLS plan (`04_*`).
4. **Ship a PR, then pause.** Branch, implement the item's **web _and_ mobile** UI
   together (a UI-bearing item is not done until its `mobile/` screens match — see
   the mobile-parity rule below), add the item's functional + E2E tests and pass
   the full **Definition of Done** gate below (quality gates **and** the constant
   regression suite, green), open **one PR** whose description references the work
   item and names the web + mobile tests added, comment "PR #NN opened, in review"
   on the item, and **stop for human review — do not self-merge.**
5. **After a human merges,** move the item to **Done** with a comment linking the
   merged PR, then return to step 1. An item is **never** closed until its
   Definition of Done (below) is met.

**Autonomy boundaries — stop and ask the human for:**

- **Design decisions** — anything tagged `decision` / `decision-gated` (e.g. ADR-7,
  Issue **#30**, the menu-edit policy). Never guess a blocked decision; implement
  only the unblocked part of an item and leave the rest with a comment.
- **PR review and merge** — open PRs; humans review and merge.
- The standing safety rules (no destructive or outward-facing action beyond opening
  a PR without explicit approval).

**Backlog discipline.** When work is deferred or newly discovered, add it to ADO as
an Issue under Epic **#15** tagged `backlog` (and `decision` if it needs a human
call) instead of dropping it — the board stays the single source of truth.

## Testing & Definition of Done

**No work item is `Done` until its change is proven and the regression baseline is
still green.** This gate is mandatory and verified in the PR before close.

**Definition of Done (every work item):**

1. **Functional tests** — Vitest unit/service tests colocated with the **web** code
   (`*.test.ts`) for the item's logic _and_ its error/permission paths, **plus**
   Jest + React Native Testing Library unit/hook tests for the item's **mobile**
   logic where it adds a mobile screen (see the mobile-parity rule below).
2. **End-to-end tests** — **Playwright** specs in `e2e/` covering the item's
   user-facing flow(s) on web. Playwright is the E2E tool of record (deterministic,
   CI-runnable) — use it, not ad-hoc clicking, for anything that must stay green.
   (Mobile UI E2E is **deferred** — see the mobile-parity rule.)
3. **Mobile parity** — if the item adds or changes a user-facing screen, its
   **`mobile/` (React Native + Expo) counterpart ships in the same PR**, consuming
   the same `/api/*` routes and `@mmp/shared` contracts. The mobile screen is
   unit/hook-tested (item 1) and verified by a **manual Expo smoke** during dev.
   Backend-only or web-admin-only items (the admin/operator console stays web-only)
   carry no mobile screen but must keep the **mobile API contract** green.
4. **Run it for real** — launch the app on localhost (`npm run dev`; Playwright's
   `webServer` does this automatically) and verify the web change end-to-end via the
   new Playwright specs; smoke the mobile change in Expo. A quick manual smoke in
   Chrome / Claude-in-Chrome is fine _during dev_, but the web **gate is the
   automated run**, never a manual click-through.
5. **No regression** — the **constant regression suite** (below) passes in full,
   plus `npm run format:check`, `npm run lint`, `npm run typecheck`,
   `npm run test`, `npm run test:mobile`, `npm run test:e2e`.
6. **Grow the suite** — the item's new functional (web Vitest + mobile Jest) + E2E
   tests are added to the regression suite. The suite only ever **grows**; a test is
   never skipped or removed without a `decision`-tagged work item approving it.
7. The PR states which web + mobile tests were added and that the regression suite is
   green — only then move the item to **Done**.

**Mobile-parity rule (DoD item 3, expanded).** Web and mobile are kept in lockstep:

- **One PR, both platforms.** Web (Track B) and mobile (Track C) UI for a feature
  ship together. A UI item is never `Done` web-only.
- **Shared backend, separate UI code.** The RN UI cannot share component code with
  the Next.js UI — it is built against the same `/api/*` routes and the same
  `@mmp/shared/provider` contracts, via a `mobile/src/api/provider.ts` client that
  mirrors `mobile/src/api/*`. No second auth, no second transport.
- **Mobile test bar.** Jest + React Native Testing Library unit/hook tests are
  **required** and join the constant suite via `npm run test:mobile`. **Mobile UI
  E2E (Detox/Maestro) is deferred** behind a `decision`-tagged ADO item — this
  Windows / no-Docker machine cannot run an iOS simulator and no Android emulator /
  cloud-device runner is stood up yet. Until that decision lands, mobile UI is
  proven by unit/hook tests + a manual Expo smoke, never an automated device E2E.
- **Prerequisite.** Standing up the mobile provider test harness + API-client
  scaffold and wiring `test:mobile` into `test:all` is **MP-C-000** (analogous to
  #34); no mobile provider feature item closes before it.

**The constant regression suite (the testing backbone):**

- It is **identified once and kept constant** — a fixed, always-green baseline that
  every work item must not break and must extend. It lives in `e2e/` (Playwright),
  the colocated web Vitest tests, and (as it grows) the `mobile/` Jest tests, run
  via `npm run test` + `npm run test:mobile` + `npm run test:e2e`.
- Establishing and freezing it is **Issue #34 (P0, `seq-00`)** — the autopilot does
  this **before any feature item**. Until the suite exists and is green, **no
  feature item (#16+) may close.** It is the backbone of all testing here.
- The suite must always include the existing **household** flows and the **mobile
  API** contract (no feature may regress them), and grows one item at a time. As
  mobile provider screens land, their Jest unit/hook tests join the suite; mobile UI
  E2E joins only once the deferred runner decision is resolved.

## Product spec map (`docs/`)

| File                                 | Contents                                            |
| ------------------------------------ | --------------------------------------------------- |
| `00_overview.md`                     | Vision, MVP promise, personas, non-goals            |
| `01_product_requirements.md`         | Core MVP feature requirements                       |
| `02_user_flows.md`                   | 11 step-by-step user flows                          |
| `03_data_model.md`                   | All tables, fields, and enum values                 |
| `04_recommendation_engine.md`        | Hard filters, soft scoring weights, pseudocode      |
| `05_api_spec.md`                     | REST endpoint shapes (request/response JSON)        |
| `06_admin_operator_spec.md`          | Internal dish/ingredient content tooling            |
| `07_onboarding_save_resume_spec.md`  | Draft autosave/resume, minimum fields               |
| `08_household_collaboration_spec.md` | Roles, permissions, invite/guest flows              |
| `09_notifications_spec.md`           | Notification events, content, MVP scope             |
| `10_security_privacy_permissions.md` | Access control, RLS, privacy guidelines             |
| `11_technical_architecture.md`       | Stack, services, scheduled jobs                     |
| `12_mvp_roadmap.md`                  | Phased build plan (Phase 0–9)                       |
| `13_success_metrics.md`              | Activation/engagement/retention metrics, north star |

## Engineering design map (`design/`)

| File                                      | Contents                                       |
| ----------------------------------------- | ---------------------------------------------- |
| `00_design_index.md`                      | Index and reading order                        |
| `01_database_design.md`                   | Schema; source of truth for table/column names |
| `02_system_architecture.md`               | App and runtime architecture, Supabase clients |
| `03_auth_and_security_design.md`          | Auth, sessions, RLS, permission guards         |
| `04_api_design.md`                        | Route handlers and response envelopes          |
| `05_recommendation_engine_design.md`      | Engine implementation design                   |
| `06_onboarding_design.md`                 | Draft autosave and resume                      |
| `07_household_collaboration_design.md`    | Roles, invites, guests, ownership transfer     |
| `08_meal_planning_grocery_prep_design.md` | Plans, grocery lists, prep reminders           |
| `09_notifications_design.md`              | Notification events and notifier adapters      |

## Tech stack (committed)

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript.
  **Next 16 has breaking changes vs. earlier versions** (see `AGENTS.md`): the
  edge middleware now lives in `proxy.ts`, and you should read the relevant guide
  under `node_modules/next/dist/docs/` before writing Next-specific code.
- **UI:** Tailwind CSS v4 with **Base UI** (`@base-ui/react`) plus shadcn
  generators (`components.json`). This is Base UI, not the Radix-based classic
  shadcn. Icons from `lucide-react`.
- **Backend:** Supabase (Postgres, Auth, RLS) accessed via `@supabase/ssr`.
  Three clients in `lib/db/`: browser, server (per-request), and service-role
  (server and edge only, bypasses RLS). Domain logic in `lib/`, the service
  layer in `lib/services/`, and REST handlers in `app/api/`.
- **Scheduled jobs** run as Postgres **pg_cron**, not Vercel Cron: stale-draft
  abandonment, guest and invite expiry, prep reminders.
- **Testing:** Vitest, with `.test.ts` files colocated next to the code in
  `lib/`.

## Running and developing locally

- `npm run dev` serves the app at `http://localhost:3000`. It needs `.env.local`
  with Supabase credentials (copy `.env.example`); the committed local
  `.env.local` points at the **cloud dev** project, so authenticated flows work
  end to end.
- **This machine has no Docker**, so the **local Supabase stack cannot run** —
  the `supabase start`-based scripts (`db:start`, `db:stop`, `db:reset`,
  `db:status`) do not work here. Develop against cloud dev instead.
- **Schema changes:** author a migration file under `supabase/migrations/`, then
  apply it to cloud dev via the Supabase **MCP** (`apply_migration`) and keep the
  migration version list in sync. See `supabase/README.md`.
- Quality gates (match CI; Node 22): `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run format:check`. Markdown is format-checked too, so
  re-run `format:check` after editing docs.

## Key domain rules to respect

- **Recommendation engine is rule-based, not AI.** Use the deterministic
  hard-filter + weighted-soft-score model in `docs/04_recommendation_engine.md`.
  It must be explainable: every suggestion returns a short human-readable reason.
- **Prep-aware suggestions.** A dish requiring advance prep (e.g. soaking rajma
  8h) must not be suggested when prep can't be completed in time.
- **Variety rotation.** Don't repeat a dish within `variety_gap_days` unless the
  user explicitly asks.
- **Eating-out** meals must not be penalized in rotation and should trigger
  grocery recalculation.
- **Permissions are enforced server-side.** Every write API checks the relevant
  `can_*` flag plus active membership; reads check active membership and (for
  guests) unexpired access. Don't rely only on scheduled expiry jobs — verify
  guest expiry in real time too. Plan for Supabase RLS on household-scoped tables.
- **Collaboration conflict policy:** last-write-wins, with every change recorded
  in `household_activity_events`.
- **Privacy:** dietary/health/family data is sensitive. No medical claims (use
  "dietary preferences"); include the medical disclaimer for health tags; let
  users edit/delete preferences.
- **Onboarding** must autosave and be resumable; allow completion with only the
  minimum required fields (household name, family size, diet type, meals to plan,
  cooking time, cuisine preference).

## Conventions

- Data model uses `snake_case` table/column names; API JSON uses `camelCase`
  (see `docs/03_data_model.md` vs `docs/05_api_spec.md`). When names disagree,
  `design/01_database_design.md` is the authoritative schema.
- Status/role/type fields are enums with fixed allowed values — see the data
  model doc before introducing new ones.
- Generated DB types live in `lib/db/database.types.ts` — regenerate them from
  cloud dev via the Supabase MCP after a schema change, don't hand-edit.
