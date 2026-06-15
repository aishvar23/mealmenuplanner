import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { ProviderBatchReadDto } from "@/lib/services/provider";
import {
  buildPrintView,
  formatQuantity,
  providerComponentGroupLabel,
  providerVariantSuffix,
} from "@/packages/shared/provider";
import type { PreparationLine } from "@/packages/shared/provider";

import { PrintButton } from "./print-button";

/**
 * Server-rendered preparation print view (MP-B-051, spec §17 / UC-BATCH-005 / ADR-14).
 * Renders a PERSISTED batch revision as a clean, paper-friendly document: the cutoff
 * census, the aggregate cooking roster, then the per-member breakdown — in the single
 * canonical order (buildPrintView routes through sortPreparationLines), so the printout
 * reconciles with the CSV exports and the summary email. No app chrome, no interactive
 * controls except a Print button that is hidden in print media.
 */

function lineLabel(line: PreparationLine): string {
  return `${line.itemName}${providerVariantSuffix(line.spiceLevel, line.saltLevel)}`;
}

/** A roster table whose column header repeats on every printed page (thead). */
function PrintRosterTable({ lines }: { lines: PreparationLine[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-gray-500">No items in this batch.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-400 text-left text-xs tracking-wide text-gray-600 uppercase">
          <th className="py-1.5 pr-3 font-semibold">Item</th>
          <th className="py-1.5 pr-3 font-semibold">Group</th>
          <th className="py-1.5 pr-3 text-right font-semibold">Included</th>
          <th className="py-1.5 pr-3 text-right font-semibold">Extra</th>
          <th className="py-1.5 pr-3 text-right font-semibold">Total</th>
          <th className="py-1.5 font-semibold">Unit</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr
            key={`${line.catalogItemId}-${i}`}
            className="break-inside-avoid border-b border-gray-200"
          >
            <td className="py-1.5 pr-3 font-medium">{lineLabel(line)}</td>
            <td className="py-1.5 pr-3 text-gray-600">
              {providerComponentGroupLabel(line.componentGroup)}
            </td>
            <td className="py-1.5 pr-3 text-right tabular-nums">
              {formatQuantity(line.includedQuantity)}
            </td>
            <td className="py-1.5 pr-3 text-right tabular-nums">
              {formatQuantity(line.extraQuantity)}
            </td>
            <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
              {formatQuantity(line.totalQuantity)}
            </td>
            <td className="py-1.5 text-gray-600">{line.canonicalUnit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PreparationPrintView({
  batch,
}: {
  batch: ProviderBatchReadDto;
}) {
  const view = buildPrintView(batch);
  const customerCount = view.individuals.length;

  return (
    <>
      {/* @page + print rules: works for A4 and US Letter (no forced size), repeats
          table headers across pages, and strips the screen background on paper. */}
      <style>{`
        @page { margin: 14mm; }
        @media print {
          thead { display: table-header-group; }
          .print-page { padding: 0 !important; }
          a[href]::after { content: ""; }
        }
      `}</style>
      <div className="print-page mx-auto w-full max-w-3xl space-y-6 px-6 py-8 text-gray-900">
        <div className="print:hidden">
          <Link
            href={`/provider/preparation/${batch.batchId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            <ArrowLeft className="size-4" /> Back to preparation
          </Link>
        </div>

        <header className="flex items-start justify-between gap-4 border-b border-gray-400 pb-4">
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {view.providerName}
            </h1>
            <p className="text-sm text-gray-600">
              Preparation roster — {view.menuDate}
            </p>
            <p className="text-xs text-gray-500">
              Revision {view.revision} · Generated{" "}
              {new Date(view.generatedAt).toLocaleString()} · Cutoff{" "}
              {new Date(view.cutoffAt).toLocaleString()}
            </p>
          </div>
          <PrintButton />
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
            Cutoff census
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-gray-500">Confirmed</dt>
              <dd className="font-semibold tabular-nums">
                {view.totals.confirmed}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-gray-500">Auto-accepted</dt>
              <dd className="font-semibold tabular-nums">
                {view.totals.autoAccepted}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-gray-500">Cancelled</dt>
              <dd className="font-semibold tabular-nums">
                {view.totals.cancelled}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-gray-500">No response</dt>
              <dd className="font-semibold tabular-nums">
                {view.totals.noResponse}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-gray-500">
            Customers to prepare for: {customerCount}
          </p>
        </section>

        <section className="break-inside-avoid space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
            Aggregate roster
          </h2>
          <PrintRosterTable lines={view.aggregateLines} />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
            Per-member breakdown
          </h2>
          {customerCount === 0 ? (
            <p className="text-sm text-gray-500">
              No member orders in this batch.
            </p>
          ) : (
            view.individuals.map((member) => (
              <div
                key={member.memberUserId}
                className="break-inside-avoid space-y-1.5"
              >
                <p className="font-medium">{member.displayName ?? "Member"}</p>
                <PrintRosterTable lines={member.lines} />
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
