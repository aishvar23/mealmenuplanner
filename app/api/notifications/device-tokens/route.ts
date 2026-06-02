import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { registerDeviceToken } from "@/lib/services/notification";

// Resolves the session from cookies / bearer token and writes; never cached.
export const dynamic = "force-dynamic";

/**
 * `POST /api/notifications/device-tokens` — register the caller's Expo push token
 * (M3-1, design/10 § 7). Body `{ token, platform }` (`platform` ∈ ios|android).
 * Upserts the token to the current user via the `register_device_token` RPC (a
 * device signing in as a new user reassigns the token). Self-guarded; returns
 * `201 { deviceTokenId }`. `withErrorBoundary` maps any throw to the standard
 * envelope — `VALIDATION_ERROR` for a missing token / bad platform.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const result = await registerDeviceToken(body);
  return Response.json(result, { status: 201 });
});
