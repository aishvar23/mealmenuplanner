import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { ErrorBanner, LoadingState } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";
import { useProviders } from "@/provider/use-providers";
import { providerWorkspaceRoute } from "@/provider/workspace-routes";

import {
  timezoneOptions,
  useProviderOnboarding,
  type OnboardingForm,
} from "./use-provider-onboarding";

/**
 * Provider owner onboarding wizard (MP-C-020), the mobile twin of the web
 * `ProviderOnboardingWizard`. Two steps — identity (name + timezone required,
 * optional contact) then service defaults — driving the shared `/api/*` routes
 * via `useProviderOnboarding`. On finish it completes the draft and enters the
 * owner shell. Required-field gating mirrors web: Continue/Finish stay disabled
 * until name + timezone are set.
 *
 * MVP assumption: one active provider per owner. An owner who already has an active
 * provider is redirected to its dashboard instead of creating a second — mirroring
 * the web onboarding page. Draft orgs are excluded from `useProviders`, so an owned
 * summary here is always an active provider. (Revisit for multi-provider owners.)
 */
export default function ProviderOnboardingScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useProviders();
  const ownedActive = (providers ?? []).find((p) => p.role === "owner");
  const c = useProviderOnboarding();
  const tzOptions = timezoneOptions().map((tz) => ({ value: tz, label: tz }));

  useEffect(() => {
    if (ownedActive) {
      router.replace(providerWorkspaceRoute(ownedActive) as Href);
    }
  }, [ownedActive, router]);

  // While discovery is in flight, or when we're about to redirect an existing
  // owner, render a spinner rather than the (would-be duplicate) create form.
  if (isLoading || ownedActive) return <LoadingState />;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="border-b border-gray-100 bg-white px-5 pt-4 pb-3">
          <Text className="text-xs font-semibold tracking-widest text-green-700 uppercase">
            Provider setup
          </Text>
          <Text className="mt-1 text-2xl font-bold text-gray-900">
            {c.step === 0 ? "Create your provider" : "Service defaults"}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {c.step === 0
              ? "Tell us about your kitchen. You can change this later."
              : "Set an optional daily cutoff and summary recipients."}
          </Text>
        </View>

        <ScrollView
          contentContainerClassName="gap-4 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {c.error ? <ErrorBanner message={c.error} /> : null}

          {c.step === 0 ? (
            <>
              <TextField
                label="Provider name *"
                value={c.form.name}
                onChangeText={(t) => c.setField("name", t)}
                placeholder="Anna's Kitchen"
                autoCapitalize="words"
              />

              <View className="gap-1.5">
                <Text className="text-sm font-medium text-gray-700">
                  Timezone *
                </Text>
                <SelectChips
                  options={tzOptions}
                  selected={[c.form.timezone]}
                  onChange={(next) =>
                    c.setField("timezone", next[0] ?? c.form.timezone)
                  }
                  mode="single"
                />
              </View>

              <TextField
                label="Email"
                value={c.form.email}
                onChangeText={(t) => c.setField("email", t)}
                placeholder="hello@annaskitchen.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextField
                label="Phone"
                value={c.form.phone}
                onChangeText={(t) => c.setField("phone", t)}
                keyboardType="phone-pad"
              />
              <TextField
                label="City"
                value={c.form.city}
                onChangeText={(t) => c.setField("city", t)}
              />
              <TextField
                label="State"
                value={c.form.state}
                onChangeText={(t) => c.setField("state", t)}
              />
              <TextField
                label="Country"
                value={c.form.country}
                onChangeText={(t) => c.setField("country", t)}
              />
            </>
          ) : (
            <>
              <TextField
                label="Default order cutoff (HH:MM)"
                value={c.form.defaultCutoffLocalTime}
                onChangeText={(t: string) =>
                  c.setField("defaultCutoffLocalTime", t)
                }
                placeholder="18:00"
                autoCapitalize="none"
              />
              <TextField
                label="Preparation summary recipients"
                value={c.form.summaryEmailRecipients}
                onChangeText={(t) => c.setField("summaryEmailRecipients", t)}
                placeholder="kitchen@annaskitchen.com, prep@annaskitchen.com"
                autoCapitalize="none"
              />
              <Text className="text-xs text-gray-500">
                Comma-separated emails that receive the daily preparation
                summary. Optional.
              </Text>
            </>
          )}
        </ScrollView>

        <View className="flex-row gap-3 border-t border-gray-100 bg-white px-5 pt-3 pb-5">
          {c.step === 1 ? (
            <View className="flex-1">
              <Button label="Back" variant="secondary" onPress={c.goBack} />
            </View>
          ) : null}
          <View className="flex-1">
            {c.step === 0 ? (
              <Button
                label="Continue"
                loading={c.busy}
                disabled={!c.canAdvance}
                onPress={() => void c.goNext()}
              />
            ) : (
              <Button
                label="Finish setup"
                loading={c.busy}
                disabled={!c.canAdvance}
                onPress={() => void c.finish()}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export type { OnboardingForm };
