import { router } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, Switch, Text, View } from "react-native";

import type { BudgetPreference, DietType, MealSlot, SpiceLevel } from "@/api";
import { Button } from "@/components/Button";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { NumberField } from "@/components/NumberField";
import { SelectChips } from "@/components/SelectChips";
import { useActiveHousehold } from "@/household/use-household";
import { usePreferencesEditor } from "@/household/use-preferences";
import {
  BUDGET_OPTIONS,
  CUISINE_OPTIONS,
  DIET_TYPE_OPTIONS,
  MEAL_SLOT_OPTIONS,
  SPICE_LEVEL_OPTIONS,
} from "@/onboarding/options";

/**
 * Edit household preferences (M2-3, design/10 § 6). Reuses the onboarding option
 * lists + controls, gated by `can_edit_household_preferences` — a member without
 * it sees the values read-only. Saving re-reads the plan views, since diet /
 * cuisines / family size shift recommendations and grocery quantities.
 */
export default function PreferencesScreen() {
  const {
    household,
    isLoading: loadingHh,
    error: hhError,
  } = useActiveHousehold();

  if (loadingHh) return <LoadingState />;
  if (hhError || !household) {
    return <ErrorState message="Couldn't load your household." />;
  }
  return <PreferencesEditor householdId={household.householdId} />;
}

function PreferencesEditor({ householdId }: { householdId: string }) {
  const p = usePreferencesEditor(householdId);

  if (p.isLoading) return <LoadingState />;
  if (p.error)
    return (
      <ErrorState message="Couldn't load preferences." onRetry={p.refetch} />
    );
  if (p.prefsMissing) {
    return (
      <EmptyState
        title="Preferences not set up"
        hint="This household was created without going through setup. Complete onboarding to configure its preferences."
      />
    );
  }
  if (!p.form) return <LoadingState />;

  const { form, update, canEdit } = p;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="gap-6 p-5 pb-8">
        {p.saveError ? <ErrorBanner message={p.saveError} /> : null}
        {!canEdit ? (
          <View className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <Text className="text-sm text-gray-500">
              You don&apos;t have permission to edit these. Viewing only.
            </Text>
          </View>
        ) : null}

        <View
          pointerEvents={canEdit ? "auto" : "none"}
          style={{ opacity: canEdit ? 1 : 0.6 }}
          className="gap-6"
        >
          <Field label="Diet type">
            <SelectChips<DietType>
              options={DIET_TYPE_OPTIONS}
              selected={form.dietTypes}
              onChange={(dietTypes) => update({ dietTypes })}
            />
          </Field>

          <Field label="Preferred cuisines">
            <SelectChips
              options={CUISINE_OPTIONS}
              selected={form.preferredCuisines}
              onChange={(preferredCuisines) => update({ preferredCuisines })}
            />
          </Field>

          <Field label="Spice level">
            <SelectChips<SpiceLevel>
              options={SPICE_LEVEL_OPTIONS}
              selected={[form.spiceLevel]}
              onChange={(v) => v[0] && update({ spiceLevel: v[0] })}
              mode="single"
            />
          </Field>

          <Field label="Meals to plan">
            <SelectChips<MealSlot>
              options={MEAL_SLOT_OPTIONS}
              selected={form.mealsToPlan}
              onChange={(mealsToPlan) => update({ mealsToPlan })}
            />
          </Field>

          <NumberField
            label="Family size"
            value={form.familySize}
            onChange={(familySize) => update({ familySize })}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <NumberField
                label="Adults"
                value={form.adultsCount}
                onChange={(adultsCount) => update({ adultsCount })}
              />
            </View>
            <View className="flex-1">
              <NumberField
                label="Kids"
                value={form.kidsCount}
                onChange={(kidsCount) => update({ kidsCount })}
              />
            </View>
          </View>

          <NumberField
            label="Weekday cooking time"
            value={form.weekdayCookingTimeMinutes}
            onChange={(v) => update({ weekdayCookingTimeMinutes: v })}
            suffix="minutes"
          />
          <NumberField
            label="Weekend cooking time (optional)"
            value={form.weekendCookingTimeMinutes}
            onChange={(v) => update({ weekendCookingTimeMinutes: v })}
            suffix="minutes"
          />
          <NumberField
            label="Variety gap"
            value={form.varietyGapDays}
            onChange={(v) => update({ varietyGapDays: v })}
            suffix="days"
          />

          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">
              Allow leftovers
            </Text>
            <Switch
              value={form.allowLeftovers}
              onValueChange={(allowLeftovers) => update({ allowLeftovers })}
              trackColor={{ true: "#16a34a" }}
            />
          </View>

          <Field label="Budget">
            <SelectChips<BudgetPreference>
              options={BUDGET_OPTIONS}
              selected={[form.budgetPreference]}
              onChange={(v) => v[0] && update({ budgetPreference: v[0] })}
              mode="single"
            />
          </Field>
        </View>
      </ScrollView>

      {canEdit ? (
        <View className="border-t border-gray-100 bg-white px-5 pt-3 pb-5">
          <Button
            label="Save changes"
            loading={p.saving}
            disabled={!p.valid || p.saving}
            onPress={async () => {
              const result = await p.save();
              if (result) router.back();
            }}
          />
          {!p.valid ? (
            <Text className="mt-2 text-center text-xs text-gray-400">
              Diet, cuisines, meals, family size, and weekday cooking time are
              required.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-gray-700">{label}</Text>
      {children}
    </View>
  );
}
