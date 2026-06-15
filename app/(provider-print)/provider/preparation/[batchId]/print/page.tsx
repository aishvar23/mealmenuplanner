import Link from "next/link";
import { notFound } from "next/navigation";

import { PreparationPrintView } from "@/components/provider-preparation/preparation-print-view";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { getProviderBatch } from "@/lib/services/provider";
import type { ProviderBatchReadDto } from "@/lib/services/provider";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print preparation" };

type PageProps = { params: Promise<{ batchId: string }> };

/**
 * Server-rendered preparation print page (MP-B-051, spec §17 / UC-BATCH-005 / ADR-14).
 * Lives in its own (provider-print) route group so it renders WITHOUT the owner-app
 * shell chrome — a clean, paper-friendly document. Owner-gated by the same read RPC as
 * the detail page (getProviderBatch self-gates): a missing/foreign batch or a non-owner
 * is existence-hidden as 404; a superseded revision (409) shows an explanatory note,
 * since only the current revision reconciles. The `/provider` prefix is auth-protected
 * by the edge proxy, so an unauthenticated caller is bounced to sign-in upstream.
 */
export default async function ProviderPreparationPrintPage({
  params,
}: PageProps) {
  const { batchId } = await params;

  let batch: ProviderBatchReadDto;
  try {
    batch = await getProviderBatch(batchId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    if (error instanceof ConflictError) {
      return (
        <div className="mx-auto w-full max-w-3xl space-y-3 px-6 py-10 text-gray-900">
          <h1 className="text-xl font-bold">This revision was superseded</h1>
          <p className="text-sm text-gray-600">
            A newer revision has replaced this one. Open the current batch and
            print from there.
          </p>
          <Link
            href={`/provider/preparation/${batchId}`}
            className="text-sm font-medium text-primary underline"
          >
            Back to preparation
          </Link>
        </div>
      );
    }
    throw error;
  }

  return <PreparationPrintView batch={batch} />;
}
