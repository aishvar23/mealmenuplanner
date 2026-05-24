/**
 * Dish quality checklist (docs/06 § "Dish quality checklist", P3-8) — pure and
 * I/O-free so it is trivially unit-testable and shared by the activation guard
 * (server) and the editor UI (client preview).
 *
 * "A dish should not be activated unless it has: Name, Cuisine, Meal slot, Diet
 * type, Total time, Ingredients, at least one serving quantity, Prep tasks if
 * required, Tags, Status set to active."
 *
 * Mapping the spec to the actual schema (design/01 is the source of truth):
 *   • Name, Diet type — NOT NULL columns, but Name is still checked non-empty.
 *   • Cuisine — nullable `text`; required for activation.
 *   • Meal slot — at least one value in `meal_slots`.
 *   • Total time — `total_time_minutes` (= prep + cook, generated) > 0.
 *   • Ingredients + "at least one serving quantity" — at least one
 *     `dish_ingredients` row (each carries `quantity_per_serving > 0`, design/01),
 *     so the two spec items collapse into one checkable condition.
 *   • "Prep tasks if required" — conditional and not machine-decidable, so it is
 *     an ADVISORY (non-blocking) item the operator confirms by eye.
 *   • "Tags" — the schema models descriptors as boolean flags (kid_friendly,
 *     high_protein, …) rather than a free tag array; "at least one flag set" is
 *     an ADVISORY item.
 *   • "Status set to active" — the outcome of activation, not a precondition.
 */

/** The dish fields the checklist inspects (a subset of the dish DTO/row). */
export interface QualityInput {
  name: string;
  cuisine: string | null;
  mealSlots: string[];
  totalTimeMinutes: number | null;
  /** Number of `dish_ingredients` rows attached to the dish. */
  ingredientCount: number;
  /** Number of `dish_prep_tasks` rows (advisory). */
  prepTaskCount: number;
  /** Whether any descriptive boolean flag is set (advisory "tags"). */
  hasAnyTag: boolean;
}

/** One checklist line. `required` items gate activation; advisory ones don't. */
export interface QualityChecklistItem {
  id: string;
  label: string;
  satisfied: boolean;
  required: boolean;
}

/** The evaluated checklist + whether the dish may be activated. */
export interface QualityChecklist {
  items: QualityChecklistItem[];
  /** True iff every `required` item is satisfied. */
  canActivate: boolean;
  /** The labels of the unmet required items (for a `ValidationError`/UI list). */
  unmetRequired: string[];
}

/** Evaluate the activation quality checklist for a dish. */
export function evaluateQualityChecklist(
  input: QualityInput,
): QualityChecklist {
  const items: QualityChecklistItem[] = [
    {
      id: "name",
      label: "Has a name",
      satisfied: input.name.trim().length > 0,
      required: true,
    },
    {
      id: "cuisine",
      label: "Has a cuisine",
      satisfied: (input.cuisine ?? "").trim().length > 0,
      required: true,
    },
    {
      id: "mealSlots",
      label: "Has at least one meal slot",
      satisfied: input.mealSlots.length > 0,
      required: true,
    },
    {
      id: "totalTime",
      label: "Has a total time greater than zero",
      satisfied: (input.totalTimeMinutes ?? 0) > 0,
      required: true,
    },
    {
      id: "ingredients",
      label: "Has at least one ingredient with a serving quantity",
      satisfied: input.ingredientCount > 0,
      required: true,
    },
    {
      id: "prepTasks",
      label: "Advance-prep tasks added where required",
      satisfied: input.prepTaskCount > 0,
      required: false,
    },
    {
      id: "tags",
      label: "Has at least one descriptive tag",
      satisfied: input.hasAnyTag,
      required: false,
    },
  ];

  const unmetRequired = items
    .filter((item) => item.required && !item.satisfied)
    .map((item) => item.label);

  return { items, canActivate: unmetRequired.length === 0, unmetRequired };
}
