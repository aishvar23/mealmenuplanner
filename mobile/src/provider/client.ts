import type { ProviderApiClient } from "@mmp/shared/provider";

import { mockProviderClient } from "./__fixtures__/mock-client";

/**
 * The composition-root seam for the Meal Provider Workspace client (MP-C-000).
 *
 * Every mobile provider hook/screen depends on this `ProviderApiClient`, never
 * on a concrete implementation, so the swap from fixtures to live data is a
 * one-line change here. Until Developer A's `/api/*` routes land, it resolves to
 * the fixture-backed `mockProviderClient`; once they do, point it at the real
 * `providerApiClient` from `@/api/provider` (the HTTP client is already written
 * and contract-bound, so no screen changes).
 */
export const providerClient: ProviderApiClient = mockProviderClient;
