import { ScrollView, Switch, Text, View } from "react-native";

import {
  CAN_FLAG_KEYS,
  type CanFlags,
  type Member,
  type MemberRole,
  type UpdateMemberInput,
} from "@/api";
import {
  ASSIGNABLE_ROLES,
  MEMBERSHIP_TYPE_LABELS,
  PERMISSION_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  STATUS_LABELS,
} from "@/household/labels";

import { Button } from "./Button";
import { SelectChips } from "./SelectChips";
import { Sheet } from "./Sheet";

/**
 * Member detail + management sheet (M2-2). For a caller who can manage members,
 * a non-owner / non-self row is editable: pick a role (re-applies that role's
 * default flags server-side) or toggle individual `can_*` flags, and remove the
 * member. The owner's row and your own row are read-only here — owner changes go
 * through ownership transfer, which isn't exposed in M2-2. Edits apply
 * immediately; `busy` disables the controls while a change is in flight.
 */

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
  description: ROLE_HINTS[role],
}));

export function MemberSheet({
  member,
  canManage,
  isSelf,
  busy,
  onUpdate,
  onRemove,
  onClose,
}: {
  member: Member | null;
  canManage: boolean;
  isSelf: boolean;
  busy: boolean;
  onUpdate: (input: UpdateMemberInput) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  if (!member) return null;

  const isOwner = member.role === "owner";
  const editable = canManage && !isOwner && !isSelf;

  function setRole(values: MemberRole[]) {
    const next = values[0];
    if (next && next !== member!.role) onUpdate({ role: next });
  }

  function toggleFlag(key: keyof CanFlags, value: boolean) {
    onUpdate({ permissions: { [key]: value } });
  }

  return (
    <Sheet
      visible={member != null}
      title={memberTitle(member)}
      onClose={onClose}
    >
      <View className="flex-row flex-wrap gap-2">
        <Badge text={ROLE_LABELS[member.role]} />
        <Badge text={STATUS_LABELS[member.status]} />
        {member.membershipType === "temporary_guest" ? (
          <Badge text={MEMBERSHIP_TYPE_LABELS[member.membershipType]} />
        ) : null}
      </View>

      {!editable ? (
        <Text className="text-sm text-gray-500">
          {isOwner
            ? "The owner has full control. Transfer ownership to change who owns the household."
            : isSelf
              ? "This is you. Ask another manager to change your role."
              : "You don't have permission to manage members."}
        </Text>
      ) : null}

      <ScrollView className="max-h-96" contentContainerClassName="gap-5">
        {editable ? (
          <View className="gap-2">
            <Text className="text-sm font-medium text-gray-700">Role</Text>
            <SelectChips<MemberRole>
              options={ROLE_OPTIONS}
              selected={
                ASSIGNABLE_ROLES.includes(member.role) ? [member.role] : []
              }
              onChange={setRole}
              mode="single"
            />
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700">Permissions</Text>
          {CAN_FLAG_KEYS.map((key) => (
            <View
              key={key}
              className="flex-row items-center justify-between gap-3"
            >
              <View className="flex-1">
                <Text className="text-base text-gray-900">
                  {PERMISSION_LABELS[key].label}
                </Text>
                <Text className="text-xs text-gray-400">
                  {PERMISSION_LABELS[key].hint}
                </Text>
              </View>
              <Switch
                value={member.permissions[key]}
                disabled={!editable || busy}
                onValueChange={(v) => toggleFlag(key, v)}
                trackColor={{ true: "#16a34a" }}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {editable ? (
        <Button
          label="Remove from household"
          variant="danger"
          loading={busy}
          onPress={onRemove}
        />
      ) : null}
    </Sheet>
  );
}

function memberTitle(member: Member): string {
  return member.displayName ?? "Member";
}

function Badge({ text }: { text: string }) {
  return (
    <View className="rounded-full bg-gray-100 px-3 py-1">
      <Text className="text-xs font-medium text-gray-600">{text}</Text>
    </View>
  );
}
