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
 *
 * The outcome is returned so the caller can tell a *transient failure* (worth
 * retrying — e.g. offline at sign-in, a 5xx) from a deliberate *skip* (no point
 * retrying this session). The last token successfully registered is remembered so
 * sign-out can deregister exactly this device's token.
 */

/** Outcome of a registration attempt; `failed` is the only retry-worthy state. */
export type RegistrationResult = "registered" | "skipped" | "failed";

/** The token last registered this session, so sign-out can remove just this one. */
let lastRegisteredToken: string | null = null;

/** Resolve the EAS project id from app config; null until EAS is set up (M3-5). */
function getProjectId(): string | null {
  const fromExtra = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? null;
}

export async function registerForPushNotifications(): Promise<RegistrationResult> {
  // Only real devices can mint a push token, and only iOS/Android are targets.
  if (!Device.isDevice) return "skipped";
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "skipped";

  try {
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
    if (!granted) return "skipped";

    const projectId = getProjectId();
    if (!projectId) return "skipped"; // No EAS project yet (M3-5) — can't mint.

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const platform: DevicePlatform = Platform.OS === "ios" ? "ios" : "android";
    await notificationsApi.registerDeviceToken(token, platform);
    lastRegisteredToken = token;
    return "registered";
  } catch (error) {
    // Never surface a push-registration failure to the user (design/10 § 7), but
    // report it as a transient failure so the caller can retry (e.g. on next
    // foreground) rather than giving up on push for the whole session.
    if (!isApiError(error)) {
      console.warn("[push] registration failed", error);
    }
    return "failed";
  }
}

/**
 * Remove this device's push token on sign-out so the signed-out user stops
 * receiving the household's push (the token row otherwise keeps their user_id and
 * the fan-out keeps targeting it). Best-effort: a failure must never block
 * sign-out. No-op if this session never registered a token.
 */
export async function deregisterForPushNotifications(): Promise<void> {
  const token = lastRegisteredToken;
  if (!token) return;
  lastRegisteredToken = null;
  try {
    await notificationsApi.deregisterDeviceToken(token);
  } catch (error) {
    if (!isApiError(error)) {
      console.warn("[push] deregistration failed", error);
    }
  }
}
