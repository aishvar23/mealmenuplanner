import { useLocalSearchParams } from "expo-router";

import { MembersScreen } from "@/provider/members-screen";

/** Owner Members screen route (MP-C-022). */
export default function OwnerMembersScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <MembersScreen providerId={providerId} />;
}
