import { Switch, Text, View } from "react-native";

import type { BudgetPreference, DietType, MealSlot, SpiceLevel } from "@/api";
import { NumberField } from "@/components/NumberField";
import { SelectChips } from "@/components/SelectChips";
import { TagInput } from "@/components/TagInput";
import { TextField } from "@/components/TextField";

import type { DraftData } from "./draft";
import {
  BUDGET_OPTIONS,
  CUISINE_OPTIONS,
  DIET_TYPE_OPTIONS,
  HEALTH_TAG_OPTIONS,
  MEAL_SLOT_OPTIONS,
  optionLabel,
  SPICE_LEVEL_OPTIONS,
} from "./options";

/**
 * The six wizard step bodies (design/06 § 2). Each is a controlled view over a
 * slice of the draft: it reads from `data` and merges field changes back through
 * `update`, which schedules the debounced autosave. Required-field labels carry a
 * green dot; everything else is optional and clearly marked.
 */

export interface StepProps {
  data: DraftData;
  update: (patch: Partial<DraftData>) => void;
}

function FieldLabel({
  children,
  required,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-sm font-medium text-gray-700">{children}</Text>
      {required ? (
        <View className="h-1.5 w-1.5 rounded-full bg-green-600" />
      ) : null}
    </View>
  );
}

// ───────────────────────────── Step 1: basics ─────────────────────────────

export function HouseholdBasicsStep({ data, update }: StepProps) {
  const basics = data.householdBasics ?? {};
  const set = (patch: Partial<typeof basics>) =>
    update({ householdBasics: { ...basics, ...patch } });

  return (
    <View className="gap-5">
      <TextField
        label="Household name"
        value={basics.name ?? ""}
        onChangeText={(name) => set({ name })}
        placeholder="e.g. The Suhane Household"
        autoCapitalize="words"
      />
      <NumberField
        label="Family size"
        value={basics.familySize}
        onChange={(familySize) => set({ familySize })}
        placeholder="How many people?"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <NumberField
            label="Adults"
            value={basics.adultsCount}
            onChange={(adultsCount) => set({ adultsCount })}
            placeholder="Optional"
          />
        </View>
        <View className="flex-1">
          <NumberField
            label="Kids"
            value={basics.kidsCount}
            onChange={(kidsCount) => set({ kidsCount })}
            placeholder="Optional"
          />
        </View>
      </View>
      <TextField
        label="City (optional)"
        value={basics.locationCity ?? ""}
        onChangeText={(locationCity) => set({ locationCity })}
        placeholder="e.g. Pune"
        autoCapitalize="words"
      />
    </View>
  );
}

// ────────────────────────── Step 2: food preferences ──────────────────────────

export function FoodPreferencesStep({ data, update }: StepProps) {
  const food = data.foodPreferences ?? {};
  const set = (patch: Partial<typeof food>) =>
    update({ foodPreferences: { ...food, ...patch } });

  return (
    <View className="gap-6">
      <View className="gap-2">
        <FieldLabel required>Diet type</FieldLabel>
        <Text className="text-sm text-gray-500">Choose one or more.</Text>
        <SelectChips<DietType>
          options={DIET_TYPE_OPTIONS}
          selected={food.dietTypes ?? []}
          onChange={(dietTypes) => set({ dietTypes })}
        />
      </View>

      <View className="gap-2">
        <FieldLabel required>Preferred cuisines</FieldLabel>
        <SelectChips
          options={CUISINE_OPTIONS}
          selected={food.preferredCuisines ?? []}
          onChange={(preferredCuisines) => set({ preferredCuisines })}
        />
      </View>

      <View className="gap-2">
        <FieldLabel>Spice level</FieldLabel>
        <SelectChips<SpiceLevel>
          options={SPICE_LEVEL_OPTIONS}
          selected={food.spiceLevel ? [food.spiceLevel] : []}
          onChange={(values) => set({ spiceLevel: values[0] })}
          mode="single"
        />
      </View>
    </View>
  );
}

// ────────────────────────── Step 3: meal schedule ──────────────────────────

export function MealScheduleStep({ data, update }: StepProps) {
  const schedule = data.mealSchedule ?? {};
  const set = (patch: Partial<typeof schedule>) =>
    update({ mealSchedule: { ...schedule, ...patch } });

  return (
    <View className="gap-6">
      <View className="gap-2">
        <FieldLabel required>Meals to plan</FieldLabel>
        <SelectChips<MealSlot>
          options={MEAL_SLOT_OPTIONS}
          selected={schedule.mealsToPlan ?? []}
          onChange={(mealsToPlan) => set({ mealsToPlan })}
        />
      </View>

      <View className="gap-1.5">
        <FieldLabel required>Weekday cooking time</FieldLabel>
        <NumberField
          label=""
          value={schedule.weekdayCookingTimeMinutes}
          onChange={(v) => set({ weekdayCookingTimeMinutes: v })}
          placeholder="e.g. 45"
          suffix="minutes"
        />
      </View>

      <NumberField
        label="Weekend cooking time (optional)"
        value={schedule.weekendCookingTimeMinutes}
        onChange={(v) => set({ weekendCookingTimeMinutes: v })}
        placeholder="Defaults to weekday"
        suffix="minutes"
      />

      <NumberField
        label="Variety gap (optional)"
        value={schedule.varietyGapDays}
        onChange={(v) => set({ varietyGapDays: v })}
        placeholder="Default 7"
        suffix="days"
      />

      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-sm font-medium text-gray-700">
            Allow leftovers
          </Text>
          <Text className="text-xs text-gray-400">
            Let a dish repeat as planned leftovers.
          </Text>
        </View>
        <Switch
          value={schedule.allowLeftovers ?? true}
          onValueChange={(allowLeftovers) => set({ allowLeftovers })}
          trackColor={{ true: "#16a34a" }}
        />
      </View>
    </View>
  );
}

// ────────────────────────── Step 4: allergies & health ──────────────────────────

export function AllergiesHealthStep({ data, update }: StepProps) {
  const health = data.allergiesHealth ?? {};
  const set = (patch: Partial<typeof health>) =>
    update({ allergiesHealth: { ...health, ...patch } });

  return (
    <View className="gap-6">
      <TagInput
        label="Allergies"
        values={health.allergies ?? []}
        onChange={(allergies) => set({ allergies })}
        placeholder="e.g. peanuts"
      />
      <TagInput
        label="Disliked ingredients"
        values={health.dislikedIngredients ?? []}
        onChange={(dislikedIngredients) => set({ dislikedIngredients })}
        placeholder="e.g. okra"
      />

      <View className="gap-2">
        <FieldLabel>Health preferences</FieldLabel>
        <SelectChips
          options={HEALTH_TAG_OPTIONS}
          selected={health.healthPreferenceTags ?? []}
          onChange={(healthPreferenceTags) => set({ healthPreferenceTags })}
        />
        {(health.healthPreferenceTags ?? []).length > 0 ? (
          <Text className="text-xs text-gray-400">
            These reflect dietary preferences, not medical advice. Consult a
            professional for medical guidance.
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <FieldLabel>Your spice preference</FieldLabel>
        <SelectChips<SpiceLevel>
          options={SPICE_LEVEL_OPTIONS}
          selected={health.spicePreference ? [health.spicePreference] : []}
          onChange={(values) => set({ spicePreference: values[0] })}
          mode="single"
        />
      </View>
    </View>
  );
}

// ────────────────────────── Step 5: budget ──────────────────────────

export function BudgetStep({ data, update }: StepProps) {
  const budget = data.budget ?? {};
  return (
    <View className="gap-2">
      <FieldLabel>Budget preference</FieldLabel>
      <SelectChips<BudgetPreference>
        options={BUDGET_OPTIONS}
        selected={budget.budgetPreference ? [budget.budgetPreference] : []}
        onChange={(values) =>
          update({ budget: { budgetPreference: values[0] } })
        }
        mode="single"
      />
    </View>
  );
}

// ────────────────────────── Step 6: review ──────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 border-b border-gray-100 py-3">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="flex-1 text-right text-base text-gray-900">{value}</Text>
    </View>
  );
}

export function ReviewStep({ data }: StepProps) {
  const basics = data.householdBasics ?? {};
  const food = data.foodPreferences ?? {};
  const schedule = data.mealSchedule ?? {};
  const health = data.allergiesHealth ?? {};
  const budget = data.budget ?? {};

  const dash = (s: string | undefined) => (s && s.length > 0 ? s : "—");
  const list = (
    options: Parameters<typeof optionLabel>[0],
    values: readonly string[] | undefined,
  ) =>
    values && values.length > 0
      ? values.map((v) => optionLabel(options, v)).join(", ")
      : "—";

  return (
    <View className="gap-6">
      <View>
        <Text className="mb-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Household
        </Text>
        <SummaryRow label="Name" value={dash(basics.name)} />
        <SummaryRow
          label="Family size"
          value={basics.familySize ? String(basics.familySize) : "—"}
        />
        {basics.locationCity ? (
          <SummaryRow label="City" value={basics.locationCity} />
        ) : null}
      </View>

      <View>
        <Text className="mb-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Food
        </Text>
        <SummaryRow
          label="Diet"
          value={list(DIET_TYPE_OPTIONS, food.dietTypes)}
        />
        <SummaryRow
          label="Cuisines"
          value={list(CUISINE_OPTIONS, food.preferredCuisines)}
        />
        <SummaryRow
          label="Spice"
          value={
            food.spiceLevel
              ? optionLabel(SPICE_LEVEL_OPTIONS, food.spiceLevel)
              : "—"
          }
        />
      </View>

      <View>
        <Text className="mb-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Schedule
        </Text>
        <SummaryRow
          label="Meals"
          value={list(MEAL_SLOT_OPTIONS, schedule.mealsToPlan)}
        />
        <SummaryRow
          label="Weekday cooking"
          value={
            schedule.weekdayCookingTimeMinutes
              ? `${schedule.weekdayCookingTimeMinutes} min`
              : "—"
          }
        />
        {schedule.weekendCookingTimeMinutes ? (
          <SummaryRow
            label="Weekend cooking"
            value={`${schedule.weekendCookingTimeMinutes} min`}
          />
        ) : null}
      </View>

      {health.allergies?.length ||
      health.dislikedIngredients?.length ||
      health.healthPreferenceTags?.length ||
      budget.budgetPreference ? (
        <View>
          <Text className="mb-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
            Extras
          </Text>
          {health.allergies?.length ? (
            <SummaryRow label="Allergies" value={health.allergies.join(", ")} />
          ) : null}
          {health.dislikedIngredients?.length ? (
            <SummaryRow
              label="Dislikes"
              value={health.dislikedIngredients.join(", ")}
            />
          ) : null}
          {health.healthPreferenceTags?.length ? (
            <SummaryRow
              label="Health"
              value={list(HEALTH_TAG_OPTIONS, health.healthPreferenceTags)}
            />
          ) : null}
          {budget.budgetPreference ? (
            <SummaryRow
              label="Budget"
              value={optionLabel(BUDGET_OPTIONS, budget.budgetPreference)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
