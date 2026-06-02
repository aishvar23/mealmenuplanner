import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ChevronRight,
  Heart,
  PlusCircle,
  SlidersHorizontal,
  Trash2,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  deleteHousehold,
  isApiError,
  type HouseholdSummary,
  type Member,
} from "@/api";
import {
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
} from "@/components/Feedback";
import { MemberSheet } from "@/components/MemberSheet";
import {
  householdsQueryKey,
  useActiveHousehold,
} from "@/household/use-household";
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
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (m.isLoading) return <LoadingState />;
  if (m.error) {
    return <ErrorState message="Couldn't load members." onRetry={m.refetch} />;
  }

  const selected = m.members.find((x) => x.memberId === selectedId) ?? null;

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteHousehold(household.householdId);
      // Refetch the list; the tabs gate re-resolves the active household (or
      // routes to onboarding if this was the last one).
      await qc.invalidateQueries({ queryKey: householdsQueryKey });
    } catch (e) {
      setDeleteError(
        isApiError(e) ? e.message : "Couldn't delete the household.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete household?",
      `"${household.name}" and all its plans, groceries, and members will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void doDelete(),
        },
      ],
    );
  }

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

        {deleteError ? <ErrorBanner message={deleteError} /> : null}

        <Text className="mt-2 px-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
          Manage
        </Text>
        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <ActionRow
            icon={<SlidersHorizontal color="#16a34a" size={20} />}
            label={
              m.canEditPreferences
                ? "Household preferences"
                : "View preferences"
            }
            onPress={() => router.push("/(household)/preferences")}
          />
          <ActionRow
            icon={<Heart color="#16a34a" size={20} />}
            label="My liked dishes"
            onPress={() => router.push("/(household)/food")}
          />
          <ActionRow
            icon={<PlusCircle color="#16a34a" size={20} />}
            label="Create a household"
            onPress={() => router.push("/(household)/create")}
            isLast={!m.isOwner}
          />
          {m.isOwner ? (
            <ActionRow
              icon={<Trash2 color="#dc2626" size={20} />}
              label="Delete this household"
              destructive
              busy={deleting}
              onPress={confirmDelete}
              isLast
            />
          ) : null}
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

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  busy,
  isLast,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  busy?: boolean;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-gray-50 ${isLast ? "" : "border-b border-gray-100"} ${busy ? "opacity-50" : ""}`}
    >
      {icon}
      <Text
        className={`flex-1 text-base ${destructive ? "text-red-600" : "text-gray-900"}`}
      >
        {label}
      </Text>
      {!destructive ? <ChevronRight color="#9ca3af" size={20} /> : null}
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
