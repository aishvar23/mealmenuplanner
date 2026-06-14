import "server-only";

import { mapPgError } from "@/lib/db/rpc-error";
import { NotFoundError } from "@/lib/errors";
import { listProviderSummaries } from "@/lib/services/workspace";
import { isUuid } from "@/lib/validation/uuid";

import type { SupabaseClient } from "./read-utils";

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

/**
 * Draft-safe owner gate. Unlike {@link requireOwnedProvider} (which lists workspace
 * summaries and excludes `draft` orgs), this calls the SECURITY DEFINER
 * `is_provider_owner(p)` — true for the owner even while the org is a draft
 * (onboarding) — so a non-owner, or an unknown/malformed provider id, is answered
 * with an existence-hiding `NotFoundError` (design/04 § 2). A non-UUID id can't
 * name a real row, so it short-circuits without a round trip (and avoids a `22P02`
 * cast error surfacing as a 500). Shared by the catalog and suggestion services,
 * which write through RLS and gate ownership here first.
 */
export async function requireProviderOwner(
  supabase: SupabaseClient,
  providerId: string,
): Promise<void> {
  if (!isUuid(providerId)) throw new NotFoundError("Provider not found.");
  const { data, error } = await supabase.rpc("is_provider_owner", {
    p: providerId,
  });
  if (error) mapPgError(error, "Failed to verify provider ownership.");
  if (!data) throw new NotFoundError("Provider not found.");
}
