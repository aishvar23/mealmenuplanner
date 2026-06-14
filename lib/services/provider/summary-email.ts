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
 *
 * Two deliberate best-effort behaviours (ADR-12; named in PR #48 review, ADO #27):
 *   • An UNCONFIGURED transport (`getEmailTransport()` → null, i.e. `RESEND_API_KEY`
 *     unset) is reported as a SOFT `failed` — nothing was delivered, but the request
 *     still returns 200 rather than throwing. This matches the documented
 *     `getEmailTransport` contract ("a null transport makes the adapter a best-effort
 *     no-op rather than a hard failure") and is honest observability: an operator who
 *     forgot to configure mail SHOULD see summary emails reported as not-sent. In
 *     production the transport is always configured, so this branch is non-prod only.
 *   • A PARTIAL failure (some recipients delivered, one threw) reports `failed`; a
 *     resend then re-sends to EVERY recipient (no per-recipient delivery ledger in the
 *     MVP), so an already-delivered recipient may get a duplicate. Per-recipient
 *     idempotency is deferred — the summary is a low-frequency, non-transactional
 *     digest where a rare duplicate is acceptable.
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

  // Resolve the configured recipients via the batch's provider in ONE round-trip by
  // embedding the parent org row (PostgREST follows the batch → org FK; the owner can
  // SELECT both under RLS). batchId already passed the owner gate above.
  const { data: row, error: rowErr } = await supabase
    .from("provider_preparation_batches")
    .select("provider_organizations(summary_email_recipients)")
    .eq("id", batchId)
    .single();
  if (rowErr || !row) {
    throw new InternalError("Failed to resolve the summary recipients.", {
      cause: rowErr,
    });
  }
  // A to-one embed; cast like the codebase's other embedded selects.
  const org = (
    row as unknown as {
      provider_organizations: {
        summary_email_recipients: string[] | null;
      } | null;
    }
  ).provider_organizations;

  // Trim blanks AND de-duplicate case-insensitively, preserving the first spelling —
  // a duplicated address must not be emailed twice or inflate recipientCount.
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of org?.summary_email_recipients ?? []) {
    const email = raw?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }

  // No recipients configured: nothing to send, and email_status stays untouched
  // (the column has no 'no_recipient' state). The UI prompts the owner to add one.
  if (recipients.length === 0) {
    return { emailStatus: "no_recipient", recipientCount: 0 };
  }

  const urls = batchUrls(appBaseUrl, batchId);
  const transport = getEmailTransport();

  let allSent = transport !== null;
  if (transport) {
    // The rendered email is recipient-independent (the renderer never reads
    // `toEmail`), so render ONCE and vary only the `to:` address per send — no point
    // rebuilding the identical HTML/text body for every recipient.
    const params: ProviderSummaryEmailParams = {
      toEmail: recipients[0]!,
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
    for (const toEmail of recipients) {
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
