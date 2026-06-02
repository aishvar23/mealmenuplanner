import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { isApiError, notificationsApi, type DevicePlatform } from "@/api";

/**
 * Native push registration (M3-3, design/10 § 7). After sign-in the app obtains
 * an Expo push token and upserts it via `POST /api/notifications/device-tokens`
 * so the push fan-out (M3-2) can deliver to this device.
 *
 * Best-effort and defensive: it no-ops on a simulator (no push token), when push
 * permission is denied, or before an EAS `projectId` exists (M3-5) — none of
 * which should ever surface an error to the user. Push is purely additive: a user
 * who declines still gets in-app + email.
 */

/** Resolve the EAS project id from app config; null until EAS is set up (M3-5). */
function getProjectId(): string | null {
  const fromExtra = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? null;
}

export async function registerForPushNotifications(): Promise<void> {
  try {
    // Only real devices can mint a push token, and only iOS/Android are targets.
    if (!Device.isDevice) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const settings = await Notifications.getPermissionsAsync();
    let granted =
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted && settings.canAskAgain) {
      const request = await Notifications.requestPermissionsAsync();
      granted = request.granted;
    }
    if (!granted) return;

    const projectId = getProjectId();
    if (!projectId) return; // No EAS project yet (M3-5) — can't mint a token.

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const platform: DevicePlatform = Platform.OS === "ios" ? "ios" : "android";
    await notificationsApi.registerDeviceToken(token, platform);
  } catch (error) {
    // Never surface a push-registration failure to the user (design/10 § 7).
    if (!isApiError(error)) {
      console.warn("[push] registration failed", error);
    }
  }
}
