import type { LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

/**
 * Placeholder body for a provider screen whose feature lands in a later
 * checkpoint (MP-C-011/012 stand up the shells + nav at CP2; the dashboard, menu,
 * members, responses, preparation, etc. fill these in across CP3–CP5). Keeping
 * every nav target rendered now means the shell is fully navigable and testable,
 * and each later item replaces the matching screen. Mirrors the web
 * `ProviderComingSoon`.
 */
export function ProviderComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-gray-50 px-8">
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-green-50">
        <Icon color="#16a34a" size={24} />
      </View>
      <Text className="text-center text-xl font-semibold text-gray-900">
        {title}
      </Text>
      <Text className="mt-2 text-center text-base text-gray-500">
        {description}
      </Text>
    </View>
  );
}
