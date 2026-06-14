import { useRouter, type Href } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  isResponseReadOnly,
  PROVIDER_RESPONSE_STATUS_LABELS,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner, LoadingState } from "@/components/Feedback";

import { providerStatusTextClass } from "./status-style";
import { useTodayResponse } from "./use-today-response";

/**
 * Member response recap (MP-C-041, the mobile twin of the web "Your response"
 * page): a read-only status summary of today's order with a CTA back to Today's
 * Menu, where the order is actually confirmed / updated / cancelled. Keeping the
 * interactive controls on one screen (Today) avoids two diverging response forms.
 */
export function ResponsesRecapScreen({ providerId }: { providerId: string }) {
  const router = useRouter();
  const { menu, response, isLoading, error } = useTodayResponse(providerId);

  if (isLoading) return <LoadingState />;

  if (error || !menu || !response) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
        <View className="p-5">
          {error ? (
            <ErrorBanner message="Couldn't load your response." />
          ) : (
            <Text className="text-base text-gray-600">
              When your provider publishes today&rsquo;s menu, your response
              status will show here.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Read-only includes the cutoff (not just the lock sweep, which may lag), so the CTA
  // never promises an edit the Today screen will then refuse.
  const locked = isResponseReadOnly(menu, response, new Date());

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <View>
          <Text className="text-2xl font-bold text-gray-900">
            Your response
          </Text>
          <Text className="text-sm text-gray-500">
            Today&rsquo;s menu · {menu.menuDate}
          </Text>
        </View>

        <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">Status</Text>
            <Text
              className={`text-sm font-semibold ${providerStatusTextClass(response.status)}`}
            >
              {PROVIDER_RESPONSE_STATUS_LABELS[response.status]}
            </Text>
          </View>
          {response.memberNote ? (
            <Text className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Your note: {response.memberNote}
            </Text>
          ) : null}
          <Button
            label={locked ? "View today's menu" : "Review & respond"}
            onPress={() =>
              router.push(`/(provider-member)/${providerId}/today` as Href)
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
