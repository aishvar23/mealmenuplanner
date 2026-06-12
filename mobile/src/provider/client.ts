import type { ProviderApiClient } from "@mmp/shared/provider";

import { providerApiClient } from "@/api/provider";

/**
 * The composition-root seam for the Meal Provider Workspace client (MP-C-000).
 *
 * Every mobile provider hook/screen depends on this `ProviderApiClient`, never on
 * a concrete implementation, so the swap from fixtures to live data is this single
 * line. Now that the discovery route `GET /api/providers` exists (MP-A-100), this
 * points at the live, contract-bound `providerApiClient` — provider discovery is
 * real, not fixtures. The fixture-backed `./__fixtures__/mock-client` stays for
 * unit tests and any future screen built ahead of its `/api/*` route.
 */
export const providerClient: ProviderApiClient = providerApiClient;
