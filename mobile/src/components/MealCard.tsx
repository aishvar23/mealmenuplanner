import {
  Check,
  Flame,
  Lock,
  RefreshCw,
  Shuffle,
  Store,
  Unlock,
  Utensils,
  X,
} from "lucide-react-native";
import { type ComponentType } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import type { MealPlanItem, MealSlot } from "@/api";

import { NutritionRow } from "./NutritionRow";

/**
 * One meal slot on the Today board (M1-3/4/5). Renders the planned dish (image,
 * name, the engine's explainable reason, package sides, nutrition) and the
 * action bar — accept / reject / swap / suggest-another / lock / eating-out /
 * cooked. All mutations live in the parent; this is presentational and calls back.
 *
 * Actions only render when `canChange` (the caller's `can_change_today_menu`);
 * a viewer without permission sees the plan read-only.
 */

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export interface MealCardCallbacks {
  onAccept: () => void;
  onReject: () => void;
  onSwap: () => void;
  onSuggestAnother: () => void;
  onToggleLock: () => void;
  onEatingOut: () => void;
  onCooked: () => void;
}

export function MealCard({
  item,
  canChange,
  busy = false,
  callbacks,
}: {
  item: MealPlanItem;
  canChange: boolean;
  busy?: boolean;
  callbacks: MealCardCallbacks;
}) {
  const hasImage =
    item.dishImageStatus === "ready" && item.dishImageUrl != null;
  const sides = item.pairedDishes.map((p) => p.dishName).join(", ");

  return (
    <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold tracking-wide text-gray-400 uppercase">
          {SLOT_LABEL[item.mealSlot] ?? item.mealSlot}
        </Text>
        <View className="flex-row items-center gap-2">
          <StatusBadge status={item.status} locked={item.locked} />
          {canChange && item.dishId && item.status !== "cooked" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.locked ? "Unlock meal" : "Lock meal"}
              onPress={callbacks.onToggleLock}
              disabled={busy}
              hitSlop={8}
            >
              {item.locked ? (
                <Lock size={18} color="#16a34a" />
              ) : (
                <Unlock size={18} color="#9ca3af" />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {item.status === "eating_out" ? (
        <EatingOutBody note={item.eatingOutNote} />
      ) : item.dishId ? (
        <View className="flex-row gap-3">
          {hasImage ? (
            <Image
              source={{ uri: item.dishImageUrl! }}
              accessibilityLabel={item.dishImageAltText ?? item.dishName ?? ""}
              className="h-20 w-20 rounded-xl bg-gray-100"
            />
          ) : null}
          <View className="flex-1 gap-1.5">
            <Text className="text-lg font-semibold text-gray-900">
              {item.dishName ?? "Suggested dish"}
            </Text>
            {sides ? (
              <Text className="text-sm text-gray-500">with {sides}</Text>
            ) : null}
            {item.reason ? (
              <Text className="text-sm text-gray-500 italic">
                {item.reason}
              </Text>
            ) : null}
            <NutritionRow nutrition={item.nutrition} />
          </View>
        </View>
      ) : (
        <Text className="text-base text-gray-400">No suggestion yet.</Text>
      )}

      {canChange ? (
        <ActionBar item={item} busy={busy} callbacks={callbacks} />
      ) : null}
    </View>
  );
}

function ActionBar({
  item,
  busy,
  callbacks,
}: {
  item: MealPlanItem;
  busy: boolean;
  callbacks: MealCardCallbacks;
}) {
  if (busy) {
    return (
      <View className="h-9 items-center justify-center">
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  if (item.status === "cooked") {
    return (
      <Text className="text-sm font-medium text-green-700">
        Cooked — enjoy your meal!
      </Text>
    );
  }

  if (item.status === "eating_out") {
    return (
      <View className="flex-row flex-wrap gap-2">
        <ActionButton
          icon={Shuffle}
          label="Plan a dish"
          onPress={callbacks.onSuggestAnother}
        />
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {item.status === "suggested" ? (
        <ActionButton
          icon={Check}
          label="Accept"
          primary
          onPress={callbacks.onAccept}
        />
      ) : null}
      {item.status === "accepted" ? (
        <ActionButton
          icon={Flame}
          label="Cooked"
          primary
          onPress={callbacks.onCooked}
        />
      ) : null}
      <ActionButton icon={Shuffle} label="Swap" onPress={callbacks.onSwap} />
      <ActionButton
        icon={RefreshCw}
        label="Another"
        onPress={callbacks.onSuggestAnother}
      />
      <ActionButton
        icon={Store}
        label="Eat out"
        onPress={callbacks.onEatingOut}
      />
      {item.status !== "rejected" ? (
        <ActionButton icon={X} label="Reject" onPress={callbacks.onReject} />
      ) : null}
    </View>
  );
}

function ActionButton({
  icon: Icon,
  label,
  primary = false,
  onPress,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`h-9 flex-row items-center gap-1.5 rounded-lg px-3 ${primary ? "bg-green-600 active:bg-green-700" : "bg-gray-100 active:bg-gray-200"}`}
    >
      <Icon size={15} color={primary ? "#ffffff" : "#374151"} />
      <Text
        className={`text-sm font-medium ${primary ? "text-white" : "text-gray-700"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EatingOutBody({ note }: { note: string | null }) {
  return (
    <View className="flex-row items-center gap-2">
      <Store size={20} color="#6b7280" />
      <Text className="text-base text-gray-700">
        Eating out{note ? ` — ${note}` : ""}
      </Text>
    </View>
  );
}

function StatusBadge({
  status,
  locked,
}: {
  status: MealPlanItem["status"];
  locked: boolean;
}) {
  const map: Record<MealPlanItem["status"], { label: string; cls: string }> = {
    suggested: { label: "Suggested", cls: "bg-amber-100 text-amber-700" },
    accepted: { label: "Accepted", cls: "bg-green-100 text-green-700" },
    rejected: { label: "Rejected", cls: "bg-gray-100 text-gray-500" },
    eating_out: { label: "Eating out", cls: "bg-blue-100 text-blue-700" },
    cooked: { label: "Cooked", cls: "bg-green-100 text-green-700" },
  };
  const badge = map[status];
  // NativeWind can't split one className across two elements, so re-derive bits.
  const [bg, text] = badge.cls.split(" ");
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${bg}`}>
      <Text className={`text-xs font-semibold ${text}`}>
        {locked ? `${badge.label} · Locked` : badge.label}
      </Text>
    </View>
  );
}
