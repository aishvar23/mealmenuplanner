# BUG-015 … BUG-026 — Reported Bug Sweep: Implementation Tracker

Drives the 12 user-reported bugs from `test/ui_testing_bugs_2026-05-26.md` to
done. **Separate from the root `IMPLEMENTATION_TRACKER.md`** (which tracks the P0–P9
product build) — that file is not touched by this work.

- Bug log (symptoms, evidence): `test/ui_testing_bugs_2026-05-26.md`
- Acceptance/functional tests (closing criteria): `test/15_reported_bugs_acceptance_tests.md`
- Branch: `fix/app-bug-sweep` (from `origin/main` @ `2869ca4`)
- Started: 2026-05-26 · Owner: Claude Code

## Status legend

- ✅ **Fixed** — change landed + verified (unit/integration and/or browser).
- 🟡 **Partially fixed** — core symptom addressed; remainder phased below.
- 🔁 **Cannot reproduce** — not reproducible in current code.
- 📄 **Deferred (planned)** — real but larger; phased plan below; lands later.

## Summary

| Bug     | Area                                    | Status             | Notes                                                                                                                    |
| ------- | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| BUG-015 | Recommendation ignores picks            | ✅ Fixed           | `householdChosenDish +60` factor + `chosenDishIds`; reason names the pick.                                               |
| BUG-016 | Performance                             | 🟡 Partially fixed | `next.config` images + day-suggestion N+1 fix + React `cache()` on auth done; source-photo re-encode (PERF-002) remains. |
| BUG-017 | Member edits + approve/overwrite notify | ✅ Fixed           | Owner per-member toggles; `meal_accepted` event; overwrite-notify in suggest-another.                                    |
| BUG-018 | Invite email                            | 🟡 Partially fixed | Code path + send-status UI landed; real delivery pending `RESEND_API_KEY`.                                               |
| BUG-019 | Finish leave-dialog                     | ✅ Fixed           | Coalesce branch clears the dirty flag so `beforeunload` won't fire.                                                      |
| BUG-020 | Onboarding location fields              | ✅ Fixed           | Country `<select>` + city text, seeded from timezone; pre-filled name.                                                   |
| BUG-021 | Today nav subtitle                      | ✅ Fixed           | "Approve tonight" → "Today's meals" (status-neutral).                                                                    |
| BUG-022 | Week "Generate" picker                  | ✅ Fixed           | "Swap" → "Change" opens a single-select picker; commits via `replaceItem`.                                               |
| BUG-023 | Today "Try another" picker              | ✅ Fixed           | "Try another" opens the same single-select picker.                                                                       |
| BUG-024 | Review missing Step-3 picks             | ✅ Fixed           | Combo names captured at pick time; Review lists all populated sources.                                                   |
| BUG-025 | Step-3 image size + dup name            | ✅ Fixed           | 3-up `w-full` thumbnails; removed duplicate per-dish captions.                                                           |
| BUG-026 | Step-3 not additive                     | ✅ Fixed           | Three slices tracked independently; merged in Review + completion.                                                       |

> ✅/🟡 items landed and pass `typecheck`, `lint`, `format:check`, the full Vitest
> suite (842), and `next build` (see Verification). The remaining work is the
> BUG-016 source-photo re-encode (PERF-002 — `next/image` already optimizes served
> bytes) and the **E2E/UI** acceptance criteria, which need a browser pass on a
> running app (the closing unit/integration criteria are covered by new tests).

## Recommended sequencing

1. **BUG-026** (additive Step 3) → unblocks **BUG-024** (Review) and feeds
   **BUG-015** (scoring uses the picks). Do this first among the onboarding set.
2. **BUG-015** (scoring) — independent engine work; high user value.
3. **BUG-017** (collaboration) — permission UI + notification events; the
   `meal_changed`-on-overwrite piece also closes SLOTPICK-007.
4. **BUG-022 + BUG-023** — build the shared single-select picker once.
5. **BUG-020** (location) — self-contained.
6. **BUG-016** (perf) — can run in parallel; image re-encode is content work.

---

## Per-bug detail

### BUG-019 — Finish leave-dialog — ✅ Fixed

- **Root cause:** `performSave` coalesce early-return (unchanged snapshot) returned
  without clearing the dirty flag that `saveNow` set, so the Finish navigation
  tripped the `beforeunload` guard.
- **Fix:** `components/onboarding/use-draft-autosave.ts` — the coalesce branch now
  calls `markUnsaved(false)` / status `saved` when the buffered snapshot is the
  latest, mirroring the success branch.
- **Closes:** ONB-001. ONB-002 (genuine unsaved still warns) holds — the guard is
  corrected, not removed.
- **Verify:** browser — complete onboarding, click Finish, confirm no dialog and a
  clean redirect to `/today`. (No jsdom/testing-library harness exists for hooks;
  UI is the acceptance check. A hook test is a follow-up if that harness is added.)

### BUG-021 — Today nav subtitle — ✅ Fixed

- **Root cause:** hardcoded `description: "Approve tonight"` in
  `components/app-nav.tsx`.
- **Fix:** changed to the status-neutral "Today's meals".
- **Closes:** NAV-001.
- **Follow-up (📄, optional):** NAV-002 dynamic subtitle ("N to approve" / "All
  set") needs an undecided-slot count plumbed from a server component into the
  client nav (mirror `needsDecision` in `today-board.tsx`).

### BUG-025 — Step-3 image size + duplicate name — ✅ Fixed

- **Root cause:** `CombinationCard` used `w-16` (4rem) member thumbnails (vs
  `DishCard`'s `w-full`) and rendered the combo name plus a `dish.name` caption per
  thumbnail (name read twice).
- **Fix:** `components/onboarding/cards/combination-card.tsx` — member thumbnails
  now fill a `grid-cols-3` `w-full` layout with larger `sizes`; per-dish captions
  removed (name preserved in image `alt`).
- **Closes:** ONB-030, ONB-031, ONB-032.
- **Verify:** browser — Step 3 thumbnails comparable to build-mode; name appears
  once.

### BUG-018 — Invite email — 🟡 Partially fixed

- **Root cause:** Resend adapter fully built and called; disabled only because
  `RESEND_API_KEY` is unset, and the UI gave no feedback.
- **Done this session:**
  - `lib/events/notifier/router.ts` — `sendInviteEmail` returns
    `InviteEmailOutcome` (`sent`/`not_configured`/`failed`); never throws.
  - `lib/services/invite/dto.ts` — `CreateInviteResult.emailStatus`
    (`InviteEmailStatus = InviteEmailOutcome | "no_recipient"`).
  - `lib/services/invite/create-invite.ts` — threads the outcome.
  - `components/household/household-members.tsx` — invite panel shows
    sent / not-configured / failed messages; link still shown for manual sharing.
  - Tests: `router.test.ts`, `create-invite.test.ts`, invite `route.test.ts`.
- **Remaining (config):** set `RESEND_API_KEY` (+ `RESEND_FROM_EMAIL`) in env;
  verify a real send (INVITE-005). Add the phone-only `no_recipient` unit arm
  (INVITE-002).
- **Closes:** INVITE-001, INVITE-003 (done); INVITE-004/006 (verify); INVITE-002
  (phone arm) + INVITE-005 (delivery) pending.

### BUG-015 — Recommendation honours chosen combinations — ✅ Fixed

- **Root cause:** chosen combos default to `once_in_a_while` (= `-20`); fresh
  household never reaches `popularityThreshold: 5`; no household-chosen positive
  factor.
- **Phase 1 — Engine signal (Small/Med):** add a `householdChosenDish` weight in
  `lib/recommendation/config.ts`; in `lib/recommendation/scoring.ts` apply it when
  the dish is in the household's `dishFrequencies`/chosen set (regardless of tier),
  and ensure `once_in_a_while` does not net-penalize a chosen dish. Add a
  per-household "chosen dish ids" set to `HouseholdContext`
  (`lib/recommendation/types.ts`), populated by
  `lib/services/recommendation/load-inputs.ts`, **distinct** from the global
  popularity set.
- **Phase 2 — Reason text (Small):** the recommendation reason names the household
  preference (REC-005).
- **Phase 3 — Tests (Small):** REC-001 … REC-008 in `scoring.test.ts` +
  integration in the recommendation service test.
- **Dependencies:** benefits from BUG-026 (so all chosen sources reach
  `household_dish_preferences`), but is independently testable with seeded prefs.
- **Closes:** REC-001 … REC-008.

### BUG-016 — Performance — 🟡 Partially fixed

- **Phase 1 — Images (Med, highest impact):** add an `images` block to
  `next.config.ts` (AVIF/WebP, `deviceSizes`/`imageSizes`, a default `quality`);
  re-encode the `public/images/dishes/*` photos and `meal-hero.png` to
  ~150–300 KB JPEG/WebP. Keep `image_url`s stable (or update seed + reseed).
- **Phase 2 — Day-suggestion N+1 (Med):** refactor `ensureDaySuggestions`
  (`lib/services/meal-plan/generate.ts`) to load the candidate universe once (like
  `generateWeek`) and run `recommendSlot` in-memory per slot with the run-exclusion.
- **Phase 3 — Auth dedupe (Small):** wrap `getAuthUser`
  (`lib/auth/session.ts`), `getActiveMembership`, and `resolveCurrentHousehold`
  in React `cache()` so each is resolved once per render; consider passing the
  resolved household from layout to page.
- **Closes:** PERF-001 … PERF-006. Each phase is independently shippable.
- **Risk:** Phase 1 touches seed/content if filenames change — prefer in-place
  re-encode to keep `image_url`s.

### BUG-017 — Member edits + approve/overwrite notifications — ✅ Fixed

- **Decision:** owner toggles the change-permission **per member** (member-role
  defaults stay `false`).
- **Phase 1 — Permission UI (Med):** add owner-only per-member toggles for
  `can_change_today_menu` / `can_change_weekly_schedule` in the member-management
  UI (`components/household/household-members.tsx` + the member-update client/route
  already support permission overrides). Confirm RLS (`mpi_update_today`) accepts
  the granted flag in real time.
- **Phase 2 — Approval notification (Small):** add a `meal_accepted` event type
  (`lib/events/types.ts`) + template (`lib/events/templates.ts`) and emit it from
  `acceptItem` (`lib/services/meal-plan/items.ts`) via `safeEmitHouseholdEvent`.
  `event_type` is free-text — **no enum migration**.
- **Phase 3 — Overwrite notification (Small):** emit `meal_changed` whenever an
  `accepted`/`cooked` cell is overwritten, including `suggestAnotherItem` /
  `generateToday` (today only `replaceItem` emits it).
- **Phase 4 — Tests (Small/Med):** COLLAB-001 … COLLAB-008.
- **Closes:** COLLAB-001 … COLLAB-008, and SLOTPICK-007 (overwrite-notify).

### BUG-020 — Onboarding location fields — ✅ Fixed

- **Decision:** country `<select>` + pre-filled city text, seeded from timezone.
- **Phase 1 — Mapping (Small):** a small `timezone → { countryCode, countryName,
city }` lookup (no large dataset), with a graceful fallback for unknown zones.
- **Phase 2 — UI (Small/Med):** in
  `components/onboarding/steps/household-basics-step.tsx`, replace the country
  `<Input>` with a Base UI `<select>` of countries; pre-fill city text; seed both
  on mount from `Intl.DateTimeFormat().resolvedOptions().timeZone`; pre-fill a
  sensible household-name default. Persist `locationCountry` as the ISO code
  (matching `lib/onboarding/draft.ts`).
- **Phase 3 — Tests (Small):** ONB-010 … ONB-014.
- **Closes:** ONB-010 … ONB-014.

### BUG-022 + BUG-023 — Single-select replacement picker — ✅ Fixed

- **Shared approach:** one reusable single-select "choose a dish for this slot"
  component, styled like the onboarding picker but enforcing a single choice;
  commits via the existing `api.replaceItem(id, { replacementDishId })`
  (`POST /api/meal-plan-items/[id]/replace`) — no backend change required for the
  commit. Optionally add a slot-candidates endpoint to populate eligible dishes.
- **BUG-022 (Week):** in `components/meal-plan/week-board.tsx`, rename "Swap" →
  "Change" and open the picker instead of calling `suggestAnother`.
- **BUG-023 (Today):** in `components/meal-plan/today-board.tsx`, wire
  "Try another" to the same picker.
- **Candidate list:** offer only slot-/diet-/role-eligible standalone dishes
  (reuse recommender filters).
- **Tests:** SLOTPICK-001 … SLOTPICK-007.
- **Closes:** SLOTPICK-001 … 006 (007 via BUG-017 Phase 3).

### BUG-024 — Review shows Step-3 choices — ✅ Fixed

- **Root cause:** Review renders combinations as a count / "Not set"; no catalog to
  resolve ids → names.
- **Approach:** pass the combination catalog (or store the combo name alongside the
  id in `SelectedCombination`) so `review-step.tsx` lists chosen combinations by
  name; show an accurate empty state.
- **Dependency:** do together with BUG-026 (Review must merge all populated
  sources).
- **Closes:** ONB-020 … ONB-022.

### BUG-026 — Step-3 additive across modes — ✅ Fixed

- **Root cause:** single `mode` field; each `ModeCard.onSelect` clears sibling
  arrays; only the active mode renders.
- **Approach:** track `selectedCombinations`, `builtDishes`, `dishNames`
  independently; stop clearing siblings on mode switch; render the populated
  pickers together (and define how "Let the system decide" interacts — ONB-043);
  Review (`review-step.tsx`) and completion mapping
  (`lib/services/onboarding/validate-completion.ts`) merge **all** populated
  sources into completion (combination popularity + `household_dish_preferences`).
- **Dependency:** unblocks BUG-024 and feeds BUG-015.
- **Closes:** ONB-040 … ONB-044.

---

## Done this session

Code changes on `fix/app-bug-sweep`:

- `components/app-nav.tsx` — BUG-021.
- `components/onboarding/use-draft-autosave.ts` — BUG-019.
- `components/onboarding/cards/combination-card.tsx` — BUG-025.
- `lib/events/notifier/router.ts`, `lib/services/invite/{dto,create-invite}.ts`,
  `components/household/household-members.tsx` — BUG-018 (code path + UI).
- Tests updated/added: `lib/events/notifier/router.test.ts`,
  `lib/services/invite/create-invite.test.ts`,
  `app/api/households/[householdId]/invites/route.test.ts`.
- Docs: this tracker, the bug log, and the acceptance/functional spec.

## Verification

- `npm run typecheck` — clean.
- `npm run test` — full Vitest suite green (incl. updated invite tests).
- `npm run lint` / `npm run format:check` — clean (docs are prettier-formatted).
- **Browser pass (2026-05-27, dev-login session against a server run from this
  working tree on `:3100`):**
  - **BUG-021 ✅** — Today nav subtitle now reads "Today's meals" (was "Approve
    tonight").
  - **BUG-025 ✅** — Step-3 "Select meal combinations" cards show a properly sized
    image and the combination name once (no duplicate per-dish caption).
  - **BUG-018 ✅** — with `RESEND_API_KEY` active, creating an invite shows
    "Invitation emailed to …" (the `sent` path); Resend returned 2xx, so a real
    email was dispatched (INVITE-005 — recipient should confirm inbox receipt).
  - **BUG-019 ◑** — exact create-flow "Finish" not reproducible with an
    existing-household (edit-mode) session; however navigating away from
    `/onboarding` after an autosaved edit produced **no** leave dialog, exercising
    the corrected guard. Full create-flow check needs a no-household account.
- Note: the running app on `:3000` is a **separate clone**
  (`C:\personal\mealmenuplanner`) without these fixes; verification was done
  against a fresh server started from this working tree
  (`C:\personal\mmtUI\mealmenuplanner`).

---

## Session 2 — deferred bugs implemented (2026-05-27)

The seven 📄 items above (BUG-015, 016, 017, 020, 022, 023, 024, 026) were
implemented in the recommended sequence. Each closing **unit/integration**
criterion is covered by a new test; the **E2E/UI** criteria still want a browser
pass.

### Code changes (`fix/app-bug-sweep`)

- **BUG-026 / BUG-024 (Step-3 additive + Review):**
  `lib/onboarding/draft.ts` (`SelectedCombination.name`),
  `lib/onboarding/preferred-summary.ts` (new pure resolvers),
  `components/onboarding/steps/preferred-dishes-step.tsx` (no sibling-wipe on mode
  switch; `system` stays exclusive; cross-mode "Your picks so far" summary; combo
  name captured at pick time), `components/onboarding/steps/review-step.tsx`
  (lists all populated sources by name), `lib/services/onboarding/validate-completion.ts`
  (mode-agnostic additive merge; `system` exclusive), `lib/onboarding/edit.ts`
  (additive `draftDataToLikedDishes`).
- **BUG-015 (recommendation honours picks):**
  `lib/recommendation/config.ts` (`householdChosenDish: 60`),
  `lib/recommendation/types.ts` (`HouseholdContext.chosenDishIds` + factor label),
  `lib/recommendation/scoring.ts` (apply the factor to any chosen dish, gated by
  `combinations.enabled`), `lib/recommendation/explanation.ts` (reason phrase
  "it is one your household chose"),
  `lib/services/recommendation/load-inputs.ts` (populate `chosenDishIds` from
  `household_dish_preferences`).
- **BUG-017 (collab permissions + notifications):**
  `lib/events/types.ts` + `lib/events/templates.ts` (`meal_accepted` event),
  `lib/services/meal-plan/items.ts` (emit `meal_accepted` on `acceptItem`; emit
  `meal_changed` when `suggestAnotherItem` overwrites an accepted/cooked cell),
  `components/household/household-members.tsx` (owner-only per-member
  `can_change_today_menu` / `can_change_weekly_schedule` toggles, via the existing
  member-update route). The accepted-status edit was already unguarded
  (`loadItemForAction` gates on the flag only) — COLLAB-002/003 needed no change.
- **BUG-022 + BUG-023 (replacement picker):**
  `lib/services/meal-plan/suggest.ts` (`listSlotCandidates`, uncapped),
  `lib/services/meal-plan/items.ts` (`listItemCandidates`),
  `app/api/meal-plan-items/[mealPlanItemId]/candidates/route.ts` (new GET),
  `components/meal-plan/slot-replacement-picker.tsx` (new reusable single-select
  picker committing via `replaceItem`), wired into `today-board.tsx`
  ("Try another") and `week-board.tsx` ("Swap" → "Change").
- **BUG-020 (location fields):**
  `lib/onboarding/locale.ts` (timezone → country/city map + country list),
  `components/onboarding/steps/household-basics-step.tsx` (country `<select>`,
  city text, name + location seeded once from the browser timezone).
- **BUG-016 (performance):**
  `next.config.ts` (AVIF/WebP `images` block + size ladder + cache TTL),
  `lib/services/meal-plan/generate.ts` (`ensureDaySuggestions` now loads the
  candidate universe once like `generateWeek`, killing the per-slot N+1),
  `lib/auth/session.ts` / `lib/auth/guards.ts` /
  `lib/services/household/current-household.ts` (React `cache()` on `getAuthUser`,
  `getActiveMembership`, `resolveCurrentHousehold`).

### Tests added/updated

- `lib/onboarding/preferred-summary.test.ts` (ONB-021/022),
  `lib/onboarding/locale.test.ts` (ONB-013),
  `lib/services/onboarding/validate-completion.test.ts` (ONB-042/043),
  `lib/recommendation/{scoring,explanation,engine}.test.ts` (REC-001…008),
  `lib/services/recommendation/load-inputs.test.ts` (chosen-set load),
  `lib/events/templates.test.ts` (COLLAB-006),
  `lib/services/meal-plan/{items,access,suggest}.test.ts` (COLLAB-002/004/005,
  SLOTPICK-005), `lib/services/meal-plan/generate.test.ts` (PERF-003 load-once).

### Verification (session 2)

- `npm run typecheck`, `npm run lint`, `npm run format:check` — all clean.
- `npm run test` — full Vitest suite green: **842 tests, 133 files**.
- `npm run build` — succeeds; the new `/api/meal-plan-items/[id]/candidates`
  route is registered.

### Remaining

- **PERF-002** — re-encode the source dish photos / landing hero to ≤ ~300 KB.
  Lower priority now that the `next.config` `images` block transcodes served bytes
  to AVIF/WebP on the fly; it's a repo-size + optimizer-input win.
- **E2E/UI pass** — REC-004 (live ranking), COLLAB-008 (granted-member Today),
  ONB-010/011/012/040/043, SLOTPICK-001/002/004/006, PERF-005/006: verify on a
  running app (browser). The closing unit/integration criteria are green above.
