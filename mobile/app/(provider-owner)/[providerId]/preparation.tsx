import { useLocalSearchParams } from "expo-router";

import { PreparationScreen } from "@/provider/preparation-screen";

/**
 * Owner Preparation route (MP-C-050). Mounts the preparation screen that shipped with
 * PR #50/#51 — the route had been left on the placeholder, so the dashboard's "View
 * preparation" affordance (MP-C-060) and the tab now resolve to the real roster.
 */
export default function OwnerPreparationScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <PreparationScreen providerId={providerId} />;
}
