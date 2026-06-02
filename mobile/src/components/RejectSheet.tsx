import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { FeedbackType } from "@/api";

import { Button } from "./Button";
import { Sheet } from "./Sheet";

/**
 * Reject-with-reason picker (M1-3, design/08 § 2). Collects a required
 * `feedbackType` and an optional note, then hands them back; the parent calls the
 * reject endpoint and shows the replacement suggestion. `do_not_suggest_again`
 * feeds the exclusion logic server-side.
 */

// Mirrors the web's REJECT_FEEDBACK_OPTIONS (lib/meal-plan/labels.ts): only
// `feedback_type` enum values the reject validator accepts (design/08 § 2).
const OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "too_much_effort", label: "Too much effort" },
  { value: "ingredients_unavailable", label: "Ingredients unavailable" },
  { value: "kids_disliked", label: "Kids didn't like it" },
  { value: "disliked", label: "Didn't like it" },
  { value: "do_not_suggest_again", label: "Never suggest this again" },
];

export function RejectSheet({
  visible,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (feedbackType: FeedbackType, reason: string | null) => void;
}) {
  const [selected, setSelected] = useState<FeedbackType | null>(null);
  const [reason, setReason] = useState("");

  function submit() {
    if (!selected) return;
    onSubmit(selected, reason.trim() || null);
    setSelected(null);
    setReason("");
  }

  return (
    <Sheet visible={visible} title="Why not this dish?" onClose={onClose}>
      <View className="gap-2">
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(opt.value)}
              className={`rounded-xl border px-4 py-3 ${active ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"}`}
            >
              <Text
                className={`text-base ${active ? "font-semibold text-green-700" : "text-gray-700"}`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Add a note (optional)"
        placeholderTextColor="#9ca3af"
        className="h-12 rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900"
      />

      <Button
        label="Reject & suggest another"
        loading={busy}
        disabled={!selected || busy}
        onPress={submit}
      />
    </Sheet>
  );
}
