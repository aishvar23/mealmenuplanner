import { useLocalSearchParams } from "expo-router";

import { DashboardScreen } from "@/provider/dashboard-screen";

/** Owner Dashboard route (MP-C-060) — day at a glance (spec §13.2). */
export default function OwnerDashboardScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <DashboardScreen providerId={providerId} />;
}
