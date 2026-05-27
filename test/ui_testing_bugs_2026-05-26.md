# UI Testing Bug Log - 2026-05-26

User-reported defects from a manual run of the app, triaged and validated against
the code on branch `fix/app-bug-sweep` (cut from `origin/main` @ `2869ca4`).
These 12 bugs continue the existing sequence as **BUG-015 … BUG-026**
(prior bugs: `test/ui_acceptance_bug_log.md`, through BUG-014).

Companion docs:

- Acceptance + functional tests: `test/15_reported_bugs_acceptance_tests.md`
- Implementation tracker: `test/BUG-015-026_IMPLEMENTATION_TRACKER.md`

## Environment

- Branch: `fix/app-bug-sweep` (from `origin/main` @ `2869ca4`)
- App: Next.js 16 (App Router, Turbopack), React 19, Supabase cloud dev
- Validation method: **code-level root-cause tracing** (this pass). UI evidence is
  added per bug as flows are exercised against a running dev app + Chrome.
- Auth state: an authenticated dev-login household is assumed for the app routes.

## Reporter symptoms → IDs

| Reported | ID      | One-line                                                                     |
| -------- | ------- | ---------------------------------------------------------------------------- |
| #1       | BUG-015 | Recommendations ignore the meal combinations I chose                         |
| #2       | BUG-016 | The site is slow / laggy                                                     |
| #3       | BUG-017 | Members can't change an approved meal; no notify on approve/overwrite        |
| #4       | BUG-018 | Invitee should also get an email, not just a copyable link                   |
| #5       | BUG-019 | "Finish" shows a "changes may not be saved" leave dialog                     |
| #6       | BUG-020 | Onboarding text should be pre-filled; country/city = dropdowns from timezone |
| #7       | BUG-021 | `/today` nav still says "Approve tonight" when all approved                  |
| #8       | BUG-022 | Weekly "Generate Week" should let me pick the replacement meal               |
| #9       | BUG-023 | `/today` "Try another" should let me pick the replacement meal               |
| #10      | BUG-024 | Step 3 choices don't appear on the Review page                               |
| #11      | BUG-025 | Step 3 combination images smaller; dish name shown twice                     |
| #12      | BUG-026 | Step 3 options aren't additive across the three modes                        |

## Status this session

- ✅ Fixed (quick wins): **BUG-019, BUG-021, BUG-025**, and **BUG-018** (code path
  and send-status UI; final delivery verification awaits a `RESEND_API_KEY`).
- 📄 Deferred (planned, in the tracker): **BUG-015, BUG-016, BUG-017, BUG-020,
  BUG-022, BUG-023, BUG-024, BUG-026**.

---

## Bugs Found

### BUG-015 — Recommendations ignore the chosen meal combinations

- Severity: High
- Routes: `/today`, `/plan` (recommendation output)
- What the user sees: After selecting several meal combinations in onboarding, the
  daily/weekly recommendations look random and don't favour the chosen dishes.
- Repro:
  1. Onboard and pick combinations in Step 3 ("Select meal combinations") without
     manually bumping each one's frequency.
  2. Open `/today` (or generate a week) and inspect the suggestions.
  3. The selected combinations' dishes are not preferentially recommended.
- Evidence (code):
  - A toggled combination defaults to `frequency: "once_in_a_while"`
    (`components/onboarding/steps/preferred-dishes-step.tsx:178`).
  - In scoring, `once_in_a_while` applies `frequencyOnceInAWhile = -20`
    (`lib/recommendation/config.ts:102`, `lib/recommendation/scoring.ts:256-260`),
    so a chosen dish scores **below** an unchosen one (0).
  - The only positive popularity signal, `popularDish +15`, is gated on
    `popularityThreshold: 5` (`lib/recommendation/config.ts:133`); a fresh
    household bumps each combo's `popularity_count` by just +1, so it never fires
    for the household's own picks. There is **no "this household chose this dish"
    positive factor** in `HouseholdContext` / scoring.
- Likely owner/files: `lib/recommendation/{scoring,config,types}.ts`,
  `lib/services/recommendation/load-inputs.ts`,
  `components/onboarding/steps/preferred-dishes-step.tsx`.
- Suggested fix direction: Add a positive `householdChosenDish` factor for any dish
  in `household_dish_preferences` (regardless of tier), large enough to clear the
  generic factors; stop letting `once_in_a_while` net-penalize a chosen dish; feed
  the household's own selected-combination dish ids to the engine as a per-household
  set, separate from the global popularity threshold.

### BUG-016 — Site is slow / laggy

- Severity: High
- Routes: all, most visibly `/today`, `/plan`, `/grocery`, landing `/`
- What the user sees: Navigation and first paint feel slow; meal cards are sluggish.
- Repro: Navigate between `/today` / `/plan`; observe first-load latency and image
  pop-in.
- Evidence (code):
  - **Images:** `next.config.ts` has **no `images` block**; dish photos under
    `public/images/dishes/meal_photos/` (~154 MB) and the sibling folders are
    2.5–3 MB PNGs (e.g. `aloo-beans.png` ≈ 2.96 MB). The landing hero
    `public/images/meal-hero.png` ≈ 2.3 MB. PNG is the wrong format for photos.
  - **N+1 on the hot path:** `ensureDaySuggestions`
    (`lib/services/meal-plan/generate.ts:344`) loops slots and calls
    `suggestForSlot` → `loadSlotInputs` per empty slot, reloading the entire
    candidate universe (prefs, members, candidate dishes + ingredients + attrs +
    prep + pairings + history + popular combos) each time. `generateWeek` already
    loads inputs once — the day path doesn't.
  - **Auth revalidation:** `getAuthUser()` wraps `supabase.auth.getUser()` (a
    network revalidation) and is invoked ~6–8×/render across the proxy, layout,
    page, and service guards; **no React `cache()`** appears anywhere in `lib/`.
- Likely owner/files: `next.config.ts`, `public/images/dishes/*`,
  `lib/services/meal-plan/generate.ts`, `lib/services/recommendation/recommend.ts`,
  `lib/auth/session.ts`, `lib/auth/guards.ts`,
  `lib/services/household/current-household.ts`.
- Suggested fix direction: Add an `images` config (AVIF/WebP, device/image sizes)
  and re-encode source photos to ~150–300 KB; refactor `ensureDaySuggestions` to
  load inputs once like `generateWeek`; wrap `getAuthUser` /
  `getActiveMembership` / `resolveCurrentHousehold` in React `cache()`.

### BUG-017 — Member can't change an approved meal; no notify on approve/overwrite

- Severity: High
- Routes: `/today`, `/plan`
- What the user sees: A non-owner member has no way to change a meal (even one not
  yet approved). When a meal is approved, other members aren't notified; when an
  approved meal is overwritten, members aren't reliably notified.
- Repro:
  1. As a `member` (not owner), open `/today` — no change/approve actions render.
  2. As owner, approve a meal — members get no notification.
  3. Overwrite an approved meal via "Try another" — no notification fires.
- Evidence (code):
  - The `member` default bundle has `can_change_today_menu: false` /
    `can_change_weekly_schedule: false`
    (`lib/auth/permissions.ts:207-217`). `loadItemForAction` then 403s
    (`lib/services/meal-plan/access.ts:111-115`) and the Today board renders no
    actions (`app/(app)/today/page.tsx:42`, `components/meal-plan/today-board.tsx:313`).
    There is **no `accepted`-status guard** — the block is purely the flag.
  - No `meal_accepted` event exists (`lib/events/types.ts`, `lib/events/templates.ts`)
    and `acceptItem` (`lib/services/meal-plan/items.ts:48-70`) emits nothing.
  - `replaceItem` emits `meal_changed`, but `suggestAnotherItem`
    (`items.ts:77-84` → `generate.ts`) silently overwrites an `accepted` cell with
    no event.
- Likely owner/files: `lib/auth/permissions.ts`, `lib/services/meal-plan/{items,access,generate}.ts`,
  `lib/events/{types,templates}.ts`, member-management UI under `components/household/`.
- Suggested fix direction (per user decision — **owner toggles per member**):
  surface the per-member `can_change_today_menu` / `can_change_weekly_schedule`
  toggles in the owner-only member-management UI (don't flip the role default); add
  a `meal_accepted` event + template emitted from `acceptItem`; emit `meal_changed`
  whenever an accepted/cooked cell is overwritten (incl. `suggestAnotherItem`).
  `event_type` is free-text, so no enum migration. RLS must agree with the granted
  flag.

### BUG-018 — Invitee should also get an email — ✅ Fixed (code) / config pending

- Severity: Medium
- Routes: `/household` (invite panel)
- What the user sees: Inviting a member produced only a copyable link; no email was
  sent to the invitee.
- Repro:
  1. `/household` → "Invite someone" → enter an email → create the invite.
  2. No email arrives.
- Evidence (code): The Resend email adapter is fully built
  (`lib/events/notifier/*`) and `createInvite` already calls `sendInviteEmail`
  when an email is supplied (`lib/services/invite/create-invite.ts:110`). It's a
  no-op only because `RESEND_API_KEY` is unset → `getEmailTransport()` returns
  `null` (`lib/events/notifier/email-transport.ts:64-71`). So the email "doesn't
  send" purely due to missing config, and the UI gave no indication either way.
- Fix this session: `sendInviteEmail` now returns an `InviteEmailOutcome`
  (`sent` / `not_configured` / `failed`); `createInvite` threads it as
  `CreateInviteResult.emailStatus`; the invite panel shows
  "Invitation emailed to …" / "Email delivery isn't set up yet…" / a failure note.
  **Config to-do:** set `RESEND_API_KEY` (+ optional `RESEND_FROM_EMAIL`) and
  verify a real send.
- Likely owner/files: `lib/events/notifier/router.ts`,
  `lib/services/invite/{create-invite,dto}.ts`,
  `components/household/household-members.tsx`, `.env.local` / prod env.

### BUG-019 — "Finish" shows a spurious leave-page dialog — ✅ Fixed

- Severity: Medium
- Routes: `/onboarding` (Finish on the Review step)
- What the user sees: Clicking "Finish" pops Chrome's "Changes you made may not be
  saved" dialog before navigating to `/today`.
- Repro:
  1. Complete onboarding so each step has been saved.
  2. On Review, click "Finish".
  3. The leave-page dialog appears.
- Evidence (code): The autosave `beforeunload` guard
  (`components/onboarding/use-draft-autosave.ts:186-195`) fires while
  `unsavedRef.current` is `true`. On Finish, `saveNow` sets the dirty flag
  (`:171`); if the Review snapshot equals the last successful save, `performSave`
  hit the coalesce early-return (`:98-101`) and returned **without** clearing the
  flag, so the navigation tripped the dialog.
- Fix this session: the coalesce branch now clears the dirty flag
  (`markUnsaved(false)` / status `saved`) when the buffered snapshot is the latest,
  so an up-to-date draft no longer warns on Finish.
- Likely owner/files: `components/onboarding/use-draft-autosave.ts`.

### BUG-020 — Onboarding location fields are placeholder/free-text

- Severity: Medium
- Routes: `/onboarding` Step 1 (Household basics)
- What the user sees: The household name is a placeholder (not pre-filled), and
  country/city are free-text inputs that aren't auto-populated.
- Repro: Open Step 1 — name shows only a placeholder; country/city are empty text
  boxes.
- Evidence (code): `components/onboarding/steps/household-basics-step.tsx` — name
  uses `placeholder` only (`:48-49`); country (`:96-107`) and city (`:108-119`) are
  plain `<Input type="text">`. No timezone usage exists anywhere
  (`Intl.DateTimeFormat`/`resolvedOptions` returns no hits).
- Likely owner/files: `components/onboarding/steps/household-basics-step.tsx`,
  `lib/onboarding/draft.ts`.
- Suggested fix direction (per user decision — **country dropdown + city text**):
  country becomes a `<select>`; city stays text but pre-filled; both seeded on
  mount from `Intl.DateTimeFormat().resolvedOptions().timeZone` via a small
  timezone→country/city map. No large city dataset.

### BUG-021 — `/today` nav subtitle stuck on "Approve tonight" — ✅ Fixed

- Severity: Low
- Routes: app shell sidebar (all authenticated routes)
- What the user sees: The "Today" nav link's subtitle always reads "Approve
  tonight", even when every meal is already accepted — confusing.
- Repro: Accept all of today's meals; the sidebar still says "Approve tonight".
- Evidence (code): A hardcoded static `description: "Approve tonight"` on the Today
  link (`components/app-nav.tsx:13`), rendered verbatim (`:106`); it never reads
  plan state.
- Fix this session: changed the subtitle to the status-neutral "Today's meals" so
  it's never wrong regardless of approval state.
- Likely owner/files: `components/app-nav.tsx`.
- Follow-up (optional, tracked): make it dynamic ("N to approve" / "All set") by
  plumbing an undecided-slot count into the client nav.

### BUG-022 — Weekly "Generate Week" should let the user pick the replacement

- Severity: Medium
- Routes: `/plan` (week board)
- What the user sees: After "Generate Week", each cell has a "Swap" button that
  auto-replaces the meal with the engine's next pick; the user can't choose.
- Repro: `/plan` → Generate Week → "Swap" a cell → it changes to whatever the
  engine picks next.
- Evidence (code): `components/meal-plan/week-board.tsx:237-245` ("Swap") calls
  `onSuggestAnother` → `api.suggestAnother` → `suggestAnotherItem`
  (`lib/services/meal-plan/items.ts:77-84`), which overwrites the cell with the
  next top recommendation. No picker UI exists. The `replaceItem(id,
{ replacementDishId })` endpoint already supports choosing a specific dish.
- Likely owner/files: `components/meal-plan/week-board.tsx`,
  `lib/services/meal-plan/items.ts`,
  `app/api/meal-plan-items/[mealPlanItemId]/replace/route.ts`.
- Suggested fix direction: rename to "Change" and open an onboarding-style
  **single-select** picker; commit the chosen dish via the existing
  `replaceItem` endpoint (single instance replaced).

### BUG-023 — `/today` "Try another" should let the user pick the replacement

- Severity: Medium
- Routes: `/today`
- What the user sees: "Try another" auto-cycles to the engine's next pick rather
  than letting the user choose (only a limited "Quick swaps" list exists).
- Repro: `/today` → "Try another" on a meal → it jumps to the next engine pick.
- Evidence (code): `components/meal-plan/today-board.tsx:448-455` ("Try another")
  → `onSuggestAnother` → `suggestAnotherItem` (same auto-cycle as BUG-022). A
  "Quick swaps" list (`:347-392`) offers a few runners-up via `replaceItem`, but
  not the full onboarding-style picker.
- Likely owner/files: `components/meal-plan/today-board.tsx`,
  `lib/services/meal-plan/items.ts`.
- Suggested fix direction: same reusable single-select picker as BUG-022, committed
  via `replaceItem`. (BUG-022 + BUG-023 share one picker component.)

### BUG-024 — Step 3 choices don't appear on the Review page

- Severity: Medium
- Routes: `/onboarding` (Review step)
- What the user sees: The combinations picked in Step 3 don't show on Review (or
  show only as an opaque count / "Not set").
- Repro: Pick combinations in Step 3 → advance to Review → the chosen combinations
  aren't listed.
- Evidence (code): `components/onboarding/steps/review-step.tsx:198-231` renders the
  `combinations` mode as a bare `"{count} selected"` (and "Not set" when 0); it has
  no combination catalog to resolve the stored combination ids → names, so the
  actual picks are invisible.
- Likely owner/files: `components/onboarding/steps/review-step.tsx`,
  `lib/onboarding/draft.ts`.
- Suggested fix direction: resolve combination ids → names for Review (pass the
  catalog in, or store the name alongside the id) and list the real selections.
  Pairs with BUG-026 (Review must merge all populated sources).

### BUG-025 — Step 3 combination images smaller; dish name shown twice — ✅ Fixed

- Severity: Low
- Routes: `/onboarding` Step 3
- What the user sees: In "Select meal combinations", the dish images are much
  smaller than the "Build your own combination" dish cards, and each dish's name
  appears under its thumbnail in addition to the combination name above — so the
  name reads twice.
- Repro: Open Step 3, compare "Select meal combinations" vs "Build your own".
- Evidence (code): `CombinationCard` rendered each member dish as a `w-16` (4rem)
  thumbnail (`components/onboarding/cards/combination-card.tsx:68-82`) vs
  `DishCard`'s `w-full` image (`dish-card.tsx:50`); and it showed the combination
  name (`:46`) plus a `dish.name` caption under each thumbnail (`:79`), reading as
  the name twice. (`FoodImage` renders only an `alt` attribute — no visible
  filename — so the duplication was the title-vs-caption overlap.)
- Fix this session: the member thumbnails now fill a 3-up grid (`w-full`,
  larger `sizes`) so they're as prominent as the build-mode dish images, and the
  redundant per-dish captions are removed (dish names remain in the image alt text
  for assistive tech; the combo name + description name the plate once).
- Likely owner/files: `components/onboarding/cards/combination-card.tsx`.

### BUG-026 — Step 3 options aren't additive across the three modes

- Severity: Medium
- Routes: `/onboarding` Step 3
- What the user sees: Picking from "Select combinations", "Build your own", and
  "Let the system decide" is mutually exclusive — switching modes wipes the prior
  mode's selections instead of accumulating them.
- Repro: Pick a combination, switch to "Build your own", add a dish, switch back —
  the combination is gone.
- Evidence (code): `PreferredDishes.mode` is a single value; each `ModeCard`
  `onSelect` clears the sibling arrays
  (`components/onboarding/steps/preferred-dishes-step.tsx:64-101`), and only the
  active mode's picker renders (`:104-130`). Review reads only the active mode
  (`review-step.tsx:201`).
- Likely owner/files: `components/onboarding/steps/preferred-dishes-step.tsx`,
  `lib/onboarding/draft.ts`, `components/onboarding/steps/review-step.tsx`,
  `lib/services/onboarding/validate-completion.ts`.
- Suggested fix direction: stop clearing sibling arrays; track
  `selectedCombinations`, `builtDishes`, `dishNames` independently and render the
  populated sources together; Review and the completion mapping merge all
  populated sources. Pairs with BUG-024.

---

## Notes

- Code-level root causes above are validated. UI evidence (screenshots / DOM /
  console) is added to each bug as the running app is exercised; per the request,
  some UI validation may be deferred where it requires multi-account or email
  delivery.
- The quick-win fixes (BUG-018 code, BUG-019, BUG-021, BUG-025) landed on
  `fix/app-bug-sweep` this session and pass `typecheck` + the affected unit tests.
