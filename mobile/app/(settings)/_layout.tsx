import { Stack } from "expo-router";

/**
 * Settings stack (M2-5 / M2-6): notifications inbox, email preferences, and
 * (later) profile. Pushed over the tabs from the More tab with native headers.
 */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: "#16a34a",
        headerTitleStyle: { color: "#111827" },
      }}
    >
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen
        name="notification-settings"
        options={{ title: "Email notifications" }}
      />
    </Stack>
  );
}
