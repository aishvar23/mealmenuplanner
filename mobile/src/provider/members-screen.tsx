import { useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  CreateProviderInviteResult,
  MemberDto,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner, LoadingState } from "@/components/Feedback";
import { TextField } from "@/components/TextField";

import { useMembers, useMemberActions } from "./use-members";

/**
 * Owner Members screen (MP-C-022, the mobile twin of the web Members page, spec
 * §13.4): invite a customer by email/phone, approve/reject the awaiting list, and
 * remove active members. The created invite link is shared via the native share
 * sheet — the mobile equivalent of the web copy-link.
 */
export function MembersScreen({ providerId }: { providerId: string }) {
  const { data: members, isLoading, error, refetch } = useMembers(providerId);
  const { approve, reject, remove, invite } = useMemberActions(providerId);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteResult, setInviteResult] =
    useState<CreateProviderInviteResult | null>(null);

  const acting = approve.isPending || reject.isPending || remove.isPending;
  const actionError =
    approve.error ?? reject.error ?? remove.error ?? invite.error;

  const pending = (members ?? []).filter(
    (m) => m.status === "awaiting_approval",
  );
  const active = (members ?? []).filter((m) => m.status === "active");

  async function onInvite() {
    const result = await invite.mutateAsync({
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
    setInviteResult(result);
    setEmail("");
    setPhone("");
  }

  if (isLoading) return <LoadingState />;
  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
        <View className="p-5">
          <ErrorBanner message="Couldn't load members." />
          <Button label="Retry" variant="secondary" onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {actionError ? (
          <ErrorBanner
            message={
              actionError instanceof Error
                ? actionError.message
                : "Something went wrong."
            }
          />
        ) : null}

        {/* ── Invite a customer ── */}
        <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
          <Text className="text-lg font-semibold text-gray-900">
            Invite a customer
          </Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="customer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 555 0100"
            keyboardType="phone-pad"
          />
          <Button
            label="Send invite"
            loading={invite.isPending}
            onPress={() => void onInvite()}
          />

          {inviteResult ? (
            <View className="gap-2 rounded-lg bg-gray-50 p-3">
              <Text className="text-sm font-medium text-gray-700">
                {inviteResult.emailStatus === "sent"
                  ? "Invite emailed. You can also share the link:"
                  : "Invite created. Share this link with the customer:"}
              </Text>
              <Text className="text-xs text-gray-500" selectable>
                {inviteResult.inviteLink}
              </Text>
              <Button
                label="Share link"
                variant="secondary"
                onPress={() =>
                  void Share.share({ message: inviteResult.inviteLink })
                }
              />
            </View>
          ) : null}
        </View>

        {/* ── Awaiting approval ── */}
        <View className="gap-2">
          <Text className="text-lg font-semibold text-gray-900">
            Awaiting approval
          </Text>
          {pending.length === 0 ? (
            <Text className="text-sm text-gray-500">
              No one is waiting for approval.
            </Text>
          ) : (
            pending.map((m) => (
              <MemberRow key={m.memberId} member={m}>
                <Button
                  label="Approve"
                  onPress={() => approve.mutate(m.memberId)}
                  disabled={acting}
                />
                <Button
                  label="Reject"
                  variant="secondary"
                  onPress={() => reject.mutate(m.memberId)}
                  disabled={acting}
                />
              </MemberRow>
            ))
          )}
        </View>

        {/* ── Active members ── */}
        <View className="gap-2">
          <Text className="text-lg font-semibold text-gray-900">
            Active members
          </Text>
          {active.map((m) => (
            <MemberRow key={m.memberId} member={m}>
              {m.role === "owner" ? (
                <Text className="px-2 text-xs text-gray-500">Owner</Text>
              ) : (
                <Button
                  label="Remove"
                  variant="danger"
                  onPress={() => remove.mutate(m.memberId)}
                  disabled={acting}
                />
              )}
            </MemberRow>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberRow({
  member,
  children,
}: {
  member: MemberDto;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-gray-900" numberOfLines={1}>
          {member.displayName ?? member.email ?? member.phone ?? "Customer"}
        </Text>
        {(member.email ?? member.phone) ? (
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {member.email ?? member.phone}
          </Text>
        ) : null}
      </View>
      <View className="flex-row gap-2">{children}</View>
    </View>
  );
}
