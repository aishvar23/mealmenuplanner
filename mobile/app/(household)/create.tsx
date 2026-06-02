import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { createHousehold, isApiError } from "@/api";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { TextField } from "@/components/TextField";
import { householdsQueryKey } from "@/household/use-household";

/**
 * Create another household (M2-3). The caller becomes its owner. Preferences are
 * set up afterwards (a raw-created household has none yet), so we create + refresh
 * the households list and pop back; the switcher (M2-6) lets the user move to it.
 */
export default function CreateHouseholdScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a household name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createHousehold(trimmed);
      await qc.invalidateQueries({ queryKey: householdsQueryKey });
      router.back();
    } catch (e) {
      setError(isApiError(e) ? e.message : "Couldn't create the household.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="gap-4 p-5">
        {error ? <ErrorBanner message={error} /> : null}
        <TextField
          label="Household name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Beach House"
          autoCapitalize="words"
          autoFocus
          editable={!busy}
        />
        <Text className="text-sm text-gray-500">
          You&apos;ll be the owner. Set up its preferences from the Preferences
          screen after switching to it.
        </Text>
        <Button label="Create household" loading={busy} onPress={onCreate} />
      </View>
    </KeyboardAvoidingView>
  );
}
