/**
 * `admin` service DTOs — the snake_case-row → camelCase-payload translation for
 * the operator console (design/04 § 1, "the translation boundary"; docs/06).
 * Pure mappers, no I/O, so the service layer produces client-ready DTOs and the
 * route handler just serializes them.
 *
 * Enum **values** pass through unchanged — they are data, not naming convention
 * (design/04 § 1).
 */

import type { Database } from "@/lib/db/database.types";

import type { QualityChecklist } from "./quality-checklist";

type DishRow = Database["public"]["Tables"]["dishes"]["Row"];
type IngredientRow = Database["public"]["Tables"]["ingredients"]["Row"];
type DishIngredientRow =
  Database["public"]["Tables"]["dish_ingredients"]["Row"];
type DishPrepTaskRow = Database["public"]["Tables"]["dish_prep_tasks"]["Row"];
type DishPairingRow = Database["public"]["Tables"]["dish_pairings"]["Row"];

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type DifficultyLevel = Database["public"]["Enums"]["difficulty_level"];
type DishStatus = Database["public"]["Enums"]["dish_status"];
type ImageStatus = Database["public"]["Enums"]["image_status"];
type PairingType = Database["public"]["Enums"]["pairing_type"];

// ───────────────────────────────── dishes ─────────────────────────────────

/** A dish as the operator console sees it (the full `dishes` row, design/01). */
export interface DishDto {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  region: string | null;
  mealSlots: string[];
  dietType: DietType;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  /** Stored-generated `prep + cook` (design/01); read-only. */
  totalTimeMinutes: number | null;
  difficulty: DifficultyLevel;
  spiceLevel: SpiceLevel;
  kidFriendly: boolean;
  lunchboxFriendly: boolean;
  leftoverFriendly: boolean;
  batchCookFriendly: boolean;
  diabeticFriendly: boolean;
  lowSodium: boolean;
  highProtein: boolean;
  lowCarb: boolean;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
  imageVerified: boolean;
  status: DishStatus;
  createdAt: string;
  updatedAt: string;
}

/** Map a `dishes` row to its camelCase DTO. */
export function toDishDto(row: DishRow): DishDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cuisine: row.cuisine,
    region: row.region,
    mealSlots: row.meal_slots,
    dietType: row.diet_type,
    prepTimeMinutes: row.prep_time_minutes,
    cookTimeMinutes: row.cook_time_minutes,
    totalTimeMinutes: row.total_time_minutes,
    difficulty: row.difficulty,
    spiceLevel: row.spice_level,
    kidFriendly: row.kid_friendly,
    lunchboxFriendly: row.lunchbox_friendly,
    leftoverFriendly: row.leftover_friendly,
    batchCookFriendly: row.batch_cook_friendly,
    diabeticFriendly: row.diabetic_friendly,
    lowSodium: row.low_sodium,
    highProtein: row.high_protein,
    lowCarb: row.low_carb,
    imageUrl: row.image_url,
    imageAltText: row.image_alt_text,
    imageStatus: row.image_status,
    imageVerified: row.image_verified,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────── ingredients ───────────────────────────────

/**
 * An ingredient as the operator console sees it. The `dishes`/`ingredients`
 * schema (design/01) has no `substitutes` column — docs/06 lists it, but the
 * data model is the source of truth, so it is intentionally absent.
 */
export interface IngredientDto {
  id: string;
  name: string;
  category: string;
  defaultUnit: string;
  commonNames: string[];
  allergenType: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  imageStatus: ImageStatus;
  imageVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Map an `ingredients` row to its camelCase DTO. */
export function toIngredientDto(row: IngredientRow): IngredientDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    defaultUnit: row.default_unit,
    commonNames: row.common_names,
    allergenType: row.allergen_type,
    imageUrl: row.image_url,
    imageAltText: row.image_alt_text,
    imageStatus: row.image_status,
    imageVerified: row.image_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ───────────────────────────── dish ingredients ─────────────────────────────

/** A dish↔ingredient link with the ingredient name resolved for display. */
export interface DishIngredientDto {
  id: string;
  ingredientId: string;
  /** Resolved from the joined `ingredients.name`; null if it could not load. */
  ingredientName: string | null;
  quantityPerServing: number;
  unit: string;
  isRequired: boolean;
  isOptional: boolean;
}

/**
 * Map a `dish_ingredients` row + the resolved ingredient name to its DTO. The
 * name is passed in (resolved by the service) rather than embedded so the
 * mapper stays a pure row translation.
 */
export function toDishIngredientDto(
  row: DishIngredientRow,
  ingredientName: string | null,
): DishIngredientDto {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    ingredientName,
    quantityPerServing: row.quantity_per_serving,
    unit: row.unit,
    isRequired: row.is_required,
    isOptional: row.is_optional,
  };
}

// ─────────────────────────────── prep tasks ───────────────────────────────

/** A dish prep task (e.g. "soak chickpeas 480 min ahead", docs/06). */
export interface PrepTaskDto {
  id: string;
  taskName: string;
  requiredBeforeMinutes: number;
  description: string | null;
}

/** Map a `dish_prep_tasks` row to its DTO. */
export function toPrepTaskDto(row: DishPrepTaskRow): PrepTaskDto {
  return {
    id: row.id,
    taskName: row.task_name,
    requiredBeforeMinutes: row.required_before_minutes,
    description: row.description,
  };
}

// ──────────────────────────────── pairings ────────────────────────────────

/** A directional dish pairing (primary → paired) of one type (design/01). */
export interface PairingDto {
  id: string;
  pairedDishId: string;
  /** Resolved from the paired dish's `name`; null if it could not load. */
  pairedDishName: string | null;
  pairingType: PairingType;
}

/** Map a `dish_pairings` row + the resolved paired-dish name to its DTO. */
export function toPairingDto(
  row: DishPairingRow,
  pairedDishName: string | null,
): PairingDto {
  return {
    id: row.id,
    pairedDishId: row.paired_dish_id,
    pairedDishName,
    pairingType: row.pairing_type,
  };
}

// ─────────────────────────────── dish detail ───────────────────────────────

/**
 * A dish plus its composed sub-resources and the activation quality checklist —
 * what the editor screen loads (`GET /api/admin/dishes/{dishId}`, P3-3/8). Lives
 * here (a pure, client-safe module) so the client editor can import it as a type.
 */
export interface DishDetailDto extends DishDto {
  ingredients: DishIngredientDto[];
  prepTasks: PrepTaskDto[];
  pairings: PairingDto[];
  qualityChecklist: QualityChecklist;
}
