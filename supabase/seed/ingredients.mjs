// Ingredient catalog for the seed (P0-14). Data only — consumed by generate.mjs.
//
// Categories use the canonical set the grocery UI groups by
// (lib/grocery/labels.ts CATEGORY_ORDER): vegetables, fruits, dairy, grains,
// lentils, spices, eggs_meat, pantry.
//
// `allergen` populates ingredients.allergen_type, matched WHOLE-WORD by the
// recommendation allergy filter (lib/recommendation/text-match.ts) against name,
// common names, and allergen type. So "peanut" must appear as a common name on
// "Peanuts" (the term "peanut" does NOT match "peanuts" — trailing 's').
//
// `meatKind` is VALIDATION-ONLY (never written to the DB). The generator uses it
// to enforce diet coherence: veg/vegan/jain dishes carry no eggs_meat ingredient,
// eggetarian only egg, pescatarian only fish/shellfish/egg.
//   meatKind ∈ 'egg' | 'poultry' | 'redmeat' | 'fish' | 'shellfish'
//
// `dairy` + `eggs_meat` are the engine's nonVeganCategories; the nonVeganTerms
// set (milk/paneer/ghee/curd/egg/honey/…) is also caught by the generator, so a
// vegan dish must avoid both.

const i = (
  name,
  category,
  unit,
  common = [],
  allergen = null,
  meatKind = null,
) => ({
  name,
  category,
  unit,
  common,
  allergen,
  meatKind,
});

export const INGREDIENTS = [
  // ── Vegetables ─────────────────────────────────────────────────────────────
  i("Onion", "vegetables", "g", ["pyaaz"]),
  i("Tomato", "vegetables", "g", ["tamatar"]),
  i("Potato", "vegetables", "g", ["aloo"]),
  i("Garlic", "vegetables", "g", ["lehsun"]),
  i("Ginger", "vegetables", "g", ["adrak"]),
  i("Green Chili", "vegetables", "g", ["hari mirch"]),
  i("Spinach", "vegetables", "g", ["palak"]),
  i("Fenugreek Leaves", "vegetables", "g", ["methi"]),
  i("Cauliflower", "vegetables", "g", ["gobi"]),
  i("Cabbage", "vegetables", "g", ["patta gobi"]),
  i("Carrot", "vegetables", "g", ["gajar"]),
  i("Green Peas", "vegetables", "g", ["matar"]),
  i("Capsicum", "vegetables", "g", ["bell pepper", "shimla mirch"]),
  i("Bottle Gourd", "vegetables", "g", ["lauki", "dudhi"]),
  i("Okra", "vegetables", "g", ["bhindi", "ladyfinger"]),
  i("Eggplant", "vegetables", "g", ["brinjal", "baingan"]),
  i("Bitter Gourd", "vegetables", "g", ["karela"]),
  i("Pumpkin", "vegetables", "g", ["kaddu"]),
  i("French Beans", "vegetables", "g", ["beans"]),
  i("Cucumber", "vegetables", "g", ["kheera"]),
  i("Mushroom", "vegetables", "g", ["khumb"]),
  i("Drumstick", "vegetables", "g", ["moringa"]),
  i("Raw Banana", "vegetables", "g", ["kacha kela", "plantain"]),
  i("Spring Onion", "vegetables", "g", ["scallion"]),
  i("Coriander Leaves", "vegetables", "g", ["cilantro", "dhania patta"]),
  i("Mint Leaves", "vegetables", "g", ["pudina"]),
  i("Sweet Corn", "vegetables", "g", ["corn", "makka"]),
  i("Colocasia", "vegetables", "g", ["arbi"]),
  i("Radish", "vegetables", "g", ["mooli"]),

  // ── Fruits ─────────────────────────────────────────────────────────────────
  i("Lemon", "fruits", "piece", ["nimbu", "lime"]),
  i("Raw Mango", "fruits", "g", ["kacha aam"]),
  i("Banana", "fruits", "piece", ["kela"]),
  i("Pineapple", "fruits", "g", ["ananas"]),
  i("Pomegranate", "fruits", "g", ["anaar"]),
  i("Mango", "fruits", "g", ["aam"]),
  i("Apple", "fruits", "piece", ["seb"]),

  // ── Dairy (non-vegan) ────────────────────────────────────────────────────��─
  i("Milk", "dairy", "ml", ["doodh"], "dairy"),
  i("Paneer", "dairy", "g", ["cottage cheese"], "dairy"),
  i("Yogurt", "dairy", "g", ["curd", "dahi"], "dairy"),
  i("Butter", "dairy", "g", ["makhan"], "dairy"),
  i("Ghee", "dairy", "g", ["clarified butter"], "dairy"),
  i("Fresh Cream", "dairy", "ml", ["malai", "cream"], "dairy"),
  i("Cheese", "dairy", "g", ["mozzarella"], "dairy"),
  i("Khoya", "dairy", "g", ["mawa"], "dairy"),
  i("Buttermilk", "dairy", "ml", ["chaas"], "dairy"),
  i("Condensed Milk", "dairy", "ml", ["milkmaid"], "dairy"),

  // ── Grains ───────────────────────────────────────────────────────────────��─
  i("Rice", "grains", "g", ["chawal"]),
  i("Basmati Rice", "grains", "g", ["long grain rice"]),
  i("Idli Rice", "grains", "g", ["parboiled rice"]),
  i("Wheat Flour", "grains", "g", ["atta"], "gluten"),
  i("Refined Flour", "grains", "g", ["maida"], "gluten"),
  i("Semolina", "grains", "g", ["rava", "sooji"], "gluten"),
  i("Vermicelli", "grains", "g", ["sevai"], "gluten"),
  i("Bread", "grains", "slice", ["loaf"], "gluten"),
  i("Pav", "grains", "piece", ["bread roll", "bun"], "gluten"),
  i("Pasta", "grains", "g", ["penne", "macaroni"], "gluten"),
  i("Noodles", "grains", "g", ["hakka noodles"], "gluten"),
  i("Gram Flour", "grains", "g", ["besan"]),
  i("Rice Flour", "grains", "g", ["chawal atta"]),
  i("Cornflour", "grains", "g", ["corn starch"]),
  i("Flattened Rice", "grains", "g", ["poha"]),
  i("Puffed Rice", "grains", "g", ["murmura", "kurmura"]),
  i("Oats", "grains", "g", ["rolled oats"]),
  i("Quinoa", "grains", "g", []),
  i("Pearl Millet", "grains", "g", ["bajra"]),
  i("Sorghum", "grains", "g", ["jowar"]),

  // ── Lentils & legumes ────────────────────────────────────────────────────��─
  i("Toor Dal", "lentils", "g", ["arhar", "pigeon pea"]),
  i("Moong Dal", "lentils", "g", ["yellow moong", "split mung"]),
  i("Whole Moong", "lentils", "g", ["green gram"]),
  i("Masoor Dal", "lentils", "g", ["red lentil"]),
  i("Urad Dal", "lentils", "g", ["black gram"]),
  i("Chana Dal", "lentils", "g", ["split bengal gram"]),
  i("Chickpeas", "lentils", "g", ["kabuli chana", "garbanzo"]),
  i("Black Chickpeas", "lentils", "g", ["kala chana"]),
  i("Kidney Beans", "lentils", "g", ["rajma"]),
  i("Black-eyed Peas", "lentils", "g", ["lobia", "chawli"]),
  i("Moong Sprouts", "lentils", "g", ["sprouts"]),

  // ── Spices ───────────────────────────────────────────────────────────────��─
  i("Turmeric", "spices", "tsp", ["haldi"]),
  i("Red Chili Powder", "spices", "tsp", ["lal mirch"]),
  i("Cumin Seeds", "spices", "tsp", ["jeera"]),
  i("Coriander Powder", "spices", "tsp", ["dhania powder"]),
  i("Garam Masala", "spices", "tsp", []),
  i("Mustard Seeds", "spices", "tsp", ["rai"]),
  i("Asafoetida", "spices", "pinch", ["hing"]),
  i("Curry Leaves", "spices", "g", ["kadi patta"]),
  i("Bay Leaf", "spices", "piece", ["tej patta"]),
  i("Cinnamon", "spices", "piece", ["dalchini"]),
  i("Green Cardamom", "spices", "piece", ["elaichi"]),
  i("Cloves", "spices", "piece", ["laung"]),
  i("Black Pepper", "spices", "tsp", ["kali mirch"]),
  i("Fenugreek Seeds", "spices", "tsp", ["methi dana"]),
  i("Fennel Seeds", "spices", "tsp", ["saunf"]),
  i("Carom Seeds", "spices", "tsp", ["ajwain"]),
  i("Dried Red Chili", "spices", "piece", ["sookhi lal mirch"]),
  i("Kasuri Methi", "spices", "tsp", ["dried fenugreek"]),
  i("Chaat Masala", "spices", "tsp", []),
  i("Sambar Powder", "spices", "tsp", []),
  i("Rasam Powder", "spices", "tsp", []),
  i("Pav Bhaji Masala", "spices", "tsp", []),
  i("Tandoori Masala", "spices", "tsp", []),
  i("Saffron", "spices", "pinch", ["kesar"]),

  // ── Eggs & meat (non-vegan; meatKind drives diet validation) ─────────────────
  i("Egg", "eggs_meat", "piece", ["anda"], "egg", "egg"),
  i("Chicken", "eggs_meat", "g", ["murgh"], null, "poultry"),
  i("Mutton", "eggs_meat", "g", ["goat meat", "lamb"], null, "redmeat"),
  i("Fish", "eggs_meat", "g", ["machli"], "fish", "fish"),
  i("Pomfret", "eggs_meat", "g", ["paplet"], "fish", "fish"),
  i("Prawns", "eggs_meat", "g", ["shrimp", "jhinga"], "shellfish", "shellfish"),

  // ── Pantry staples ─────────────────────────────────────────────────────────
  i("Salt", "pantry", "tsp", ["namak"]),
  i("Black Salt", "pantry", "tsp", ["kala namak"]),
  i("Sugar", "pantry", "tsp", ["cheeni"]),
  i("Jaggery", "pantry", "g", ["gur"]),
  i("Cooking Oil", "pantry", "tbsp", ["oil", "vegetable oil", "sunflower oil"]),
  i("Mustard Oil", "pantry", "tbsp", ["sarson ka tel"]),
  i("Coconut Oil", "pantry", "tbsp", []),
  i("Tamarind", "pantry", "g", ["imli"]),
  i("Coconut Milk", "pantry", "ml", []),
  i("Grated Coconut", "pantry", "g", ["nariyal", "coconut"]),
  i("Cashews", "pantry", "g", ["kaju", "cashew"], "tree nuts"),
  i("Almonds", "pantry", "g", ["badam", "almond"], "tree nuts"),
  i("Peanuts", "pantry", "g", ["groundnut", "mungphali", "peanut"], "peanut"),
  i("Sesame Seeds", "pantry", "tsp", ["til"], "sesame"),
  i("Soy Sauce", "pantry", "tbsp", [], "soy"),
  i("Tofu", "pantry", "g", ["soya", "soybean"], "soy"),
  i("Vinegar", "pantry", "tbsp", []),
  i("Tomato Ketchup", "pantry", "tbsp", []),
  i("Baking Soda", "pantry", "tsp", ["eno", "fruit salt"]),
  i("Honey", "pantry", "tbsp", ["shahad"]),
  i("Raisins", "pantry", "g", ["kishmish"]),
  i("Sago", "pantry", "g", ["sabudana", "tapioca pearls"]),
  i("Tea Leaves", "pantry", "tsp", ["chai patti"]),
  i("Poppy Seeds", "pantry", "tsp", ["khus khus"]),
];
