import { useState } from "react";
import { Text, View } from "react-native";

import {
  providerSuggestionStatusLabel,
  SUGGESTION_TEXT_MAX_LENGTH,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { TextField } from "@/components/TextField";

import { providerSuggestionStatusTextClass } from "./status-style";
import { useSuggestions } from "./use-suggestions";

/**
 * Member meal-suggestions section (MP-A-131, UC-SUGGEST-001) on the mobile Today's Menu
 * screen — the twin of the web `MemberSuggestions`. Lets an approved member send the
 * provider a free-text, NON-BINDING idea for the day and see the status of the ones
 * they've sent (RLS-scoped to their own). A suggestion never changes their order or the
 * batch (BR-012). Presentational over `useSuggestions`; its test mocks that hook,
 * mirroring the screen tests (mobile UI E2E is deferred — ADR-17/Q-8).
 */
export function MemberSuggestions({ menuDayId }: { menuDayId: string }) {
  const { list, create } = useSuggestions(menuDayId);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSend = !create.isPending && trimmed.length > 0;

  async function onSend() {
    if (!canSend) return;
    setMessage(null);
    try {
      await create.mutateAsync(trimmed);
      setText("");
      setMessage("Suggestion sent. Thanks!");
    } catch {
      // Error is surfaced via the mutation's `error` below.
    }
  }

  const suggestions = list.data ?? [];

  return (
    <View className="gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <View className="gap-1">
        <Text className="text-base font-semibold text-gray-900">
          Suggest a change
        </Text>
        <Text className="text-sm text-gray-500">
          Send your provider an idea for today&rsquo;s menu. Suggestions are
          optional and don&rsquo;t change your order.
        </Text>
      </View>

      <TextField
        label="Your suggestion"
        value={text}
        multiline
        maxLength={SUGGESTION_TEXT_MAX_LENGTH}
        placeholder="e.g. Could you add a millet roti option?"
        onChangeText={(t) => {
          setText(t);
          setMessage(null);
        }}
      />
      {create.error ? (
        <ErrorBanner
          message={
            create.error instanceof Error
              ? create.error.message
              : "Couldn't send your suggestion."
          }
        />
      ) : null}
      {message ? (
        <Text className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </Text>
      ) : null}
      <Button
        label={create.isPending ? "Sending…" : "Send suggestion"}
        disabled={!canSend}
        onPress={() => void onSend()}
      />

      <Text className="text-sm font-medium text-gray-500">
        Your suggestions
      </Text>
      {list.isLoading ? (
        <Text className="text-sm text-gray-500">Loading…</Text>
      ) : list.error ? (
        <ErrorBanner message="Couldn't load suggestions." />
      ) : suggestions.length === 0 ? (
        <Text className="text-sm text-gray-500">
          You haven&rsquo;t sent any suggestions for today.
        </Text>
      ) : (
        <View className="gap-3">
          {suggestions.map((s) => (
            <View
              key={s.suggestionId}
              className="gap-1.5 rounded-lg border border-gray-100 p-3"
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm text-gray-800">
                  {s.suggestionText}
                </Text>
                <Text
                  className={`text-xs font-medium ${providerSuggestionStatusTextClass(s.status)}`}
                >
                  {providerSuggestionStatusLabel(s.status)}
                </Text>
              </View>
              {s.providerResponse ? (
                <Text className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {s.providerResponse}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
