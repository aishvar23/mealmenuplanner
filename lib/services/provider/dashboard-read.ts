import "server-only";

import type { ProviderDashboardDto } from "@/packages/shared/provider";

import { requireOwnedProvider } from "./access";
import { listProviderBatches } from "./batch-read";
import { getTodayMenu } from "./menu-read";
import { getProvider } from "./onboarding";

/**
 * `GET /api/providers/{providerId}/dashboard` (MP-B-060, spec §13.2) — the owner's
 * day-at-a-glance summary, composed from the existing owner-scoped reads so the web +
 * mobile dashboards render from one call:
 *   • `today` — the menu day for today in the provider's timezone (state + cutoff), or
 *     `null` when none is published (owner sees any status via `getTodayMenu`'s RLS).
 *   • `batch` — today's CURRENT preparation batch (the post-cutoff census + email
 *     status), or `null` before cutoff has processed.
 *
 * Owner-gated: {@link requireOwnedProvider} answers a non-owner (or unknown provider)
 * with an existence-hiding 404, matching the rest of the owner surface — the dashboard
 * is owner-only, so a customer never reaches it. The batch index is only read once a
 * menu day exists, so a provider with no menu today does a single extra-light read.
 */
export async function getProviderDashboard(
  providerId: string,
): Promise<ProviderDashboardDto> {
  await requireOwnedProvider(providerId);

  const [provider, today] = await Promise.all([
    getProvider(providerId),
    getTodayMenu(providerId),
  ]);

  // The batch index is owner-only and one row per day's current revision; pick today's.
  // Only fetch it when there's a menu day today (no day ⇒ no batch).
  let batch = null;
  if (today) {
    const batches = await listProviderBatches(providerId);
    batch = batches.find((b) => b.menuDayId === today.menuDayId) ?? null;
  }

  return {
    providerId: provider.providerId,
    providerName: provider.name,
    timezone: provider.timezone,
    today: today
      ? {
          menuDayId: today.menuDayId,
          menuDate: today.menuDate,
          cutoffAt: today.cutoffAt,
          status: today.status,
          componentCount: today.components.length,
        }
      : null,
    batch,
  };
}
