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
  c(
    "Corn Spinach Rice",
    "North Indian",
    "vegetarian",
    main("Corn Spinach Rice"),
    {
      description: "Goes with raita.",
    },
  ),
  c("Thecha Rice", "Maharashtrian", "vegetarian", main("Thecha Rice"), {
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

  // ── Dietician weight-loss plan meal options (P12) ───────────────────────────
  // Each recreates a meal-slot option from the dietician's weight-loss plans:
  // one light main, with its accompaniments described in the "goes with" text.

  // Breakfasts.
  c(
    "Sprouts Sandwich Breakfast",
    "North Indian",
    "vegan",
    main("Sprouts Sandwich"),
    {
      description: "A grilled moong-sprouts sandwich. Goes with green chutney.",
    },
  ),
  c(
    "Berry Granola Breakfast",
    "Continental",
    "vegetarian",
    main("Berry Granola Bowl"),
    {
      description: "Greek-yogurt granola bowl with berries and a little honey.",
    },
  ),
  c(
    "Paneer Sandwich Breakfast",
    "North Indian",
    "vegetarian",
    main("Paneer Sandwich"),
    {
      description: "A whole-grain paneer sandwich. Goes with green chutney.",
    },
  ),
  c(
    "Masala Oats Breakfast",
    "North Indian",
    "vegetarian",
    main("Homemade Masala Oats"),
    {
      description: "Savoury vegetable oats. Goes with a glass of buttermilk.",
    },
  ),
  c("Oats Upma Breakfast", "South Indian", "vegan", main("Oats Upma"), {
    description: "Oats upma. Goes with a bowl of boiled moong.",
  }),

  // Lunches.
  c("Lobia Curry Meal", "North Indian", "vegetarian", main("Lobia Curry"), {
    description:
      "Black-eyed pea curry. Goes with sattu paratha and a bowl of low-fat curd. Needs overnight soaking.",
  }),
  c("Varan Bhaat", "Maharashtrian", "vegetarian", main("Moong Dal Varan"), {
    description:
      "Plain moong dal with ghee. Goes with rice and capsicum sabji.",
  }),
  c(
    "Paneer Kofta Meal",
    "North Indian",
    "vegetarian",
    main("Steamed Paneer Kofta"),
    {
      description: "Steamed paneer koftas in gravy. Goes with rice and curd.",
    },
  ),
  c("Khichdi Kadhi", "North Indian", "vegetarian", main("Moong Dal Khichdi"), {
    description:
      "Moong dal khichdi. Goes with kadhi and a tomato-cucumber salad.",
  }),
  c(
    "Masoor Dal Chawal",
    "North Indian",
    "vegetarian",
    main("Dhuli Masoor Dal"),
    {
      description:
        "Split red-lentil dal. Goes with rice and a glass of buttermilk.",
    },
  ),
  c(
    "Masala Daliya Bowl",
    "North Indian",
    "vegetarian",
    main("Moong Dal Daliya"),
    {
      description:
        "Broken-wheat and moong dal daliya. Goes with vegetable raita.",
    },
  ),
  c(
    "Tomato Sprouts Rice Bowl",
    "South Indian",
    "vegetarian",
    main("Tomato Sprouts Rice"),
    {
      description: "Tomato rice with moong sprouts. Goes with a bowl of curd.",
    },
  ),
  c(
    "Paneer Kathi Roll Meal",
    "North Indian",
    "vegetarian",
    main("Paneer Tikka Kathi Roll"),
    {
      description:
        "A whole-wheat paneer-tikka roll — a wholesome one-hand lunch.",
    },
  ),
  c("Rajma with Barley", "North Indian", "vegetarian", main("Rajma Masala"), {
    description:
      "Rajma curry. Goes with boiled barley and mixed-vegetable raita. Needs overnight soaking.",
  }),
  c(
    "Mexican Bean Wrap Meal",
    "Mexican",
    "vegetarian",
    main("Mexican Bean Wrap"),
    {
      description: "A rajma-stuffed wrap. Goes with a bowl of carrot soup.",
    },
  ),
  c(
    "Green Gram Dal Thali",
    "North Indian",
    "vegetarian",
    main("Green Gram Dal"),
    {
      description:
        "Whole green-gram dal. Goes with brown rice and mixed-vegetable raita.",
    },
  ),
  c("Matki Usal Meal", "Maharashtrian", "vegan", main("Matki Curry"), {
    description:
      "Sprouted moth-bean usal. Goes with multigrain roti and a fresh salad. Needs sprouting.",
  }),
  c(
    "Brown Rice Pulao Meal",
    "North Indian",
    "vegetarian",
    main("Brown Rice Pulao"),
    {
      description: "Vegetable brown-rice pulao. Goes with kadhi.",
    },
  ),
  c(
    "Paneer Sweet Corn Roti",
    "North Indian",
    "vegetarian",
    main("Paneer Sweet Corn Sabji"),
    {
      description: "Paneer and sweet-corn sabji. Goes with multigrain roti.",
    },
  ),

  // Dinners.
  c(
    "Carrot Pumpkin Soup Dinner",
    "Continental",
    "vegan",
    main("Carrot Pumpkin Lentil Soup"),
    {
      description:
        "A protein-rich carrot-pumpkin lentil soup — a light one-bowl dinner.",
    },
  ),
  c("Rajma Salad Bowl", "North Indian", "vegetarian", main("Rajma Salad"), {
    description:
      "A boiled-rajma salad. Goes with a bowl of curd. Needs overnight soaking.",
  }),
  c(
    "Paneer Tomato Salad Dinner",
    "North Indian",
    "vegetarian",
    main("Paneer Tomato Salad"),
    {
      description: "A light high-protein paneer-and-tomato salad.",
    },
  ),
  c("Moong Dosa & Chutney", "South Indian", "vegan", main("Moong Dal Dosa"), {
    description: "Protein moong dal dosa. Goes with tomato chutney.",
  }),
  c(
    "Lauki Soup Dinner",
    "North Indian",
    "vegan",
    main("Bottle Gourd Tomato Soup"),
    {
      description:
        "A very light lauki-tomato soup. Goes with a boiled-moong salad.",
    },
  ),
  c(
    "Spinach Soup & Cheela",
    "Continental",
    "vegan",
    main("Spinach Carrot Soup"),
    {
      description: "Spinach-carrot soup. Goes with a moong dal cheela.",
    },
  ),
  c(
    "Methi Moong Dal Meal",
    "North Indian",
    "vegan",
    main("Moong Dal with Methi"),
    {
      description: "Moong dal with fenugreek. Goes with boiled barley.",
    },
  ),
  c(
    "Quinoa Khichdi Bowl",
    "North Indian",
    "vegetarian",
    main("Quinoa Moong Dal Khichdi"),
    {
      description:
        "Quinoa-moong khichdi. Goes with sautéed mushrooms and pudina raita.",
    },
  ),
  c("Pesarattu & Dal Soup", "South Indian", "vegan", main("Pesarattu"), {
    description: "Andhra green-gram dosa. Goes with a bowl of dal soup.",
  }),
  c("Kerala Veg Stew", "South Indian", "vegetarian", main("Vegetable Stew"), {
    description: "A coconut-milk vegetable stew — a light, soupy dinner.",
  }),
  c(
    "Quinoa Lentil Khichdi Bowl",
    "North Indian",
    "vegetarian",
    main("Quinoa Lentil Khichdi"),
    {
      description: "Quinoa-and-lentil khichdi. Goes with grilled paneer.",
    },
  ),
  c(
    "Paneer & Barley Soup",
    "North Indian",
    "vegetarian",
    main("Sauteed Paneer Onions and Capsicum"),
    {
      description:
        "Sautéed paneer with capsicum. Goes with a bowl of barley dal soup.",
    },
  ),
  c("Grilled Veg & Soup", "Continental", "vegan", main("Grilled Vegetables"), {
    description: "Char-grilled vegetables. Goes with a bowl of carrot soup.",
  }),
];
