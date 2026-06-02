import { Pressable, Text, View } from "react-native";

import type { Option } from "@/onboarding/options";

/**
 * A wrap-flow of selectable chips for single- or multi-select choices (diet,
 * cuisines, meal slots, spice, budget, health tags). NativeWind-styled to match
 * the web's pill controls; selection is fully controlled by the parent.
 */

interface SelectChipsProps<T extends string> {
  options: readonly Option<T>[];
  /** Currently-selected values. */
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** `single` keeps at most one selected (radio-like); `multi` toggles freely. */
  mode?: "single" | "multi";
}

export function SelectChips<T extends string>({
  options,
  selected,
  onChange,
  mode = "multi",
}: SelectChipsProps<T>) {
  function toggle(value: T) {
    if (mode === "single") {
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            accessibilityRole={mode === "single" ? "radio" : "checkbox"}
            accessibilityState={{ selected: active }}
            onPress={() => toggle(opt.value)}
            className={`rounded-full border px-4 py-2 ${active ? "border-green-600 bg-green-50" : "border-gray-300 bg-white"}`}
          >
            <Text
              className={`text-base ${active ? "font-semibold text-green-700" : "text-gray-700"}`}
            >
              {opt.label}
            </Text>
            {opt.description ? (
              <Text
                className={`text-xs ${active ? "text-green-600" : "text-gray-400"}`}
              >
                {opt.description}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
