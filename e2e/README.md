# End-to-end UI tests (Playwright)

Browser automation for the acceptance specs in
[`test/14_end_to_end_acceptance_tests.md`](../test/14_end_to_end_acceptance_tests.md).
Every acceptance case is represented as a Playwright test: implemented,
deterministically-verifiable behavior runs as a real assertion; everything else
is a `test.fixme` with a one-line reason (unbuilt feature, external mock needed,
or seed/time control the UI doesn't expose). `npx playwright test --list` shows
the full set; fixmes report as "skipped".

## Coverage by area

| Area     | Real (verified)                          | Fixme (reason)                                                     |
| -------- | ---------------------------------------- | ------------------------------------------------------------------ |
| AUTH     | 001, 002, 003, 004                       | 005–007 (Google OAuth needs a mocked provider)                     |
| PROFILE  | 001, 002, 003                            | —                                                                  |
| ONBOARD  | 001–009                                  | 010 (API fault injection)                                          |
| MEALPREF | implemented 2-mode preferred-dishes step | 001–009 combination/frequency cases (not built in the app)         |
| IMAGE    | 001                                      | 002–007 (seeded broken/missing statuses, LCP, specific dishes)     |
| MEALCOMP | 001 (sides never standalone)             | 002–010 (can't force a specific dish via UI; admin in ADMIN)       |
| RECO     | 001, 002, 005                            | 003,004,006–012 (seed/time control; combination/frequency unbuilt) |
| PLAN     | 001–005                                  | —                                                                  |
| GROCERY  | 001, 002, 003                            | 004 (ingredient correlation)                                       |
| COLLAB   | 006, 008, 011, 015/016, 017, 018, 020    | invite/decline/transfer/notify round-trips (two browser contexts)  |
| NOTIF    | 006                                      | 001–005 (need a second member's action)                            |
| ADMIN    | console access + non-admin gating        | 001–005 (catalog mutations pollute the shared catalog)             |
| SECURITY | 001, 002, 005                            | 003, 004 (invite-lifecycle setup)                                  |
| MOBILE   | 001, 002                                 | 003 (invite UI round-trip)                                         |
| A11Y     | 001, 002, 003                            | —                                                                  |

Security-critical permission checks (global criterion 15) are verified at BOTH
layers: the UI hides the control AND a direct API call is rejected.

## Setup

1. Install the browser binary once (the `@playwright/test` package is already a
   devDependency):

   ```bash
   npx playwright install chromium
   ```

2. Provide credentials. The suite signs in with **real email/password** and
   provisions its accounts with the **service-role key** — no Google/magic-link
   mocking. `playwright.config.ts` loads `.env.local` then an optional `.env.e2e`
   overlay. The hard requirements (in either file):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already in
     `.env.local` for cloud dev.
   - `SUPABASE_SERVICE_ROLE_KEY` — used outside the app to create/clean up test
     users and ephemeral households.
   - `E2E_USER_PASSWORD` _(optional)_ — shared password for all test accounts;
     defaults to `e2e-Password-1234`.

   Copy `.env.e2e.example` → `.env.e2e` to override anything for e2e runs.

> Runs against **cloud dev** — there is no local Supabase stack on this machine.

## Running

```bash
npm run test:e2e          # headless run (boots `npm run dev` automatically)
npm run test:e2e:ui       # interactive UI mode for debugging
npm run test:e2e:report   # open the last HTML report
```

Playwright starts the dev server itself (`webServer`), reusing one you already
have running locally.

## How it works

- **`global-setup.ts`** runs once: idempotently provisions the six seeded spec
  users (`owner@`, `member@`, `viewer@`, `guest@`, `admin@`, `nohousehold@`),
  then signs in as `owner@` and — on first run — completes a minimum
  **vegetarian** onboarding, capturing the session to `e2e/.auth/owner.json`.
  It also grants `admin@` the operator role (`app_metadata.app_role`) and
  captures its `storageState` for the ADMIN specs.
- **Data isolation (fixtures in `fixtures/auth.ts`):**
  - _Read-only_ flows reuse the seeded `owner@`/`admin@` `storageState` — fast,
    no per-test sign-in.
  - `freshUser` — a brand-new email-confirmed user, no household, torn down after.
  - `onboardedHousehold` — signs a fresh user in and completes minimum
    (vegetarian) onboarding, yielding a clean owner household per test.
  - `team` — multi-user: mint users, onboard an owner, add members by role
    (`addHouseholdMember` mirrors `defaultPermissionsForRole`), grant admin.
    Teardown deletes every created user; deleting the owner cascades the
    household and all memberships (`households.created_by_user_id` has no FK
    cascade, so the household is removed before the owner user).
  - A documented deviation from the spec's fixed `member@`/`guest@` names, for
    isolation against shared cloud dev.
- **Sign-out / switching users:** `signInWithPassword` clears cookies first.
  Never sign out a _seeded_ user in a test — Supabase global sign-out revokes
  all of that user's sessions (including captured storageState).
- **Selectors:** the app has no `data-testid`s but solid accessible markup, so
  specs use role/label/text locators (`getByRole`, `getByLabel`, `getByText`).

## Adding a spec from an acceptance ID

1. Find the case in `test/14_end_to_end_acceptance_tests.md`.
2. Pick the data model: read-only → `import { test } from "@playwright/test"` +
   `test.use({ storageState: OWNER_STORAGE_STATE })`; mutating → `import { test }
from "../fixtures/auth"` and take the `freshUser` fixture.
3. Reuse helpers (`helpers/auth.ts`, `helpers/onboarding.ts`); add new ones there
   rather than inlining flows.
4. Prefer role/label/text locators. Only add a `data-testid` in the app when a
   node is genuinely ambiguous.

## Follow-ups (current `test.fixme`s)

- **Multi-browser collaboration round-trips** (COLLAB invite/accept/decline/
  transfer, NOTIF fan-out): need a second authenticated browser context + the
  invite-acceptance UI. The permission/access-loss core is already covered.
- **Google OAuth** AUTH-005/006/007: need a mocked/test OAuth provider.
- **Admin catalog mutations** (ADMIN-001..005, IMAGE-006, MEALCOMP-010): write to
  the shared dish catalog; need an isolated content environment to avoid skewing
  the recommendations other specs rely on.
- **Meal-combination catalog + frequency tags** (MEALPREF-001..008, RECO-011/012,
  global criteria 7/9/10): not wired into the app — schema-only.
- **Seed/time-controlled RECO** (cooking time, variety gap, prep timing) and
  seeded image statuses (broken/missing, LCP): need fault/seed/time injection.
- **CI wiring**: a non-blocking `e2e` GitHub job once the isolation model is
  proven under parallelism.
