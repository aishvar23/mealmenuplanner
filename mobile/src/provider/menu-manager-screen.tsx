import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  activeCatalog,
  defaultCutoffIso,
  dishCountLabel,
  formatCutoffCountdown,
  isoToLocalDateTime,
  providerMenuStatusLabel,
  providerTodayDate,
  summarizeMenuIssues,
  validateMenuCompleteness,
  type CreateMenuDayInput,
  type MenuDayDto,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";

import { MenuBuilderForm } from "./menu-builder-form";
import { providerMenuStatusTextClass } from "./status-style";
import { useMenuManager } from "./use-menu-manager";

/**
 * Owner menu manager screen (MP-C-030, the mobile twin of the web menu page, spec
 * §13.3). Lists this week's menu days with status, cutoff + live countdown, and dish
 * count; lets the owner author a DRAFT via the structured builder and publish a
 * complete draft. Publishing is completeness-gated by the SHARED
 * `validateMenuCompleteness` (the #84 validator), mirroring the publish gate. Edit /
 * revision + customization authoring are the remainder of #22.
 */
export function MenuManagerScreen({ providerId }: { providerId: string }) {
  const { weeklyMenu, catalog, create, publish } = useMenuManager(providerId);
  const [building, setBuilding] = useState(false);

  // A minute-ticking clock so the countdown + publishable gate stay current.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (weeklyMenu.isLoading || catalog.isLoading) return <LoadingState />;
  if (weeklyMenu.error || catalog.error || !weeklyMenu.data || !catalog.data) {
    return (
      <ErrorState
        message="Couldn't load the menu."
        onRetry={() => {
          weeklyMenu.refetch();
          catalog.refetch();
        }}
      />
    );
  }

  const active = activeCatalog(catalog.data);
  const days = weeklyMenu.data;

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const defaultMenuDate = providerTodayDate(deviceTz, new Date(nowMs));
  const defaultCutoffLocal = isoToLocalDateTime(
    defaultCutoffIso(new Date(nowMs)),
  );

  async function onCreate(input: CreateMenuDayInput) {
    await create.mutateAsync(input);
    setBuilding(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">Weekly menu</Text>
          {active.length > 0 && !building ? (
            <Button label="New" onPress={() => setBuilding(true)} />
          ) : null}
        </View>

        {active.length === 0 ? (
          <View className="rounded-xl border border-gray-100 bg-white p-4">
            <EmptyState
              title="Add catalog items first"
              hint="Your menu is built from your catalog. Add dishes before building a day's menu."
            />
          </View>
        ) : null}

        {building ? (
          <MenuBuilderForm
            catalog={active}
            defaultMenuDate={defaultMenuDate}
            defaultCutoffLocal={defaultCutoffLocal}
            now={nowMs}
            submitting={create.isPending}
            error={create.error instanceof Error ? create.error.message : null}
            onSubmit={onCreate}
            onCancel={() => setBuilding(false)}
          />
        ) : null}

        {days.length === 0 && active.length > 0 && !building ? (
          <View className="rounded-xl border border-gray-100 bg-white p-4">
            <EmptyState
              title="No menu days this week yet"
              hint="Use “New” to author and publish a day's menu."
            />
          </View>
        ) : null}

        {days.map((day) => (
          <MenuDayCard
            key={day.menuDayId}
            day={day}
            nowMs={nowMs}
            publishing={
              publish.isPending && publish.variables === day.menuDayId
            }
            onPublish={() => publish.mutate(day.menuDayId)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuDayCard({
  day,
  nowMs,
  publishing,
  onPublish,
}: {
  day: MenuDayDto;
  nowMs: number;
  publishing: boolean;
  onPublish: () => void;
}) {
  const countdown = formatCutoffCountdown(day.cutoffAt, nowMs);
  const issues = validateMenuCompleteness(day, new Date(nowMs));
  const publishable = issues.length === 0;
  const isDraft = day.status === "draft";

  return (
    <View className="gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="font-medium text-gray-900">{day.menuDate}</Text>
        <Text
          className={`text-xs font-medium ${providerMenuStatusTextClass(day.status)}`}
        >
          {providerMenuStatusLabel(day.status)}
        </Text>
        {day.revision > 1 ? (
          <Text className="text-xs text-gray-500">Rev {day.revision}</Text>
        ) : null}
      </View>
      <Text className="text-sm text-gray-500">
        {dishCountLabel(day.components.length)}
      </Text>
      <Text
        className={`text-sm font-medium ${countdown.passed ? "text-gray-500" : "text-green-700"}`}
      >
        {countdown.label}
      </Text>
      {day.note ? (
        <Text className="text-sm text-gray-500">{day.note}</Text>
      ) : null}

      {isDraft ? (
        <View className="gap-2">
          {!publishable ? (
            <View className="gap-0.5">
              {summarizeMenuIssues(issues).map((message) => (
                <Text key={message} className="text-sm text-gray-500">
                  • {message}
                </Text>
              ))}
            </View>
          ) : null}
          <Button
            label={publishing ? "Publishing…" : "Publish"}
            onPress={onPublish}
            disabled={!publishable || publishing}
          />
        </View>
      ) : null}
    </View>
  );
}
