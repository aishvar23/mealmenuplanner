import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { mealPlanApi, type Alternative } from "@/api";

import { NutritionRow } from "./NutritionRow";
import { Sheet } from "./Sheet";

/**
 * Swap picker (M1-4, design/08 § 5). Loads the eligible replacement dishes for a
 * slot (`GET .../candidates`) and lets the user pick one; the parent calls
 * `replace`. Candidates are already hard-filtered server-side to the household's
 * chosen, prep-feasible dishes, so the list is safe to render verbatim. A
 * "needs advance prep" note flags prep-heavy dishes.
 */
export function SwapSheet({
  itemId,
  busy,
  onClose,
  onPick,
}: {
  /** The item being swapped, or null when the sheet is closed. */
  itemId: string | null;
  busy: boolean;
  onClose: () => void;
  onPick: (dishId: string) => void;
}) {
  const query = useQuery({
    queryKey: ["candidates", itemId],
    queryFn: () => mealPlanApi.slotCandidates(itemId!),
    enabled: itemId != null,
  });

  return (
    <Sheet
      visible={itemId != null}
      title="Pick a different dish"
      onClose={onClose}
    >
      {query.isLoading ? (
        <View className="h-40 items-center justify-center">
          <ActivityIndicator color="#16a34a" />
        </View>
      ) : query.isError ? (
        <Text className="text-base text-gray-600">
          Couldn&apos;t load options. Pull down and try again.
        </Text>
      ) : query.data && query.data.candidates.length > 0 ? (
        <ScrollView className="max-h-[60vh]">
          <View className="gap-2">
            {query.data.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.dishId}
                candidate={candidate}
                disabled={busy}
                onPress={() => onPick(candidate.dishId)}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text className="text-base text-gray-600">
          No other dishes are available for this slot right now.
        </Text>
      )}
    </Sheet>
  );
}

function CandidateRow({
  candidate,
  disabled,
  onPress,
}: {
  candidate: Alternative;
  disabled: boolean;
  onPress: () => void;
}) {
  const needsPrep = candidate.prepTasks.length > 0;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 active:bg-gray-50"
    >
      <Text className="text-base font-semibold text-gray-900">
        {candidate.dishName ?? "Dish"}
      </Text>
      {candidate.reason ? (
        <Text className="text-sm text-gray-500 italic">{candidate.reason}</Text>
      ) : null}
      <NutritionRow nutrition={candidate.nutrition} />
      {needsPrep ? (
        <View className="flex-row items-center gap-1">
          <Clock size={13} color="#d97706" />
          <Text className="text-xs font-medium text-amber-600">
            Needs advance prep
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
