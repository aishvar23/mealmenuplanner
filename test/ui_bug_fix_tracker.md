# UI Acceptance Bug Fix Tracker

Tracks resolution of the findings in `test/ui_acceptance_bug_log.md` (Codex
browser pass, 2026-05-25). Each bug is **fixed**, **cannot reproduce** (stale /
test-spec mismatch), or **deferred** (large feature broken into a phased plan
doc; the reported symptom is real but the full fix spans multiple sessions).

Started: 2026-05-25 · Owner: Claude Code

## Status legend

- ✅ **Fixed** — change landed and verified (see Verification: runtime end-to-end
  checks + a Chrome browser click-through).
- 🟡 **Partially fixed** — core symptom resolved this session; remaining polish in a phased plan doc.
- 🔁 **Cannot reproduce** — not reproducible in current code (stale or test-spec naming mismatch).
- 📄 **Deferred (planned)** — real but large; phased plan doc created; chunks land across sessions.

## Summary

| Bug     | Area                                    | Status                | Notes                                                                                      |
| ------- | --------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| BUG-001 | Landing demo shows side dish as meal    | ✅ Fixed              | Demo card now shows a complete meal.                                                       |
| BUG-002 | `/dashboard`, `/meal-plan` 404 for anon | ✅ Fixed              | Real routes were already protected; added redirect aliases too.                            |
| BUG-003 | Google auth has no test flow            | ✅ Fixed              | Dev-login is a "test-only login callback" (allowed by AUTH-005); verified + documented.    |
| BUG-004 | Required onboarding fields skippable    | ✅ Fixed              | Per-step validation gates Next with field-level errors.                                    |
| BUG-005 | Optional steps lack "Skip for now"      | ✅ Fixed              | Skip control on optional steps.                                                            |
| BUG-006 | No preferred-dish onboarding step       | 🟡 Partially fixed    | Step + persistence landed; see `BUG-006_preferred_dish_plan.md`.                           |
| BUG-007 | Profile avatar not a real menu          | ✅ Fixed              | Account menu landed in ec1760f; added preferences link (PROFILE-003).                      |
| BUG-008 | Raita recommended as standalone dinner  | 🟡 Partially fixed    | meal_role + standalone hard filter; see `BUG-008-010_meal_role_plan.md`.                   |
| BUG-009 | Quick swaps include standalone sides    | 🟡 Partially fixed    | Same root fix; package presentation polish is follow-up.                                   |
| BUG-010 | Weekly planner fills standalone sides   | 🟡 Partially fixed    | Same root fix.                                                                             |
| BUG-011 | Grocery shows same ingredient twice     | ✅ Fixed              | Same-dimension unit normalization merges duplicates.                                       |
| BUG-012 | Pending invites not shown to owner      | ✅ Fixed              | Pending invites listed on household page.                                                  |
| BUG-013 | Owner role label confusing              | ✅ Fixed              | Disambiguated role vs membership-type labels.                                              |
| BUG-014 | No dish/ingredient images               | 📄 Deferred (planned) | Schema+content feature; **Codex is implementing it** from `BUG-014_image_support_plan.md`. |

> All ✅/🟡 changes below landed this session and passed the quality gates (see
> Verification). BUG-014 is owned by Codex per the phased plan; nothing in this
> session touches images, schema-for-images, or image seed data.

---

## Per-bug detail

### BUG-001 — Landing page promotes a side dish as a meal — ✅ Fixed

- **Root cause:** `app/page.tsx` hardcoded a demo "Today" card to "Coconut Chutney"
  (a condiment) with Approve/Try-another controls.
- **Fix:** demo card now shows a complete meal so the public surface never implies
  a side dish is a standalone decision.

### BUG-002 — Private route aliases 404 instead of redirecting — ✅ Fixed

- **Root cause:** test used route names that don't exist (`/dashboard`,
  `/meal-plan`). Real routes (`/today`, `/plan`, `/household`) already redirect
  anon users to `/sign-in?next=...` via `proxy.ts` + `lib/auth/route-access.ts`.
- **Fix:** added the test aliases as protected redirect aliases
  (`/dashboard`→`/today`, `/meal-plan`→`/plan`) so anon users redirect to sign-in
  and the acceptance test passes. (Originally a test-naming mismatch — would
  otherwise be 🔁 cannot reproduce.)

### BUG-003 — Google auth requires real login (no test flow) — ✅ Fixed

- **Finding:** AUTH-005 allows "a mocked OAuth provider, test OAuth provider, **or
  test-only login callback**." The in-progress dev-login
  (`lib/auth/dev-login.ts`, `app/api/dev/sign-in`, `components/auth/dev-sign-in-button.tsx`)
  is exactly a test-only login callback; it creates a real Supabase session
  without manual Google login.
- **Fix:** verified the dev sign-in button renders on `/sign-in` when
  `DEV_LOGIN_ENABLED=true` (non-prod); documented the flag in `.env.example`.

### BUG-004 — Required onboarding fields skippable until review — ✅ Fixed

- **Root cause:** the wizard's Next never validated; missing fields surfaced only
  on Review.
- **Fix:** per-step required-field validation gates Next and shows field-level
  errors near the inputs before leaving a step.

### BUG-005 — Optional steps lack "Skip for now" — ✅ Fixed

- **Root cause:** optional steps (`allergies_health`, `budget`) showed only Next.
- **Fix:** explicit "Skip for now" control on optional steps.

### BUG-006 — Preferred-dish onboarding flow missing — 🟡 Partially fixed

- **Finding:** persistence (`user_food_preferences.liked_dishes`) and the +10
  recommendation bonus already exist; only the step UI + carry-through were missing.
- **This session (create flow):** new preferred-dishes step (manual vs system),
  draft slice, `GET /api/onboarding/dishes` catalog (diet-filtered, standalone
  only), and persistence — the `complete_onboarding` RPC now writes the picks to
  the owner's `liked_dishes`, which already feeds the +10 bonus.
- **Follow-up:** edit-mode editing of preferred dishes (the preferences PATCH
  path doesn't touch `user_food_preferences` yet, so the step is create-only),
  image thumbnails (after BUG-014), and full E2E — see
  `BUG-006_preferred_dish_plan.md`.

### BUG-007 — Avatar not a clickable account menu — ✅ Fixed

- **Finding:** the account menu landed in commit ec1760f
  (`components/auth/account-menu.tsx`) — the avatar is a real `Menu.Trigger`
  button with identity + sign-out, so PROFILE-001/AUTH-003 were already fixed.
- **Fix:** added a "Household & preferences" link to the menu to satisfy PROFILE-003.

### BUG-008/009/010 — Sides recommended as standalone meals — 🟡 Partially fixed

- **Root cause:** `dishes` had no role concept; the engine had no filter to keep
  sides/condiments/components out of the primary slot.
- **This session:** added `meal_role` (schema + reseed) and a `notStandalone`
  hard filter so only `complete_meal`/`main_component` can be a primary pick.
- **Follow-up:** package composition + UI presentation (criterion 10) — see
  `BUG-008-010_meal_role_plan.md`.

### BUG-011 — Duplicate grocery ingredient lines — ✅ Fixed

- **Root cause:** grocery merge keyed on `(ingredientId, unit)`, so "Cooking Oil
  8 tbsp" and "3 tsp" stayed separate (MVP did not convert units).
- **Fix:** same-dimension unit normalization (volume tsp↔tbsp↔cup, mass g↔kg,
  etc.) so identical ingredients merge into one line.

### BUG-012 — Pending invite not shown to owner — ✅ Fixed

- **Root cause:** `listMembers` RPC filters to `status='active'`; no path listed
  pending invites; the household page never showed them.
- **Fix:** fetch + display pending invites in the household members UI.

### BUG-013 — Owner identity/role label confusing — ✅ Fixed

- **Root cause:** membership-type label "Member" (for `permanent`) collided with
  the role "Member".
- **Fix:** disambiguated labels (e.g. "Permanent member") and clarified the self row.

### BUG-014 — Dish/ingredient images absent — 📄 Deferred (planned)

- **Finding:** no image columns, no seed images, only a generic hero asset. This
  is a schema + content feature, not a render bug, and is partly blocked on
  sourcing/licensing ~180 real images.
- **Plan:** 7-phase breakdown in `test/BUG-014_image_support_plan.md` (Phases 1–5
  are pure engineering shippable behind a safe placeholder; Phase 6 content is
  chunked and isolated).

---

## Cloud-dev DB changes this session

Applied to the cloud dev project via the Supabase MCP (local migration files
under `supabase/migrations/` kept in sync):

- `20260525195035_p9_dish_meal_role` — `meal_role` enum + `dishes.meal_role`
  column; existing rows re-tagged from the seed catalog (BUG-008/009/010).
- `20260525195947_p9_complete_onboarding_liked_dishes` — `complete_onboarding`
  now writes `user_food_preferences.liked_dishes` (BUG-006).

`lib/db/database.types.ts` regenerated; `supabase/seed.sql` regenerated with
`meal_role` (insert + idempotent UPDATE). **No image columns/seed touched.**

## Verification

### Static / build gates (Node 22, matching CI)

- `npm run typecheck` — clean.
- `npm run test` — 123 files, **722 tests** pass (incl. new standalone-filter,
  grocery unit-merge, and preferred-dish completion tests).
- `npm run lint` — clean.
- `npm run format:check` — clean except `test/14_end_to_end_acceptance_tests.md`,
  which arrived unformatted in commit `8035dcb` (Codex) and is untouched here.
- `npm run build` — compiled successfully; `/api/onboarding/dishes` registered,
  `/dashboard`→`/today` and `/meal-plan`→`/plan` redirects configured.

### Runtime checks against the running dev app + cloud-dev DB

Verified by driving the live app (`npm run dev`) via HTTP — anonymous, then an
authenticated dev-login session — and querying the DB. These are real
end-to-end confirmations, not just compilation:

- **BUG-001** — server-rendered `/` shows "Masala Dosa" / "with Coconut Chutney",
  not a standalone chutney headline.
- **BUG-002** — `/dashboard`→307→`/today`, `/meal-plan`→307→`/plan`, and `/today`
  (anon)→307→`/sign-in?next=/today`.
- **BUG-003** — `/sign-in` renders both "Continue with Google" and "Dev: sign in
  as test user"; the dev-login POST returns a real session.
- **BUG-006 (data path)** — `/api/onboarding/dishes` is 401 for anon; authed
  `?diet=vegetarian` returns 69 standalone dishes and excludes chutney + raita.
- **BUG-008/009** — generated today (dinner) = "Veg Fried Rice"; alternatives are
  all mains (Hakka Noodles, Pasta Arrabbiata, Pithla, Bhindi Masala) — no
  side/condiment/rice-component.
- **BUG-010** — a freshly generated week has **14/14** items in
  `complete_meal`/`main_component`, 0 non-standalone (DB query).
- **BUG-011** — regenerated grocery list merges Cooking Oil to a single
  `66.667 tbsp` line (tbsp+tsp combined); no duplicate ingredient rows.
- **BUG-012** — after creating an invite, `/household` shows the "Pending
  invites" section with the invitee and "Awaiting acceptance".
- **BUG-013** — `/household` renders role "Owner" + membership "Permanent member".

### Chrome browser click-through (dev-login session)

Driven via the Claude-in-Chrome extension against the live app:

- **BUG-007** — clicking the header avatar opens the account menu showing
  "Signed in as", "Household & preferences", and "Sign out".
- **BUG-004** — on a fresh create-flow onboarding, clicking "Next" with the
  household name + family size empty stays on Step 1 and shows field errors
  ("Enter a household name.", "Enter your family size."); filling them clears
  the errors and advances.
- **BUG-006** — the create flow is now 7 steps incl. "Dishes"; choosing "Choose
  my preferred dishes" loads the diet-filtered catalog (mains only — no
  chutney/raita/plain rice), search filters it, and selecting a dish shows a
  checkmark + "1 dish selected".
- **BUG-005** — the optional Allergies and Budget steps show a "Skip for now"
  control next to Next; clicking it advances without entering anything.

All four were exercised end-to-end in the browser, so the whole backlog is now
either runtime/browser-verified or (BUG-014) handed to Codex.
