import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  PROVIDER_SPICE_OPTIONS,
  type ProviderSpiceLevel,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner, LoadingState } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";

import { providerClient } from "./client";
import { myMembershipQueryKey, useMyMembership } from "./use-my-membership";

/**
 * Minimal member onboarding (MP-C-021, the mobile twin of the web member
 * onboarding, spec §14.1 / UC-MEMBER-ONBOARD-001). Asks ONLY for
 * provider-interaction data — name, phone, default spice, allergy + terms
 * acknowledgments, and (when subscription-eligible) auto-accept consent — never
 * any household field. On submit it routes to Today's Menu.
 */

export function MemberOnboardingScreen({ providerId }: { providerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: membership, isLoading } = useMyMembership(providerId);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [spice, setSpice] = useState<ProviderSpiceLevel | null>(null);
  const [allergyAck, setAllergyAck] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);

  // Prefill once the membership loads (e.g. resuming a partial entry).
  useEffect(() => {
    if (membership) {
      setDisplayName((v) => v || (membership.displayName ?? ""));
      setPhone((v) => v || (membership.phone ?? ""));
      setSpice((v) => v ?? membership.defaultSpiceLevel);
      setAutoAccept((v) => v || membership.autoAcceptConsented);
    }
  }, [membership]);

  const complete = useMutation({
    mutationFn: () =>
      providerClient.completeMemberOnboarding(providerId, {
        displayName: displayName.trim(),
        phone: phone.trim() || null,
        defaultSpiceLevel: spice,
        allergyAck,
        termsAck,
        autoAcceptConsent: membership?.autoAcceptEligible ? autoAccept : false,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: myMembershipQueryKey(providerId),
      });
      router.replace(`/(provider-member)/${providerId}/today` as Href);
    },
  });

  if (isLoading) return <LoadingState />;
  // An already-onboarded member who navigates/deep-links back here is bounced to
  // their menu, so onboarding can't be re-submitted (matches the web
  // `requireMemberForOnboarding` guard).
  if (membership?.onboardingComplete) {
    return <Redirect href={`/(provider-member)/${providerId}/today` as Href} />;
  }

  const canSubmit =
    displayName.trim().length > 0 &&
    allergyAck &&
    termsAck &&
    !complete.isPending;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="gap-4 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text className="text-xs font-semibold tracking-widest text-green-700 uppercase">
            Welcome
          </Text>
          <Text className="mt-1 text-2xl font-bold text-gray-900">
            A few details for your provider
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            Just what we need to prepare your meals — nothing about your
            household.
          </Text>
        </View>

        {complete.error ? (
          <ErrorBanner
            message={
              complete.error instanceof Error
                ? complete.error.message
                : "Something went wrong."
            }
          />
        ) : null}

        <TextField
          label="Your name *"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Chitra"
          autoCapitalize="words"
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 555 555 0100"
          keyboardType="phone-pad"
        />

        <View className="gap-1.5">
          <Text className="text-sm font-medium text-gray-700">
            Default spice level
          </Text>
          <SelectChips
            options={PROVIDER_SPICE_OPTIONS}
            selected={spice ? [spice] : []}
            onChange={(next) =>
              setSpice((next[0] as ProviderSpiceLevel) ?? null)
            }
            mode="single"
          />
        </View>

        <CheckRow
          checked={allergyAck}
          onToggle={() => setAllergyAck((v) => !v)}
          label="I understand allergy information is a warning only — the provider can't guarantee allergen-free preparation."
        />
        <CheckRow
          checked={termsAck}
          onToggle={() => setTermsAck((v) => !v)}
          label="I agree to the provider's ordering terms."
        />
        {membership?.autoAcceptEligible ? (
          <CheckRow
            checked={autoAccept}
            onToggle={() => setAutoAccept((v) => !v)}
            label="Auto-accept the default meal at cutoff when I haven't responded."
          />
        ) : null}

        <Button
          label="Continue to today's menu"
          loading={complete.isPending}
          disabled={!canSubmit}
          onPress={() => complete.mutate()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CheckRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-start gap-3"
    >
      <View
        className={`mt-0.5 size-5 items-center justify-center rounded border ${
          checked ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"
        }`}
      >
        {checked ? (
          <Text className="text-xs font-bold text-white">✓</Text>
        ) : null}
      </View>
      <Text className="flex-1 text-sm text-gray-700">{label}</Text>
    </Pressable>
  );
}
