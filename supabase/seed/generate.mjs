// Seed generator (P0-14). Validates the catalog against the DB schema and the
// recommendation-engine rules, then emits an idempotent supabase/seed.sql.
//
//   node supabase/seed/generate.mjs
//
// Idempotency: every row gets a DETERMINISTIC uuid (md5 of a stable key), and
// every insert is `on conflict do nothing`, so re-running the seed (locally via
// `supabase db reset`, or applying to cloud dev) never duplicates or errors.
// Children reference parents by the same derived uuid — no name lookups — so the
// file is self-contained.
//
// Validation mirrors: lib/services/admin/quality-checklist.ts (activation gates),
// lib/recommendation/diet.ts + config.ts (vegan/jain refinements), and the P0-5
// enum types. Any divergence fails the build with a clear message — the seed can
// only emit dishes that would pass the operator quality checklist and activate.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { INGREDIENTS, INGREDIENT_IMAGES } from "./ingredients.mjs";
import {
  DISHES,
  MEAL_ROLE_OVERRIDES,
  DISH_IMAGES,
  DISH_NUTRITION,
} from "./dishes.mjs";
import { COMBINATIONS } from "./combinations.mjs";

// ── Enum vocabularies (P0-5 migration is the source of truth) ─────────────────
const DIET_TYPES = [
  "vegetarian",
  "vegan",
  "eggetarian",
  "non_vegetarian",
  "jain",
  "pescatarian",
];
const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const SPICES = ["mild", "medium", "spicy"];
const PAIRING_TYPES = [
  "main_side",
  "rice_pairing",
  "bread_pairing",
  "condiment",
  "beverage",
];
// meal_role enum (P9 migration). Default for an unlisted dish is main_component.
const MEAL_ROLES = [
  "complete_meal",
  "main_component",
  "rice_component",
  "bread_component",
  "side",
  "condiment",
  "beverage",
];
const DEFAULT_MEAL_ROLE = "main_component";
const mealRoleOf = (name) => MEAL_ROLE_OVERRIDES[name] ?? DEFAULT_MEAL_ROLE;
const FLAGS = [
  "kid_friendly",
  "lunchbox_friendly",
  "leftover_friendly",
  "batch_cook_friendly",
  "diabetic_friendly",
  "low_sodium",
  "high_protein",
  "low_carb",
];

// ── Diet refinement sets (mirror lib/recommendation/config.ts) ────────────────
const NON_VEGAN_CATEGORIES = ["dairy", "eggs_meat"];
const NON_VEGAN_TERMS = [
  "milk",
  "dairy",
  "paneer",
  "cheese",
  "butter",
  "ghee",
  "cream",
  "curd",
  "yogurt",
  "yoghurt",
  "khoya",
  "mawa",
  "egg",
  "eggs",
  "honey",
];
const JAIN_EXCLUDED_TERMS = [
  "onion",
  "garlic",
  "shallot",
  "leek",
  "spring onion",
];

// Combination status enum (P10 migration) is proposed|active|archived|rejected;
// admin-seeded combos are emitted `active` and `source = 'admin'`.

// Diet a combo of diet_type X may contain (mirrors the onboarding picker's
// DIET_COMPATIBILITY in lib/services/onboarding/diet-compatibility.ts): a combo
// labelled X may only bundle dishes whose own diet is offer-safe to X, so a
// "vegetarian" combo never hides a non-veg dish.
const COMBO_DIET_COMPATIBILITY = {
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "vegan", "jain"],
  jain: ["jain"],
  eggetarian: ["eggetarian", "vegetarian", "vegan", "jain"],
  pescatarian: ["pescatarian", "vegetarian", "vegan", "eggetarian", "jain"],
  non_vegetarian: [
    "non_vegetarian",
    "pescatarian",
    "eggetarian",
    "vegetarian",
    "vegan",
    "jain",
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────
const errors = [];
const fail = (msg) => errors.push(msg);

/** Whole-word match (mirrors lib/recommendation/text-match.ts containsWord). */
function containsWord(haystack, term) {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const h = haystack.trim().toLowerCase();
  if (h === t) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(h);
}

function ingredientMatchesAnyTerm(ing, terms) {
  for (const term of terms) {
    if (containsWord(ing.name, term)) return true;
    if (ing.common.some((c) => containsWord(c, term))) return true;
    if (ing.allergen && containsWord(ing.allergen, term)) return true;
  }
  return false;
}

const uuid = (key) => {
  const h = createHash("md5").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const sql = (s) => s.replace(/'/g, "''");
const pgArray = (arr) =>
  arr.length
    ? `ARRAY[${arr.map((v) => `'${sql(v)}'`).join(", ")}]::text[]`
    : `ARRAY[]::text[]`;
const pgText = (v) => (v == null ? "null" : `'${sql(v)}'`);
const pgBool = (v) => (v ? "true" : "false");
// The four image columns for a row: a verified `/images/...` asset when the row
// is in the image map, else the neutral `placeholder` default (BUG-014).
const imageCols = (img) =>
  img
    ? `${pgText(img.url)}, ${pgText(img.alt)}, 'verified', true`
    : `null, null, 'placeholder', false`;

// The seven per-serving nutrition columns for a dish row (P11): the estimate from
// DISH_NUTRITION, or all-null for a dish with no profile (the UI shows nothing).
const nutritionCols = (name) => {
  const n = DISH_NUTRITION[name];
  if (!n) return "null, null, null, null, null, null, null";
  return `${n.qty}, '${n.unit}', ${n.kcal}, ${n.protein}, ${n.carbs}, ${n.fat}, ${n.gi}`;
};

// ── Validate ingredients ────────────────────────────────────────────────────��─
const ingByName = new Map();
for (const ing of INGREDIENTS) {
  if (ingByName.has(ing.name)) fail(`Duplicate ingredient name: ${ing.name}`);
  ingByName.set(ing.name, ing);
  if (!ing.category) fail(`Ingredient ${ing.name}: missing category`);
  if (!ing.unit) fail(`Ingredient ${ing.name}: missing default_unit`);
}

// ── Validate dishes ─────────────────────────────────────────────────────────��─
const dishNames = new Set();
for (const dish of DISHES) {
  const where = `Dish "${dish.name}"`;
  if (dishNames.has(dish.name)) fail(`Duplicate dish name: ${dish.name}`);
  dishNames.add(dish.name);

  // Enum + checklist gates (so the dish would pass evaluateQualityChecklist).
  if (!dish.name?.trim()) fail(`${where}: missing name`);
  if (!dish.cuisine?.trim()) fail(`${where}: missing cuisine (checklist gate)`);
  if (!DIET_TYPES.includes(dish.diet))
    fail(`${where}: invalid diet "${dish.diet}"`);
  if (!Array.isArray(dish.slots) || dish.slots.length === 0)
    fail(`${where}: needs at least one meal slot (checklist gate)`);
  for (const slot of dish.slots)
    if (!MEAL_SLOTS.includes(slot)) fail(`${where}: invalid slot "${slot}"`);
  if (!DIFFICULTIES.includes(dish.difficulty))
    fail(`${where}: invalid difficulty "${dish.difficulty}"`);
  if (!SPICES.includes(dish.spice))
    fail(`${where}: invalid spice "${dish.spice}"`);
  for (const flag of dish.flags)
    if (!FLAGS.includes(flag)) fail(`${where}: invalid flag "${flag}"`);
  if (!(dish.prep >= 0) || !(dish.cook >= 0) || dish.prep + dish.cook <= 0)
    fail(`${where}: total time must be > 0 (checklist gate)`);
  if (!dish.ingredients?.length)
    fail(`${where}: needs at least one ingredient (checklist gate)`);

  // Resolve ingredients + per-row checks.
  const resolved = [];
  const seenIng = new Set();
  for (const [name, qty, unit, required = true] of dish.ingredients) {
    const ing = ingByName.get(name);
    if (!ing) {
      fail(`${where}: unknown ingredient "${name}"`);
      continue;
    }
    if (seenIng.has(name)) fail(`${where}: ingredient "${name}" listed twice`);
    seenIng.add(name);
    if (!(qty > 0)) fail(`${where}: ingredient "${name}" quantity must be > 0`);
    if (!unit) fail(`${where}: ingredient "${name}" missing unit`);
    resolved.push({ ing, qty, unit, required });
  }

  // Diet coherence against the actual ingredients.
  const ings = resolved.map((r) => r.ing);
  const meaty = ings.filter((g) => g.meatKind);
  if (["vegetarian", "vegan", "jain"].includes(dish.diet) && meaty.length) {
    fail(
      `${where}: ${dish.diet} dish contains animal ingredient(s): ${meaty.map((m) => m.name).join(", ")}`,
    );
  }
  if (dish.diet === "vegan") {
    const bad = ings.filter(
      (g) =>
        NON_VEGAN_CATEGORIES.includes(g.category) ||
        ingredientMatchesAnyTerm(g, NON_VEGAN_TERMS),
    );
    if (bad.length)
      fail(
        `${where}: vegan dish has non-vegan ingredient(s): ${bad.map((b) => b.name).join(", ")}`,
      );
  }
  if (dish.diet === "jain") {
    const bad = ings.filter((g) =>
      ingredientMatchesAnyTerm(g, JAIN_EXCLUDED_TERMS),
    );
    if (bad.length)
      fail(
        `${where}: jain dish has onion/garlic-family ingredient(s): ${bad.map((b) => b.name).join(", ")}`,
      );
  }
  if (dish.diet === "eggetarian") {
    const nonEgg = meaty.filter((m) => m.meatKind !== "egg");
    if (nonEgg.length)
      fail(
        `${where}: eggetarian dish has meat/fish: ${nonEgg.map((m) => m.name).join(", ")}`,
      );
    if (!meaty.some((m) => m.meatKind === "egg"))
      fail(`${where}: eggetarian dish has no egg`);
  }
  if (dish.diet === "pescatarian") {
    const land = meaty.filter(
      (m) => m.meatKind === "poultry" || m.meatKind === "redmeat",
    );
    if (land.length)
      fail(
        `${where}: pescatarian dish has poultry/red meat: ${land.map((m) => m.name).join(", ")}`,
      );
    if (!meaty.some((m) => m.meatKind === "fish" || m.meatKind === "shellfish"))
      fail(`${where}: pescatarian dish has no fish/shellfish`);
  }
  if (
    dish.diet === "non_vegetarian" &&
    !meaty.some((m) =>
      ["poultry", "redmeat", "fish", "shellfish"].includes(m.meatKind),
    )
  )
    fail(`${where}: non_vegetarian dish has no meat/fish`);

  dish._resolved = resolved;
}

// ── Validate pairings (second pass: all dish names known) ─────────────────────��
for (const dish of DISHES) {
  const seen = new Set();
  for (const [target, type] of dish.pairings) {
    if (!PAIRING_TYPES.includes(type))
      fail(`Dish "${dish.name}": invalid pairing type "${type}"`);
    if (target === dish.name)
      fail(`Dish "${dish.name}": cannot pair with itself`);
    if (!dishNames.has(target))
      fail(
        `Dish "${dish.name}": pairing target "${target}" is not a seeded dish`,
      );
    const key = `${target}|${type}`;
    if (seen.has(key)) fail(`Dish "${dish.name}": duplicate pairing ${key}`);
    seen.add(key);
  }
}

// Validate meal-role overrides: every key is a real dish, every value a valid role.
for (const [name, role] of Object.entries(MEAL_ROLE_OVERRIDES)) {
  if (!dishNames.has(name))
    fail(`MEAL_ROLE_OVERRIDES: "${name}" is not a seeded dish`);
  if (!MEAL_ROLES.includes(role))
    fail(`MEAL_ROLE_OVERRIDES["${name}"]: invalid meal_role "${role}"`);
}

// Validate nutrition (P11): every key is a real dish and every field is present
// and well-formed, so a missing/typo'd key can't emit a literal `undefined` into
// the generated SQL (which would fail to apply). Mirrors the migration's checks.
const SERVING_UNITS = ["cup", "bowl", "plate", "glass", "piece"];
for (const [name, n] of Object.entries(DISH_NUTRITION)) {
  const where = `DISH_NUTRITION["${name}"]`;
  if (!dishNames.has(name)) fail(`${where}: "${name}" is not a seeded dish`);
  if (!SERVING_UNITS.includes(n.unit))
    fail(`${where}: invalid serving_unit "${n.unit}"`);
  if (typeof n.qty !== "number" || !(n.qty > 0))
    fail(`${where}: serving qty must be a number > 0`);
  for (const key of ["kcal", "protein", "carbs", "fat"]) {
    if (typeof n[key] !== "number" || n[key] < 0)
      fail(`${where}: ${key} must be a number >= 0`);
  }
  if (typeof n.gi !== "number" || n.gi < 0 || n.gi > 110)
    fail(`${where}: gi must be a number in 0..110`);
}

// ── Validate meal combinations (P10) ────────────────────────────────────────────
// Every combo: unique name, valid diet, ≥1 distinct member dish that all exist,
// and diet-coherent with its dishes (a vegetarian combo can't hide a non-veg dish).
// Admin combos may be a single main dish (its accompaniments live as pairings);
// the ≥2 floor only constrains user proposals (propose_meal_combination RPC).
const dietByDishName = new Map(DISHES.map((dish) => [dish.name, dish.diet]));
const comboNames = new Set();
for (const combo of COMBINATIONS) {
  const where = `Combination "${combo.name}"`;
  if (!combo.name?.trim()) fail(`${where}: missing name`);
  if (comboNames.has(combo.name))
    fail(`Duplicate combination name: ${combo.name}`);
  comboNames.add(combo.name);
  if (!combo.cuisine?.trim()) fail(`${where}: missing cuisine`);
  if (!DIET_TYPES.includes(combo.diet))
    fail(`${where}: invalid diet "${combo.diet}"`);

  if (!Array.isArray(combo.dishes) || combo.dishes.length < 1) {
    fail(`${where}: needs at least one dish`);
    continue;
  }

  const allowed = COMBO_DIET_COMPATIBILITY[combo.diet] ?? [];
  const seen = new Set();
  for (const [dishName, role] of combo.dishes) {
    if (!dishNames.has(dishName)) {
      fail(`${where}: dish "${dishName}" is not a seeded dish`);
      continue;
    }
    if (seen.has(dishName)) fail(`${where}: dish "${dishName}" listed twice`);
    seen.add(dishName);
    if (!role?.trim())
      fail(`${where}: dish "${dishName}" missing role_in_combo`);
    const dishDiet = dietByDishName.get(dishName);
    if (DIET_TYPES.includes(combo.diet) && !allowed.includes(dishDiet))
      fail(
        `${where}: ${combo.diet} combo contains an incompatible ${dishDiet} dish "${dishName}"`,
      );
  }
}

// Validate image maps (BUG-014): every key is a real row, alt is present, and the
// url is a local /images/ static path. These rows are emitted as image_status
// 'verified' + image_verified true, so an empty alt would break the IMAGE-006
// "alt required when verified" rule the admin validator enforces.
for (const [name, img] of Object.entries(DISH_IMAGES)) {
  if (!dishNames.has(name)) fail(`DISH_IMAGES: "${name}" is not a seeded dish`);
  if (!img?.url?.startsWith("/images/"))
    fail(`DISH_IMAGES["${name}"]: url must be a /images/ static path`);
  if (!img?.alt?.trim())
    fail(`DISH_IMAGES["${name}"]: alt text is required for a verified image`);
}
for (const [name, img] of Object.entries(INGREDIENT_IMAGES)) {
  if (!ingByName.has(name))
    fail(`INGREDIENT_IMAGES: "${name}" is not a seeded ingredient`);
  if (!img?.url?.startsWith("/images/"))
    fail(`INGREDIENT_IMAGES["${name}"]: url must be a /images/ static path`);
  if (!img?.alt?.trim())
    fail(
      `INGREDIENT_IMAGES["${name}"]: alt text is required for a verified image`,
    );
}

if (errors.length) {
  console.error(`\n✗ Seed validation failed (${errors.length} issue(s)):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// ── Emit SQL ──────────────────────────────────────────────────────────────────
const lines = [];
const p = (s = "") => lines.push(s);

p("-- Home Meal Planner — seed data (P0-14).");
p(
  "-- GENERATED by supabase/seed/generate.mjs from ingredients.mjs + dishes.mjs.",
);
p(
  "-- Do not edit by hand: edit the catalog and re-run `node supabase/seed/generate.mjs`.",
);
p("--");
p(
  "-- Idempotent: deterministic uuids + `on conflict do nothing`. Dishes are seeded",
);
p(
  "-- `active` (every row satisfies the operator quality checklist by construction).",
);
p("");

// Ingredients
p(`-- Ingredients (${INGREDIENTS.length}).`);
p(
  "insert into ingredients (id, name, category, default_unit, common_names, allergen_type, image_url, image_alt_text, image_status, image_verified) values",
);
p(
  INGREDIENTS.map(
    (g) =>
      `  ('${uuid("ingredient:" + g.name)}', '${sql(g.name)}', '${sql(g.category)}', '${sql(g.unit)}', ${pgArray(g.common)}, ${pgText(g.allergen)}, ${imageCols(INGREDIENT_IMAGES[g.name])})`,
  ).join(",\n") + "\non conflict do nothing;",
);
p("");

// Dishes
p(`-- Dishes (${DISHES.length}), seeded active.`);
p(
  "insert into dishes (id, name, description, cuisine, region, meal_slots, diet_type, prep_time_minutes, cook_time_minutes, difficulty, spice_level, kid_friendly, lunchbox_friendly, leftover_friendly, batch_cook_friendly, diabetic_friendly, low_sodium, high_protein, low_carb, meal_role, image_url, image_alt_text, image_status, image_verified, serving_qty, serving_unit, calories_kcal, protein_g, carbs_g, fat_g, glycemic_index, status) values",
);
p(
  DISHES.map((dish) => {
    const f = (name) => pgBool(dish.flags.includes(name));
    return (
      `  ('${uuid("dish:" + dish.name)}', '${sql(dish.name)}', ${pgText(dish.desc)}, ${pgText(dish.cuisine)}, ${pgText(dish.region)}, ` +
      `${pgArray(dish.slots)}, '${dish.diet}', ${dish.prep}, ${dish.cook}, '${dish.difficulty}', '${dish.spice}', ` +
      `${f("kid_friendly")}, ${f("lunchbox_friendly")}, ${f("leftover_friendly")}, ${f("batch_cook_friendly")}, ` +
      `${f("diabetic_friendly")}, ${f("low_sodium")}, ${f("high_protein")}, ${f("low_carb")}, '${mealRoleOf(dish.name)}', ${imageCols(DISH_IMAGES[dish.name])}, ${nutritionCols(dish.name)}, 'active')`
    );
  }).join(",\n") + "\non conflict do nothing;",
);
p("");

// meal_role is data, not a one-time DDL default: re-apply it on every seed so an
// already-seeded DB (where `on conflict do nothing` skips the insert above) still
// converges to the catalog's roles (BUG-008/009/010).
p("-- Sync meal_role onto existing rows (idempotent).");
p("update dishes d set meal_role = v.role::meal_role");
p("from (values");
p(
  DISHES.map(
    (dish) => `  ('${uuid("dish:" + dish.name)}', '${mealRoleOf(dish.name)}')`,
  ).join(",\n"),
);
p(") as v(id, role)");
p(
  "where d.id = v.id::uuid and d.meal_role is distinct from v.role::meal_role;",
);
p("");

// Per-serving nutrition is data too (P11): re-apply on every seed so an
// already-seeded DB converges to the catalog's estimates. Skips rows that are
// already in sync so the updated_at trigger doesn't churn.
const nutritionDishes = DISHES.filter((dish) => DISH_NUTRITION[dish.name]);
p("-- Sync nutrition onto existing rows (idempotent).");
p(
  "update dishes d set serving_qty = v.serving_qty::numeric, serving_unit = v.serving_unit::serving_unit, calories_kcal = v.calories_kcal::int, protein_g = v.protein_g::numeric, carbs_g = v.carbs_g::numeric, fat_g = v.fat_g::numeric, glycemic_index = v.glycemic_index::int",
);
p("from (values");
p(
  nutritionDishes
    .map((dish) => {
      const n = DISH_NUTRITION[dish.name];
      return `  ('${uuid("dish:" + dish.name)}', ${n.qty}, '${n.unit}', ${n.kcal}, ${n.protein}, ${n.carbs}, ${n.fat}, ${n.gi})`;
    })
    .join(",\n"),
);
p(
  ") as v(id, serving_qty, serving_unit, calories_kcal, protein_g, carbs_g, fat_g, glycemic_index)",
);
p(
  "where d.id = v.id::uuid and (d.serving_qty is distinct from v.serving_qty::numeric or d.serving_unit is distinct from v.serving_unit::serving_unit or d.calories_kcal is distinct from v.calories_kcal::int or d.protein_g is distinct from v.protein_g::numeric or d.carbs_g is distinct from v.carbs_g::numeric or d.fat_g is distinct from v.fat_g::numeric or d.glycemic_index is distinct from v.glycemic_index::int);",
);
p("");

// Verified images are data too (BUG-014): re-apply on every seed so already-seeded
// rows (skipped by `on conflict do nothing` above) converge to the catalog's
// images. Only mapped rows are touched — everything else keeps the DB default
// `placeholder`, so an operator's hand-set image is never clobbered.
const dishImageRows = Object.entries(DISH_IMAGES).map(
  ([name, img]) =>
    `  ('${uuid("dish:" + name)}', ${pgText(img.url)}, ${pgText(img.alt)})`,
);
p("-- Sync verified dish images onto existing rows (idempotent).");
p(
  "update dishes d set image_url = v.url, image_alt_text = v.alt, image_status = 'verified', image_verified = true",
);
p("from (values");
p(dishImageRows.join(",\n"));
p(") as v(id, url, alt)");
p(
  "where d.id = v.id::uuid and (d.image_url is distinct from v.url or d.image_alt_text is distinct from v.alt or d.image_status is distinct from 'verified'::image_status or d.image_verified is distinct from true);",
);
p("");

const ingImageRows = Object.entries(INGREDIENT_IMAGES).map(
  ([name, img]) =>
    `  ('${uuid("ingredient:" + name)}', ${pgText(img.url)}, ${pgText(img.alt)})`,
);
p("-- Sync verified ingredient images onto existing rows (idempotent).");
p(
  "update ingredients g set image_url = v.url, image_alt_text = v.alt, image_status = 'verified', image_verified = true",
);
p("from (values");
p(ingImageRows.join(",\n"));
p(") as v(id, url, alt)");
p(
  "where g.id = v.id::uuid and (g.image_url is distinct from v.url or g.image_alt_text is distinct from v.alt or g.image_status is distinct from 'verified'::image_status or g.image_verified is distinct from true);",
);
p("");

// Dish ingredients — name-join keeps rows compact + readable; idempotent via the
// unique(dish_id, ingredient_id) constraint.
const diRows = [];
for (const dish of DISHES) {
  for (const { ing, qty, unit, required } of dish._resolved) {
    diRows.push(
      `  ('${sql(dish.name)}', '${sql(ing.name)}', ${qty}, '${sql(unit)}', ${pgBool(required)}, ${pgBool(!required)})`,
    );
  }
}
p(`-- Dish ingredients (${diRows.length}).`);
p(
  "insert into dish_ingredients (dish_id, ingredient_id, quantity_per_serving, unit, is_required, is_optional)",
);
p("select d.id, i.id, v.qty, v.unit, v.req, v.opt");
p("from (values");
p(diRows.join(",\n"));
p(") as v(dish, ingredient, qty, unit, req, opt)");
p("join dishes d on d.name = v.dish");
p("join ingredients i on i.name = v.ingredient");
p("on conflict do nothing;");
p("");

// Prep tasks — deterministic id (md5) so re-runs stay idempotent (no natural key).
const ptRows = [];
for (const dish of DISHES) {
  for (const [task, mins, desc = null] of dish.prepTasks) {
    ptRows.push(
      `  ('${sql(dish.name)}', '${sql(task)}', ${mins}, ${pgText(desc)})`,
    );
  }
}
p(`-- Dish prep tasks (${ptRows.length}).`);
p(
  "insert into dish_prep_tasks (id, dish_id, task_name, required_before_minutes, description)",
);
p(
  "select md5('prep_task:' || v.dish || '|' || v.task)::uuid, d.id, v.task, v.mins, v.descr",
);
p("from (values");
p(ptRows.join(",\n"));
p(") as v(dish, task, mins, descr)");
p("join dishes d on d.name = v.dish");
p("on conflict do nothing;");
p("");

// Pairings — idempotent via the unique(primary, paired, type) constraint.
const prRows = [];
for (const dish of DISHES) {
  for (const [target, type] of dish.pairings) {
    prRows.push(`  ('${sql(dish.name)}', '${sql(target)}', '${type}')`);
  }
}
p(`-- Dish pairings (${prRows.length}).`);
p("insert into dish_pairings (primary_dish_id, paired_dish_id, pairing_type)");
p("select p.id, q.id, v.ptype::pairing_type");
p("from (values");
p(prRows.join(",\n"));
p(") as v(primary_name, paired_name, ptype)");
p("join dishes p on p.name = v.primary_name");
p("join dishes q on q.name = v.paired_name");
p("on conflict do nothing;");
p("");

// Meal combinations (P10) — admin-curated, seeded `active`. Deterministic uuid so
// re-runs are idempotent (`on conflict do nothing`). popularity_count seeds a
// descending initial order (iconic combos first); it is NEVER re-synced — real
// usage drives it from there, so a re-run never clobbers accumulated popularity.
const comboCount = COMBINATIONS.length;
p(`-- Meal combinations (${comboCount}), seeded active.`);
p(
  "insert into meal_combinations (id, name, description, cuisine, region, diet_type, status, popularity_count, source) values",
);
p(
  COMBINATIONS.map((combo, i) => {
    const popularity = (comboCount - i) * 10;
    return (
      `  ('${uuid("combo:" + combo.name)}', '${sql(combo.name)}', ${pgText(combo.description)}, ` +
      `${pgText(combo.cuisine)}, ${pgText(combo.region)}, '${combo.diet}', 'active', ${popularity}, 'admin')`
    );
  }).join(",\n") + "\non conflict do nothing;",
);
p("");

// Combination items — combination_id is the deterministic combo uuid (no name
// lookup, since meal_combinations.name is not unique once users propose combos);
// dish_id name-joins dishes. Idempotent via unique(combination_id, dish_id).
const mciRows = [];
for (const combo of COMBINATIONS) {
  combo.dishes.forEach(([dishName, role], idx) => {
    mciRows.push(
      `  ('${uuid("combo:" + combo.name)}', '${sql(dishName)}', ${pgText(role)}, ${idx})`,
    );
  });
}
p(`-- Combination items (${mciRows.length}).`);
p(
  "insert into meal_combination_items (combination_id, dish_id, role_in_combo, sort_order)",
);
p("select v.combination_id::uuid, d.id, v.role, v.ord");
p("from (values");
p(mciRows.join(",\n"));
p(") as v(combination_id, dish_name, role, ord)");
p("join dishes d on d.name = v.dish_name");
p("on conflict do nothing;");
p("");

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "seed.sql");
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log("✓ Seed validated and generated.");
console.log(`  ingredients:      ${INGREDIENTS.length}`);
console.log(`  dishes:           ${DISHES.length}`);
console.log(`  dish_ingredients: ${diRows.length}`);
console.log(`  prep_tasks:       ${ptRows.length}`);
console.log(`  pairings:         ${prRows.length}`);
console.log(`  combinations:     ${comboCount}`);
console.log(`  combo_items:      ${mciRows.length}`);
console.log(`  → ${outPath}`);
