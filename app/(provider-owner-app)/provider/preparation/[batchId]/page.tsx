import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PreparationDetailView } from "@/components/provider-preparation/preparation-detail-view";
import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { getProviderBatch } from "@/lib/services/provider";
import type { ProviderBatchReadDto } from "@/lib/services/provider";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparation batch" };

type PageProps = { params: Promise<{ batchId: string }> };

/**
 * Owner Preparation detail (MP-B-050, spec §13.5 / UC-BATCH-001). Reads the persisted
 * batch revision server-side (owner-gated RPC) and renders its roster + actions. A
 * missing/foreign batch or a non-owner is existence-hidden as 404; a superseded revision
 * (409 `batch_stale`) shows an explanatory state with a link back to the current list.
 */
export default async function ProviderPreparationBatchPage({
  params,
}: PageProps) {
  const { batchId } = await params;

  // Fetch outside the JSX return so a render error is never swallowed by this catch
  // (the catch is for the data read's owner-gate / not-found / stale outcomes only).
  let batch: ProviderBatchReadDto;
  try {
    batch = await getProviderBatch(batchId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    if (error instanceof ConflictError) {
      return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-8">
          <Link
            href="/provider/preparation"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            <ArrowLeft className="size-4" /> Back to preparation
          </Link>
          <ProviderComingSoon
            title="This revision was superseded"
            description="A newer revision has replaced this one. Open the current batch from the preparation list."
          />
        </div>
      );
    }
    throw error;
  }

  return <PreparationDetailView batch={batch} />;
}
