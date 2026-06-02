import { Check } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { GroceryItem, HouseholdSummary } from "@/api";
import { Button } from "@/components/Button";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { useGrocery } from "@/grocery/use-grocery";
import { useActiveHousehold } from "@/household/use-household";

/**
 * Grocery list (M1-7, design/10 § 6). Shows the current plan's list grouped by
 * aisle/category, lets a `can_manage_grocery_list` member check items off (with
 * an optimistic toggle) and regenerate the list. Built from the active plan,
 * resolved server-side.
 */
export default function GroceryScreen() {
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
        hint="Set up your household to build a grocery list."
      />
    );
  }
  return <GroceryView household={household} />;
}

function GroceryView({ household }: { household: HouseholdSummary }) {
  const grocery = useGrocery(household.householdId);

  if (grocery.isLoading) return <LoadingState />;
  if (grocery.error) {
    return (
      <ErrorState
        message="Couldn't load your grocery list."
        onRetry={grocery.refetch}
      />
    );
  }

  // No active plan to build a list from.
  if (!grocery.plan) {
    return (
      <EmptyState
        title="No plan yet"
        hint="Generate a meal plan on the Today or Week tab — your grocery list is built from it."
      />
    );
  }

  // Plan exists but no list generated yet.
  if (!grocery.list) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-8">
        {grocery.actionError ? (
          <ErrorBanner message={grocery.actionError} />
        ) : null}
        <Text className="text-center text-lg font-semibold text-gray-900">
          No grocery list yet
        </Text>
        <Text className="text-center text-base text-gray-500">
          Build a grocery list from your current plan.
        </Text>
        {grocery.canManage ? (
          <View className="w-64">
            <Button
              label="Generate grocery list"
              loading={grocery.regenerating}
              onPress={() => grocery.regenerate(grocery.plan!.mealPlanId)}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const items = grocery.list.items;
  const checkedCount = items.filter((i) => i.checked).length;
  const groups = groupByCategory(items);

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={grocery.refetch} />
        }
      >
        <View>
          <Text className="text-2xl font-bold text-gray-900">Grocery list</Text>
          <Text className="text-base text-gray-500">
            {checkedCount} of {items.length} checked off
          </Text>
        </View>

        {grocery.actionError ? (
          <ErrorBanner message={grocery.actionError} />
        ) : null}

        {groups.map(([category, rows]) => (
          <View
            key={category}
            className="gap-1 rounded-2xl border border-gray-200 bg-white p-4"
          >
            <Text className="mb-1 text-sm font-semibold tracking-wide text-gray-400 uppercase">
              {category}
            </Text>
            {rows.map((item) => (
              <GroceryRow
                key={item.groceryListItemId}
                item={item}
                disabled={!grocery.canManage}
                onToggle={() =>
                  grocery.setChecked(item.groceryListItemId, !item.checked)
                }
              />
            ))}
          </View>
        ))}

        {grocery.canManage ? (
          <Button
            label="Regenerate list"
            variant="secondary"
            loading={grocery.regenerating}
            onPress={() => grocery.regenerate(grocery.plan!.mealPlanId)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function GroceryRow({
  item,
  disabled,
  onToggle,
}: {
  item: GroceryItem;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.checked, disabled }}
      accessibilityLabel={item.name}
      disabled={disabled}
      onPress={onToggle}
      className="flex-row items-center gap-3 py-2"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-md border ${item.checked ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"}`}
      >
        {item.checked ? <Check size={16} color="#ffffff" /> : null}
      </View>
      <Text
        className={`flex-1 text-base ${item.checked ? "text-gray-400 line-through" : "text-gray-900"}`}
      >
        {item.name}
      </Text>
      <Text className="text-sm text-gray-500">
        {formatQty(item.quantity)} {item.unit}
      </Text>
    </Pressable>
  );
}

/** Group items by category, preserving the server's category-then-name order. */
function groupByCategory(items: GroceryItem[]): [string, GroceryItem[]][] {
  const groups = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return [...groups.entries()];
}

/** Trim trailing zeros so 1.0 → "1" and 1.5 → "1.5". */
function formatQty(qty: number): string {
  return Number.isInteger(qty) ? `${qty}` : `${parseFloat(qty.toFixed(2))}`;
}
