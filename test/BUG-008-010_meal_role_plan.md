# BUG-008 / 009 / 010 — Meal Composition (Dish Roles): Phased Plan

> Companion to `test/ui_acceptance_bug_log.md` (BUG-001, 008, 009, 010) and
> `test/14_end_to_end_acceptance_tests.md` (Global criteria 9 & 10, MEALCOMP-001..009).
> Goal: side dishes / condiments / single components must never be recommended
> as standalone main meals, and a recommendation should read as a wholesome
> package (e.g. `Rajma + Jeera Rice`), not an orphan component.

## Root cause (verified 2026-05-25)

- `dishes` has **no role/course concept** — only `meal_slots` (time of day). So
  Boondi Raita, Coconut Chutney, Jeera Rice, Jeera Aloo, Tandoori Roti are seeded
  with `lunch/dinner` slots and are fully eligible as the _primary_ pick.
- `lib/recommendation/hard-filters.ts` has 5 rules (slot, do-not-suggest,
  diet, allergen, prep) — **none** excludes a non-main dish.
- The landing card (`app/page.tsx`) is hardcoded to "Coconut Chutney" (BUG-001,
  fixed separately as a quick win — keep this plan for the engine/data truth).
- The engine already loads `dish_pairings` into `CandidateDish.pairings` and
  emits `Recommendation.pairedDishes`, but **no UI surfaces the pairing** and the
  weekly/today flows pick a single dish.

## Target taxonomy

New enum `meal_role` on `dishes` (one per dish):

| role              | standalone primary?                     | examples                                              |
| ----------------- | --------------------------------------- | ----------------------------------------------------- |
| `complete_meal`   | yes                                     | Vegetable Pulao, Khichdi, Biryani                     |
| `main_component`  | yes, **but presented with its pairing** | Rajma, Chole, Dal Tadka, Paneer Bhurji, Masala Dosa   |
| `rice_component`  | no                                      | Jeera Rice, Curd Rice                                 |
| `bread_component` | no                                      | Roti, Tandoori Roti, Paratha                          |
| `side`            | no                                      | Boondi Raita, Green Salad, Jeera Aloo (side_or_sabzi) |
| `condiment`       | no                                      | Coconut Chutney, Mint Chutney, Mango Pickle, Papad    |
| `beverage`        | no                                      | (future)                                              |

**Standalone-eligible = `{complete_meal, main_component}`.** Everything else can
only appear _inside_ a package.

## Phases

### Phase 1 — Schema + types (Small)

- Migration `supabase/migrations/<ts>_p9_dish_meal_role.sql`: create enum
  `meal_role`; `alter table dishes add column meal_role meal_role not null default 'main_component'`.
- Apply to cloud dev via Supabase MCP; regenerate `lib/db/database.types.ts`;
  update the migration version list + `IMPLEMENTATION_TRACKER.md`.
- **Verify:** migration idempotent; `npm run typecheck` green.

### Phase 2 — Seed roles (Small/Med)

- Extend `supabase/seed/dishes.mjs` factory + `generate.mjs` emitter/validator to
  carry `meal_role` (validate against the enum vocabulary).
- Assign a role to **every** dish; default `main_component`, then tag the known
  sides/condiments/components per the table above. Cross-check against the
  acceptance "Required seeded dish data" tables (`test/14...md` §test env).
- Regenerate `supabase/seed.sql`; apply to cloud dev.
- **Verify:** generator passes; query confirms Coconut Chutney=`condiment`,
  Boondi Raita=`side`, Jeera Rice=`rice_component`, etc.

### Phase 3 — Standalone hard filter (Small) — _fixes criteria 9, BUG-001/008_

- Add `mealRole` to `CandidateDish` (`lib/recommendation/types.ts`) and the
  loader (`lib/services/recommendation/load-inputs.ts` / candidate loader).
- Add hard-filter rule `notStandalone` in `lib/recommendation/hard-filters.ts`:
  exclude any candidate whose role ∉ `{complete_meal, main_component}` from
  single-slot recommendation. Add the reason to `HardFilterReason`.
- **Verify:** new table tests in `hard-filters.test.ts`; raita/chutney never
  returned as the primary; existing engine tests still pass.

### Phase 4 — Package composition (Medium) — _fixes criteria 10, BUG-009/010_

- When the chosen primary is a `main_component`, attach its best pairing(s) from
  `pairedDishes` so the recommendation reads `Rajma + Jeera Rice`. Define a
  selection rule (prefer `rice_pairing`/`bread_pairing`/`main_side` in that
  order; fall back to none if a main legitimately stands alone).
- Ensure paired components are not _also_ offered as separate primaries the same
  slot (they're already filtered out by Phase 3).
- Apply to both today (`lib/services/meal-plan/suggest.ts`) and weekly
  (`lib/services/meal-plan/generate.ts`) flows.
- **Verify:** generate.test / suggest fixtures assert package shape; MEALCOMP-002
  (Masala Dosa + Chutney), MEALCOMP-004/005 (base/main paired).

### Phase 5 — UI: render the package (Medium)

- `components/meal-plan/today-board.tsx` + `week-board.tsx`: show the primary
  dish and its paired component(s) as one card ("+ Jeera Rice"), and the
  human-readable reason already returned by the engine.
- Quick-swaps list (BUG-009): only offer standalone-eligible dishes/packages.
- **Verify:** manual pass on `/today` and `/plan`; no orphan side/component card.

### Phase 6 — E2E (Small/Med)

- MEALCOMP-001 (chutney/dip/pickle/papad/side never standalone), MEALCOMP-002
  (Masala Dosa + chutney), MEALCOMP-003 (Jeera Aloo not a meal alone),
  MEALCOMP-004/005 (components paired), MEALCOMP-009 (Raita only as side).
- Weekly planner slots (PLAN-001) contain complete packages only.

## What lands THIS session vs. follow-up

- **This session:** Phases 1–3 (schema, seed roles, standalone hard filter) — this
  alone clears the reported standalone-side bugs and global criterion 9. Phase 4
  package composition is implemented if time permits; otherwise the engine
  already returns `pairedDishes` data and Phase 5/6 follow.
- **Follow-up:** Phases 4–6 polish package presentation + E2E (criterion 10).

## Dependencies / risks

- Touches cloud dev (migration + reseed) — use `memory/db-migration-workflow.md`
  - `memory/seed-catalog.md` workflows; reseed is idempotent (`on conflict do
nothing`) so existing rows won't get the new role unless re-applied with an
    upsert — **note:** since `on conflict do nothing` skips existing dishes, Phase 2
    must either `update` `meal_role` explicitly or the dishes must be reinserted.
    Plan: emit an explicit `update dishes set meal_role = ...` block keyed by id.
