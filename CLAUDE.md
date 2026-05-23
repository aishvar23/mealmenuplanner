# CLAUDE.md

Guidance for working in this repository.

## What this is

**Home Meal Planner** — a shared, household-first meal-planning app that answers
"What should we eat today?" It recommends practical meals from household
preferences (diet, cuisine, family size, cooking time, variety rules, prep
requirements) and supports weekly plans, grocery lists, advance-prep reminders,
multi-member collaboration, and notifications.

## Current state

This repo currently contains **specs only** — there is no application code yet.
All product, data, API, and architecture decisions live in `docs/`. When you
start implementing, treat `docs/` as the source of truth and keep it in sync as
designs evolve.

## Documentation map (`docs/`)

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

## Intended tech stack (from `docs/11_technical_architecture.md`)

- **Frontend:** Next.js + React + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL, Supabase Auth, Row-Level Security), with
  Next.js server actions / API routes or Supabase Edge Functions
- **Hosting:** Vercel (web) + Supabase (DB/auth); separate dev and prod projects
- **Scheduled jobs:** guest expiry, invite expiry, prep reminders

Confirm the stack with the user before scaffolding — none of it is committed yet.

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
  (see `docs/03_data_model.md` vs `docs/05_api_spec.md`).
- Status/role/type fields are enums with fixed allowed values — see the data
  model doc before introducing new ones.
