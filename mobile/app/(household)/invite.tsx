import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check, Share2 } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
} from "react-native";

import {
  invitesApi,
  isApiError,
  type CreateInviteResult,
  type InvitableRole,
} from "@/api";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";
import { useActiveHousehold } from "@/household/use-household";
import { ASSIGNABLE_ROLES, ROLE_HINTS, ROLE_LABELS } from "@/household/labels";

/**
 * Create an invite (M2-4, design/07 § 6). Collects an email, role, and an
 * optional guest window, posts to `…/invites`, and shows the one-time invite link
 * with copy / share. Gated server-side by `can_invite_members`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((role) => ({
  value: role as InvitableRole,
  label: ROLE_LABELS[role],
  description: ROLE_HINTS[role],
}));
const GUEST_DAYS = 7;

export default function CreateInviteScreen() {
  const { household } = useActiveHousehold();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateInviteResult | null>(null);

  async function onCreate() {
    if (!household) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await invitesApi.createInvite(household.householdId, {
        email: email.trim(),
        role,
        membershipType: isGuest ? "temporary_guest" : "permanent",
        ...(isGuest
          ? {
              expiresAt: new Date(
                Date.now() + GUEST_DAYS * 86_400_000,
              ).toISOString(),
            }
          : {}),
      });
      setResult(res);
      await qc.invalidateQueries({
        queryKey: ["invites", household.householdId],
      });
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't create the invite.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <InviteCreated link={result.inviteLink} email={email.trim()} />;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5"
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorBanner message={error} /> : null}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="them@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!busy}
        />

        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700">Role</Text>
          <SelectChips<InvitableRole>
            options={ROLE_OPTIONS}
            selected={[role]}
            onChange={(v) => v[0] && setRole(v[0])}
            mode="single"
          />
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-medium text-gray-700">
              Temporary guest
            </Text>
            <Text className="text-xs text-gray-400">
              Access expires in {GUEST_DAYS} days.
            </Text>
          </View>
          <Switch
            value={isGuest}
            onValueChange={setIsGuest}
            trackColor={{ true: "#16a34a" }}
          />
        </View>
      </ScrollView>

      <View className="border-t border-gray-100 px-5 pt-3 pb-5">
        <Button label="Create invite" loading={busy} onPress={onCreate} />
      </View>
    </KeyboardAvoidingView>
  );
}

function InviteCreated({ link, email }: { link: string; email: string }) {
  async function share() {
    await Share.share({
      message: `You're invited to join a household on Home Meal Planner: ${link}`,
    });
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-white px-6">
      <View className="items-center gap-2">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check color="#16a34a" size={28} />
        </View>
        <Text className="text-xl font-bold text-gray-900">Invite created</Text>
        <Text className="text-center text-base text-gray-500">
          Share this link with {email}. It opens once and expires.
        </Text>
      </View>

      <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <Text selectable className="text-sm text-gray-700">
          {link}
        </Text>
      </View>

      <Button
        label="Share link"
        icon={<Share2 color="#fff" size={18} />}
        onPress={share}
      />
      <Button label="Done" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}
