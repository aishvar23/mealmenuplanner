import { Text, View } from "react-native";

import type { DishNutrition } from "@/api";

/**
 * Compact per-serving nutrition chips (P11). Estimates, display-only — never a
 * medical claim (CLAUDE.md). Renders nothing when there's no data, and skips any
 * individually-missing macro rather than showing a zero.
 */
export function NutritionRow({
  nutrition,
}: {
  nutrition: DishNutrition | null;
}) {
  if (!nutrition) return null;

  const chips: string[] = [];
  if (nutrition.calories != null)
    chips.push(`${Math.round(nutrition.calories)} kcal`);
  if (nutrition.proteinG != null)
    chips.push(`${Math.round(nutrition.proteinG)}g protein`);
  if (nutrition.carbsG != null)
    chips.push(`${Math.round(nutrition.carbsG)}g carbs`);
  if (nutrition.fatG != null) chips.push(`${Math.round(nutrition.fatG)}g fat`);

  if (chips.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {chips.map((chip) => (
        <View key={chip} className="rounded-full bg-gray-100 px-2.5 py-1">
          <Text className="text-xs font-medium text-gray-600">{chip}</Text>
        </View>
      ))}
    </View>
  );
}
