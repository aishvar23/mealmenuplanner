import { useRouter } from "expo-router";
import { ArrowLeftRight } from "lucide-react-native";
import { Pressable } from "react-native";

/**
 * Header action that opens the cross-type workspace switcher (MP-C-012). Rendered
 * in the provider shells so a user can jump to their household or another provider
 * from inside a workspace — the mobile counterpart of the web account-menu
 * "Switch workspace" section.
 */
export function WorkspaceSwitchButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch workspace"
      hitSlop={8}
      onPress={() => router.push("/(settings)/workspaces")}
      className="px-3"
    >
      <ArrowLeftRight color="#16a34a" size={22} />
    </Pressable>
  );
}
