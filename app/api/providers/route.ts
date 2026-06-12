import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection } from "@/lib/http";
import { listProviderSummaries } from "@/lib/services/workspace";

// Resolves the session from cookies; never statically cached.
export const dynamic = "force-dynamic";

/**
 * `GET /api/providers` — the provider workspaces the caller belongs to, one
 * `ProviderSummaryDto` per live membership (contract 03 §2/§8; MP-A-100). This is
 * the provider analogue of `GET /api/households`: the web app resolves workspaces
 * server-side for routing, but the mobile client and the workspace switcher
 * discover providers through this read. Member-scoped via the per-request RLS
 * client; returns the standard `{ data, page }` collection envelope.
 *
 * Provider create (`POST`) is MP-A-101 (the onboarding RPC), deferred to CP3 with
 * the owner-onboarding wizard — it is intentionally absent here.
 */
export const GET = withErrorBoundary(async () => {
  return Response.json(boundedCollection(await listProviderSummaries()));
});
