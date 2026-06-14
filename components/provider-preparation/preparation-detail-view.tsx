"use client";

import { Download, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProviderBatchReadDto } from "@/lib/services/provider";
import {
  formatQuantity,
  providerComponentGroupLabel,
  providerSummaryEmailNotice,
  providerVariantSuffix,
} from "@/packages/shared/provider";
import type { PreparationLine } from "@/packages/shared/provider";

import { regenerateBatch, resendSummaryEmail } from "./preparation-client";

/**
 * Owner preparation/batch view (MP-B-050, spec §13.5 / UC-BATCH-001). Renders a
 * PERSISTED batch revision: the aggregate cooking roster, the per-member breakdown,
 * the cutoff census, the summary-email status, and the owner actions — CSV exports
 * (aggregate + per-member), resend the summary email, and regenerate the roster as a
 * new revision. Read straight from the immutable batch the server fetched; nothing is
 * recomputed at render time.
 */

const EMAIL_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};

function lineLabel(line: PreparationLine): string {
  return `${line.itemName}${providerVariantSuffix(line.spiceLevel, line.saltLevel)}`;
}

/** A roster table — used for the aggregate roster and each member's breakdown. */
function RosterTable({ lines }: { lines: PreparationLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No items in this batch.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 font-medium">Group</th>
            <th className="py-2 pr-3 text-right font-medium">Included</th>
            <th className="py-2 pr-3 text-right font-medium">Extra</th>
            <th className="py-2 pr-3 text-right font-medium">Total</th>
            <th className="py-2 font-medium">Unit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={`${line.catalogItemId}-${i}`} className="border-b">
              <td className="py-2 pr-3 font-medium">{lineLabel(line)}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {providerComponentGroupLabel(line.componentGroup)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatQuantity(line.includedQuantity)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatQuantity(line.extraQuantity)}
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                {formatQuantity(line.totalQuantity)}
              </td>
              <td className="py-2 text-muted-foreground">
                {line.canonicalUnit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreparationDetailView({
  batch,
}: {
  batch: ProviderBatchReadDto;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"email" | "regenerate" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onResend() {
    setBusy("email");
    setNotice(null);
    setError(null);
    try {
      const result = await resendSummaryEmail(batch.batchId);
      setNotice(providerSummaryEmailNotice(result));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the email.");
    } finally {
      setBusy(null);
    }
  }

  async function onRegenerate() {
    setBusy("regenerate");
    setNotice(null);
    setError(null);
    try {
      const result = await regenerateBatch(batch.batchId);
      router.push(`/provider/preparation/${result.batchId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't regenerate.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 lg:px-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Preparation — {batch.menuDate}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Revision {batch.revision}</span>
          <Badge variant={batch.status === "current" ? "emerald" : "neutral"}>
            {batch.status === "current" ? "Current" : "Stale"}
          </Badge>
          {batch.emailStatus ? (
            <Badge
              variant={batch.emailStatus === "sent" ? "emerald" : "outline"}
            >
              Email: {EMAIL_STATUS_LABEL[batch.emailStatus]}
            </Badge>
          ) : (
            <Badge variant="outline">Email: not sent</Badge>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cutoff census</CardTitle>
          <CardDescription>
            How the day&apos;s members responded at cutoff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Confirmed</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {batch.totals.confirmed}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Auto-accepted</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {batch.totals.autoAccepted}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cancelled</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {batch.totals.cancelled}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">No response</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {batch.totals.noResponse}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <a
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={`/api/provider-preparation-batches/${batch.batchId}/aggregate.csv`}
          download
        >
          <Download className="size-4" /> Aggregate CSV
        </a>
        <a
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={`/api/provider-preparation-batches/${batch.batchId}/individual.csv`}
          download
        >
          <Download className="size-4" /> Per-member CSV
        </a>
        <Button
          variant="outline"
          size="sm"
          onClick={onResend}
          disabled={busy !== null}
        >
          <Mail className="size-4" />
          {busy === "email" ? "Sending…" : "Resend summary email"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={busy !== null}
        >
          <RefreshCw className="size-4" />
          {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>

      {notice ? (
        <p className="text-sm text-primary" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-tomato" role="alert">
          {error}{" "}
          {/* Recovery affordance: an action can fail because this revision was
              superseded (e.g. a concurrent override), in which case acting on
              this batchId keeps failing. The index always lists current batches. */}
          <Link href="/provider/preparation" className="font-medium underline">
            Back to preparation
          </Link>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Aggregate roster</CardTitle>
          <CardDescription>
            Total quantities to cook, summed across all members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RosterTable lines={batch.aggregateLines} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-member breakdown</CardTitle>
          <CardDescription>
            What each member ordered, for packing and delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {batch.individualLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No member orders in this batch.
            </p>
          ) : (
            batch.individualLines.map((member) => (
              <div key={member.memberUserId} className="space-y-2">
                <p className="font-medium">{member.displayName ?? "Member"}</p>
                <RosterTable lines={member.lines} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
