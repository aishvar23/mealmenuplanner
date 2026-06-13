import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import {
  createCatalogItem,
  listProviderCatalog,
} from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ providerId: string }> };

/**
 * `GET /api/providers/{providerId}/catalog` — the provider's catalog library
 * (MP-A-110, contract 03 § 8; owner only). Returns a bare `CatalogItemDto[]`
 * ordered by component group then name. A non-owner caller gets an empty list.
 */
export const GET = withErrorBoundary(
  async (_request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    return Response.json(await listProviderCatalog(providerId), {
      status: 200,
    });
  },
);

/**
 * `POST /api/providers/{providerId}/catalog` — add a catalog item (owner only).
 * Body: `CreateCatalogItemRequest`. Returns `201 CatalogItemDto`. A non-owner
 * caller's write is rejected by RLS and surfaces as a 404 (no existence leak).
 */
export const POST = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId } = await context.params;
    const body = await readJsonObject(request);
    const item = await createCatalogItem(providerId, body);
    return Response.json(item, { status: 201 });
  },
);
