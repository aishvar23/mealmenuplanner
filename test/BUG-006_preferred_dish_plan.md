# BUG-006 — Preferred-Dish Onboarding: Phased Plan

> Companion to `test/ui_acceptance_bug_log.md` (BUG-006) and
> `test/14_end_to_end_acceptance_tests.md` (Global criterion 7, PREFDISH-001..006).
> Goal: during onboarding the user can either **choose preferred dishes manually**
> or **let the system choose** from their preferences; manual picks persist and
> influence recommendations.

## Good news: most of the persistence + influence already exists

Verified 2026-05-25:

- `user_food_preferences.liked_dishes text[]` already exists
  (`supabase/migrations/...p0_6_identity_household_tables.sql`).
- The engine already turns liked dishes into a **+10 "is a dish your household
  likes"** soft bonus: `aggregateMemberPreferences` →
  `lib/recommendation/scoring.ts` (`preferredIngredient` factor), surfaced in
  `lib/recommendation/explanation.ts`.
- So "preferred dishes" = the owner's `liked_dishes`. The missing pieces are the
  **onboarding step UI**, **carrying the picks through the draft**, and
  **writing them on completion** — not new scoring.

## What's missing

- No preferred-dish step in `STEP_IDS` (`lib/onboarding/steps.ts`) or
  `EDIT_STEP_IDS` (`lib/onboarding/edit.ts`).
- No `DraftData` slice for it (`lib/onboarding/draft.ts`).
- The completion RPC (`...p2_6_complete_onboarding_fn.sql`) writes the owner's
  `user_food_preferences` (allergies/disliked) but not `liked_dishes` from a
  preferred-dish selection.
- No dish catalog browse/search endpoint for the picker.

## Phases

### Phase 1 — Draft slice + step model (Small)

- Add `PreferredDishes` slice to `DraftData`:
  `{ mode?: "manual" | "system"; dishIds?: string[] }`.
- Insert step id `preferred_dishes` into `STEP_IDS` (after `food_preferences`,
  before `meal_schedule` is a natural spot) + `ONBOARDING_STEPS` metadata
  (optional: false, but satisfiable by choosing "system"). Add to `EDIT_STEP_IDS`.
- **Verify:** types compile; wizard step list shows the new step.

### Phase 2 — Dish catalog read for the picker (Small/Med)

- Add a read path to list/search **active, standalone-eligible** dishes (name +
  cuisine + diet; image once BUG-014 lands) — a service + thin route, scoped to
  the household diet so the picker only shows compatible dishes.
- Respects the household's chosen diet/cuisine from earlier steps.
- **Verify:** returns expected dishes; excludes condiments/sides (depends on the
  meal_role work — until then, list all active dishes).

### Phase 3 — Step component (Medium)

- New `components/onboarding/steps/preferred-dishes-step.tsx`:
  - two-choice control: **"Choose my preferred dishes"** vs **"Let the system
    choose based on my preferences"** (PREFDISH-001/002).
  - manual mode: searchable multi-select of dishes (PREFDISH-003); selections
    stored as `dishIds` in the draft slice; shows dish name (+ image later).
  - system mode: clears `dishIds`; explains the engine will use preferences.
- Wire into the wizard `renderStep()` switch.
- **Verify:** picking dishes autosaves to the draft; refresh restores them
  (PREFDISH-004 persistence across refresh).

### Phase 4 — Persist on completion + edit (Medium)

- Map the draft slice → owner's `liked_dishes` on completion: extend the
  complete-onboarding service/RPC (or set `liked_dishes` in the same write that
  stores allergies/disliked) using the **dish names** for the selected ids
  (engine matches liked dishes by normalized name).
- Edit mode (`lib/onboarding/edit.ts` + `draftDataToPreferencesPatch`): seed the
  step from current `liked_dishes`; "Save changes" PATCHes them back.
- **Verify:** complete onboarding with 3 picks → owner `user_food_preferences.liked_dishes`
  has those names; re-open edit shows them checked.

### Phase 5 — Influence + reason surfacing (Small) — _mostly already wired_

- Confirm a preferred dish gets the +10 bonus and the reason text ("is a dish
  your household likes") shows on the recommendation card (PREFDISH-005).
- **Verify:** seed a household with a liked dish; that dish ranks up with the
  reason on `/today`.

### Phase 6 — E2E (Small)

- PREFDISH-001..006: both modes selectable, manual picks persist + influence,
  system mode delegates, edit round-trip.

## What lands THIS session vs. follow-up

- **This session:** Phases 1, 3, 4 (draft slice, step UI with both modes, persist
  picks → `liked_dishes`). Phase 2 picker uses a simple active-dish list. Phase 5
  is largely existing behavior to confirm.
- **Follow-up:** richer search/filter, image thumbnails (after BUG-014), and the
  full E2E suite.

## Dependencies

- Independent of the meal_role work, but the picker is nicer once `meal_role`
  exists (show only standalone-eligible dishes) and once BUG-014 adds thumbnails.
