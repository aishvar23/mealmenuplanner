import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

/**
 * A free-text tag editor for list fields (allergies, disliked ingredients). Type
 * a value and submit (return key or "Add") to append a chip; tap a chip's × to
 * remove it. De-dupes and trims; fully controlled by the parent.
 */

interface TagInputProps {
  label: string;
  /** Current tags. */
  values: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: TagInputProps) {
  const [text, setText] = useState("");

  function add() {
    const tag = text.trim();
    if (!tag) return;
    if (!values.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      onChange([...values, tag]);
    }
    setText("");
  }

  function remove(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-gray-700">{label}</Text>
      <View className="flex-row gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          className="h-12 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${label}`}
          onPress={add}
          className="h-12 items-center justify-center rounded-xl bg-gray-100 px-4 active:bg-gray-200"
        >
          <Text className="text-base font-semibold text-gray-900">Add</Text>
        </Pressable>
      </View>
      {values.length > 0 ? (
        <View className="mt-1 flex-row flex-wrap gap-2">
          {values.map((tag) => (
            <View
              key={tag}
              className="flex-row items-center gap-1 rounded-full border border-gray-300 bg-white py-1.5 pr-1.5 pl-3"
            >
              <Text className="text-base text-gray-700">{tag}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${tag}`}
                onPress={() => remove(tag)}
                className="rounded-full p-0.5 active:bg-gray-100"
                hitSlop={6}
              >
                <X color="#6b7280" size={16} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
