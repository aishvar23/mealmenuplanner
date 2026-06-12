// `@mmp/shared/provider` — the Meal Provider Workspace contract foundation
// (contract 03). Provider enums, the workspace reference model, wire DTOs, the
// `details.reason` error map onto the closed 7-code `ERROR_CODES`, the typed
// `ProviderApiClient` seam, and shared fixtures. All pure (no `server-only`, no
// `next/*`, no I/O) so the Expo app consumes the same definitions the Next.js
// backend produces — no drift.
//
// Web consumes these via the `@/packages/shared/provider` path alias; mobile via
// the `@mmp/shared/provider` subpath. Fixtures live under `./fixtures`.

export * from "./enums";
export * from "./labels";
export * from "./workspace";
export * from "./dtos";
export * from "./errors";
export * from "./client";
export * as providerFixtures from "./fixtures";
