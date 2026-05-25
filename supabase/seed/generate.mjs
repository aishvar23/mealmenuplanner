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
import { INGREDIENTS } from "./ingredients.mjs";
import { DISHES, MEAL_ROLE_OVERRIDES } from "./dishes.mjs";

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
  "insert into ingredients (id, name, category, default_unit, common_names, allergen_type) values",
);
p(
  INGREDIENTS.map(
    (g) =>
      `  ('${uuid("ingredient:" + g.name)}', '${sql(g.name)}', '${sql(g.category)}', '${sql(g.unit)}', ${pgArray(g.common)}, ${pgText(g.allergen)})`,
  ).join(",\n") + "\non conflict do nothing;",
);
p("");

// Dishes
p(`-- Dishes (${DISHES.length}), seeded active.`);
p(
  "insert into dishes (id, name, description, cuisine, region, meal_slots, diet_type, prep_time_minutes, cook_time_minutes, difficulty, spice_level, kid_friendly, lunchbox_friendly, leftover_friendly, batch_cook_friendly, diabetic_friendly, low_sodium, high_protein, low_carb, meal_role, status) values",
);
p(
  DISHES.map((dish) => {
    const f = (name) => pgBool(dish.flags.includes(name));
    return (
      `  ('${uuid("dish:" + dish.name)}', '${sql(dish.name)}', ${pgText(dish.desc)}, ${pgText(dish.cuisine)}, ${pgText(dish.region)}, ` +
      `${pgArray(dish.slots)}, '${dish.diet}', ${dish.prep}, ${dish.cook}, '${dish.difficulty}', '${dish.spice}', ` +
      `${f("kid_friendly")}, ${f("lunchbox_friendly")}, ${f("leftover_friendly")}, ${f("batch_cook_friendly")}, ` +
      `${f("diabetic_friendly")}, ${f("low_sodium")}, ${f("high_protein")}, ${f("low_carb")}, '${mealRoleOf(dish.name)}', 'active')`
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

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "seed.sql");
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log("✓ Seed validated and generated.");
console.log(`  ingredients:      ${INGREDIENTS.length}`);
console.log(`  dishes:           ${DISHES.length}`);
console.log(`  dish_ingredients: ${diRows.length}`);
console.log(`  prep_tasks:       ${ptRows.length}`);
console.log(`  pairings:         ${prRows.length}`);
console.log(`  → ${outPath}`);
