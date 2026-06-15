import { useLocalSearchParams } from "expo-router";

import { MenuManagerScreen } from "@/provider/menu-manager-screen";

/** Owner Menu manager/builder screen route (MP-C-030). */
export default function OwnerMenuScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <MenuManagerScreen providerId={providerId} />;
}
