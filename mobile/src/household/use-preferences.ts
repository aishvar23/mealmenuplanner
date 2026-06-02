import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  getHousehold,
  getMyFoodPreferences,
  isApiError,
  updateMyFoodPreferences as updateFoodApi,
  updatePreferences as updatePreferencesApi,
  type BudgetPreference,
  type DietType,
  type HouseholdPreferences,
  type MealSlot,
  type PreferencesPatch,
  type SpiceLevel,
} from "@/api";

/**
 * Household-preferences + member-food-preferences editors (M2-3, design/10 § 6).
 * Both load their current values, hold a local editable copy, and save through
 * the corresponding `PATCH`. A preferences change can shift recommendations and
 * grocery quantities, so saves invalidate the plan views alongside the read.
 */

/** The editable preference form — the full set the PATCH accepts. */
export interface PrefsForm {
  familySize: number | undefined;
  adultsCount: number | undefined;
  kidsCount: number | undefined;
  dietTypes: DietType[];
  preferredCuisines: string[];
  spiceLevel: SpiceLevel;
  weekdayCookingTimeMinutes: number | undefined;
  weekendCookingTimeMinutes: number | undefined;
  mealsToPlan: MealSlot[];
  varietyGapDays: number | undefined;
  allowLeftovers: boolean;
  budgetPreference: BudgetPreference;
}

function toForm(p: HouseholdPreferences): PrefsForm {
  return {
    familySize: p.familySize,
    adultsCount: p.adultsCount,
    kidsCount: p.kidsCount,
    dietTypes: p.dietTypes,
    preferredCuisines: p.preferredCuisines,
    spiceLevel: p.spiceLevel,
    weekdayCookingTimeMinutes: p.weekdayCookingTimeMinutes ?? undefined,
    weekendCookingTimeMinutes: p.weekendCookingTimeMinutes ?? undefined,
    mealsToPlan: p.mealsToPlan,
    varietyGapDays: p.varietyGapDays,
    allowLeftovers: p.allowLeftovers,
    budgetPreference: p.budgetPreference,
  };
}

function toPatch(f: PrefsForm): PreferencesPatch {
  return {
    familySize: f.familySize,
    adultsCount: f.adultsCount,
    kidsCount: f.kidsCount,
    dietTypes: f.dietTypes,
    preferredCuisines: f.preferredCuisines,
    spiceLevel: f.spiceLevel,
    weekdayCookingTimeMinutes: f.weekdayCookingTimeMinutes ?? null,
    weekendCookingTimeMinutes: f.weekendCookingTimeMinutes ?? null,
    mealsToPlan: f.mealsToPlan,
    varietyGapDays: f.varietyGapDays,
    allowLeftovers: f.allowLeftovers,
    budgetPreference: f.budgetPreference,
  };
}

export function usePreferencesEditor(householdId: string) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PrefsForm | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHousehold(householdId),
    staleTime: 5 * 60_000,
  });

  const prefs = householdQuery.data?.preferences ?? null;
  const canEdit =
    householdQuery.data?.currentUserPermissions.canEditHouseholdPreferences ??
    false;

  // Seed the form once the preferences load (and re-seed if they change underneath).
  useEffect(() => {
    if (prefs && form === null) setForm(toForm(prefs));
  }, [prefs, form]);

  const save = useMutation({
    mutationFn: (f: PrefsForm) => updatePreferencesApi(householdId, toPatch(f)),
    onSuccess: async () => {
      setSaveError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["household", householdId] }),
        qc.invalidateQueries({ queryKey: ["dayPlan", householdId] }),
        qc.invalidateQueries({ queryKey: ["weekPlan", householdId] }),
        qc.invalidateQueries({ queryKey: ["grocery", householdId] }),
      ]);
    },
    onError: (e) => setSaveError(errorMessage(e)),
  });

  // Required fields must stay populated for the PATCH to validate.
  const valid =
    !!form &&
    form.dietTypes.length > 0 &&
    form.preferredCuisines.length > 0 &&
    form.mealsToPlan.length > 0 &&
    typeof form.familySize === "number" &&
    typeof form.weekdayCookingTimeMinutes === "number";

  return {
    form,
    update: (patch: Partial<PrefsForm>) =>
      setForm((prev) => (prev ? { ...prev, ...patch } : prev)),
    canEdit,
    prefsMissing: householdQuery.isSuccess && prefs === null,
    isLoading: householdQuery.isLoading,
    error: householdQuery.error,
    valid,
    saving: save.isPending,
    saveError,
    save: () => {
      if (form && valid) return save.mutateAsync(form);
      return Promise.resolve(null);
    },
    refetch: () => void householdQuery.refetch(),
  };
}

export function useFoodPreferences(householdId: string) {
  const qc = useQueryClient();
  const [likedDishes, setLikedDishes] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["foodPreferences", householdId],
    queryFn: () => getMyFoodPreferences(householdId),
  });

  useEffect(() => {
    if (query.data && likedDishes === null)
      setLikedDishes(query.data.likedDishes);
  }, [query.data, likedDishes]);

  const save = useMutation({
    mutationFn: (dishes: string[]) => updateFoodApi(householdId, dishes),
    onSuccess: async () => {
      setSaveError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["foodPreferences", householdId] }),
        // Liked dishes feed the engine's soft bonus, so today's suggestions shift.
        qc.invalidateQueries({ queryKey: ["dayPlan", householdId] }),
        qc.invalidateQueries({ queryKey: ["weekPlan", householdId] }),
      ]);
    },
    onError: (e) => setSaveError(errorMessage(e)),
  });

  return {
    likedDishes: likedDishes ?? [],
    setLikedDishes: (dishes: string[]) => setLikedDishes(dishes),
    isLoading: query.isLoading,
    error: query.error,
    saving: save.isPending,
    saveError,
    save: () => {
      if (likedDishes) return save.mutateAsync(likedDishes);
      return Promise.resolve(null);
    },
    refetch: () => void query.refetch(),
  };
}

function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Something went wrong. Please try again.";
}
