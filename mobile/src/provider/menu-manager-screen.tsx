import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  activeCatalog,
  defaultCutoffIso,
  dishCountLabel,
  emptyMenuBuilderState,
  formatCutoffCountdown,
  isMenuDayEditable,
  menuBuilderStateFromMenuDay,
  menuBuilderStateToCreateInput,
  menuBuilderStateToEditInput,
  providerMenuStatusLabel,
  providerTodayDate,
  summarizeMenuIssues,
  validateMenuCompleteness,
  type MenuBuilderState,
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
  const { weeklyMenu, catalog, create, publish, revise } =
    useMenuManager(providerId);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState<MenuDayDto | null>(null);

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
  const builderOpen = building || editing !== null;

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const initialState: MenuBuilderState = editing
    ? menuBuilderStateFromMenuDay(editing)
    : emptyMenuBuilderState(
        providerTodayDate(deviceTz, new Date(nowMs)),
        defaultCutoffIso(new Date(nowMs)),
      );
  // The active write for the open builder — revise when editing a day, else create.
  const saving = editing ? revise : create;

  function closeBuilder() {
    setBuilding(false);
    setEditing(null);
  }

  async function onSave(next: MenuBuilderState) {
    // Mirror the web form's submit: keep the builder open on failure (the error is
    // surfaced via the mutation's `error` in the builder) and never let the rejection
    // escape unhandled. Only close once the write actually lands.
    try {
      if (editing) {
        await revise.mutateAsync({
          menuDayId: editing.menuDayId,
          input: menuBuilderStateToEditInput(next),
        });
      } else {
        await create.mutateAsync(menuBuilderStateToCreateInput(next));
      }
      closeBuilder();
    } catch {
      // Error shown inline via the mutation's error; leave the builder open to retry.
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-4 p-5 pb-10">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">Weekly menu</Text>
          {active.length > 0 && !builderOpen ? (
            <Button
              label="New"
              onPress={() => {
                setEditing(null);
                setBuilding(true);
              }}
            />
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

        {builderOpen ? (
          <MenuBuilderForm
            catalog={active}
            mode={editing ? "edit" : "create"}
            initialState={initialState}
            showRevisionWarning={editing?.status === "published"}
            now={nowMs}
            submitting={saving.isPending}
            error={saving.error instanceof Error ? saving.error.message : null}
            onSubmit={onSave}
            onCancel={closeBuilder}
          />
        ) : null}

        {days.length === 0 && active.length > 0 && !builderOpen ? (
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
            editable={!builderOpen && isMenuDayEditable(day, nowMs)}
            onEdit={() => {
              setBuilding(false);
              setEditing(day);
            }}
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
  editable,
  onEdit,
}: {
  day: MenuDayDto;
  nowMs: number;
  publishing: boolean;
  onPublish: () => void;
  editable: boolean;
  onEdit: () => void;
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

      {isDraft && !publishable ? (
        <View className="gap-0.5">
          {summarizeMenuIssues(issues).map((message) => (
            <Text key={message} className="text-sm text-gray-500">
              • {message}
            </Text>
          ))}
        </View>
      ) : null}

      {isDraft || editable ? (
        <View className="gap-2">
          {isDraft ? (
            <Button
              label={publishing ? "Publishing…" : "Publish"}
              onPress={onPublish}
              disabled={!publishable || publishing}
            />
          ) : null}
          {editable ? (
            <Button label="Edit" variant="secondary" onPress={onEdit} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
