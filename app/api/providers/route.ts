import { withErrorBoundary } from "@/lib/errors";
import { boundedCollection, readJsonObject } from "@/lib/http";
import { createProviderDraft } from "@/lib/services/provider";
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
 */
export const GET = withErrorBoundary(async () => {
  return Response.json(boundedCollection(await listProviderSummaries()));
});

/**
 * `POST /api/providers` — create the caller's draft provider org + active owner
 * membership (MP-A-101, contract 03 §8). Body: `{ "name": string }`. The caller
 * becomes the owner; the org starts in `draft` and the onboarding wizard fills in
 * settings (`PATCH`) before finishing (`complete-onboarding`). Returns the new
 * `ProviderDto` (201). Resumable — a caller with an open draft gets it back.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  const body = await readJsonObject(request);
  const provider = await createProviderDraft(body.name);
  return Response.json(provider, { status: 201 });
});
