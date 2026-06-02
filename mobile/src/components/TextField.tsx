import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Inline validation/error text shown below the field. */
  error?: string | null;
}

/**
 * Labeled text input with an optional error line. NativeWind-styled to match the
 * web form fields; forwards the ref so a form can focus the next field.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField({ label, error, className, ...props }, ref) {
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor="#9ca3af"
          className={`h-12 rounded-xl border bg-white px-4 text-base text-gray-900 ${error ? "border-red-400" : "border-gray-300"} ${className ?? ""}`}
          {...props}
        />
        {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      </View>
    );
  },
);
