# UI Acceptance Bug Log

Append-only findings from browser-based UI testing against `http://localhost:3001`.

## 2026-05-25 13:51 CDT - Browser UI pass

Environment:

- App hosted locally on port 3001.
- Browser path: Codex Browser plugin / Chrome-like in-app browser.
- Test basis: `test/14_end_to_end_acceptance_tests.md`.
- Authenticated UI reached with a disposable confirmed dev account created for testing: `codex-ui-confirmed-1779734749891@gmail.com`.

### BUG-001 - Public landing page promotes a standalone side dish as a meal

Acceptable criteria:

- Global acceptance criteria 9 and 10.
- MEALCOMP-001: chutneys, dips, pickles, papad, and side dishes are never standalone main meals.
- MEALCOMP-002: Masala Dosa is recommended with chutney, where chutney is an accompaniment and not the main meal.

Actual result:

- The unauthenticated landing page at `/` shows a "Today" recommendation card with `Coconut Chutney` as the suggested meal.
- The same card describes it as "breakfast-ready" and presents `Approve` / `Try another` controls, implying it is a standalone meal decision.

Expected result:

- Public and authenticated meal-decision surfaces should never present `Coconut Chutney` or other side/accompaniment dishes as standalone meals.
- If chutney appears, it should be paired with a valid main/base item such as `Masala Dosa + Coconut Chutney`.

### BUG-002 - Acceptance-named private routes show public 404 instead of redirecting to sign-in

Acceptable criteria:

- AUTH-004: anonymous users navigating directly to `/dashboard`, `/meal-plan`, and `/household/members` should be redirected to sign-in, with no private data rendered before redirect.

Actual result:

- `/household/members` redirects to `/sign-in?next=%2Fhousehold%2Fmembers`.
- `/dashboard` renders a public 404 at `http://localhost:3001/dashboard`.
- `/meal-plan` renders a public 404 at `http://localhost:3001/meal-plan`.

Expected result:

- All acceptance-documented private route aliases should redirect anonymous users to sign-in or route to the corresponding protected page before auth gating.

### BUG-003 - Google auth is not test/mocked and requires real Google login

Acceptable criteria:

- AUTH-005: user can sign in with Google Auth test flow.
- Required authentication setup: Google Auth must use a mocked OAuth provider, test OAuth provider, or test-only login callback and must not require manual Google login.

Actual result:

- Clicking `Continue with Google` navigates to the real Google Accounts login page for the Supabase project.
- No test OAuth option or local mocked callback is visible in the UI.

Expected result:

- The local/E2E environment should expose a non-manual Google test flow that can complete automatically and return to the app.

### BUG-004 - Required onboarding fields can be skipped until final review

Acceptable criteria:

- ONBOARD-007: required onboarding validation works.
- Expected result: clear field-specific validation errors appear, and user cannot complete onboarding with missing required fields.

Actual result:

- From onboarding step 1, clicking `Next` with an empty `Household name` advances to step 2.
- From step 2, clicking `Next` with no diet type or cuisine advances to step 3.
- From step 3, clicking `Next` with no meals selected advances toward review.
- Missing required fields are only summarized on the review step as "A few required details are still missing."

Expected result:

- Each step should block progression when its required fields are empty.
- Errors should be shown near the relevant fields before the user leaves the step.

### BUG-005 - Optional onboarding sections do not provide "Skip for now"

Acceptable criteria:

- ONBOARD-006: optional onboarding sections can be skipped.
- Expected step: reach allergies/health section, click `Skip for now`, then finish onboarding.

Actual result:

- The allergies/health and budget sections can be left empty, but the visible action remains `Next`.
- No `Skip for now` action is present on the optional steps.

Expected result:

- Optional onboarding sections should include an explicit `Skip for now` control so users understand the step is optional.

### BUG-006 - Preferred dish onboarding flow is missing

Acceptable criteria:

- PREFDISH-001 through PREFDISH-005.
- User should see both `Choose my preferred dishes` and `Let the system choose based on my preferences` during onboarding.

Actual result:

- The six-step onboarding flow includes Household, Food, Schedule, Allergies, Budget, and Review.
- No preferred-dish step appears.
- No controls are visible for manually selecting preferred dishes or delegating selection to the system.

Expected result:

- Onboarding should include a preferred-dish decision step with manual selection and system-choice options.
- Selected preferred dishes should persist and influence recommendations.

### BUG-007 - Signed-in profile avatar is not a clickable profile/account menu

Acceptable criteria:

- PROFILE-001: signed-in user sees a clickable profile button, account menu opens, and menu shows identity and sign-out option.
- AUTH-003: user can sign out.
- PROFILE-003: user can reach preferences from the profile menu.

Actual result:

- The signed-in shell shows a square avatar with `aria-label="Signed in as ..."` but it is rendered as a generic element, not a button.
- Clicking it does not open any account menu.
- No sign-out or preferences action is available from the avatar.

Expected result:

- The profile control should be an accessible button.
- Clicking it should open an account menu containing user identity, sign-out, and preferences/household preferences.

### BUG-008 - Today recommendation suggests a side dish as standalone dinner

Acceptable criteria:

- Global acceptance criteria 9 and 10.
- MEALCOMP-001: side dishes are never standalone main meals.
- MEALCOMP-009: Raita may appear only as an optional side/accompaniment.

Actual result:

- After completing vegetarian onboarding, `Today` generated `Boondi Raita` as the primary dinner suggestion.
- The page presented `Approve`, `Try another`, and `Eating out` actions for `Boondi Raita`.

Expected result:

- Raita should never be the standalone dinner recommendation.
- If raita appears, it should be clearly labeled as a side/accompaniment for a complete meal.

### BUG-009 - Today quick swaps include incomplete standalone components

Acceptable criteria:

- MEALCOMP-003: Jeera Aloo is not a complete meal by itself.
- MEALCOMP-004 and MEALCOMP-005: base/main components should be paired into complete meals.

Actual result:

- The Today quick swaps list contained `Jeera Aloo`, `Jeera Rice`, and `Curd Rice` as standalone alternatives.

Expected result:

- Quick swaps in meal-decision mode should show complete meal packages, not standalone sides, rice, breads, or accompaniments unless they are complete meals by metadata.

### BUG-010 - Weekly planner generates incomplete standalone meal slots

Acceptable criteria:

- PLAN-001: selected meal slots contain complete meal packages; side dishes do not appear alone.
- Global acceptance criteria 9 and 10.

Actual result:

- After clicking `Generate week`, the weekly planner filled dinner slots with standalone items including `Boondi Raita`, `Jeera Aloo`, `Jeera Rice`, and `Tandoori Roti`.

Expected result:

- Weekly plan slots should contain complete meals or valid meal packages only.
- Side dishes, rice, bread, and sabzi-style components should be paired appropriately.

### BUG-011 - Grocery list shows the same ingredient as separate line items

Acceptable criteria:

- GROCERY-002: duplicate ingredients are merged.

Actual result:

- The grocery list showed `Cooking Oil` twice under Pantry staples:
  - `Cooking Oil` `8 tbsp`
  - `Cooking Oil` `3 tsp`

Expected result:

- Duplicate ingredients should be normalized and merged into one grocery-list item when they represent the same ingredient.

### BUG-012 - Invite creation does not show pending invite in owner-visible members/invites list

Acceptable criteria:

- COLLAB-001: owner can invite permanent member.
- Expected result: invite is created with pending status, owner sees pending invite, and invitee can open invite link.

Actual result:

- Creating an invite for `member@example.com` produces a share link.
- The page still shows only the current member in the Members list.
- No pending invite row/status is displayed after creation.

Expected result:

- After invite creation, the owner should see the pending invite status in the household/member management UI.

### BUG-013 - Member identity display is confusing for household owner

Acceptable criteria:

- COLLAB-001 through COLLAB-004: household membership and roles should be clear and manageable.

Actual result:

- The owner membership row displays `Member(You)` followed by `Owner / Member / Active`.
- This mixes "member" as a label and membership type/role, making the owner role unclear.

Expected result:

- The signed-in owner row should clearly identify the person/account and role, for example `You` with `Owner / Permanent member / Active`.

### BUG-014 - Dish and ingredient images are absent from reachable planning UI

Acceptable criteria:

- Global acceptance criteria 8: dish and ingredient images are accurate and displayed in the correct contexts.
- IMAGE-001: dish images display during onboarding.
- IMAGE-002: ingredient images display where ingredients are shown.
- IMAGE-003: dish image matches selected dish.
- IMAGE-005: meal package image is representative.

Actual result:

- Browser DOM image inspection found only the generic `/images/meal-hero.png` asset on `/`, `/today`, and `/onboarding`.
- `/plan`, `/grocery`, and `/household` rendered zero `<img>` elements.
- Meal recommendations such as `Boondi Raita`, weekly plan items, quick swaps, and grocery ingredients are shown as text-only UI with no dish or ingredient imagery.
- Because dish/ingredient images are absent, the UI cannot satisfy alt-text, broken-image fallback, or dish-image matching checks.

Expected result:

- Dish cards, meal recommendation cards, preferred-dish onboarding, weekly meal slots, and ingredient/grocery contexts should render the relevant `image_url` with meaningful `image_alt_text`.
- Missing or broken images should render a neutral fallback without implying the wrong food.
