import { ChefHat, Store } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyState, ErrorState, LoadingState } from "@/components/Feedback";

import {
  useWorkspaceOptions,
  type WorkspaceOption,
} from "./use-workspace-options";
import { useWorkspaceSwitch } from "./use-workspace-switch";

/**
 * Cross-type workspace switcher (MP-C-012, the mobile twin of the web account-menu
 * switcher). Lists every workspace the caller belongs to — households and meal
 * providers alike — and switches to the chosen one, recording the active pointer
 * before navigating. Reached from the More tab and from a provider shell's header,
 * so a user can move between their household and their providers from anywhere.
 */
export function WorkspaceSwitcher() {
  const { options, isLoading, isError } = useWorkspaceOptions();
  const { switchTo, pending } = useWorkspaceSwitch();

  if (isLoading) return <LoadingState />;
  if (isError) {
    return <ErrorState message="We couldn't load your workspaces." />;
  }
  if (options.length === 0) {
    return (
      <EmptyState
        title="No workspaces yet"
        hint="Join a household or a meal provider to get started."
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView contentContainerClassName="gap-3 p-4">
        <Text className="px-1 text-sm text-gray-500">
          Switch between your household and your meal providers.
        </Text>
        <View className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {options.map((option, i) => (
            <WorkspaceRow
              key={`${option.type}:${option.id}`}
              option={option}
              isLast={i === options.length - 1}
              disabled={pending}
              onPress={() => void switchTo(option)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function WorkspaceRow({
  option,
  isLast,
  disabled,
  onPress,
}: {
  option: WorkspaceOption;
  isLast: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = option.kind === "household" ? ChefHat : Store;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${isLast ? "" : "border-b border-gray-100"} ${disabled ? "opacity-60" : ""}`}
    >
      <View className="size-10 items-center justify-center rounded-lg bg-green-50">
        <Icon color="#16a34a" size={20} />
      </View>
      <View className="flex-1">
        <Text className="text-base text-gray-900">{option.name}</Text>
        <Text className="text-sm text-gray-500">{option.subtitle}</Text>
      </View>
    </Pressable>
  );
}
