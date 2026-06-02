import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

/**
 * `notification` service — register the caller's Expo push token (M3-1,
 * design/10 § 7). Backs `POST /api/notifications/device-tokens`: the native app
 * upserts its device's push token after sign-in so the push adapter (M3-2) can
 * deliver to it.
 *
 * The write goes through the `register_device_token` SECURITY DEFINER RPC, which
 * always stamps `user_id = auth.uid()` and upserts on the unique `token` — so the
 * same device signing in as a new user reassigns the token (the last signed-in
 * user owns it), which a plain RLS upsert couldn't do across users. We validate
 * the body here for a clean `VALIDATION_ERROR` before the RPC ever runs.
 */

export type DevicePlatform = "ios" | "android";

export interface RegisterDeviceTokenResult {
  deviceTokenId: string;
}

export async function registerDeviceToken(
  body: JsonObject,
): Promise<RegisterDeviceTokenResult> {
  await requireAuthUser();

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length === 0) {
    throw new ValidationError("A device token is required.", [
      { field: "token", rule: "required" },
    ]);
  }
  const platform = body.platform;
  if (platform !== "ios" && platform !== "android") {
    throw new ValidationError("A valid platform is required.", [
      { field: "platform", rule: "enum", allowed: ["ios", "android"] },
    ]);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("register_device_token", {
    p_token: token,
    p_platform: platform,
  });

  if (error) {
    throw new InternalError("Failed to register the device token.", {
      cause: error,
    });
  }

  return { deviceTokenId: data };
}
