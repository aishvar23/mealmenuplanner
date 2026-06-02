import { Text, TextInput, View } from "react-native";

/**
 * A labeled integer input for the onboarding counts (family size, cooking
 * minutes, variety gap). Keeps the parent's value as `number | undefined` — a
 * cleared field is `undefined`, not `0` — and only emits non-negative integers,
 * so a partially-typed/empty field never autosaves a bogus `0`.
 */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  placeholder?: string;
  /** Optional trailing unit, e.g. "minutes". */
  suffix?: string;
}) {
  function handle(text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    if (digits === "") {
      onChange(undefined);
      return;
    }
    onChange(Number.parseInt(digits, 10));
  }

  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <TextInput
          value={value === undefined ? "" : String(value)}
          onChangeText={handle}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          className="h-12 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900"
        />
        {suffix ? (
          <Text className="text-base text-gray-500">{suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}
