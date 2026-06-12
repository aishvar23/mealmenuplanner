import "server-only";

import type { ProviderSummaryDto } from "@/packages/shared/provider";

import { listProviderSummaries, resolveWorkspaceDiscovery } from "./resolve";

/**
 * The provider org an owner shell should render (MP-B-011). The owner path is the
 * id-less `/provider/dashboard` (spec §12.4), so a user who owns more than one
 * provider is disambiguated by the active-workspace pointer; absent a valid
 * pointer we fall back to their first (oldest) owned org. Returns `null` when the
 * caller owns no provider — the layout then bounces them out of the owner shell.
 */
export async function resolveOwnerProvider(): Promise<ProviderSummaryDto | null> {
  const [summaries, discovery] = await Promise.all([
    listProviderSummaries(),
    resolveWorkspaceDiscovery(),
  ]);

  const owned = summaries.filter((s) => s.role === "owner");
  if (owned.length === 0) return null;

  const active = discovery.activeWorkspace;
  if (active?.type === "provider_owner") {
    const pointed = owned.find((s) => s.providerId === active.id);
    if (pointed) return pointed;
  }
  return owned[0] ?? null;
}

/**
 * The caller's customer membership of `providerId` for the member shell
 * (MP-B-012), or `null` if they are not an enterable customer of it. Drives both
 * the access guard (non-members are bounced) and the awaiting-vs-active branch
 * (an awaiting customer sees the holding screen, never the menu). Resolved through
 * the per-request RLS client, so cross-provider rows are invisible here — a
 * customer of Provider A asking about Provider B simply gets `null`.
 */
export async function resolveCustomerAccess(
  providerId: string,
): Promise<ProviderSummaryDto | null> {
  const summaries = await listProviderSummaries();
  return (
    summaries.find(
      (s) => s.providerId === providerId && s.role === "customer",
    ) ?? null
  );
}
