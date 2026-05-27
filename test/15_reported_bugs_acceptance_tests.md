# Reported-Bug Acceptance & Functional Tests (BUG-015 … BUG-026)

## Purpose

Exhaustive acceptance and functional tests for the 12 user-reported bugs logged in
`test/ui_testing_bugs_2026-05-26.md`. Each criterion is written so an
implementation agent (or a human QA pass) can run it, see pass/fail, and iterate
until green. This document is the source of the "closes" lists in
`test/BUG-015-026_IMPLEMENTATION_TRACKER.md`.

Scope is the reported bugs only; it complements (does not replace) the broader
suite in `test/14_end_to_end_acceptance_tests.md`.

## How to read a criterion

Each has a stable id, a **Given/When/Then**, and a **Level**:

- **Unit** — Vitest against pure functions / services (`*.test.ts`).
- **Integration** — Vitest against a service + mocked Supabase/registry.
- **E2E/UI** — browser click-through (Playwright or Claude-in-Chrome) on the
  running dev app + cloud-dev DB.

A bug is "closed" only when every criterion under its prefix passes (or is
explicitly marked deferred in the tracker with a reason).

## Test data assumptions

- Seeded households per `test/14_end_to_end_acceptance_tests.md` (owner, member,
  viewer, guest, admin, nohousehold).
- The combination catalog has at least 3 approved combinations with distinct
  member dishes and known `popularity_count`s (some below and some at/above the
  popularity threshold).
- A dev-login flow exists for authenticated E2E (`DEV_LOGIN_ENABLED=true`).

---

## REC-\* — Recommendations honour chosen combinations (BUG-015)

- **REC-001** (Unit) — _Chosen dish is boosted, not penalized._ Given a household
  with `household_dish_preferences` containing dish D at the default
  `once_in_a_while` tier; When scoring D vs an equivalent dish the household did
  **not** choose; Then D's total score is **strictly greater**. (Regression: today
  the chosen dish scores `-20` vs `0`.)
- **REC-002** (Unit) — _Tier still orders chosen dishes._ Given two chosen dishes,
  one `daily` and one `once_in_a_while`; When scored for the same slot; Then the
  `daily` dish ranks at or above the `once_in_a_while` dish, and **both** rank
  above an unchosen dish.
- **REC-003** (Unit) — _Household pick doesn't depend on global popularity._ Given
  a freshly onboarded household whose chosen combination has
  `popularity_count < popularityThreshold`; When scoring its member dishes; Then
  they still receive the household-chosen bonus (the threshold gates only the
  global `popularDish` signal, not the household's own picks).
- **REC-004** (Integration) — _End-to-end ranking._ Given a household that picked
  combinations A and B in onboarding; When `/today` (or a generated week) suggests
  for an eligible slot; Then the top suggestions are dominated by dishes from A/B
  over unrelated catalog dishes, subject to hard filters (diet/slot/prep) and
  variety rotation.
- **REC-005** (Unit) — _Explainable reason._ Given a suggestion driven by a
  household pick; When the recommendation reason is produced; Then it names the
  household preference (e.g. "You chose this") rather than only generic factors.
- **REC-006** (Unit) — _Hard filters still win._ Given a chosen dish that violates
  a hard filter (wrong diet / wrong slot / infeasible prep); When recommending;
  Then it is excluded despite the household-chosen bonus.
- **REC-007** (Unit) — _Variety still applies._ Given a chosen dish cooked within
  `variety_gap_days`; When recommending the same slot; Then it is de-prioritized by
  the variety penalty unless the user explicitly asks (existing rule unchanged).
- **REC-008** (Unit) — _`combinations.enabled = false` baseline._ Given the flag
  off; When scoring; Then no household-chosen / popularity / frequency factors
  apply (doc-04 baseline preserved) and existing baseline tests still pass.

## PERF-\* — Performance (BUG-016)

- **PERF-001** (Config) — _Image optimization configured._ Given `next.config.ts`;
  Then it defines an `images` block enabling AVIF/WebP and reasonable
  `deviceSizes`/`imageSizes`. (Assert presence in the config / a unit assertion.)
- **PERF-002** (Asset) — _Source photos are reasonably sized._ Given the dish
  photos served as `dishes.image_url`; Then no served source image exceeds an
  agreed budget (target ≤ ~300 KB each); the landing hero is similarly bounded.
- **PERF-003** (Unit) — _Day suggestions load inputs once._ Given
  `ensureDaySuggestions` for a day with N empty slots; When it runs; Then the
  candidate universe (candidate dishes / members / history) is loaded **once**, not
  per slot (assert via a spy/count on the loader, mirroring `generateWeek`).
- **PERF-004** (Unit) — _Auth/membership deduped per render._ Given a single
  server render that resolves auth + membership multiple times; When wrapped in
  React `cache()`; Then `auth.getUser()` / membership resolution is invoked once
  per request (assert via spy count).
- **PERF-005** (E2E, advisory) — _No correctness regression._ Given the perf
  changes; When `/today`, `/plan`, `/grocery` are loaded; Then content is
  unchanged vs before (same meals, same grocery lines) — perf work must not alter
  recommendations or data.
- **PERF-006** (E2E, advisory) — _Image LCP._ Given `/today` above-the-fold meal
  image; Then it is served in a modern format at an appropriate size and no
  oversized-LCP console warning fires for the primary card.

## COLLAB-\* — Member edits + approval/overwrite notifications (BUG-017)

- **COLLAB-001** (Integration) — _Owner can grant change permission per member._
  Given an owner on the member-management UI; When they enable
  `can_change_today_menu` (and/or `can_change_weekly_schedule`) for a member; Then
  the member's stored permissions reflect the grant and the API/RLS accept the
  member's subsequent change.
- **COLLAB-002** (Integration) — _Granted member can change any meal, incl.
  approved._ Given a member with `can_change_today_menu`; When they change a meal
  whose status is `accepted`; Then the change succeeds (there is no
  approved-status edit guard) and the item updates.
- **COLLAB-003** (Integration) — _Ungranted member is still blocked._ Given a
  member **without** the flag; When they attempt a meal change; Then the API
  returns 403 and the UI shows no change action (default-off preserved per the
  chosen permission model).
- **COLLAB-004** (Integration) — _Approval notifies all members._ Given an owner or
  permitted member approves (accepts) a meal; When `acceptItem` runs; Then a
  `meal_accepted` household event is emitted and an in-app notification fans out to
  the other active members (actor excluded).
- **COLLAB-005** (Integration) — _Overwrite of an approved meal notifies all._
  Given an `accepted` (or `cooked`) meal; When it is overwritten via "Try
  another"/`suggestAnotherItem` **or** `replaceItem`; Then a `meal_changed` event
  is emitted to the other members in both code paths (today only `replaceItem`
  notifies).
- **COLLAB-006** (Unit) — _Event taxonomy + templates._ Given the new
  `meal_accepted` event type; Then it exists in the event types and has a
  human-readable template; existing event tests still pass.
- **COLLAB-007** (Integration) — _Last-write-wins + activity log._ Given two
  members change the same slot; When both writes land; Then the last write wins and
  both changes are recorded in `household_activity_events` (existing policy).
- **COLLAB-008** (E2E/UI) — _Member experience._ Given a granted member on
  `/today`; Then the change/approve controls render and operate end-to-end.

## INVITE-\* — Invite email (BUG-018)

- **INVITE-001** (Unit) — _Outcome reported._ Given `sendInviteEmail` with a
  configured transport; Then it resolves `"sent"`; with no transport →
  `"not_configured"`; with a throwing transport → `"failed"` (and never throws).
  _(Implemented — `lib/events/notifier/router.test.ts`.)_
- **INVITE-002** (Unit) — _Service threads the status._ Given `createInvite` with an
  email recipient; Then `CreateInviteResult.emailStatus` reflects the send outcome;
  with a phone-only invite → `"no_recipient"` and no send attempt. _(Email arm
  implemented — `lib/services/invite/create-invite.test.ts`; add the phone-only
  arm.)_
- **INVITE-003** (Unit) — _Route serializes the status._ Given the POST invite
  route; Then the 201 JSON includes `emailStatus`. _(Implemented —
  `app/api/households/[householdId]/invites/route.test.ts`.)_
- **INVITE-004** (E2E/UI) — _Inviter sees the right message._ Given the invite
  panel; When email is configured → "Invitation emailed to …"; when not configured
  → "Email delivery isn't set up yet…"; when it failed → the failure note; the
  copyable link is always shown.
- **INVITE-005** (Manual/config) — _Real delivery._ Given `RESEND_API_KEY` (and
  `RESEND_FROM_EMAIL`) set; When an invite is created with an email; Then the
  invitee receives the invite email containing the working one-time link.
  _(Deferred until a key is supplied.)_
- **INVITE-006** (Integration) — _Best-effort isolation._ Given the email send
  fails; Then invite creation still succeeds (row persisted, link returned) — a
  failed email never fails the invite.

## ONB-\* — Onboarding (BUG-019, BUG-020, BUG-024, BUG-025, BUG-026)

### Finish leave-dialog (BUG-019)

- **ONB-001** (E2E/UI) — _No spurious dialog on Finish._ Given a completed
  onboarding where every step was saved; When "Finish" is clicked; Then it
  navigates to `/today` with **no** "changes may not be saved" dialog.
  _(Fixed; verify in browser.)_
- **ONB-002** (E2E/UI) — _Genuine unsaved edits still warn._ Given an in-progress
  edit that has **not** been saved; When the tab is closed/navigated away; Then the
  `beforeunload` warning still fires (the guard isn't disabled, only corrected).

### Location fields (BUG-020)

- **ONB-010** (E2E/UI) — _Name pre-filled._ Given Step 1; Then the household-name
  field has a sensible pre-filled default value (not just a placeholder).
- **ONB-011** (E2E/UI) — _Country is a dropdown, seeded from timezone._ Given a
  browser timezone of `Asia/Kolkata`; When Step 1 loads; Then the country `<select>`
  defaults to India.
- **ONB-012** (E2E/UI) — _City pre-filled from timezone._ Given the same; Then the
  city text field is pre-filled with the timezone's city and remains editable.
- **ONB-013** (Unit) — _Timezone → country/city mapping._ Given representative
  timezones; Then the mapping returns the expected country/city; an unknown
  timezone falls back gracefully (empty/neutral default, no crash).
- **ONB-014** (Integration) — _Values persist + complete._ Given a country/city
  chosen via the new controls; Then they save to the draft and onboarding completes
  with them stored.

### Review shows Step 3 choices (BUG-024)

- **ONB-020** (E2E/UI) — _Chosen combinations listed by name._ Given combinations
  picked in Step 3; When the Review step renders; Then each chosen combination is
  listed **by name** (not a bare count or "Not set").
- **ONB-021** (Unit) — _Combination id → name resolution._ Given selected
  combination ids and the catalog; Then Review resolves and displays their names.
- **ONB-022** (E2E/UI) — _Empty state._ Given no Step-3 selection; Then Review
  shows an accurate empty/"system chooses" state, not a misleading count.

### Step 3 images + duplicate name (BUG-025)

- **ONB-030** (E2E/UI) — _Comparable image size._ Given Step 3; Then the
  "Select meal combinations" dish thumbnails are visually comparable in size to the
  "Build your own" dish-card images (no tiny 4rem chips). _(Fixed; verify.)_
- **ONB-031** (E2E/UI) — _Name shown once._ Given a combination card; Then the
  combination name is not duplicated by per-thumbnail dish-name captions.
  _(Fixed; verify.)_
- **ONB-032** (A11y) — _Dish name still accessible._ Given the captions are
  removed; Then each dish image still exposes its name via `alt` text.

### Step 3 additive across modes (BUG-026)

- **ONB-040** (E2E/UI) — _Selections accumulate across modes._ Given a combination
  picked in "Select combinations"; When the user switches to "Build your own" and
  adds a dish, then switches back; Then **both** selections are still present.
- **ONB-041** (E2E/UI) — _All sources reach Review._ Given picks from combinations
  **and** build modes; When Review renders; Then all populated sources are listed
  together.
- **ONB-042** (Integration) — _Completion persists all sources._ Given additive
  picks; When onboarding completes; Then combinations **and** built dishes are both
  persisted (combination popularity + `household_dish_preferences`).
- **ONB-043** (E2E/UI) — _"Let the system decide" is exclusive-ish._ Given the user
  selects "Let the system decide"; Then it represents delegating, and the
  additive-merge behaviour for the two explicit modes is well-defined (document and
  test the intended interaction).
- **ONB-044** (Unit) — _No accidental wipe._ Given a draft with all three slices
  populated; When a mode is toggled in the UI handler; Then sibling arrays are not
  cleared.

## NAV-\* — Today nav subtitle (BUG-021)

- **NAV-001** (Unit/UI) — _Subtitle is status-neutral._ Given the sidebar nav;
  Then the Today link subtitle no longer asserts "Approve tonight" and reads
  neutrally ("Today's meals"). _(Fixed.)_
- **NAV-002** (E2E/UI, optional/deferred) — _Dynamic count._ Given all meals
  accepted; Then a dynamic subtitle shows "All set"; with undecided slots it shows
  the count. _(Optional enhancement; tracked.)_

## SLOTPICK-\* — Single-select replacement picker (BUG-022, BUG-023)

- **SLOTPICK-001** (E2E/UI) — _Week "Change" opens a picker._ Given a generated
  week; When the user clicks the cell's "Change" (renamed from "Swap"); Then an
  onboarding-style picker opens in **single-select** mode (choose exactly one
  dish).
- **SLOTPICK-002** (E2E/UI) — _Today "Try another" opens the same picker._ Given
  `/today`; When "Try another" is clicked; Then the same single-select picker
  opens.
- **SLOTPICK-003** (Integration) — _Chosen dish is committed via replace._ Given a
  dish selected in the picker; When confirmed; Then exactly that slot is replaced
  with the chosen dish via the existing `replaceItem(id, { replacementDishId })`
  endpoint (no auto-pick).
- **SLOTPICK-004** (E2E/UI) — _Single-select only._ Given the picker is for
  replacing one slot; Then it enforces choosing exactly one dish (not multi-select).
- **SLOTPICK-005** (Integration) — _Eligibility + filters respected._ Given the
  picker candidate list; Then it offers only slot-eligible, standalone-eligible
  dishes (diet/slot/role filters), consistent with the recommender.
- **SLOTPICK-006** (E2E/UI) — _Cancel is non-destructive._ Given the picker is
  cancelled; Then the original meal is unchanged.
- **SLOTPICK-007** (Integration) — _Notify on overwrite of approved._ Given the
  replaced slot was `accepted`; Then the replacement emits `meal_changed`
  (ties into COLLAB-005).

---

## Coverage matrix

| Bug     | Closing criteria                      |
| ------- | ------------------------------------- |
| BUG-015 | REC-001 … REC-008                     |
| BUG-016 | PERF-001 … PERF-006                   |
| BUG-017 | COLLAB-001 … COLLAB-008               |
| BUG-018 | INVITE-001 … INVITE-006               |
| BUG-019 | ONB-001, ONB-002                      |
| BUG-020 | ONB-010 … ONB-014                     |
| BUG-021 | NAV-001 (NAV-002 optional)            |
| BUG-022 | SLOTPICK-001, 003, 004, 005, 006, 007 |
| BUG-023 | SLOTPICK-002, 003, 004, 005, 006, 007 |
| BUG-024 | ONB-020 … ONB-022                     |
| BUG-025 | ONB-030 … ONB-032                     |
| BUG-026 | ONB-040 … ONB-044                     |
