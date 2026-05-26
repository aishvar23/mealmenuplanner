# End-to-End Functional and Acceptance Test Specification

## Purpose

This document defines exhaustive end-to-end functional and acceptance tests for the household meal planning app. It is intended for an implementation agent to repeatedly run, fix, and iterate until every scenario passes.

The tests should be automated with Playwright, Cypress, or an equivalent browser E2E framework. They should run against a clean seeded test database and must not require manual intervention.

---

## Test environment requirements

### Required seeded test users

| User                      | Purpose                            |
| ------------------------- | ---------------------------------- |
| `owner@example.com`       | Household owner                    |
| `member@example.com`      | Permanent household member         |
| `viewer@example.com`      | View-only member                   |
| `guest@example.com`       | Temporary guest                    |
| `admin@example.com`       | App admin/operator                 |
| `nohousehold@example.com` | Signed-in user without a household |

### Required authentication setup

The E2E suite must support both:

1. Email/password login using seeded test users.
2. Google Auth using a mocked OAuth provider, test OAuth provider, or test-only login callback that simulates a verified Google user.

Automated tests must not depend on manual Google login.

### Required seeded dish data

The seed data must include dishes with accurate metadata and images.

#### Main or meal components

| Dish            | Diet           | Meal role       | Image required |
| --------------- | -------------- | --------------- | -------------- |
| Masala Dosa     | vegetarian     | main_component  | yes            |
| Rajma           | vegetarian     | main_component  | yes            |
| Chole           | vegetarian     | main_component  | yes            |
| Dal Tadka       | vegetarian     | main_component  | yes            |
| Arhar Dal       | vegetarian     | main_component  | yes            |
| Moong Dal       | vegetarian     | main_component  | yes            |
| Mix Veg         | vegetarian     | main_component  | yes            |
| Sambhar         | vegetarian     | main_component  | yes            |
| Paratha         | vegetarian     | bread_component | yes            |
| Chapati         | vegetarian     | bread_component | yes            |
| Poori           | vegetarian     | bread_component | yes            |
| Luchhi          | vegetarian     | bread_component | yes            |
| Roti            | vegetarian     | bread_component | yes            |
| Jeera Rice      | vegetarian     | rice_component  | yes            |
| Idli            | vegetarian     | bread_component | yes            |
| Vegetable Pulao | vegetarian     | complete_meal   | yes            |
| Khichdi         | vegetarian     | complete_meal   | yes            |
| Paneer Bhurji   | vegetarian     | main_component  | yes            |
| Aloo Sabzi      | vegetarian     | main_component  | yes            |
| Egg Curry       | egg            | main_component  | yes            |
| Chicken Curry   | non_vegetarian | main_component  | yes            |

#### Side dishes, condiments, and accompaniments

| Dish            | Meal role     | Can be standalone main meal? |
| --------------- | ------------- | ---------------------------- |
| Coconut Chutney | side          | no                           |
| Mint Chutney    | side          | no                           |
| Mango Pickle    | condiment     | no                           |
| Papad           | side          | no                           |
| Raita           | side          | no                           |
| Green Salad     | side          | no                           |
| Jeera Aloo      | side_or_sabzi | no unless paired             |

#### Required meal packages

| Package                 | Components                                           |
| ----------------------- | ---------------------------------------------------- |
| Masala Dosa Meal        | Masala Dosa + Coconut Chutney                        |
| Rajma Rice Meal         | Rajma + Jeera Rice                                   |
| Chole Rice Meal         | Chole + Jeera Rice                                   |
| Dal Roti Meal           | Dal Tadka + Roti                                     |
| Paratha Jeera Aloo Meal | Paratha + Jeera Aloo                                 |
| Paneer Bhurji Roti Meal | Paneer Bhurji + Roti                                 |
| Khichdi Raita Meal      | Khichdi + Raita                                      |
| Arhar Dal Mix Veg Meal  | Arhar Dal + Mix Veg + Roti + Jeera Rice              |
| Chole Poori Rice Meal   | Chole + Poori + Jeera Rice                           |
| Rajma Roti Rice Meal    | Rajma + Roti + Jeera Rice                            |
| Sambhar Idli Meal       | Sambhar + Idli + Coconut Chutney                     |
| Sambhar Dosa Aloo Meal  | Sambhar + Masala Dosa + Aloo Sabzi + Coconut Chutney |

### Required meal-combination catalog data

The seed data must include an approved meal-combination catalog that can be
managed by an admin and used during onboarding and recommendation. Each catalog
row must include:

- stable combination id
- display name
- component dish ids grouped by role, such as dal/protein, dry veg/sabzi, bread,
  rice, chutney/dip, and other accompaniments
- `popularity_count`
- active/approved status
- admin-created source metadata, plus distinct metadata for combinations promoted
  from user-approved meals

The test seed must include at least the required meal packages above, with
different popularity counts so sorting can be verified.

### Required image metadata

Every dish and ingredient shown during onboarding or meal planning must have:

- `image_url`
- `image_alt_text`
- `image_status`
- `image_verified`

Accepted image statuses:

- `verified`
- `missing`
- `broken`
- `placeholder`

---

## Global acceptance criteria

The implementation is acceptable only if:

1. All tests run from a clean database seed.
2. No test requires manual login or manual database edits.
3. Authenticated pages redirect anonymous users to sign-in.
4. Users can only access households where they are active members.
5. Onboarding progress survives refresh, close/reopen, and sign-out/sign-in.
6. Preferences can be edited after onboarding.
7. Onboarding lets users choose between selecting existing meal combinations, building their own meal combinations, or letting the system decide.
8. Dish and meal-combination selection uses cards with images, component summaries, and controls; it must not rely on dropdown-only or plain-list-only selection for the main experience.
9. Meal-combination popularity is updated idempotently when a user selects or later approves a combination, and popularity influences both onboarding ordering and recommendations.
10. User-defined frequency preferences, such as daily meal, once a week, and once in a while, persist and influence recommendations.
11. Dish and ingredient images are accurate and displayed in the correct contexts.
12. Side dishes, chutneys, dips, pickles, papad, and accompaniments are never recommended alone as main meals.
13. A recommended meal is a wholesome South Asian package, such as `Arhar Dal + Mix Veg + Roti + Rice`, `Chole + Poori + Rice`, `Rajma + Rice + Roti`, `Sambhar + Idli + Chutney`, or `Sambhar + Dosa + Aloo + Chutney`, not an incomplete component.
14. Collaboration, invites, permissions, guest expiry, member removal, and notifications work correctly.
15. All permission checks are enforced server-side, not only by hidden UI buttons.
16. Browser acceptance must pass the UI bug checks recorded in `test/ui_testing_bugs_2026-05-25.md`: no excessive empty card space on primary meal cards, no above-the-fold image LCP warning for placeholders, and no clipped onboarding side-panel copy in the first desktop viewport.

---

# 1. Authentication tests

## AUTH-001: User can sign in with email and password

### Preconditions

- `owner@example.com` exists.
- Password is known in test seed.

### Steps

1. Open the app.
2. Click **Sign in**.
3. Select email/password login.
4. Enter `owner@example.com`.
5. Enter valid password.
6. Submit.

### Expected result

- User is signed in.
- User is redirected to dashboard or onboarding depending on profile state.
- Session survives page refresh.
- Profile button is visible in the top-right corner.

## AUTH-002: Invalid email/password login fails safely

### Steps

1. Open sign-in page.
2. Enter `owner@example.com`.
3. Enter an invalid password.
4. Submit.

### Expected result

- User is not signed in.
- Error is shown.
- Error does not reveal whether the email exists.
- User remains on sign-in page.

## AUTH-003: User can sign out

### Preconditions

- User is signed in.

### Steps

1. Click profile button.
2. Click **Sign out**.

### Expected result

- User is signed out.
- User is redirected to public landing or sign-in page.
- Private routes are no longer accessible.

## AUTH-004: Anonymous user is redirected from private pages

### Steps

1. Sign out.
2. Navigate directly to `/dashboard`.
3. Navigate directly to `/meal-plan`.
4. Navigate directly to `/household/members`.

### Expected result

- User is redirected to sign-in.
- No private data is rendered before redirect.

## AUTH-005: User can sign in with Google Auth test flow

### Preconditions

- Mock Google Auth or test OAuth provider is configured.

### Steps

1. Open sign-in page.
2. Click **Continue with Google**.
3. Complete mocked/test OAuth flow.

### Expected result

- User is signed in.
- User record is created or loaded.
- User lands on dashboard or onboarding.
- Profile button appears.

## AUTH-006: Cancelled Google Auth is handled gracefully

### Steps

1. Start Google Auth.
2. Cancel provider flow.

### Expected result

- User remains signed out.
- App shows retry-friendly message.
- No broken loading state remains.

## AUTH-007: Google and email login with same email do not duplicate household access incorrectly

### Preconditions

- `owner@example.com` exists as email/password user.
- Google test identity has same email.

### Steps

1. Sign in with email/password.
2. Sign out.
3. Sign in with Google test flow using same email.

### Expected result

- User lands in expected account context.
- Existing household memberships are not duplicated.
- Existing household data remains accessible.

---

# 2. Profile button and account navigation tests

## PROFILE-001: Signed-in user sees clickable profile button

### Preconditions

- User is signed in.

### Steps

1. Open dashboard.
2. Locate top-right profile button.
3. Click it.

### Expected result

- Button is visible.
- Button is clickable.
- Account menu opens.
- Menu shows user identity and sign-out option.

## PROFILE-002: Profile button works on mobile

### Steps

1. Set viewport to mobile size.
2. Sign in.
3. Tap profile button.

### Expected result

- Profile menu opens.
- Menu fits screen.
- Items are tappable.

## PROFILE-003: User can reach preferences from profile menu

### Preconditions

- User completed onboarding.

### Steps

1. Click profile button.
2. Click **Preferences** or **Household preferences**.

### Expected result

- Preferences page opens.
- Existing values are prefilled.
- User can edit and save.

---

# 3. Onboarding tests

## ONBOARD-001: New signed-in user is prompted to create or join household

### Preconditions

- `nohousehold@example.com` has no household.

### Steps

1. Sign in as `nohousehold@example.com`.

### Expected result

- App shows create/join household experience.
- App does not show broken empty dashboard.

## ONBOARD-002: User can complete minimum onboarding

### Steps

1. Start onboarding.
2. Enter household name.
3. Enter family size.
4. Select diet type.
5. Select meals to plan.
6. Select cooking time.
7. Select cuisine preference.
8. Complete onboarding.

### Expected result

- Household is created.
- User becomes owner.
- Preferences are saved.
- Dashboard opens.
- First meal suggestion can be generated.

## ONBOARD-003: Onboarding autosaves after each step

### Steps

1. Start onboarding.
2. Complete household basics.
3. Continue to next step.
4. Refresh page.

### Expected result

- Household basics are still populated.
- Current step is restored.
- Completion percentage is preserved.

## ONBOARD-004: User can resume onboarding after closing app

### Steps

1. Complete first two onboarding sections.
2. Close browser or sign out.
3. Sign back in.

### Expected result

- App detects incomplete draft.
- App shows **Continue setup**.
- User resumes from last saved step.
- Previous values are prefilled.

## ONBOARD-005: User can go back and edit onboarding answers

### Steps

1. Complete household basics.
2. Complete food preferences.
3. Go back to household basics.
4. Change family size.
5. Continue.

### Expected result

- New family size is saved.
- No duplicate draft is created.
- Later grocery quantities use updated family size.

## ONBOARD-006: Optional onboarding sections can be skipped

### Steps

1. Complete required fields.
2. Reach allergies/health section.
3. Click **Skip for now**.
4. Finish onboarding.

### Expected result

- Onboarding completes.
- Optional values are empty/default.
- User can edit them later.

## ONBOARD-007: Required onboarding validation works

### Steps

1. Leave family size empty.
2. Try to continue.
3. Leave diet type empty.
4. Try to continue.

### Expected result

- Clear field-specific validation errors appear.
- User cannot complete onboarding with missing required fields.

## ONBOARD-008: User can edit preferences after onboarding

### Preconditions

- Onboarding is completed.

### Steps

1. Open profile menu.
2. Open preferences.
3. Change diet or cuisine preference.
4. Save.
5. Generate new recommendation.

### Expected result

- Updated preferences persist.
- New recommendation respects updated values.

## ONBOARD-009: Preference update does not remove household members

### Preconditions

- Household has owner and member.

### Steps

1. Owner edits cooking time preference.
2. Save.

### Expected result

- Members remain active.
- Member permissions remain unchanged.
- Shared view remains accessible.

## ONBOARD-010: Save failure is visible and recoverable

### Preconditions

- Test can simulate save API failure.

### Steps

1. Start onboarding.
2. Enter data.
3. Simulate autosave failure.
4. Restore API.
5. Retry save.

### Expected result

- App shows save failure state.
- User-entered data remains in form.
- Retry succeeds.
- No data loss occurs.

---

# 4. Meal-combination onboarding tests

These tests supersede the older preferred-dish picker acceptance. The feature is
for South Asian household meal planning, where a normal meal is usually a
combination of protein/dal or legumes, dry veg/sabzi, bread, rice, and optional
chutney/dip/accompaniments.

## MEALPREF-001: User sees all three meal preference modes

### Steps

1. Reach the meal preference step during onboarding.

### Expected result

- User sees three clear options:
  - **Select your meal combinations**
  - **Build your own meal combination**
  - **Let the system decide**
- The options are presented as cards or segmented card controls, not as a plain
  text list or dropdown.
- Selecting a mode updates the draft and survives refresh.

## MEALPREF-002: Existing meal combinations are exhaustive, card-based, and popularity sorted

### Steps

1. Select **Select your meal combinations**.
2. Browse without searching.
3. Search for `dal`, `chole`, `rajma`, and `sambhar`.
4. Select:
   - `Arhar Dal + Mix Veg + Roti + Jeera Rice`
   - `Chole + Poori + Jeera Rice`
   - `Sambhar + Idli + Coconut Chutney`
5. Continue onboarding.

### Expected result

- All active approved seeded meal combinations are available.
- Cards show combination name, component dishes grouped by role, accurate images
  or safe placeholders, dietary tags, and a selectable state.
- Default ordering is by `popularity_count` descending, with deterministic
  tie-breaking.
- Search/filter does not hide valid matches due to casing, punctuation, or
  component order.
- Selected combinations persist through autosave, refresh, sign-out/sign-in, and
  onboarding completion.
- Popularity increases exactly once per saved user selection and does not
  double-increment on refresh, autosave retry, or repeated Save clicks.

## MEALPREF-003: User can build their own meal combination from dish cards

### Steps

1. Select **Build your own meal combination**.
2. Verify the main dish catalog is shown as cards.
3. Select `Arhar Dal` and tag it **include in daily meal**.
4. Select `Mix Veg` and tag it **include in once in a week**.
5. In **Goes with**, select `Chapati`/`Roti` and `Jeera Rice` from popular
   options.
6. Use typeahead to add an accompaniment that is not in the visible popular
   options, such as `Luchhi` or `Mint Chutney`.
7. Save and continue.

### Expected result

- The build screen uses dish cards for main/base dishes, not a dropdown-only UI.
- Main/base cards are sorted by popularity and exclude snacks, breads, dips,
  chutneys, pickles, papad, and pure accompaniments from the primary card grid.
- Each chosen main/base card supports exactly these frequency choices:
  - **include in daily meal**
  - **include in once in a week**
  - **include in once in a while**
- **Goes with** supports multi-select popular options, including chapati/roti,
  poori, paratha, luchhi, rice, idli, dosa, dip, and chutney.
- **Goes with** also supports searching/selecting from the exhaustive dish
  catalog.
- Saved build-your-own preferences persist and influence recommendations.

## MEALPREF-004: User-built combinations are promoted only after meal approval

### Steps

1. Complete onboarding with a build-your-own preference such as `Arhar Dal +
Mix Veg + Roti + Jeera Rice`.
2. Generate today's meal or the weekly plan.
3. Approve a recommendation that matches the user-built combination.
4. Inspect the approved meal-combination catalog.

### Expected result

- Onboarding save stores the user's preference template but does not immediately
  create a new globally approved combination.
- Only after the user approves the actual suggested meal does the combination
  get promoted into the approved meal-combination table or increment an existing
  matching row.
- Admin-created combinations and user-approved promoted combinations are
  distinguishable by source metadata.
- The admin UI remains the manual admin creation/editing surface for approved
  combinations.

## MEALPREF-005: Let the system decide uses popularity, frequency, and preferences

### Steps

1. Select vegetarian diet, North Indian and South Indian cuisines, medium spice,
   and dinner as the planned meal slot.
2. Select **Let the system decide**.
3. Complete onboarding.
4. Generate a week plan.

### Expected result

- The user is not forced to select any dishes or combinations manually.
- Recommendations consider:
  - approved meal-combination popularity
  - selected diet/cuisines/spice/cooking-time preferences
  - allergies and disliked ingredients
  - preferred frequency data when available from prior user choices
  - variety gap and leftovers settings
- A `dal + dry veg + roti/rice` pattern may repeat three or four times in a
  week only if the exact dal/protein and dry veg are varied enough to satisfy
  the variety rules.
- The same exact combination is not repeated inside the variety gap unless the
  household explicitly allows that behavior.

## MEALPREF-006: Recommended meals are complete South Asian combinations

### Steps

1. Generate today's meal and a weekly plan for a vegetarian South Asian
   household.
2. Inspect every recommended meal card and quick swap.

### Expected result

- Standalone accompaniments are never suggested as a full meal.
- Dry veg/sabzi is not suggested alone as a complete meal unless paired.
- Valid recommendations include complete combinations such as:
  - `Arhar Dal + Mix Veg + Roti + Rice`
  - `Chole + Poori + Rice`
  - `Rajma + Rice + Roti`
  - `Sambhar + Idli + Chutney`
  - `Sambhar + Dosa + Aloo + Chutney`
- Recommendation reason text explains the combination, not only one component.

## MEALPREF-007: Meal preferences can be edited after onboarding

### Steps

1. Complete onboarding with **Select your meal combinations**.
2. Open preferences after onboarding.
3. Change to **Build your own meal combination**.
4. Add one frequency tag and one **Goes with** accompaniment.
5. Save.
6. Reopen preferences.

### Expected result

- The selected mode, selected combinations, custom build choices, frequency tags,
  and **Goes with** choices round-trip correctly.
- Recommendations use the updated preferences after save.

## MEALPREF-008: Admin can add and manage approved meal combinations

### Steps

1. Sign in as `admin@example.com`.
2. Add a new approved meal combination with at least one main/protein component
   and one accompaniment.
3. Set a known `popularity_count`.
4. Sign in as a household user and open onboarding.

### Expected result

- The admin-created combination appears in **Select your meal combinations**.
- The combination is sorted according to popularity.
- Inactive or unapproved combinations are hidden from household users.
- Household users cannot access admin-only combination creation or edit actions.

## MEALPREF-009: Meal preference UI passes visual QA from the 2026-05-25 bug log

### Steps

1. Open onboarding meal preference step at desktop `1280x720`.
2. Open the same step at mobile `390x844`.
3. Open `/today` after completing onboarding with selected combinations.
4. Inspect console warnings and screenshots.

### Expected result

- Onboarding copy in the desktop side panel is visible in the first viewport and
  is not clipped at the bottom.
- Meal preference cards and `/today` meal cards do not have large empty vertical
  gaps before controls.
- Above-the-fold dish or placeholder images do not emit the Next.js LCP warning
  recorded in `BUG-UI-002`.
- Cards remain readable and tappable on mobile without horizontal overflow.

---

# 5. Food and ingredient image tests

## IMAGE-001: Dish images display during onboarding

### Steps

1. Open the onboarding meal preference step.
2. Select **Select your meal combinations**.
3. Search for Masala Dosa.
4. Select **Build your own meal combination**.
5. Search for Rajma.

### Expected result

- Meal-combination cards and build-your-own dish cards display images.
- Images are not broken.
- Alt text describes the dish or combination.
- Verified images are not replaced by unrelated placeholders.

## IMAGE-002: Ingredient images display where ingredients are shown

### Steps

1. Open any onboarding or grocery preference step with ingredient cards.
2. View tomato, rice, paneer, onion.

### Expected result

- Each ingredient has correct image.
- Image alt text is meaningful.
- Broken image does not break layout.

## IMAGE-003: Dish image matches selected dish

### Steps

1. Search Masala Dosa.
2. Search Rajma.
3. Search Chole.

### Expected result

- Masala Dosa does not show Rajma image.
- Rajma does not show Chole image.
- Chole does not show Masala Dosa image.

## IMAGE-004: Broken image fallback is safe

### Preconditions

- Test dish has `image_status = broken`.

### Steps

1. Open dish card.

### Expected result

- Neutral placeholder is displayed.
- Placeholder does not imply wrong food.
- Layout remains stable.

## IMAGE-005: Meal package image is representative

### Preconditions

- Masala Dosa Meal exists.

### Steps

1. Generate recommendation for Masala Dosa Meal.

### Expected result

- Card shows main dish or package image.
- Chutney image alone is not used as primary representation unless configured as package image.

## IMAGE-006: Admin image metadata updates user UI

### Steps

1. Sign in as admin.
2. Open dish editor.
3. Update image URL and alt text.
4. Save.
5. Open user-facing dish card.

### Expected result

- New image and alt text are visible.

## IMAGE-007: Above-the-fold placeholder images do not trigger LCP warnings

### Steps

1. Seed a currently recommended dish with `image_status = missing` so it uses the
   placeholder dish image.
2. Open `/today`.
3. Open `/plan`.
4. Inspect browser console warnings.

### Expected result

- Placeholder image renders safely.
- No Next.js warning appears for an above-the-fold placeholder image missing
  eager/priority loading.
- Layout remains stable while the placeholder loads.

---

# 6. Meal completeness and side-dish tests

## MEALCOMP-001: Chutney, dip, pickle, papad, and side dish are never standalone main meals

### Steps

1. Complete vegetarian onboarding.
2. Generate breakfast, lunch, and dinner recommendations multiple times.

### Expected result

- Coconut Chutney is never recommended alone.
- Mint Chutney is never recommended alone.
- Mango Pickle is never recommended alone.
- Papad is never recommended alone.
- Raita is never recommended alone.
- Green Salad is never recommended alone as main meal.

## MEALCOMP-002: Masala Dosa is recommended with chutney

### Steps

1. Generate breakfast recommendation.
2. Select or force Masala Dosa if available.

### Expected result

- Meal is displayed as `Masala Dosa + Coconut Chutney` or equivalent.
- Chutney is accompaniment, not main meal.

## MEALCOMP-003: Jeera Aloo is not a complete meal by itself

### Steps

1. Generate lunch or dinner recommendation.

### Expected result

- App does not recommend only Jeera Aloo.
- If Jeera Aloo appears, it is paired with Paratha, Roti, or another valid main/base.

## MEALCOMP-004: Rajma is paired with rice or base

### Steps

1. Generate lunch recommendation.
2. Select or force Rajma if needed.

### Expected result

- Recommendation is Rajma Rice or Rajma + Jeera Rice.
- Plain Rajma alone is not treated as complete meal.

## MEALCOMP-005: Dal is paired with roti or rice

### Steps

1. Generate dinner recommendation.
2. Select Dal Tadka.

### Expected result

- App recommends Dal Tadka + Roti or Dal Tadka + Rice.
- Dal alone is not shown as complete dinner.

## MEALCOMP-006: Complete meals may stand alone

### Steps

1. Generate dinner recommendations.

### Expected result

- Khichdi may be recommended as complete meal.
- Vegetable Pulao may be recommended as complete meal.
- Optional side like raita may be added but is not required.

## MEALCOMP-007: Explore mode can show sides, meal-decision mode cannot

### Steps

1. Select **Explore dishes** mode.
2. Search for chutney.
3. Select **What should we eat today?** mode.
4. Generate dinner.

### Expected result

- Explore mode may show chutney as a searchable dish.
- Meal-decision mode never recommends chutney alone.

## MEALCOMP-008: Meal package grocery list combines all components

### Steps

1. Add Rajma Rice Meal to weekly plan.
2. Generate grocery list.

### Expected result

- Grocery list includes Rajma ingredients.
- Grocery list includes rice ingredients.
- Quantities are scaled by household size.

## MEALCOMP-009: Side dish can be optional accompaniment

### Steps

1. Generate Khichdi recommendation.

### Expected result

- App may show Raita as optional side.
- Raita is clearly labeled side/accompaniment.

## MEALCOMP-010: Admin cannot accidentally activate side as complete meal without validation

### Steps

1. Sign in as admin.
2. Open Coconut Chutney.
3. Try to mark it as `complete_meal` and active.

### Expected result

- App blocks save or shows explicit validation warning.
- Recommendation engine still does not recommend it alone unless it has valid complete meal metadata.

---

# 7. Recommendation and preference tests

## RECO-001: Vegetarian household does not receive meat recommendation

### Steps

1. Set household diet to vegetarian.
2. Generate dinner.

### Expected result

- Chicken Curry is not recommended.
- Egg Curry is not recommended unless eggs are allowed.

## RECO-002: Egg-allowed household may receive egg dishes

### Steps

1. Set preference to egg allowed.
2. Generate dinner.

### Expected result

- Egg Curry may be recommended.
- Meat dishes remain excluded unless non-veg is enabled.

## RECO-003: Cooking time is respected

### Steps

1. Set weekday cooking time to 30 minutes.
2. Generate weekday dinner.

### Expected result

- Recommended meal fits time or clearly explains exception.
- Long meals are filtered or heavily penalized.

## RECO-004: Recently cooked dish is not repeated within variety gap

### Preconditions

- Variety gap is 7 days.
- Rajma Rice was cooked yesterday.

### Steps

1. Generate lunch.

### Expected result

- Rajma Rice is not recommended unless no alternatives exist and app explains why.

## RECO-005: Rejected dish is penalized

### Preconditions

- User rejected Chole Rice.

### Steps

1. Generate next meal.

### Expected result

- Chole Rice is not immediately recommended again.

## RECO-006: Eating-out status does not count as cooked

### Steps

1. Mark recommended Rajma Rice as eating out.
2. Generate future plan.

### Expected result

- Rajma Rice is not counted as cooked.
- It can appear later according to normal rotation rules.

## RECO-007: Allergy is a hard filter

### Steps

1. Set peanut allergy.
2. Generate recommendations.

### Expected result

- Peanut-containing dishes are excluded.
- Allergy is not merely a lower ranking.

## RECO-008: Preferred combinations do not override hard filters

### Preconditions

- Chicken Curry is part of a selected or popular preferred combination.

### Steps

1. Change household to vegetarian.
2. Generate recommendation.

### Expected result

- Chicken Curry is not recommended.

## RECO-009: Prep-required dish is not suggested when prep is impossible

### Preconditions

- Chole requires 8-hour soaking.
- Current time is 6 PM.
- Dinner is 7 PM.
- Chickpeas are not soaked.

### Steps

1. Generate dinner.

### Expected result

- Chole Rice is not recommended for tonight.
- App may recommend it for tomorrow and create prep reminder.

## RECO-010: Future prep-required dish creates prep reminder

### Steps

1. Generate tomorrow lunch.
2. App selects Rajma Rice.

### Expected result

- Prep task says to soak Rajma.
- Due time is before required cooking time.

## RECO-011: Popular meal combinations rank higher when otherwise valid

### Preconditions

- `Arhar Dal + Mix Veg + Roti + Jeera Rice` has a higher popularity count than
  `Moong Dal + Mix Veg + Roti + Jeera Rice`.
- Both combinations match diet, cuisine, time, allergy, and variety rules.

### Steps

1. Select **Let the system decide** during onboarding.
2. Generate dinner.

### Expected result

- The higher-popularity valid combination is ranked first or appears before the
  lower-popularity equivalent in quick swaps.
- The reason text can mention popularity or household fit without hiding hard
  filter decisions.

## RECO-012: Frequency preferences affect weekly distribution

### Preconditions

- User tagged `Arhar Dal` as **include in daily meal**.
- User tagged `Chole` as **include in once in a week**.
- User tagged `Sambhar` as **include in once in a while**.

### Steps

1. Generate a weekly dinner plan.

### Expected result

- Daily-tagged items can appear more often only through varied complete
  combinations.
- Once-a-week items appear no more than once in the generated week unless the
  user manually overrides.
- Once-in-a-while items are strongly de-prioritized but still available as valid
  occasional recommendations.

---

# 8. Weekly plan tests

## PLAN-001: User can generate weekly meal plan

### Steps

1. Open weekly planner.
2. Click **Generate week**.

### Expected result

- Plan is generated.
- Selected meal slots contain complete meal packages.
- Side dishes do not appear alone.

## PLAN-002: User can replace planned meal

### Steps

1. Open planned dinner.
2. Click replace.
3. Select alternative.
4. Confirm.

### Expected result

- Meal is replaced.
- Activity event is created.
- Grocery list can be regenerated.
- Members are notified.

## PLAN-003: User can lock meal

### Steps

1. Lock Monday dinner.
2. Regenerate week.

### Expected result

- Monday dinner remains unchanged.
- Other unlocked meals may change.

## PLAN-004: User can unlock meal

### Steps

1. Unlock locked meal.
2. Regenerate week.

### Expected result

- Meal can now change.

## PLAN-005: Mark eating out updates plan and grocery list

### Steps

1. Mark Wednesday dinner as eating out.
2. Regenerate grocery list.

### Expected result

- Wednesday dinner status is eating_out.
- Ingredients for that meal are removed or reduced.

---

# 9. Grocery list tests

## GROCERY-001: Weekly plan generates grocery list

### Steps

1. Generate weekly plan.
2. Click **Generate grocery list**.

### Expected result

- Grocery list is created.
- Items are grouped by category.
- Quantities scale by family size.

## GROCERY-002: Duplicate ingredients are merged

### Preconditions

- Multiple meals use onion and tomato.

### Steps

1. Generate grocery list.

### Expected result

- Onion appears once with summed quantity.
- Tomato appears once with summed quantity.

## GROCERY-003: User can check off item

### Steps

1. Open grocery list.
2. Check tomato.
3. Refresh.

### Expected result

- Tomato remains checked.

## GROCERY-004: Meal replacement updates grocery list

### Steps

1. Replace Rajma Rice with Paneer Bhurji Roti.
2. Regenerate grocery list.

### Expected result

- Rajma-specific ingredients are removed or reduced.
- Paneer-specific ingredients are added.

---

# 10. Household collaboration tests

## COLLAB-001: Owner can invite permanent member

### Steps

1. Sign in as owner.
2. Open household members.
3. Invite `member@example.com`.
4. Select permanent member.
5. Assign permissions.
6. Send invite.

### Expected result

- Invite is created with pending status.
- Owner sees pending invite.
- Invitee can open invite link.

## COLLAB-002: Invitee can accept invite

### Steps

1. Sign in as `member@example.com`.
2. Open invite link.
3. Accept invite.

### Expected result

- Invite status becomes accepted.
- Member status becomes active.
- Member sees shared household dashboard.
- Owner receives notification.

## COLLAB-003: Invitee can decline invite

### Steps

1. Sign in as invitee.
2. Open invite link.
3. Decline.

### Expected result

- Invite status becomes declined.
- No membership is created.
- Invitee cannot access household.

## COLLAB-004: Owner and member see same household plan

### Steps

1. Owner opens weekly plan in one browser context.
2. Member opens weekly plan in another browser context.

### Expected result

- Both see same household name.
- Both see same meal plan and statuses.

## COLLAB-005: Member with permission can change today's menu

### Preconditions

- Member has `can_change_today_menu = true`.

### Steps

1. Member opens Today screen.
2. Replaces dinner.
3. Owner refreshes dashboard.

### Expected result

- Dinner changed for household.
- Activity event records member as actor.
- Owner receives notification.

## COLLAB-006: Member without permission cannot change today's menu

### Preconditions

- Viewer has `can_change_today_menu = false`.

### Steps

1. Viewer opens Today screen.
2. Attempt to change dinner.
3. Attempt direct API call if possible.

### Expected result

- UI hides or disables action.
- Backend rejects unauthorized write.
- Meal remains unchanged.

## COLLAB-007: Member with weekly permission can change schedule

### Preconditions

- Member has `can_change_weekly_schedule = true`.

### Steps

1. Member opens weekly plan.
2. Replaces Friday dinner.

### Expected result

- Friday dinner changes.
- Other members are notified.

## COLLAB-008: Member without weekly permission cannot change schedule

### Preconditions

- Viewer has `can_change_weekly_schedule = false`.

### Steps

1. Viewer attempts to replace Friday dinner.

### Expected result

- UI blocks action.
- Backend rejects direct mutation.
- Plan remains unchanged.

## COLLAB-009: Owner can remove member

### Steps

1. Owner opens member management.
2. Removes member.

### Expected result

- Member status becomes removed.
- Removed member loses access.
- Activity event is created.

## COLLAB-010: Member can leave household

### Steps

1. Member opens household settings.
2. Clicks leave household.
3. Confirms.

### Expected result

- Member status becomes left.
- Member loses access.
- Owner receives notification.

## COLLAB-011: Owner cannot leave without transferring ownership

### Steps

1. Owner opens household settings.
2. Attempts to leave.

### Expected result

- App blocks leaving.
- App asks owner to transfer ownership first.

## COLLAB-012: Owner can transfer ownership

### Steps

1. Owner selects active member.
2. Transfers ownership.

### Expected result

- Selected member becomes owner.
- Previous owner role changes appropriately.
- Activity event is created.

## COLLAB-013: Owner can invite temporary guest with expiry

### Steps

1. Owner invites `guest@example.com`.
2. Selects temporary guest.
3. Sets duration to 4 days.
4. Sends invite.

### Expected result

- Invite has `membership_type = temporary_guest`.
- Invite has correct `expires_at`.
- Permissions are saved.

## COLLAB-014: Temporary guest can accept invite and view plan

### Steps

1. Guest signs in.
2. Guest opens invite.
3. Guest accepts.
4. Guest opens household dashboard.

### Expected result

- Guest status becomes active.
- Guest sees shared meal plan.
- Guest permissions match invite.
- Expiry date is visible.

## COLLAB-015: Temporary guest loses access after expiry

### Steps

1. Advance test clock beyond guest expiry or set expiry in past.
2. Run expiry job or access household.
3. Guest opens dashboard.

### Expected result

- Guest status becomes expired.
- Guest cannot access household data.
- Clear expired-access message is shown.

## COLLAB-016: Expired guest cannot access direct household URL

### Expected result

- Direct URL access is denied.
- No household data is exposed.

## COLLAB-017: Removed member cannot access direct household URL

### Expected result

- Direct URL access is denied.
- API returns forbidden.

## COLLAB-018: Member without invite permission cannot invite others

### Preconditions

- Member has `can_invite_members = false`.

### Steps

1. Member opens household members.
2. Attempts invite through UI and direct API.

### Expected result

- Invite UI is hidden/disabled.
- Backend rejects request.
- No invite is created.

## COLLAB-019: Member with invite permission can invite others

### Preconditions

- Admin/member has `can_invite_members = true`.

### Steps

1. Member invites `viewer@example.com`.

### Expected result

- Invite is created.
- Activity event records inviting member as actor.

## COLLAB-020: View-only user cannot mutate grocery list

### Preconditions

- Viewer has `can_manage_grocery_list = false`.

### Steps

1. Viewer opens grocery list.
2. Attempts to check or edit item.
3. Attempts direct API mutation.

### Expected result

- UI blocks mutation.
- Backend rejects mutation.
- Grocery list remains unchanged.

---

# 11. Collaboration notification tests

## NOTIF-001: Menu change notifies other members

### Steps

1. Member changes today's dinner.
2. Owner opens notifications.

### Expected result

- Owner receives notification.
- Notification includes actor and changed meal.
- Actor does not receive duplicate notification for own action.

## NOTIF-002: Weekly plan change notifies members

### Steps

1. Member changes Friday dinner.
2. Owner opens notifications.

### Expected result

- Notification references changed date and meal slot.

## NOTIF-003: Invite accepted notifies owner

### Steps

1. Invitee accepts invite.
2. Owner opens notifications.

### Expected result

- Owner sees invite accepted notification.

## NOTIF-004: Member leaving notifies owner

### Steps

1. Member leaves household.
2. Owner opens notifications.

### Expected result

- Owner sees member-left notification.

## NOTIF-005: Removed member does not receive future notifications

### Steps

1. Owner removes member.
2. Owner changes meal plan.
3. Removed member signs in and opens notifications.

### Expected result

- Removed member receives no new household notifications.
- Removed member cannot access household notification data.

## NOTIF-006: Notification can be marked read

### Steps

1. Open unread notification.
2. Mark as read.
3. Refresh.

### Expected result

- `read_at` is set.
- Unread count decreases and persists.

---

# 12. Admin/operator metadata tests

## ADMIN-001: Admin can add dish with image metadata

### Steps

1. Sign in as admin.
2. Add dish.
3. Enter name, cuisine, meal role, diet type, image URL, alt text.
4. Save.

### Expected result

- Dish is created.
- Image metadata is saved.
- Dish appears in admin list.

## ADMIN-002: Admin can mark dish as side

### Steps

1. Create Coconut Chutney.
2. Set meal role to side.
3. Activate.

### Expected result

- Dish can be used as pairing.
- Dish cannot be standalone main recommendation.

## ADMIN-003: Admin can create dish pairing

### Steps

1. Open Masala Dosa.
2. Add Coconut Chutney as pairing.
3. Save.

### Expected result

- Pairing is saved.
- Recommendation can show Masala Dosa + Coconut Chutney.

## ADMIN-004: Admin can add prep task

### Steps

1. Open Rajma.
2. Add prep task `Soak rajma`.
3. Set required_before_minutes to 480.
4. Save.

### Expected result

- Prep task is saved.
- Future Rajma plan creates prep reminder.

## ADMIN-005: Admin cannot activate dish missing required metadata

### Steps

1. Create dish with name only.
2. Try to activate.

### Expected result

- Activation is blocked or validation errors are shown.
- Dish is not used in recommendations.

---

# 13. Security and authorization tests

## SECURITY-001: Non-member cannot access household

### Steps

1. Sign in as unrelated user.
2. Navigate to household URL.

### Expected result

- Access denied.
- No household data is displayed.
- API returns forbidden.

## SECURITY-002: Backend enforces permission checks

### Preconditions

- Viewer lacks edit permissions.

### Steps

1. Viewer makes direct API request to replace meal.

### Expected result

- API rejects request.
- Meal remains unchanged.

## SECURITY-003: Expired invite cannot be accepted

### Steps

1. Open expired invite.
2. Attempt accept.

### Expected result

- Invite cannot be accepted.
- No membership is created.

## SECURITY-004: Cancelled invite cannot be accepted

### Expected result

- Invite cannot be accepted.
- No membership is created.

## SECURITY-005: Invite token does not expose sensitive data before auth

### Steps

1. Open invite link while signed out.

### Expected result

- Only limited preview or sign-in prompt is shown.
- Meal plan and preferences are not exposed before authentication.

---

# 14. Mobile responsive tests

## MOBILE-001: Onboarding works on mobile

### Steps

1. Set mobile viewport.
2. Complete onboarding.

### Expected result

- No horizontal overflow.
- All fields and buttons are usable.
- Autosave works.

## MOBILE-002: Weekly planner works on mobile

### Steps

1. Set mobile viewport.
2. Open weekly planner.

### Expected result

- Days and meal slots are readable.
- User can open meal details.
- User can replace meal if permitted.

## MOBILE-003: Invite acceptance works on mobile

### Steps

1. Set mobile viewport.
2. Open invite link.
3. Accept invite.

### Expected result

- Flow is usable.
- Accept button is visible and tappable.
- User lands in household dashboard.

---

# 15. Accessibility tests

## A11Y-001: Main navigation is keyboard accessible

### Steps

1. Use Tab key through dashboard.
2. Open profile menu with keyboard.

### Expected result

- Focus indicators are visible.
- Menu can be opened and used with keyboard.

## A11Y-002: Dish cards have accessible names

### Steps

1. Inspect dish cards with accessibility tooling.

### Expected result

- Each card has accessible name.
- Images have meaningful alt text.
- Buttons have labels.

## A11Y-003: Form errors are accessible

### Steps

1. Submit invalid onboarding form.

### Expected result

- Errors are associated with fields.
- Screen reader can announce errors.
- Focus moves to first invalid field or error summary.

---

# 16. Final regression checklist

Before release, run these checks:

## Authentication

- Email/password login works.
- Google test login works.
- Logout works.
- Anonymous users cannot access private pages.

## Onboarding

- Draft saves.
- Draft resumes.
- Required validation works.
- Preferences can be edited after onboarding.
- User can select existing meal combinations, build their own combination, or let
  the system decide.
- Meal-combination cards are exhaustive, searchable, image-backed, and sorted by
  popularity.
- Build-your-own meal preferences persist frequency tags and **Goes with**
  accompaniments.

## Images

- Dish images display accurately.
- Ingredient images display accurately.
- Broken images have safe fallback.
- Images match metadata.
- Above-the-fold placeholders do not emit LCP warnings.

## Meal planning

- Today meal generates.
- Weekly plan generates.
- Side dishes are not standalone meals.
- Meal packages are wholesome South Asian combinations.
- Meal-combination popularity and user frequency preferences influence
  recommendations.
- Prep tasks are generated.
- Grocery list is accurate.

## Visual QA

- `/today` meal cards do not reserve excessive empty space before controls.
- Onboarding side-panel copy is visible in the first desktop viewport.
- Mobile onboarding, meal-combination cards, today, plan, grocery, and household
  views have no horizontal overflow.
- Browser console has no relevant app errors or unexpected warnings.

## Collaboration

- Owner can invite members.
- Invitee can accept/decline.
- Members see same plan.
- Permissions are enforced.
- Temporary guest expires.
- Removed member loses access.
- Notifications are created.

## Security

- Non-members cannot access household.
- Backend enforces permissions.
- Expired/cancelled invites fail.
- Direct URL access is protected.

---

# Definition of done for the implementation agent

The implementation is not complete until:

1. All E2E tests pass locally.
2. All E2E tests pass in CI.
3. Tests run from clean seeded data.
4. No test requires manual Google login.
5. All permission checks are enforced server-side.
6. Onboarding draft survives refresh and sign-out/sign-in.
7. Preferences are editable after onboarding.
8. Meal-combination onboarding supports selecting existing combinations,
   building custom combinations, and letting the system decide.
9. Meal-combination popularity and user frequency preferences influence
   recommendations.
10. Dish and ingredient images are accurate.
11. Above-the-fold placeholders do not emit LCP warnings.
12. Side dishes are never standalone main recommendations.
13. Meal package logic is implemented for complete South Asian combinations.
14. Visual QA bugs in `test/ui_testing_bugs_2026-05-25.md` are resolved.
15. Collaboration notifications are generated.
16. Temporary guest expiry is enforced.
17. Removed users cannot access household data.
18. The profile button is visible and clickable for every signed-in user.
