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

### Phase 4 — Package composition (Medium) — ✅ done — _fixes criterion 10, BUG-009/010_

- A `main_component` primary is presented with its best accompaniments so the
  recommendation reads `Rajma Masala + Steamed Rice`. **Selection rule** (pure
  `selectPackagePairings`): one base — `rice_pairing` → `bread_pairing` →
  `main_side` in priority order — for a `main_component` only, plus one
  `condiment` for any primary (so Masala Dosa carries its chutney, MEALCOMP-002).
  A `complete_meal` never gets a base; `beverage` pairings are excluded.
- Implemented as a **display concern**, not a stored package: the plan row keeps
  a single primary `dish_id`. `attachPackages` resolves the components from
  active `dish_pairings`/`dishes` and fills `pairedDishes` on the DTO. Applied to
  the read path (`reads.ts`), today generation, and every item action so the
  package is consistent however a card was produced.
- Paired components are already kept out of the primary slot by the Phase 3
  hard filter.
- **Verified:** pure selector + resolver/attach unit tests; runtime — Chole
  Masala renders "+ Bhature", and generated alternatives are all standalone mains.

### Phase 5 — UI: render the package (Medium) — ✅ done

- `today-board.tsx` + `week-board.tsx` render the primary dish with a
  `+ Steamed Rice` package line (hero, supporting cards, week cells) alongside
  the engine's human-readable reason.
- Quick-swaps show each alternative's package and are already standalone-eligible
  (Phase 3 filter), so no orphan side/component is ever offered.
- **Verified:** server-rendered `/today` shows "Chole Masala" with "+ Bhature".

### Phase 6 — E2E (Small/Med)

- MEALCOMP-001 (chutney/dip/pickle/papad/side never standalone), MEALCOMP-002
  (Masala Dosa + chutney), MEALCOMP-003 (Jeera Aloo not a meal alone),
  MEALCOMP-004/005 (components paired), MEALCOMP-009 (Raita only as side).
- Weekly planner slots (PLAN-001) contain complete packages only.

## What lands THIS session vs. follow-up

- **Done:** Phases 1–3 (schema, seed roles, standalone hard filter — criterion 9)
  and Phases 4–5 (package composition + UI — criterion 10).
- **Follow-up:** Phase 6, the formal MEALCOMP-001..009 / PLAN-001 E2E suite, and
  image thumbnails once BUG-014 lands.

## Dependencies / risks

- Touches cloud dev (migration + reseed) — use `memory/db-migration-workflow.md`
  - `memory/seed-catalog.md` workflows; reseed is idempotent (`on conflict do
nothing`) so existing rows won't get the new role unless re-applied with an
    upsert — **note:** since `on conflict do nothing` skips existing dishes, Phase 2
    must either `update` `meal_role` explicitly or the dishes must be reinserted.
    Plan: emit an explicit `update dishes set meal_role = ...` block keyed by id.
