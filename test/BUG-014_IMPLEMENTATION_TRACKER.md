# BUG-014 Implementation Tracker

Source plan: [BUG-014_image_support_plan.md](BUG-014_image_support_plan.md)

| Phase                                                | Status      | Notes                                                                                                         |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Phase 1 - Schema + generated types                   | Done        | Cloud dev migration `20260525202901_p9_dish_ingredient_images` applied; local DB types updated.               |
| Phase 2 - Placeholder assets + `<FoodImage>`         | Done        | Neutral dish and ingredient placeholders plus shared fallback component are in place.                         |
| Phase 3 - Thread image fields through DTOs + loaders | Done        | Admin, meal-plan, grocery, and recommendation DTO/loaders now carry image metadata.                           |
| Phase 4 - Render images on user surfaces             | In progress | Today, Plan, and Grocery consume live image metadata with fallback; onboarding waits on preferred-dish UI.    |
| Phase 5 - Admin image metadata editing               | In progress | Dish and ingredient admin forms/validators persist image fields; still needs browser round-trip verification. |
| Phase 6 - Source + seed real image content           | Not started | Requires hosting/licensing decision and batched image backfill.                                               |
| Phase 7 - E2E verification of IMAGE-001..006         | Not started | Needs broken-image fallback, matching-image, package-primary, grocery/onboarding, and admin round-trip tests. |

## Current Slice

- [x] Apply image metadata migration to cloud dev.
- [x] Add neutral image fallbacks and shared image component.
- [x] Add image metadata to admin DTOs.
- [x] Add image metadata to meal-plan DTOs/loaders.
- [x] Add image metadata to grocery DTOs/loaders.
- [x] Add image metadata to recommendation alternatives.
- [x] Feed live image metadata into Today, Plan, and Grocery `<FoodImage>` calls.
- [x] Add admin image metadata fields and validator support.
- [x] Run format, typecheck, lint, tests, and build.
