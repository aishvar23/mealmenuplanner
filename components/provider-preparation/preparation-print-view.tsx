import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { ProviderBatchReadDto } from "@/lib/services/provider";
import {
  buildPrintView,
  formatPrintTimestamp,
} from "@/packages/shared/provider";

import { PrintButton } from "./print-button";
import { RosterTable } from "./roster-table";

/**
 * Server-rendered preparation print view (MP-B-051, spec §17 / UC-BATCH-005 / ADR-14).
 * Renders a PERSISTED batch revision as a clean, paper-friendly document: the cutoff
 * census, the aggregate cooking roster, then the per-member breakdown — in the single
 * canonical order (buildPrintView routes through sortPreparationLines), so the printout
 * reconciles with the CSV exports and the summary email. The roster table is the shared
 * `RosterTable` (./roster-table, `variant="print"`). No app chrome, no interactive
 * controls except a Print button that is hidden in print media. Timestamps are
 * formatted host-independently (formatPrintTimestamp, UTC) because this renders on the
 * server — a bare toLocaleString() would print the deployment server's timezone.
 */

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
              {formatPrintTimestamp(view.generatedAt)} · Cutoff{" "}
              {formatPrintTimestamp(view.cutoffAt)}
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
          <RosterTable lines={view.aggregateLines} variant="print" />
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
                <RosterTable lines={member.lines} variant="print" />
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
