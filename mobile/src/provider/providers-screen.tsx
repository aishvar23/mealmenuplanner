import { ChevronRight, Store } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import type {
  ProviderMembershipStatus,
  ProviderSummaryDto,
} from "@mmp/shared/provider";

import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { useProviders } from "@/provider/use-providers";
import { useWorkspaceSwitch } from "@/provider/use-workspace-switch";
import { providerWorkspaceRoute } from "@/provider/workspace-routes";

/**
 * Meal-provider workspace entry (MP-C-010 + MP-C-011/012, the mobile twin of the
 * web `/workspace` chooser). Lists the providers the caller belongs to, discovered
 * through the shared `useProviders` hook against the live `GET /api/providers`.
 * Reached from the More tab — a member-of-no-provider household user sees the
 * empty state. With the provider shells landed (#18), each row now enters the
 * right shell (owner / member / awaiting-approval), recording the active-workspace
 * pointer first via `useWorkspaceSwitch`.
 */
export default function ProvidersScreen() {
  const { data, isLoading, isError, refetch } = useProviders();
  const { switchTo, pending } = useWorkspaceSwitch();

  if (isLoading) return <LoadingState />;
  if (isError) {
    return (
      <ErrorState
        message="We couldn't load your providers. Please try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const providers = data ?? [];
  if (providers.length === 0) {
    return (
      <EmptyState
        title="No meal providers yet"
        hint="When you join a meal provider, it shows up here."
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="gap-3 p-4">
        <Text className="px-1 text-sm text-gray-500">
          The meal providers you belong to.
        </Text>
        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {providers.map((p, i) => (
            <ProviderRow
              key={p.providerId}
              provider={p}
              isLast={i === providers.length - 1}
              disabled={pending}
              onPress={() =>
                void switchTo({
                  type:
                    p.role === "owner" ? "provider_owner" : "provider_customer",
                  id: p.providerId,
                  route: providerWorkspaceRoute(p),
                })
              }
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ProviderRow({
  provider,
  isLast,
  disabled,
  onPress,
}: {
  provider: ProviderSummaryDto;
  isLast: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${isLast ? "" : "border-b border-gray-100"} ${disabled ? "opacity-60" : ""}`}
    >
      <View className="size-10 items-center justify-center rounded-lg bg-green-50">
        <Store color="#16a34a" size={20} />
      </View>
      <View className="flex-1">
        <Text className="text-base text-gray-900">{provider.name}</Text>
        <Text className="text-sm text-gray-500">
          {membershipLabel(provider.role, provider.membershipStatus)}
        </Text>
      </View>
      <ChevronRight color="#9ca3af" size={20} />
    </Pressable>
  );
}

/** The caller's standing with a provider, for the row subtitle. */
function membershipLabel(
  role: ProviderSummaryDto["role"],
  status: ProviderMembershipStatus,
): string {
  if (role === "owner") return "Owner";
  return status === "active" ? "Subscriber" : "Awaiting approval";
}
