import { Text, View } from "react-native";

/**
 * Shared placeholder body for the tab screens scaffolded in M0. Each is replaced
 * by its real implementation in M1 (Today / Week / Grocery) and M2 (Household /
 * More) — this keeps the navigation shell navigable in the meantime.
 */
export function PlaceholderScreen({
  title,
  task,
}: {
  title: string;
  task: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-white px-8">
      <Text className="text-xl font-semibold text-gray-900">{title}</Text>
      <Text className="mt-2 text-center text-base text-gray-500">
        Coming in {task}.
      </Text>
    </View>
  );
}
