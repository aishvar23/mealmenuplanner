# End-to-end UI tests (Playwright)

Browser automation for the acceptance specs in
[`test/14_end_to_end_acceptance_tests.md`](../test/14_end_to_end_acceptance_tests.md).
This is the **pilot slice** — a proven harness plus a thin vertical (AUTH →
ONBOARD → today/recommendation). It's the foundation later phases extend to cover
the remaining areas (MEALPREF, MEALCOMP, COLLAB, GROCERY, NOTIF, ADMIN, …).

## What it runs

| Spec                 | Acceptance IDs             | Covers                                                 |
| -------------------- | -------------------------- | ------------------------------------------------------ |
| `auth.spec.ts`       | AUTH-001, AUTH-002         | Email/password sign-in; invalid-login error            |
| `onboarding.spec.ts` | ONBOARD-001, ONBOARD-002   | No-household routing; complete minimum onboarding      |
| `today-reco.spec.ts` | today happy path, RECO-001 | Generate an explainable, meat-free suggestion (veg HH) |

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
- **Data isolation:**
  - _Read-only / idempotent_ flows reuse the seeded `owner@` household via its
    `storageState` (today/RECO) — fast, no per-test sign-in.
  - _Mutating_ flows use the **`freshUser`** fixture (`fixtures/auth.ts`): a
    brand-new email-confirmed user per test, torn down afterwards (its household
    is deleted first because `households.created_by_user_id` has no FK cascade).
    This keeps mutating tests repeatable against shared cloud dev. It's a
    deliberate, documented deviation from the spec's fixed `nohousehold@` name.
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

## Not yet covered (follow-ups)

- The remaining ~100 cases, area by area on top of this harness.
- Google OAuth / magic-link AUTH tests (need a mocked/test OAuth provider).
- CI wiring (a non-blocking `e2e` GitHub job) once the isolation model is proven
  under parallelism.
