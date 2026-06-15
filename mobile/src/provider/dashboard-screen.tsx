import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatCutoffCountdown,
  providerMenuStatusLabel,
  type ProviderDashboardDto,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/Feedback";

import { providerMenuStatusTextClass } from "./status-style";
import { useDashboard } from "./use-dashboard";

/**
 * Owner Dashboard screen (MP-C-060, the mobile twin of the web dashboard page, spec
 * §13.2). Reads the composed day-at-a-glance summary and renders the same cards as web —
 * today's menu state + a live cutoff countdown, and (once cutoff has processed) the
 * response census with batch + email status. Shares no code with the web UI: same
 * `/api/*` route, same `@mmp/shared/provider` contracts.
 */
export function DashboardScreen({ providerId }: { providerId: string }) {
  const { data, isLoading, error, refetch } = useDashboard(providerId);

  if (isLoading) return <LoadingState />;
  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
        <View className="p-5">
          <ErrorBanner message="Couldn't load the dashboard." />
          <Button label="Retry" variant="secondary" onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <Text className="text-2xl font-bold text-gray-900">Dashboard</Text>
        <Text className="-mt-2 text-sm text-gray-500">{data.providerName}</Text>
        <TodayCard dashboard={data} />
        {data.today ? (
          <ResponsesCard dashboard={data} providerId={providerId} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A readable cutoff date+time in the provider's timezone (falls back to raw ISO). */
function formatCutoff(cutoffAtIso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(cutoffAtIso));
  } catch {
    return cutoffAtIso;
  }
}

function TodayCard({ dashboard }: { dashboard: ProviderDashboardDto }) {
  const { today, timezone } = dashboard;

  // Re-tick the countdown each minute, like the web dashboard.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-base font-semibold text-gray-900">
        Today&apos;s menu
      </Text>
      {today ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-medium text-gray-900">{today.menuDate}</Text>
            <Text
              className={`text-xs font-medium ${providerMenuStatusTextClass(today.status)}`}
            >
              {providerMenuStatusLabel(today.status)}
            </Text>
            <Text className="text-xs text-gray-500">
              {today.componentCount}{" "}
              {today.componentCount === 1 ? "dish" : "dishes"}
            </Text>
          </View>
          <Text className="text-sm text-gray-600">
            Cutoff {formatCutoff(today.cutoffAt, timezone)}
          </Text>
          <Text
            className={`text-sm font-medium ${
              formatCutoffCountdown(today.cutoffAt, nowMs).passed
                ? "text-gray-500"
                : "text-green-700"
            }`}
          >
            {formatCutoffCountdown(today.cutoffAt, nowMs).label}
          </Text>
        </View>
      ) : (
        <Text className="text-sm text-gray-500">
          No menu is published for today.
        </Text>
      )}
    </View>
  );
}

function ResponsesCard({
  dashboard,
  providerId,
}: {
  dashboard: ProviderDashboardDto;
  providerId: string;
}) {
  const router = useRouter();
  const { batch } = dashboard;

  if (!batch) {
    return (
      <View className="gap-2 rounded-xl border border-gray-100 bg-white p-4">
        <Text className="text-base font-semibold text-gray-900">Responses</Text>
        <EmptyState
          title="No counts yet"
          hint="Members can still respond until the cutoff. Once it passes, the cooking quantities are aggregated here."
        />
      </View>
    );
  }

  const cells: { label: string; value: number }[] = [
    { label: "Confirmed", value: batch.totals.confirmed },
    { label: "Auto-accepted", value: batch.totals.autoAccepted },
    { label: "Cancelled", value: batch.totals.cancelled },
    { label: "No response", value: batch.totals.noResponse },
  ];

  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-base font-semibold text-gray-900">Responses</Text>
      <View className="flex-row flex-wrap gap-3">
        {cells.map((c) => (
          <View key={c.label} className="w-[45%] gap-0.5">
            <Text className="text-xs text-gray-500">{c.label}</Text>
            <Text className="text-xl font-semibold text-gray-900">
              {c.value}
            </Text>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          className={`text-xs font-medium ${batch.status === "current" ? "text-green-700" : "text-gray-500"}`}
        >
          {batch.status === "current" ? "Current" : "Stale"}
        </Text>
        <Text
          className={`text-xs font-medium ${batch.emailStatus === "sent" ? "text-green-700" : "text-gray-500"}`}
        >
          {batch.emailStatus === "sent" ? "Email sent" : "Email not sent"}
        </Text>
      </View>
      <Button
        label="View preparation"
        variant="secondary"
        onPress={() =>
          router.navigate(`/(provider-owner)/${providerId}/preparation` as Href)
        }
      />
    </View>
  );
}
