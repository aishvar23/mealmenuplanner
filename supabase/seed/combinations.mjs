// Admin-curated starter meal combinations for the seed (P10). Data only —
// consumed by generate.mjs, which validates every combo against the schema and
// the diet-compatibility rule (a combo's diet_type must be one every member dish
// is compatible with) before emitting SQL.
//
// MODEL: each combination is a single main lunch/dinner dish. The accompaniments
// it "goes with" (roti, dal, rice, raita, …) are NOT bundled as member dishes —
// they live on the dish as `pairings` in dishes.mjs and are surfaced to the user
// as the combo `description`. So a combination here has exactly ONE member dish
// (the main), and the picker card shows that main plus the "goes with" text.
//
// Active prep time on every main is kept under 60 min; advance soaking /
// fermentation is modelled as a dish prepTask (dishes.mjs), so the prep-aware
// engine still respects it.
//
// Factory args:
//   c(name, cuisine, diet, dishes, opts)
//   - diet   ∈ diet_type (vegetarian|vegan|eggetarian|non_vegetarian|jain|pescatarian)
//   - dishes: [dishName, roleInCombo]  (the single main; every name MUST exist in
//             dishes.mjs — the generator fails the build otherwise)
//   - opts: { region, description }

const c = (name, cuisine, diet, dishes, opts = {}) => ({
  name,
  cuisine,
  diet,
  dishes,
  region: opts.region ?? null,
  description: opts.description ?? null,
});

const main = (dishName) => [[dishName, "main"]];

export const COMBINATIONS = [
  c("Lauki Chana Dal", "North Indian", "vegan", main("Lauki Chana Dal"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Nenua Chana", "North Indian", "vegan", main("Nenua Chana"), {
    description:
      "Ridge gourd (tori) with chana dal. Goes with roti, dal and rice. Needs overnight soaking.",
  }),
  c("Aloo Gobi", "North Indian", "vegan", main("Aloo Gobi"), {
    description: "Goes with roti, dal and rice.",
  }),
  c(
    "Mixed Vegetable Curry",
    "North Indian",
    "vegan",
    main("Mixed Vegetable Curry"),
    { description: "Mix veg. Goes with roti, dal and rice." },
  ),
  c("Aloo Capsicum", "North Indian", "vegan", main("Aloo Capsicum"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Chole", "Punjabi", "vegan", main("Chole Masala"), {
    description: "Goes with roti and rice. Needs overnight soaking.",
  }),
  c("Rajma Masala", "North Indian", "vegetarian", main("Rajma Masala"), {
    description: "Goes with roti and rice. Needs overnight soaking.",
  }),
  c("Sambar", "South Indian", "vegan", main("Sambar"), {
    description:
      "Goes with idli, dosa, rice and chutney. Idli/dosa batter needs fermenting.",
  }),
  c("Matar Paneer", "North Indian", "vegetarian", main("Matar Paneer"), {
    description: "Goes with roti and rice.",
  }),
  c("Kadhai Paneer", "North Indian", "vegetarian", main("Kadhai Paneer"), {
    description: "Goes with roti and rice.",
  }),
  c("Aloo Baingan", "North Indian", "vegan", main("Aloo Baingan"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Palak Paneer", "North Indian", "vegetarian", main("Palak Paneer"), {
    description: "Goes with roti and rice.",
  }),
  c("Paneer Lababdar", "North Indian", "vegetarian", main("Paneer Lababdar"), {
    description: "Goes with roti or paratha, and rice.",
  }),
  c("Corn Spinach Rice", "North Indian", "vegan", main("Corn Spinach Rice"), {
    description: "Goes with raita.",
  }),
  c("Thecha Rice", "Maharashtrian", "vegan", main("Thecha Rice"), {
    description: "Goes with raita.",
  }),
  c("Pasta Arrabbiata", "Italian", "vegan", main("Pasta Arrabbiata"), {
    description: "Goes with garlic bread.",
  }),
  c("Kadhi Pakora", "North Indian", "vegetarian", main("Kadhi Pakora"), {
    description: "Goes with jeera aloo, roti and rice.",
  }),
  c("Bhindi Masala", "North Indian", "vegan", main("Bhindi Masala"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Aloo Beans", "North Indian", "vegan", main("Aloo Beans"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Aloo Methi", "North Indian", "vegan", main("Aloo Methi"), {
    description: "Goes with roti, dal and rice.",
  }),
  c("Thepla", "Gujarati", "vegetarian", main("Thepla"), {
    description: "Goes with aloo tamatar (or tea for breakfast).",
  }),
  c("Matar Ghugni", "North Indian", "vegan", main("Matar Ghugni"), {
    description: "Goes with roti and rice. Needs overnight soaking.",
  }),
  c("Paneer Bhurji", "North Indian", "vegetarian", main("Paneer Bhurji"), {
    description: "Goes with paratha.",
  }),
  c("Margherita Pizza", "Italian", "vegetarian", main("Margherita Pizza"), {
    description: "A classic margherita pizza — a meal on its own.",
  }),
  c("Khichdi", "North Indian", "vegetarian", main("Khichdi"), {
    description: "Goes with curd.",
  }),
  c("Aloo Tamatar", "North Indian", "vegan", main("Aloo Tamatar"), {
    description: "Goes with roti and rice.",
  }),
  c("Kala Chana Sabji", "North Indian", "vegan", main("Kala Chana Masala"), {
    description: "Goes with roti and rice. Needs overnight soaking.",
  }),

  // ── Breakfast options ────────────────────────────────────────────────────────
  // Each main is meal_slots ["breakfast"] (or includes breakfast), so the engine
  // only offers it at breakfast. Single-main combos, same as above.
  c("Poha", "Maharashtrian", "vegan", main("Poha"), {
    description: "Goes with tea.",
  }),
  c("Sevaiyan Upma", "Indian", "vegan", main("Sevaiyan Upma"), {
    description: "Roasted vermicelli upma with vegetables.",
  }),
  c("Upma", "South Indian", "vegan", main("Upma"), {
    description: "A soft semolina upma.",
  }),
  c("Chana Dal Paratha", "North Indian", "vegan", main("Chana Dal Paratha"), {
    description: "Paratha stuffed with spiced chana dal.",
  }),
  c("Paneer Paratha", "North Indian", "vegetarian", main("Paneer Paratha"), {
    description: "Paratha stuffed with spiced paneer.",
  }),
  c("Suji Uttapam", "South Indian", "vegetarian", main("Suji Uttapam"), {
    description: "An instant semolina uttapam topped with vegetables.",
  }),
  c("Uttapam", "South Indian", "vegan", main("Uttapam"), {
    description: "A savoury rice-and-lentil uttapam.",
  }),
  c("Besan Cheela", "North Indian", "vegan", main("Besan Cheela"), {
    description: "A savoury gram-flour pancake.",
  }),
  c("Aloo Sandwich", "Indian", "vegan", main("Aloo Sandwich"), {
    description: "A spiced mashed-potato sandwich.",
  }),
  c(
    "Paneer Corn Grilled Sandwich",
    "Indian",
    "vegetarian",
    main("Paneer Corn Grilled Sandwich"),
    { description: "Grilled sandwich with paneer and corn." },
  ),
  c("Dhokla", "Gujarati", "vegetarian", main("Dhokla"), {
    description: "Steamed savoury gram-flour cake.",
  }),
  c("Moong Dal Cheela", "North Indian", "vegan", main("Moong Dal Cheela"), {
    description: "A protein-rich moong dal pancake. Needs soaking.",
  }),
  c("Oats Cheela", "Indian", "vegan", main("Oats Cheela"), {
    description: "A savoury oats pancake.",
  }),
  c("Suji Idli Fry", "South Indian", "vegetarian", main("Suji Idli Fry"), {
    description: "Tempered, pan-fried semolina idli.",
  }),
  c("Boiled Chana Salad", "Indian", "vegan", main("Boiled Chana Salad"), {
    description: "A protein-rich boiled chana salad. Needs overnight soaking.",
  }),
  c("Bread Poha", "Indian", "vegan", main("Bread Poha"), {
    description: "A quick poha made with bread.",
  }),
  c("Bread Pizza", "Indian", "vegetarian", main("Bread Pizza"), {
    description: "Cheesy veggie bread pizza.",
  }),
  c("Aloo Paratha", "Punjabi", "vegetarian", main("Aloo Paratha"), {
    description: "Paratha stuffed with spiced potato.",
  }),
  c("Gobhi Paratha", "North Indian", "vegan", main("Gobhi Paratha"), {
    description: "Paratha stuffed with spiced cauliflower.",
  }),
  c("Egg Paratha", "North Indian", "eggetarian", main("Egg Paratha"), {
    description: "Paratha rolled with a spiced egg coating.",
  }),
];
