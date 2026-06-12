import { Clock } from "lucide-react-native";
import { Text, View } from "react-native";

/**
 * Awaiting-approval holding screen (MP-C-012, the mobile twin of the web
 * awaiting-approval page, spec §14.4). Where a customer who has accepted an invite
 * but not yet been approved lands — they see the provider's name (identity reads
 * are granted to awaiting members) but no menu data and no menu navigation.
 */
export function AwaitingApprovalScreen({
  providerName,
}: {
  providerName: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-gray-50 px-8">
      <View className="mb-4 size-12 items-center justify-center rounded-full bg-green-50">
        <Clock color="#16a34a" size={24} />
      </View>
      <Text className="text-center text-xl font-semibold text-gray-900">
        Awaiting approval
      </Text>
      <Text className="mt-2 text-center text-base text-gray-500">
        You&apos;ve joined {providerName}. The provider needs to approve your
        membership before you can see the menu and place orders. We&apos;ll let
        you know once you&apos;re in.
      </Text>
    </View>
  );
}
