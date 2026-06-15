"use client";

import { CalendarDays, ChefHat, Clock, Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCutoffCountdown,
  PROVIDER_MENU_STATUS_BADGE_VARIANT,
  providerMenuStatusLabel,
  type ProviderDashboardDto,
} from "@/packages/shared/provider";

/**
 * Owner dashboard — day at a glance (MP-B-060, spec §13.2). Renders the composed
 * `ProviderDashboardDto` the server fetched: today's menu state + a live cutoff
 * countdown, and (once cutoff has processed) the response census with the batch + email
 * status. A client component only so the countdown re-ticks every minute; the data
 * itself is server-read. Pre-cutoff, the census reads "after cutoff" — counts are
 * generated at cutoff, never live-aggregated (the batch is the source of truth).
 */

const EMAIL_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};

/** A readable cutoff date+time in the provider's timezone (falls back to the raw ISO). */
function formatCutoff(cutoffAtIso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(cutoffAtIso));
  } catch {
    return cutoffAtIso;
  }
}

export function DashboardView({
  dashboard,
}: {
  dashboard: ProviderDashboardDto;
}) {
  const { today, batch, providerName, timezone } = dashboard;

  // Re-tick the countdown each minute. Seeded lazily from the clock (the label is
  // minute-granular, so server and client first renders agree) and updated only from
  // the interval callback — never a synchronous setState in the effect body.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const countdown = today ? formatCutoffCountdown(today.cutoffAt, nowMs) : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 lg:px-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">{providerName}</p>
      </div>

      {/* ── Today's menu ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" /> Today&apos;s menu
          </CardTitle>
          <CardDescription>
            The day&apos;s menu state and when responses close.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {today ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{today.menuDate}</span>
                <Badge
                  variant={PROVIDER_MENU_STATUS_BADGE_VARIANT[today.status]}
                >
                  {providerMenuStatusLabel(today.status)}
                </Badge>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <ChefHat className="size-4" />
                  {today.componentCount}{" "}
                  {today.componentCount === 1 ? "dish" : "dishes"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-4" />
                  Cutoff {formatCutoff(today.cutoffAt, timezone)}
                </span>
                {countdown ? (
                  <Badge variant={countdown.passed ? "neutral" : "emerald"}>
                    {countdown.label}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No menu is published for today.
              </p>
              <Link
                href="/provider/menu"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Plan a menu
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Responses (census) ── */}
      {today ? (
        <Card>
          <CardHeader>
            <CardTitle>Responses</CardTitle>
            <CardDescription>
              {batch
                ? "How members responded at cutoff."
                : "Response counts appear once the cutoff has passed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {batch ? (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Confirmed</dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {batch.totals.confirmed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Auto-accepted
                    </dt>
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
                    <dt className="text-xs text-muted-foreground">
                      No response
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {batch.totals.noResponse}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={batch.status === "current" ? "emerald" : "neutral"}
                  >
                    {batch.status === "current" ? "Current" : "Stale"}
                  </Badge>
                  <Badge
                    variant={
                      batch.emailStatus === "sent" ? "emerald" : "outline"
                    }
                  >
                    <Mail className="size-3" />
                    {batch.emailStatus
                      ? `Email: ${EMAIL_STATUS_LABEL[batch.emailStatus]}`
                      : "Email: not sent"}
                  </Badge>
                  <Link
                    href={`/provider/preparation/${batch.batchId}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    View preparation →
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Members can still respond until the cutoff. Once it passes, the
                cooking quantities are aggregated here.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
