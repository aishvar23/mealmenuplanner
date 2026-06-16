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
    // A multiline field grows from a min-height (mirroring the web Textarea's
    // `min-h-24` auto-grow) instead of the fixed single-line `h-12` box; on Android
    // the text must also top-align so it starts at the top of the taller box.
    const sizeClass = props.multiline ? "min-h-24 py-3" : "h-12";
    return (
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor="#9ca3af"
          textAlignVertical={props.multiline ? "top" : undefined}
          className={`${sizeClass} rounded-xl border bg-white px-4 text-base text-gray-900 ${error ? "border-red-400" : "border-gray-300"} ${className ?? ""}`}
          {...props}
        />
        {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      </View>
    );
  },
);
