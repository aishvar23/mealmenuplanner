# UI Testing Bug Log - 2026-05-25

## Environment

- Branch: `main` after fast-forward pull from `origin/main` to `400b0cf`
- App URL: `http://localhost:3001`
- Server: `npm run dev -- -p 3001` (Next.js 16.2.6 / Turbopack)
- Browser path: Codex in-app Browser (`iab`)
- Viewports tested: default desktop `1280x720`, mobile override `390x844`
- Auth state: existing signed-in dev/test session for `codex-ui-confirmed-1779734749891@gmail.com`

## Coverage

- Landing: `/`
- Sign-in redirect/auth state: `/sign-in` redirected to `/today` because a session already existed
- Core app: `/today`, `/plan`, `/grocery`, `/household`, `/notifications`
- Preferences/onboarding edit flow: `/onboarding`, steps 1 through 6
- Account menu: opened successfully from `/today`
- Admin direct URLs: `/admin`, `/admin/dishes`, `/admin/ingredients` redirected to `/today` for this user/session

## Bugs Found

### BUG-UI-001 - Featured meal card has excessive empty space between slot/status and controls

- Severity: Medium
- Routes: `/today` desktop and mobile
- What the user sees: The featured meal card reserves a large blank white area below the meal slot/status row before the actions. On desktop this makes a one-meal card feel mostly empty; on mobile it pushes controls lower than necessary.
- Repro:
  1. Open `http://localhost:3001/today`.
  2. Use the existing signed-in household.
  3. Observe the featured meal card after a dish is accepted or suggested.
- Evidence:
  - Desktop screenshot showed a large blank region between `DINNER` / `Accepted` and the action buttons.
  - Mobile `390x844` screenshot showed the same empty area inside the featured card.
- Likely owner/files:
  - `components/meal-plan/today-board.tsx`
  - The card uses `featured && "min-h-[28rem]"` around line 210 and the body uses `min-h-56` around line 254.
- Suggested fix direction: Make featured card body height content-driven, or reserve vertical space only for states that actually render quick swaps/details.

### BUG-UI-002 - Placeholder dish image is above the fold and triggers a Next.js LCP warning

- Severity: Medium
- Routes: `/today`, `/plan` when a meal uses `/images/placeholder-dish.svg`
- What the user sees: Several current meals render placeholder imagery (`Dish image unavailable`), including above-the-fold cards. The browser console reports an LCP warning for the placeholder dish image.
- Repro:
  1. Open `http://localhost:3001/today`.
  2. Use a meal with missing or non-verified image metadata, such as `Curd Rice`.
  3. Check console warnings.
- Evidence:
  - Console warning: `Image with src "/images/placeholder-dish.svg" was detected as the Largest Contentful Paint (LCP). Please add the loading="eager" property if this image is above the fold.`
  - DOM snapshots showed repeated `img "Dish image unavailable"` entries on `/today` and `/plan`.
- Likely owner/files:
  - `components/ui/food-image.tsx`
  - `components/meal-plan/today-board.tsx`
  - `components/meal-plan/week-board.tsx`
- Suggested fix direction: Let `FoodImage` accept a priority/eager-loading prop for above-the-fold uses, and/or improve seed image coverage for dishes that appear in primary recommendations.

### BUG-UI-003 - Onboarding desktop side-panel copy is partially below the first viewport

- Severity: Low/Medium
- Route: `/onboarding` at desktop `1280x720`
- What the user sees: The left visual panel's marketing copy (`Set the rules once. Decide dinner faster.`) starts at the bottom edge of the first viewport and is partially clipped/mostly inaccessible without scrolling.
- Repro:
  1. Open `http://localhost:3001/onboarding` at the default desktop viewport.
  2. Observe the left image panel on initial load.
- Evidence:
  - Desktop screenshot showed only the lower portion of the left-panel text at the bottom of the viewport while the right-side form was visible.
- Likely owner/files:
  - `app/onboarding/page.tsx`
  - The side panel uses a full-height `justify-between` layout around lines 101-132, while the right-side form content can make the grid taller than the viewport.
- Suggested fix direction: Make the left panel sticky to the viewport, center or pin the copy within the visible viewport, or hide the copy when vertical space is constrained.

## Non-blocking Observations

- The app rendered meaningful content on all tested user-facing routes and did not show a framework error overlay.
- No relevant console errors were captured.
- Mobile layouts did not show document-level horizontal overflow (`scrollWidth` matched the client width in the tested viewport).
- The floating Next.js dev tools button overlaps bottom navigation/buttons in dev mode on mobile. This appears dev-only and not an app UI defect unless the project expects dev-mode screenshots to be clean.
- Grocery checkbox interactions worked: marking `Capsicum` bought updated counts and the `Bought` filter, then unmarking restored the list.
- Today interactions worked: `Try another`, quick-swap `Choose`, and lock/unlock eventually updated state, though lock/unlock took several seconds and only communicated progress by disabling controls.
