import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  providerSuggestionStatusLabel,
  SUGGESTION_RESPONSE_MAX_LENGTH,
} from "@mmp/shared/provider";
import type { ProviderSuggestionDto } from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { TextField } from "@/components/TextField";

import { providerSuggestionStatusTextClass } from "./status-style";
import { useSuggestions } from "./use-suggestions";

/**
 * Owner suggestion triage for one menu day (MP-A-131, UC-SUGGEST-002/003) on the mobile
 * Weekly Menu screen — the twin of the web `OwnerDaySuggestions`. Collapsed by default and
 * lazy-loads the day's suggestions on first expand (so the week list doesn't fan out a read
 * per day); the owner can accept a pending suggestion "as an option" or reject it, each with
 * an optional note back to the member. Resolution is `pending`-only at the server — once
 * resolved the row shows the outcome + note read-only. Suggestions never touch a response or
 * batch (BR-012). Presentational over `useSuggestions`; its test mocks that hook.
 */
export function OwnerDaySuggestions({ menuDayId }: { menuDayId: string }) {
  const [open, setOpen] = useState(false);
  const { list, accept, reject } = useSuggestions(menuDayId, open);

  const suggestions = list.data ?? [];

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Member suggestions"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
      >
        <Text className="text-sm font-medium text-gray-600">
          {open ? "▾" : "▸"} Member suggestions
        </Text>
      </Pressable>

      {open ? (
        <View className="gap-3 pl-3">
          {list.isLoading ? (
            <Text className="text-sm text-gray-500">Loading…</Text>
          ) : list.error ? (
            <ErrorBanner message="Couldn't load suggestions." />
          ) : suggestions.length === 0 ? (
            <Text className="text-sm text-gray-500">
              No suggestions for this day yet.
            </Text>
          ) : (
            suggestions.map((s) => (
              <SuggestionRow
                key={s.suggestionId}
                suggestion={s}
                onAccept={(providerResponse) =>
                  accept.mutateAsync({
                    suggestionId: s.suggestionId,
                    providerResponse,
                  })
                }
                onReject={(providerResponse) =>
                  reject.mutateAsync({
                    suggestionId: s.suggestionId,
                    providerResponse,
                  })
                }
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function SuggestionRow({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: ProviderSuggestionDto;
  onAccept: (providerResponse?: string) => Promise<ProviderSuggestionDto>;
  onReject: (providerResponse?: string) => Promise<ProviderSuggestionDto>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = suggestion.status === "pending";

  async function resolve(kind: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const trimmed = note.trim();
    const response = trimmed.length > 0 ? trimmed : undefined;
    try {
      await (kind === "accept" ? onAccept(response) : onReject(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2 rounded-lg border border-gray-100 p-3">
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-sm text-gray-800">
          {suggestion.suggestionText}
        </Text>
        <Text
          className={`text-xs font-medium ${providerSuggestionStatusTextClass(suggestion.status)}`}
        >
          {providerSuggestionStatusLabel(suggestion.status)}
        </Text>
      </View>

      {pending ? (
        <View className="gap-2">
          <TextField
            label="Note to the member (optional)"
            value={note}
            multiline
            maxLength={SUGGESTION_RESPONSE_MAX_LENGTH}
            placeholder="Optional note back to the member"
            onChangeText={setNote}
          />
          {error ? <ErrorBanner message={error} /> : null}
          <View className="flex-row gap-2">
            <Button
              label={busy ? "Saving…" : "Accept as option"}
              disabled={busy}
              onPress={() => void resolve("accept")}
            />
            <Button
              label="Reject"
              variant="secondary"
              disabled={busy}
              onPress={() => void resolve("reject")}
            />
          </View>
        </View>
      ) : suggestion.providerResponse ? (
        <Text className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {suggestion.providerResponse}
        </Text>
      ) : null}
    </View>
  );
}
