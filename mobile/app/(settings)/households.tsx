import { Check, Star } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { HouseholdSummary } from "@/api";
import { ErrorBanner, LoadingState } from "@/components/Feedback";
import { ROLE_LABELS } from "@/household/labels";
import { useHouseholdSwitcher } from "@/household/use-household";

/**
 * Household switcher (M2-6, design/10 § 6). Tap a household to make it the one
 * you're viewing (active); the star sets your default-on-login (preferred). The
 * active household drives every daily-loop screen.
 */
export default function HouseholdsScreen() {
  const s = useHouseholdSwitcher();

  if (s.isLoading) return <LoadingState />;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="gap-3 p-4">
        {typeof s.error === "string" ? <ErrorBanner message={s.error} /> : null}

        <Text className="px-1 text-sm text-gray-500">
          Tap a household to switch to it. The star marks your default on
          sign-in.
        </Text>

        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {s.households.map((h, i) => (
            <HouseholdRow
              key={h.householdId}
              household={h}
              isActive={h.householdId === s.activeId}
              isPreferred={h.householdId === s.preferredId}
              busy={s.busyId === h.householdId}
              isLast={i === s.households.length - 1}
              onSwitch={() => s.switchActive(h.householdId)}
              onPrefer={() => s.setPreferred(h.householdId)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function HouseholdRow({
  household,
  isActive,
  isPreferred,
  busy,
  isLast,
  onSwitch,
  onPrefer,
}: {
  household: HouseholdSummary;
  isActive: boolean;
  isPreferred: boolean;
  busy: boolean;
  isLast: boolean;
  onSwitch: () => void;
  onPrefer: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onSwitch}
      disabled={busy || isActive}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-gray-50 ${isLast ? "" : "border-b border-gray-100"} ${busy ? "opacity-50" : ""}`}
    >
      <View className="w-5">
        {isActive ? <Check color="#16a34a" size={20} /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-base text-gray-900">{household.name}</Text>
        <Text className="text-sm text-gray-500">
          {ROLE_LABELS[household.role]}
          {isActive ? " · Viewing" : ""}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isPreferred ? "Default household" : "Set as default household"
        }
        onPress={onPrefer}
        disabled={busy}
        hitSlop={10}
        className="p-1"
      >
        <Star
          color={isPreferred ? "#f59e0b" : "#d1d5db"}
          fill={isPreferred ? "#f59e0b" : "transparent"}
          size={22}
        />
      </Pressable>
    </Pressable>
  );
}
