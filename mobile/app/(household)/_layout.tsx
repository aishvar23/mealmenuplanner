import { Stack } from "expo-router";

/**
 * Household-management stack (M2-3): edit preferences, edit my dishes, create a
 * household. Pushed over the tabs from the Household tab, each with a native
 * header + back button.
 */
export default function HouseholdManageLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: "#16a34a",
        headerTitleStyle: { color: "#111827" },
      }}
    >
      <Stack.Screen name="preferences" options={{ title: "Preferences" }} />
      <Stack.Screen name="food" options={{ title: "My dishes" }} />
      <Stack.Screen name="create" options={{ title: "New household" }} />
      <Stack.Screen name="invite" options={{ title: "Invite someone" }} />
    </Stack>
  );
}
