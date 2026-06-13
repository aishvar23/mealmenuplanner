import { withErrorBoundary } from "@/lib/errors";
import { readJsonObject } from "@/lib/http";
import { updateCatalogItem } from "@/lib/services/provider";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ providerId: string; catalogItemId: string }>;
};

/**
 * `PATCH /api/providers/{providerId}/catalog/{catalogItemId}` — edit a catalog
 * item, or archive/restore it by toggling `isActive` (MP-A-110, contract 03 § 8;
 * owner only). Body: `UpdateCatalogItemRequest` (partial). Returns the updated
 * `CatalogItemDto`. A row the caller can't reach (not owner, or absent) returns a
 * 404 (no existence leak). Items are never hard deleted (ADR-4) — hence no DELETE.
 */
export const PATCH = withErrorBoundary(
  async (request: Request, context: RouteContext) => {
    const { providerId, catalogItemId } = await context.params;
    const body = await readJsonObject(request);
    const item = await updateCatalogItem(providerId, catalogItemId, body);
    return Response.json(item, { status: 200 });
  },
);
