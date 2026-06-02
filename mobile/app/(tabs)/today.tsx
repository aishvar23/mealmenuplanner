import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import type { HouseholdSummary } from "@/api";
import { Button } from "@/components/Button";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { MealCard } from "@/components/MealCard";
import { RejectSheet } from "@/components/RejectSheet";
import { SwapSheet } from "@/components/SwapSheet";
import { useActiveHousehold } from "@/household/use-household";
import { formatDayLabel } from "@/lib/dates";
import { useTodayBoard } from "@/meal-plan/use-today";

/**
 * Today board (M1-3/4/5, design/10 § 6). Resolves the active household, then
 * renders the day's slots with generate / accept / reject / swap / suggest-
 * another / lock / eating-out / cooked. Read-only for a member without
 * `can_change_today_menu`.
 */
export default function TodayScreen() {
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
        hint="Finish setting up your household to start planning meals. Onboarding lands on mobile in M2 — for now, complete it on the web."
      />
    );
  }
  return <TodayBoard household={household} />;
}

function TodayBoard({ household }: { household: HouseholdSummary }) {
  const board = useTodayBoard(household.householdId);
  const [rejectItemId, setRejectItemId] = useState<string | null>(null);
  const [swapItemId, setSwapItemId] = useState<string | null>(null);

  if (board.isLoading) return <LoadingState />;
  if (board.error) {
    return (
      <ErrorState
        message="Couldn't load today's plan."
        onRetry={board.refetch}
      />
    );
  }

  const items = board.items ?? [];
  const canGenerate = board.canChange && board.missingSlots.length > 0;

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
        <View>
          <Text className="text-2xl font-bold text-gray-900">Today</Text>
          <Text className="text-base text-gray-500">
            {formatDayLabel(board.date)}
          </Text>
        </View>

        {board.actionError ? <ErrorBanner message={board.actionError} /> : null}

        {!board.hasAnyPlanned ? (
          <View className="mt-10 items-center gap-4 px-4">
            <Text className="text-center text-lg font-semibold text-gray-900">
              Nothing planned yet
            </Text>
            <Text className="text-center text-base text-gray-500">
              {canGenerate
                ? "Generate today's meals from your household preferences."
                : board.canChange
                  ? "Choose which meals to plan in your household preferences (on the web for now) to start generating meals."
                  : "No meals have been planned for today."}
            </Text>
            {canGenerate ? (
              <View className="w-64">
                <Button
                  label={`Generate ${board.missingSlots.length} meal${board.missingSlots.length > 1 ? "s" : ""}`}
                  loading={board.generating}
                  onPress={board.generateMissing}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {items.map((item) => (
              <MealCard
                key={item.mealPlanItemId}
                item={item}
                canChange={board.canChange}
                busy={board.busyItemId === item.mealPlanItemId}
                callbacks={{
                  onAccept: () => board.accept(item.mealPlanItemId),
                  onReject: () => setRejectItemId(item.mealPlanItemId),
                  onSwap: () => setSwapItemId(item.mealPlanItemId),
                  onSuggestAnother: () =>
                    board.suggestAnother(item.mealPlanItemId),
                  onToggleLock: () => board.toggleLock(item),
                  onEatingOut: () => board.eatingOut(item.mealPlanItemId),
                  onCooked: () => board.cooked(item.mealPlanItemId),
                }}
              />
            ))}

            {canGenerate ? (
              <Button
                label={`Plan ${board.missingSlots.length} more meal${board.missingSlots.length > 1 ? "s" : ""}`}
                variant="secondary"
                loading={board.generating}
                onPress={board.generateMissing}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      <RejectSheet
        visible={rejectItemId != null}
        busy={board.busyItemId === rejectItemId}
        onClose={() => setRejectItemId(null)}
        onSubmit={(feedbackType, reason) => {
          if (rejectItemId) board.reject(rejectItemId, feedbackType, reason);
          setRejectItemId(null);
        }}
      />

      <SwapSheet
        itemId={swapItemId}
        busy={board.busyItemId === swapItemId}
        onClose={() => setSwapItemId(null)}
        onPick={(dishId) => {
          if (swapItemId) board.replace(swapItemId, dishId);
          setSwapItemId(null);
        }}
      />
    </View>
  );
}
