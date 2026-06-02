import { type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";

/**
 * A simple bottom-sheet modal used for the reject-feedback and swap pickers. Taps
 * on the scrim dismiss; the card holds the title and content. Kept dependency-free
 * (RN `Modal`) so M1 needs no extra sheet library.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="max-h-[80%] gap-4 rounded-t-3xl bg-white px-5 pt-5 pb-8"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center">
            <View className="h-1 w-10 rounded-full bg-gray-300" />
          </View>
          <Text className="text-lg font-semibold text-gray-900">{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
