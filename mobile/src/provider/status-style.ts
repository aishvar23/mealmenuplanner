import {
  PROVIDER_RESPONSE_STATUS_BADGE_VARIANT,
  type ProviderResponseBadgeVariant,
} from "@mmp/shared/provider";
import type { ProviderResponseStatus } from "@mmp/shared/provider";

/**
 * The mobile twin of the web status `Badge` colour: maps each response status to a
 * NativeWind text colour via the SHARED `PROVIDER_RESPONSE_STATUS_BADGE_VARIANT`, so
 * the Today screen and the recap screen colour the status identically to web (a
 * cancelled order reads ember/red, not success-green). One mapping, no per-screen drift.
 */
const VARIANT_TEXT_CLASS: Record<ProviderResponseBadgeVariant, string> = {
  neutral: "text-gray-500",
  emerald: "text-green-700",
  marigold: "text-amber-700",
  ember: "text-red-700",
};

export function providerStatusTextClass(
  status: ProviderResponseStatus,
): string {
  return VARIANT_TEXT_CLASS[PROVIDER_RESPONSE_STATUS_BADGE_VARIANT[status]];
}
