import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/Button";
import { ErrorBanner, ErrorState, LoadingState } from "@/components/Feedback";
import { TagInput } from "@/components/TagInput";
import { useActiveHousehold } from "@/household/use-household";
import { useFoodPreferences } from "@/household/use-preferences";

/**
 * Edit my food preferences (M2-3, design/10 § 6) — the dish names the household
 * likes, which feed the engine's liked-dish bonus. Self-write (no permission
 * flag); saving re-reads the plan views since suggestions can shift.
 */
export default function FoodPreferencesScreen() {
  const { household, isLoading, error } = useActiveHousehold();

  if (isLoading) return <LoadingState />;
  if (error || !household) {
    return <ErrorState message="Couldn't load your household." />;
  }
  return <FoodPreferencesEditor householdId={household.householdId} />;
}

function FoodPreferencesEditor({ householdId }: { householdId: string }) {
  const f = useFoodPreferences(householdId);

  if (f.isLoading) return <LoadingState />;
  if (f.error) {
    return (
      <ErrorState message="Couldn't load your dishes." onRetry={f.refetch} />
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-4 p-5"
        keyboardShouldPersistTaps="handled"
      >
        {f.saveError ? <ErrorBanner message={f.saveError} /> : null}
        <Text className="text-base text-gray-500">
          Add dishes your household loves. We&apos;ll give them a nudge in your
          suggestions.
        </Text>
        <TagInput
          label="Liked dishes"
          values={f.likedDishes}
          onChange={f.setLikedDishes}
          placeholder="e.g. Rajma Chawal"
        />
      </ScrollView>

      <View className="border-t border-gray-100 bg-white px-5 pt-3 pb-5">
        <Button
          label="Save"
          loading={f.saving}
          onPress={async () => {
            const result = await f.save();
            if (result) router.back();
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
