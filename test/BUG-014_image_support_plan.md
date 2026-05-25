# BUG-014 — Dish & Ingredient Image Support: Phased Implementation Plan

> Companion to `test/ui_acceptance_bug_log.md` (BUG-014) and
> `test/14_end_to_end_acceptance_tests.md` (Global criterion 8, IMAGE-001..006).
> This is the **largest** item in the acceptance backlog. It is broken into
> independently shippable chunks; each chunk is sized to fit in one focused
> working session and ends with its own verification gate.

## Why this is a separate plan

BUG-014 is not a render bug — it is a **missing feature with a content
dependency**. The current state (verified 2026-05-25):

- The `dishes` and `ingredients` tables have **no** `image_url`,
  `image_alt_text`, `image_status`, or `image_verified` columns
  (`supabase/migrations/20260523034643_p0_7_content_tables.sql`).
- The seed (`supabase/seed/dishes.mjs`, `ingredients.mjs`) populates **no**
  image data, and there is no place to put it.
- `public/images/` holds exactly **one** asset, `meal-hero.png` (a generic
  marketing background, reused on `/`, `/today`, `/onboarding`).
- No DTO carries image fields (`lib/services/**/dto.ts`), so the boards
  (`today-board.tsx`, `week-board.tsx`, `grocery-board.tsx`) render text only.

So the work spans **schema → types → assets → a shared component → DTOs/loaders
→ four UI surfaces → admin editing → real content → E2E**. Trying to land it as
one change is high-risk and stalls behind sourcing ~180 images. The phases below
let us ship the _plumbing_ (which we control) early and behind a safe neutral
placeholder, then backfill _content_ incrementally without further code changes.

## Acceptance criteria this plan must satisfy

- **Global criterion 8** — dish and ingredient images are accurate and shown in
  the correct contexts.
- **IMAGE-001** — dish images display during the (preferred-dish) onboarding step,
  not broken, alt text describes the dish, not an unrelated placeholder.
- **IMAGE-002** — ingredient images display where ingredients are shown
  (onboarding/grocery), meaningful alt text, broken image does not break layout.
- **IMAGE-003** — a dish's image matches that dish (no cross-wiring).
- **IMAGE-004** — `image_status = broken` renders a neutral placeholder that does
  not imply the wrong food; layout stays stable.
- **IMAGE-005** — a meal package shows the main dish / package image, not a
  chutney/side image as the primary representation.
- **IMAGE-006** — admin updates to image URL + alt text are reflected in the
  user-facing card.

## Key decisions to settle before Phase 6 (content)

These do **not** block Phases 1–5 (which work against placeholders) but must be
answered before sourcing real images:

1. **Hosting** — Supabase Storage bucket (recommended; signed/public URLs,
   integrates with the project), static files under `public/images/dishes/`, or
   an external CDN. Affects `next.config` `images.remotePatterns` and the seed
   URL format.
2. **Licensing** — where the ~180 dish/ingredient photos come from (licensed
   stock, generated, hand-shot). This is the real long pole; legal-safe sourcing
   gates `image_verified = true`.
3. **Package image policy (IMAGE-005)** — does a meal package get its own image,
   or do we always render the _main component's_ image? Recommended: render the
   main component image and never a condiment/side image as the primary.

---

## Phase 1 — Schema + generated types (foundation)

**Goal:** the database can store image metadata; types compile.

**Scope / files:**

- New migration `supabase/migrations/<ts>_p9_dish_ingredient_images.sql`.
- `lib/db/database.types.ts` (regenerated, not hand-edited).
- `IMPLEMENTATION_TRACKER.md` + migration version list in `supabase/README.md`.

**Steps:**

1. Add enum `image_status` with values `verified | missing | broken | placeholder`.
2. Add to **both** `dishes` and `ingredients`:
   - `image_url text`
   - `image_alt_text text`
   - `image_status image_status not null default 'placeholder'`
   - `image_verified boolean not null default false`
3. Apply to cloud dev via the Supabase MCP `apply_migration` (see
   `memory/db-migration-workflow.md`); keep the migration version list in sync.
4. Regenerate `database.types.ts` from cloud dev via the MCP.

**Verification:** migration applies idempotently; `npm run typecheck` passes;
`list_migrations` shows the new version.

**Size:** Small. **Depends on:** nothing.

---

## Phase 2 — Neutral placeholder asset + shared `<FoodImage>` component

**Goal:** one reusable, accessible image component with a safe fallback —
buildable with zero real content.

**Scope / files:**

- `public/images/placeholder-dish.svg`, `public/images/placeholder-ingredient.svg`
  (neutral plate/produce silhouettes that do **not** imply a specific food).
- New `components/ui/food-image.tsx`.
- `next.config.ts` — add `images.remotePatterns` if URLs are remote (decision 1).

**Steps:**

1. Create the two neutral SVG placeholders (monochrome, brand-neutral).
2. Build `<FoodImage src altText status kind="dish"|"ingredient" />`:
   - fixed aspect-ratio wrapper so layout never shifts (IMAGE-002/004);
   - render the placeholder when `src` is empty or `status ∈ {missing, broken, placeholder}`;
   - client `onError` handler swaps to the placeholder (covers runtime 404s);
   - `alt` = `altText` when present, else a neutral generic ("Dish image unavailable").

**Verification:** Storybook-style/manual mount with each status; broken URL
falls back without layout shift; placeholder never shows a real food.

**Size:** Medium. **Depends on:** Phase 1 (for the `image_status` type) — can stub the type if run in parallel.

---

## Phase 3 — Thread image fields through DTOs + loaders

**Goal:** image data reaches the UI layer in camelCase.

**Scope / files:**

- `lib/services/admin/dto.ts` (`DishDto`, `IngredientDto`).
- `lib/services/meal-plan/dto.ts` (`MealPlanItemDto`) + its mapper.
- `lib/services/grocery/dto.ts` (`GroceryItemDto`) + mapper.
- `lib/services/meal-plan/suggest.ts` (today suggestion shape).
- `lib/recommendation/types.ts` (`CandidateDish` / `Recommendation` if the card
  needs the image at recommend time) + the recommendation loaders.
- Any SQL/RPC that projects dish/ingredient rows — notably the grocery RPC
  `replace_grocery_list` (`supabase/migrations/...replace_grocery_list_fn.sql`)
  and the member/candidate loaders. Add the new columns to those `select`s/RPC
  return shapes and regenerate types if RPC signatures change.

**Steps:** add `imageUrl`, `imageAltText`, `imageStatus` to each DTO; populate in
each mapper from the new columns; for RPC-sourced data, extend the function’s
returned columns (new migration) and re-thread.

**Verification:** `npm run typecheck` + existing service tests pass; a scratch
query confirms image fields arrive non-null for a manually-populated dish.

**Size:** Medium (wide but mechanical). **Depends on:** Phase 1.

---

## Phase 4 — Render images on the four user surfaces

**Goal:** users see dish/ingredient imagery in the right contexts.

**Scope / files:**

- `components/meal-plan/today-board.tsx` — primary recommendation card uses the
  **main/package** image, never a side (IMAGE-005); quick-swaps get thumbnails.
- `components/meal-plan/week-board.tsx` — per-slot thumbnail.
- `components/grocery/grocery-board.tsx` — per-ingredient thumbnail (IMAGE-002).
- Onboarding preferred-dish step + any ingredient cards (IMAGE-001) — **note this
  surface only exists once BUG-006 lands.**

**Steps:** replace text-only rows with `<FoodImage>` + label; keep the existing
`meal-hero.png` only as decorative hero, never as a dish stand-in.

**Verification:** manual pass on `/today`, `/plan`, `/grocery`, `/onboarding`;
DOM has real `<img>`/`next/image` with correct `alt`; placeholders where content
is absent; no layout shift.

**Size:** Medium. **Depends on:** Phases 2 + 3 (and BUG-006 for the onboarding bit).

---

## Phase 5 — Admin image metadata editing (IMAGE-006)

**Goal:** operators can set/verify image URL + alt text and see it flow to users.

**Scope / files:**

- Admin dish/ingredient editor under `app/admin/**` + its form components.
- `lib/services/admin/*` update paths + DTO validation (URL shape, required alt
  when status = verified).

**Steps:** add the four fields to the editor; validate; persist; confirm the
user-facing card reflects changes (IMAGE-006 round-trip).

**Verification:** edit a dish’s image URL + alt as admin, reload the user card,
see the update.

**Size:** Medium. **Depends on:** Phases 1, 3, 4.

---

## Phase 6 — Source + seed real image content (the content long pole)

**Goal:** real, accurate, licensed images + alt text for the catalog. **Split
this across sub-sessions** — do not attempt all ~180 at once.

**Scope / files:** `supabase/seed/dishes.mjs`, `supabase/seed/ingredients.mjs`,
`supabase/seed/generate.mjs` (extend the factory + emitter to accept image
fields), regenerated `supabase/seed.sql`, applied to cloud dev.

**Sub-chunks (each a session):**

- **6a** — extend the seed factory/generator + validator for image fields
  (`image_url`, `image_alt_text`, `image_status`, `image_verified`); set every
  existing row to `status = 'placeholder'` so the generator stays green.
- **6b..6n** — backfill real images in batches of ~20 (e.g., by cuisine):
  populate URL + descriptive alt, flip to `status = 'verified'`,
  `image_verified = true`. The acceptance "required dish data" table
  (`test/14...md` §"Required seeded dish data") lists the must-have dishes —
  prioritize those (Masala Dosa, Rajma, Chole, Dal Tadka, Paneer Bhurji, etc.).
- **ingredients batch** — tomato, rice, paneer, onion first (named in IMAGE-002).

**Verification per batch:** `node supabase/seed/generate.mjs` validates; apply to
cloud dev; spot-check the affected cards render the right image with alt text
(IMAGE-001/002/003).

**Size:** Large — intentionally chunked. **Depends on:** Phases 1, 4, and
decisions 1 & 2 (hosting + licensing).

---

## Phase 7 — E2E verification of IMAGE-001..006

**Goal:** lock the behavior with the acceptance suite.

**Steps:** seed a deliberate `image_status = broken` test dish (IMAGE-004);
assert matching images (IMAGE-003), onboarding/grocery imagery (IMAGE-001/002),
package representation (IMAGE-005), admin round-trip (IMAGE-006), and the
"broken images have safe fallback" check (`test/14...md` line ~1414).

**Verification:** all IMAGE-00x scenarios pass against a clean seed.

**Size:** Small–Medium. **Depends on:** all prior phases.

---

## Suggested order & what unblocks early value

1. **Phase 1 + 2 together** (one session) — schema + the safe component. After
   this, every surface _can_ show images with placeholders.
2. **Phase 3** — plumbing.
3. **Phase 4** — visible placeholders everywhere correct (passes IMAGE-004 layout
   - fallback immediately, even with zero real content).
4. **Phase 5** — admin editing (lets content be entered without a reseed).
5. **Phase 6** — backfill real content in batches (the long pole; parallelizable).
6. **Phase 7** — E2E lock-in.

> Phases 1–5 are pure engineering we fully control and can finish without any
> image assets. Only Phase 6 depends on sourcing/licensing real photos, which is
> why it is isolated and chunked last.
