import { Pressable, Text, View } from "react-native";

import { formatSaveStatus } from "@/onboarding/save-status";
import type { SaveState } from "@/onboarding/use-onboarding";

/**
 * The wizard header (design/06 § 5): step title + subtitle, a completion progress
 * bar (from the minimum required set), the step counter, and the autosave status
 * line. The status line is the actionable retry control when a save failed.
 */
export function OnboardingHeader({
  title,
  subtitle,
  stepIndex,
  totalSteps,
  completionPercentage,
  save,
  onRetrySave,
}: {
  title: string;
  subtitle: string;
  stepIndex: number;
  totalSteps: number;
  completionPercentage: number;
  save: SaveState;
  onRetrySave: () => void;
}) {
  const status = formatSaveStatus(save);

  return (
    <View className="gap-3 border-b border-gray-100 bg-white px-5 pt-2 pb-4">
      <View className="h-2 overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full bg-green-600"
          style={{ width: `${completionPercentage}%` }}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium tracking-wide text-gray-400 uppercase">
          Step {stepIndex + 1} of {totalSteps}
        </Text>
        {status ? (
          status.isError ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetrySave}
              hitSlop={6}
            >
              <Text className="text-xs font-semibold text-red-600">
                {status.text}
              </Text>
            </Pressable>
          ) : (
            <Text className="text-xs text-gray-400">{status.text}</Text>
          )
        ) : null}
      </View>

      <View>
        <Text className="text-2xl font-bold text-gray-900">{title}</Text>
        <Text className="mt-1 text-base text-gray-500">{subtitle}</Text>
      </View>
    </View>
  );
}
