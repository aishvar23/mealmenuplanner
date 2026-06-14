"use client";

/**
 * Browser-side fetch helpers for the owner Preparation page (MP-B-050). Thin wrappers
 * over same-origin `fetch` (the session rides the HTTP-only auth cookies), typed
 * against the shared `ProviderApiClient` contract so a request/response shape change is
 * a compile error here too. The roster reads happen server-side (the page is a server
 * component); only the owner mutations — resend summary email + regenerate — go through
 * here. The CSV exports are plain `<a download>` links straight to the routes.
 */

import { readApiErrorMessage } from "@/packages/shared/provider";
import type {
  ProviderBatchRevisionDto,
  ProviderSummaryEmailResultDto,
} from "@/packages/shared/provider";

/** `POST /api/provider-preparation-batches/{batchId}/resend-email`. */
export async function resendSummaryEmail(
  batchId: string,
): Promise<ProviderSummaryEmailResultDto> {
  const res = await fetch(
    `/api/provider-preparation-batches/${batchId}/resend-email`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't send the summary email."),
    );
  }
  return res.json();
}

/** `POST /api/provider-preparation-batches/{batchId}/regenerate`. */
export async function regenerateBatch(
  batchId: string,
): Promise<ProviderBatchRevisionDto> {
  const res = await fetch(
    `/api/provider-preparation-batches/${batchId}/regenerate`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      await readApiErrorMessage(res, "Couldn't regenerate the batch."),
    );
  }
  return res.json();
}
