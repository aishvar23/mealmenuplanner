import { Soup } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProviderComingSoon } from "@/components/provider/provider-coming-soon";
import { Badge } from "@/components/ui/badge";
import { listProviderBatches } from "@/lib/services/provider";
import { resolveOwnerProvider } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparation" };

/**
 * Owner Preparation index (MP-B-050, spec §13.5). Resolves the owner's active provider
 * (id-less `/provider/*` convention), lists the generated batches under RLS, and links
 * each menu day to its roster. A day's batch appears once cutoff has processed; an owner
 * with no batches yet sees the empty state. A user who owns no provider is bounced to the
 * workspace chooser (defense-in-depth on the shell).
 */
export default async function ProviderPreparationPage() {
  const provider = await resolveOwnerProvider();
  if (!provider) {
    redirect("/workspace");
  }

  const batches = await listProviderBatches(provider.providerId);

  if (batches.length === 0) {
    return (
      <ProviderComingSoon
        icon={Soup}
        title="No preparation batches yet"
        description="After a published menu's cutoff passes, its aggregated cooking quantities and per-member breakdown will appear here."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 lg:px-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Preparation
        </h1>
        <p className="text-sm text-muted-foreground">
          Cooking quantities and per-member breakdowns for each day after
          cutoff.
        </p>
      </div>

      <ul className="space-y-3">
        {batches.map((batch) => (
          <li key={batch.batchId}>
            <Link
              href={`/provider/preparation/${batch.batchId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {batch.menuDate}
                  <span className="text-xs font-normal text-muted-foreground">
                    rev {batch.revision}
                  </span>
                  {batch.emailStatus === "sent" ? (
                    <Badge variant="emerald">Email sent</Badge>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {batch.totals.confirmed} confirmed ·{" "}
                  {batch.totals.autoAccepted} auto-accepted ·{" "}
                  {batch.totals.cancelled} cancelled · {batch.totals.noResponse}{" "}
                  no response
                </p>
              </div>
              <span className="text-sm font-medium text-primary">View →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
