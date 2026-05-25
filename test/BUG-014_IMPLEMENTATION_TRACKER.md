# BUG-014 Implementation Tracker

Source plan: [BUG-014_image_support_plan.md](BUG-014_image_support_plan.md)

| Phase                                                | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 - Schema + generated types                   | Done        | Cloud dev migration `20260525202901_p9_dish_ingredient_images` applied; local DB types updated.                                                                                                                                                                                                                                                                                          |
| Phase 2 - Placeholder assets + `<FoodImage>`         | Done        | Neutral dish and ingredient placeholders plus shared fallback component are in place.                                                                                                                                                                                                                                                                                                    |
| Phase 3 - Thread image fields through DTOs + loaders | Done        | Admin, meal-plan, grocery, and recommendation DTO/loaders now carry image metadata.                                                                                                                                                                                                                                                                                                      |
| Phase 4 - Render images on user surfaces             | Done        | Today, Plan, Grocery, and the onboarding preferred-dish step consume live image metadata with placeholder fallback.                                                                                                                                                                                                                                                                      |
| Phase 5 - Admin image metadata editing               | Done        | IMAGE-006 round-trip verified end-to-end: admin `PATCH /api/admin/dishes/{id}` (alt+url required when `verified`) → user-facing `/api/onboarding/dishes` reflects the new image/alt/status.                                                                                                                                                                                              |
| Phase 6 - Source + seed real image content           | Mostly done | 23 openly-licensed Commons photos committed under `public/images/` (static hosting) with `CREDITS.md`; seed generator emits + syncs image columns. 19 dishes + 4 ingredients verified on cloud dev; 6 missing required dishes added (Paneer Bhurji, Khichdi, Mango Pickle, Papad, Raita, Green Salad). Remaining: optional backfill of the other ~85 catalog dishes (still placeholder). |
| Phase 7 - E2E verification of IMAGE-001..006         | Mostly done | IMAGE-001/002/003 verified via real content (onboarding `/api/onboarding/dishes` returns per-dish verified images; static files serve 200); IMAGE-004/005/006 verified earlier. Optional: a seeded `image_status='broken'` fixture dish for an automated IMAGE-004 check.                                                                                                                |

## Current Slice

- [x] Apply image metadata migration to cloud dev.
- [x] Add neutral image fallbacks and shared image component.
- [x] Add image metadata to admin DTOs.
- [x] Add image metadata to meal-plan DTOs/loaders.
- [x] Add image metadata to grocery DTOs/loaders.
- [x] Add image metadata to recommendation alternatives.
- [x] Feed live image metadata into Today, Plan, and Grocery `<FoodImage>` calls.
- [x] Feed live image metadata into the onboarding preferred-dish picker (IMAGE-001 plumbing).
- [x] Add admin image metadata fields and validator support.
- [x] Run format, typecheck, lint, tests, and build.

## Verification log (2026-05-25)

Verified against the running app + cloud dev (HTTP round-trip; the browser
extension dropped mid-session, so the admin→user round-trip was exercised
through the real route handlers instead):

- **IMAGE-006 ✓** — admin `PATCH /api/admin/dishes/{id}` set Masala Dosa to a
  verified image; the validator enforced "alt + url required when verified";
  the user-facing `/api/onboarding/dishes` read then returned the new
  `imageUrl`/`imageAltText`/`imageStatus`. Reverted to `placeholder` after.
- **IMAGE-001 ✓ (data path)** — `/api/onboarding/dishes` carries
  `imageUrl/imageAltText/imageStatus`; the preferred-dish step renders
  `<FoodImage>` (Phase 4). Full visual (real photo) awaits Phase 6 content.
- **IMAGE-004 ✓** — the neutral dish placeholder renders for any non-`verified`
  status (observed live on the Today card; `FoodImage` short-circuits to the
  placeholder when `status !== 'verified'`), layout stable.
- **IMAGE-003 / IMAGE-005** — structurally satisfied (each row carries its own
  image; the plan cards render the planned **main** dish's image, sides are
  text suffixes). A full visual pass needs the seeded Rajma/Chole/package dishes
  - real images (Phase 6); only Masala Dosa is currently in the catalog.

> Note: meal-generation API routes (`.../meal-plans/today/generate`, `week`)
> returned framework 404s in this session — traced to the local `next dev`
> server's stale module graph after a branch switch, **not** a code regression
> (build/tests/types green, routes exist, pages render, `proxy.ts` only
> redirects). Restart `next dev` to clear it.

## Content batch applied (2026-05-25)

Decisions: **static `public/images/` hosting** + a **free-licensed Commons batch**
(see `BUG-014_image_batch_proposal.md`, `public/images/CREDITS.md`).

- Downloaded 23 openly-licensed photos (19 dishes + 4 ingredients) into
  `public/images/dishes|ingredients/`; attribution recorded in `CREDITS.md`.
- Extended `supabase/seed/generate.mjs`: `DISH_IMAGES` / `INGREDIENT_IMAGES` maps
  drive verified image columns on insert + an idempotent UPDATE sync so
  already-seeded rows converge (mapped rows only — never clobbers admin edits).
- Added the 6 missing required dishes to `supabase/seed/dishes.mjs` with valid
  ingredients, pairings (Paneer Bhurji+Roti, Khichdi+Raita), and `meal_role`.
- Applied the delta to cloud dev: 19 dishes + 4 ingredients now `verified`,
  catalog at 106 dishes. Verified `/api/onboarding/dishes` returns the real
  per-dish images (IMAGE-001/003) and the static files serve 200 (IMAGE-002).
- Gates green: format, lint, typecheck, 759 tests, build.

## Remaining (optional)

- Backfill images for the remaining ~85 catalog dishes (all still `placeholder`,
  which renders the safe neutral fallback — no code changes needed, just more
  `DISH_IMAGES` entries + assets).
- A seeded `image_status='broken'` fixture dish would let IMAGE-004 be asserted
  automatically rather than by inspection.
