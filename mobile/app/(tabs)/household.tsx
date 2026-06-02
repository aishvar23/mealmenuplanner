import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { HouseholdSummary, Member } from "@/api";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { MemberSheet } from "@/components/MemberSheet";
import { useActiveHousehold } from "@/household/use-household";
import { ROLE_LABELS, STATUS_LABELS } from "@/household/labels";
import { useMembers } from "@/household/use-members";

/**
 * Household tab — members list with roles / permissions (M2-2, design/10 § 6).
 * Everyone sees the roster; a member with `can_remove_members` can tap a row to
 * change a member's role / permissions or remove them. Create / delete,
 * preferences, and invites arrive in M2-3 / M2-4.
 */
export default function HouseholdScreen() {
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
        hint="Set up your household to manage members."
      />
    );
  }
  return <HouseholdMembers household={household} />;
}

function HouseholdMembers({ household }: { household: HouseholdSummary }) {
  const m = useMembers(household.householdId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (m.isLoading) return <LoadingState />;
  if (m.error) {
    return <ErrorState message="Couldn't load members." onRetry={m.refetch} />;
  }

  const selected = m.members.find((x) => x.memberId === selectedId) ?? null;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl refreshing={m.refreshing} onRefresh={m.refetch} />
        }
      >
        <View>
          <Text className="text-2xl font-bold text-gray-900">
            {household.name}
          </Text>
          <Text className="text-base text-gray-500">
            {m.members.length} member{m.members.length === 1 ? "" : "s"}
          </Text>
        </View>

        {m.actionError ? <ErrorBanner message={m.actionError} /> : null}

        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {m.members.map((member, i) => (
            <MemberRow
              key={member.memberId}
              member={member}
              isSelf={member.userId === m.currentUserId}
              isLast={i === m.members.length - 1}
              onPress={() => setSelectedId(member.memberId)}
            />
          ))}
        </View>
      </ScrollView>

      <MemberSheet
        member={selected}
        canManage={m.canManage}
        isSelf={selected?.userId === m.currentUserId}
        busy={m.busyMemberId === selectedId}
        onUpdate={(input) => {
          if (selectedId) m.updateMember(selectedId, input);
        }}
        onRemove={() => {
          if (selectedId) m.removeMember(selectedId);
          setSelectedId(null);
        }}
        onClose={() => setSelectedId(null)}
      />
    </View>
  );
}

function MemberRow({
  member,
  isSelf,
  isLast,
  onPress,
}: {
  member: Member;
  isSelf: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const inactive = member.status !== "active" && member.status !== "invited";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-gray-50 ${isLast ? "" : "border-b border-gray-100"}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-green-100">
        <Text className="text-base font-semibold text-green-700">
          {initials(member.displayName)}
        </Text>
      </View>
      <View className="flex-1">
        <Text
          className={`text-base ${inactive ? "text-gray-400" : "text-gray-900"}`}
        >
          {member.displayName ?? "Member"}
          {isSelf ? "  (You)" : ""}
        </Text>
        <Text className="text-sm text-gray-500">
          {ROLE_LABELS[member.role]}
          {member.status !== "active"
            ? ` · ${STATUS_LABELS[member.status]}`
            : ""}
        </Text>
      </View>
      <ChevronRight color="#9ca3af" size={20} />
    </Pressable>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}
