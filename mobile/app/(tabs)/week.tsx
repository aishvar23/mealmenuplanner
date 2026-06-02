import { RefreshControl, ScrollView, Text, View } from "react-native";

import type { HouseholdSummary, MealPlanItem, MealSlot } from "@/api";
import { Button } from "@/components/Button";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { useActiveHousehold } from "@/household/use-household";
import { addDays, formatDayLabel, isToday } from "@/lib/dates";
import { useWeekBoard } from "@/meal-plan/use-week";

/**
 * Week plan view (M1-6, design/10 § 6). An at-a-glance read of the next 7 days,
 * grouped by day; a caller with `can_change_weekly_schedule` can generate the
 * week. Per-meal edits happen on the Today board.
 */
export default function WeekScreen() {
  const { household, hasNoHousehold, isLoading, error, refetch } =
    useActiveHousehold();

  if (isLoading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState message="Couldn't load your household." onRetry={refetch} />
    );
  }
  if (hasNoHousehold || !household) {
    return (
      <EmptyState
        title="No household yet"
        hint="Set up your household to plan your week."
      />
    );
  }
  return <WeekBoard household={household} />;
}

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function WeekBoard({ household }: { household: HouseholdSummary }) {
  const board = useWeekBoard(household.householdId);

  if (board.isLoading) return <LoadingState />;
  if (board.error) {
    return (
      <ErrorState
        message="Couldn't load the weekly plan."
        onRetry={board.refetch}
      />
    );
  }

  // Seven calendar days from the range start, each with its planned items.
  const days = Array.from({ length: 7 }, (_, i) => addDays(board.startDate, i));
  const byDate = new Map<string, MealPlanItem[]>();
  for (const item of board.items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl
            refreshing={board.refreshing}
            onRefresh={board.refetch}
          />
        }
      >
        <Text className="text-2xl font-bold text-gray-900">This week</Text>

        {board.generateError ? (
          <ErrorBanner message={board.generateError} />
        ) : null}

        {!board.hasAnyPlanned ? (
          <View className="mt-10 items-center gap-4 px-4">
            <Text className="text-center text-lg font-semibold text-gray-900">
              No weekly plan yet
            </Text>
            <Text className="text-center text-base text-gray-500">
              {board.canChange
                ? "Generate a full week of meals from your preferences."
                : "No meals have been planned for this week."}
            </Text>
            {board.canChange ? (
              <View className="w-64">
                <Button
                  label="Generate this week"
                  loading={board.generating}
                  onPress={board.generateWeek}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {days.map((date) => (
              <DaySection
                key={date}
                date={date}
                items={byDate.get(date) ?? []}
              />
            ))}
            {board.canChange ? (
              <Button
                label="Regenerate week"
                variant="secondary"
                loading={board.generating}
                onPress={board.generateWeek}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DaySection({ date, items }: { date: string; items: MealPlanItem[] }) {
  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-center gap-2">
        <Text className="text-base font-semibold text-gray-900">
          {formatDayLabel(date)}
        </Text>
        {isToday(date) ? (
          <View className="rounded-full bg-green-100 px-2 py-0.5">
            <Text className="text-xs font-semibold text-green-700">Today</Text>
          </View>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text className="text-sm text-gray-400">No meals planned.</Text>
      ) : (
        items.map((item) => <MealRow key={item.mealPlanItemId} item={item} />)
      )}
    </View>
  );
}

function MealRow({ item }: { item: MealPlanItem }) {
  const label =
    item.status === "eating_out"
      ? `Eating out${item.eatingOutNote ? ` — ${item.eatingOutNote}` : ""}`
      : (item.dishName ?? "—");
  return (
    <View className="flex-row items-baseline gap-3">
      <Text className="w-20 text-sm font-medium text-gray-400">
        {SLOT_LABEL[item.mealSlot] ?? item.mealSlot}
      </Text>
      <Text className="flex-1 text-base text-gray-800">{label}</Text>
    </View>
  );
}
