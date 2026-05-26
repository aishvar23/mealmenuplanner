// Admin-curated starter meal combinations for the seed (P10). Data only —
// consumed by generate.mjs, which validates every combo against the schema and
// the diet-compatibility rule (a combo's diet_type must be one every member dish
// is compatible with) before emitting SQL.
//
// A combination is a FIXED set of specific catalog dishes that form a South-Asian
// plate (1 dal + 1 dry veg + a bread + rice, or a self-contained tiffin). Every
// dish name here MUST exist in dishes.mjs; the generator fails the build otherwise.
//
// Factory args:
//   c(name, cuisine, diet, dishes, opts)
//   - diet   ∈ diet_type (vegetarian|vegan|eggetarian|non_vegetarian|jain|pescatarian)
//   - dishes: [dishName, roleInCombo]  (roleInCombo is a free-text display label:
//             dal | dry_veg | bread | rice | main | condiment | side)
//   - opts: { region, description }

const c = (name, cuisine, diet, dishes, opts = {}) => ({
  name,
  cuisine,
  diet,
  dishes,
  region: opts.region ?? null,
  description: opts.description ?? null,
});

export const COMBINATIONS = [
  c(
    "Rajma Chawal Thali",
    "North Indian",
    "vegetarian",
    [
      ["Rajma Masala", "dal"],
      ["Steamed Rice", "rice"],
      ["Roti", "bread"],
    ],
    {
      description:
        "Rajma masala with steamed rice and roti — the classic North Indian comfort plate.",
    },
  ),
  c(
    "Dal Roti Sabzi",
    "North Indian",
    "vegetarian",
    [
      ["Dal Tadka", "dal"],
      ["Aloo Gobi", "dry_veg"],
      ["Roti", "bread"],
      ["Steamed Rice", "rice"],
    ],
    {
      description:
        "An everyday plate: tempered dal, a dry vegetable, roti and rice.",
    },
  ),
  c(
    "Chole Bhature",
    "Punjabi",
    "vegetarian",
    [
      ["Chole Masala", "dal"],
      ["Bhature", "bread"],
    ],
    { description: "Spiced chickpeas with fluffy fried bhature." },
  ),
  c(
    "Paneer Butter Masala Meal",
    "North Indian",
    "vegetarian",
    [
      ["Paneer Butter Masala", "main"],
      ["Butter Naan", "bread"],
      ["Jeera Rice", "rice"],
    ],
    {
      description: "Rich paneer butter masala with butter naan and cumin rice.",
    },
  ),
  c(
    "Idli Sambar Chutney",
    "South Indian",
    "vegan",
    [
      ["Idli", "main"],
      ["Sambar", "dal"],
      ["Coconut Chutney", "condiment"],
    ],
    { description: "Steamed idli with sambar and coconut chutney." },
  ),
  c(
    "Masala Dosa Plate",
    "South Indian",
    "vegan",
    [
      ["Masala Dosa", "main"],
      ["Sambar", "dal"],
      ["Coconut Chutney", "condiment"],
    ],
    {
      description: "Crispy potato-filled dosa with sambar and coconut chutney.",
    },
  ),
  c(
    "Jain Dal Pulao Thali",
    "North Indian",
    "jain",
    [
      ["Jain Dal Fry", "dal"],
      ["Jain Paneer Bhurji", "dry_veg"],
      ["Jain Vegetable Pulao", "rice"],
    ],
    {
      description:
        "A no-onion-no-garlic plate: jain dal, paneer bhurji and vegetable pulao.",
    },
  ),
  c(
    "Chicken Curry Meal",
    "Indian",
    "non_vegetarian",
    [
      ["Chicken Curry", "main"],
      ["Steamed Rice", "rice"],
      ["Roti", "bread"],
    ],
    { description: "Home-style chicken curry with rice and roti." },
  ),
];
