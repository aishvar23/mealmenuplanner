import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError, NotFoundError } from "@/lib/errors";
import { getEmailTransport } from "@/lib/events/notifier";
import { isUuid } from "@/lib/validation/uuid";
import { renderProviderSummaryEmail } from "@/packages/shared/provider";
import type {
  ProviderSummaryEmailParams,
  ProviderSummaryEmailResultDto,
} from "@/packages/shared/provider";

import { getProviderBatch } from "./batch-read";

/**
 * Provider summary-email service (MP-A-161, contract 03 § 13; UC-CUTOFF-003,
 * UC-OVERRIDE-003, UC-NOTIFY-004; ADR-12). Builds the email DTO from a PERSISTED,
 * immutable batch revision (never recomputed — a resend reproduces the exact same
 * email), renders it with the pure `renderProviderSummaryEmail`, and sends it to the
 * provider's configured `summary_email_recipients` via the SHARED `EmailTransport`
 * (no second mailer — ADR-12).
 *
 * The send is best-effort and POST-COMMIT: the batch revision already exists and is
 * never rolled back by a send failure. The outcome is recorded on the batch via the
 * owner-gated `set_provider_batch_email_status` RPC (the batch table grants SELECT
 * only — design/04 § 9), which also emits the § 19.4 `provider_email_sent` /
 * `provider_email_failed` audit event. The route always returns 200 with an honest
 * status the preparation UI can act on (offer resend on `failed`).
 *
 * Owner-gating is implicit: `getProviderBatch` calls the self-gating
 * `get_provider_batch` RPC (non-owner → 403, missing → 404, superseded → 409), so a
 * non-owner can never reach the send path.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** The owner-facing URLs embedded in the email, all absolute under `appBaseUrl`. */
function batchUrls(appBaseUrl: string, batchId: string) {
  const base = appBaseUrl.replace(/\/+$/, "");
  return {
    csvAggregateUrl: `${base}/api/provider-preparation-batches/${batchId}/aggregate.csv`,
    csvIndividualUrl: `${base}/api/provider-preparation-batches/${batchId}/individual.csv`,
    printUrl: `${base}/provider/preparation/${batchId}/print`,
    batchUrl: `${base}/provider/preparation/${batchId}`,
  };
}

/**
 * Send (or resend) the preparation-summary email for `batchId`. Returns an honest
 * `ProviderSummaryEmailResultDto`; never throws on a transport failure.
 */
export async function sendProviderSummaryEmail(
  batchId: string,
  appBaseUrl: string,
): Promise<ProviderSummaryEmailResultDto> {
  await requireAuthUser();
  if (!isUuid(batchId)) throw new NotFoundError("Batch not found.");

  // Owner-gated read of the persisted revision (self-gates: 403 / 404 / 409-stale).
  const batch = await getProviderBatch(batchId);

  const supabase: SupabaseClient = await createServerSupabaseClient();

  // Resolve the configured recipients via the batch's provider (owner can SELECT
  // both rows under RLS). batchId already passed the owner gate above.
  const { data: batchRow, error: batchErr } = await supabase
    .from("provider_preparation_batches")
    .select("provider_id")
    .eq("id", batchId)
    .single();
  if (batchErr || !batchRow) {
    throw new InternalError("Failed to resolve the batch provider.", {
      cause: batchErr,
    });
  }
  const { data: org, error: orgErr } = await supabase
    .from("provider_organizations")
    .select("summary_email_recipients")
    .eq("id", batchRow.provider_id)
    .single();
  if (orgErr || !org) {
    throw new InternalError("Failed to resolve the summary recipients.", {
      cause: orgErr,
    });
  }

  const recipients = (org.summary_email_recipients ?? []).filter(
    (email): email is string => Boolean(email && email.trim()),
  );

  // No recipients configured: nothing to send, and email_status stays untouched
  // (the column has no 'no_recipient' state). The UI prompts the owner to add one.
  if (recipients.length === 0) {
    return { emailStatus: "no_recipient", recipientCount: 0 };
  }

  const urls = batchUrls(appBaseUrl, batchId);
  const transport = getEmailTransport();

  let allSent = transport !== null;
  if (transport) {
    for (const toEmail of recipients) {
      const params: ProviderSummaryEmailParams = {
        toEmail,
        providerName: batch.providerName,
        menuDate: batch.menuDate,
        revision: batch.revision,
        generatedAt: batch.generatedAt,
        totals: batch.totals,
        aggregateLines: batch.aggregateLines,
        individuals: batch.individualLines,
        ...urls,
      };
      const { subject, html, text } = renderProviderSummaryEmail(params);
      try {
        await transport.send({ to: toEmail, subject, html, text });
      } catch (error) {
        // Honest partial failure: record + report 'failed' so the owner can resend.
        // The recipient address is never logged (the body is the only PII channel).
        console.error("[provider] failed to send summary email", { error });
        allSent = false;
      }
    }
  }

  const emailStatus: "sent" | "failed" = allSent ? "sent" : "failed";

  // Record the outcome on the persisted batch (owner-gated RPC; emits the § 19.4
  // event). A failure to persist the status must not mask a successful send, but it
  // is unexpected here (owner already verified) — surface it as a 500.
  const { error: statusErr } = await supabase.rpc(
    "set_provider_batch_email_status",
    { p_batch_id: batchId, p_status: emailStatus },
  );
  if (statusErr) {
    throw new InternalError("Failed to record the email status.", {
      cause: statusErr,
    });
  }

  return { emailStatus, recipientCount: recipients.length };
}
