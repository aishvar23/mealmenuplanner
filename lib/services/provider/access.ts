import "server-only";

import { NotFoundError } from "@/lib/errors";
import { listProviderSummaries } from "@/lib/services/workspace";

/**
 * Provider authorization helpers shared by the membership services (MP-A-102).
 * The DEFINER RPCs (approve/reject/remove/list) self-gate on `is_provider_owner`,
 * but the service-layer paths that write through RLS (invite create) gate here
 * first so a non-owner gets a clean `NotFoundError` (existence-hiding, design/04
 * § 2) rather than a raw RLS rejection.
 */

/** Throw `NotFoundError` unless the caller is the active owner of `providerId`. */
export async function requireOwnedProvider(providerId: string): Promise<void> {
  const summaries = await listProviderSummaries();
  const owns = summaries.some(
    (s) => s.providerId === providerId && s.role === "owner",
  );
  if (!owns) throw new NotFoundError("Provider not found.");
}
