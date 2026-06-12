import {
  providerMembershipLabel,
  type ProviderSummaryDto,
} from "@mmp/shared/provider";
import { useRouter } from "expo-router";
import { ChevronRight, Plus, Store } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";
import { useProviders } from "@/provider/use-providers";
import { useWorkspaceSwitch } from "@/provider/use-workspace-switch";
import { providerWorkspaceTarget } from "@/provider/workspace-routes";

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
  const router = useRouter();

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
      <View className="flex-1 bg-gray-50">
        <EmptyState
          title="No meal providers yet"
          hint="When you join a meal provider, it shows up here. Run your own kitchen? Set one up."
        />
        <View className="px-5 pb-8">
          <Button
            label="Set up a meal provider"
            icon={<Plus color="#ffffff" size={18} />}
            onPress={() => router.push("/provider-onboarding")}
          />
        </View>
      </View>
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
              onPress={() => void switchTo(providerWorkspaceTarget(p))}
            />
          ))}
        </View>
        <Button
          label="Set up a meal provider"
          variant="secondary"
          icon={<Plus color="#16a34a" size={18} />}
          onPress={() => router.push("/provider-onboarding")}
        />
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
          {providerMembershipLabel(provider.role, provider.membershipStatus)}
        </Text>
      </View>
      <ChevronRight color="#9ca3af" size={20} />
    </Pressable>
  );
}
