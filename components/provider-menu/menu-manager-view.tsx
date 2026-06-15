"use client";

import { CalendarRange, ChefHat, Clock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  activeCatalog,
  defaultCutoffIso,
  dishCountLabel,
  formatCutoffCountdown,
  formatCutoffDateTime,
  isoToLocalDateTime,
  PROVIDER_MENU_STATUS_BADGE_VARIANT,
  providerMenuStatusLabel,
  providerTodayDate,
  summarizeMenuIssues,
  validateMenuCompleteness,
  type CatalogItemDto,
  type MenuDayDto,
} from "@/packages/shared/provider";

import { MenuBuilderForm } from "./menu-builder-form";
import { publishMenuDay } from "./menu-client";

/**
 * Owner menu manager (MP-B-030, spec §13.3). Lists the week's menu days the server
 * read (`getWeeklyMenu`) with their status, cutoff + live countdown, and dish count;
 * lets the owner author a new DRAFT day via the structured builder and publish a
 * complete draft. Publishing is completeness-gated by the SHARED
 * `validateMenuCompleteness` (the #84 validator), so the button mirrors the server's
 * publish gate. Structural edit/revision + customization authoring are the remainder
 * of #22. A client component so the countdown re-ticks and the builder is interactive;
 * the data itself is server-read and re-fetched via `router.refresh()` after a write.
 */

// Minute-bucketed client clock (see the dashboard view) — the SERVER snapshot is null
// so SSR omits the time-dependent publishable verdict, then the client takes over
// after hydration with no mismatch.
const MINUTE_MS = 60_000;
function subscribeMinute(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, MINUTE_MS);
  return () => clearInterval(id);
}
function getMinuteSnapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}
function getServerMinuteSnapshot(): null {
  return null;
}

export function MenuManagerView({
  providerId,
  weeklyMenu,
  catalog,
  timezone,
}: {
  providerId: string;
  weeklyMenu: MenuDayDto[];
  catalog: CatalogItemDto[];
  timezone: string;
}) {
  const router = useRouter();
  const nowMs = useSyncExternalStore(
    subscribeMinute,
    getMinuteSnapshot,
    getServerMinuteSnapshot,
  );

  const [building, setBuilding] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = activeCatalog(catalog);

  async function onPublish(menuDayId: string) {
    setPublishingId(menuDayId);
    setError(null);
    try {
      await publishMenuDay(menuDayId);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't publish the menu.",
      );
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Weekly menu
          </h1>
          <p className="text-sm text-muted-foreground">
            Build and publish each day&apos;s menu.
          </p>
        </div>
        {active.length > 0 && !building ? (
          <Button type="button" onClick={() => setBuilding(true)}>
            <Plus /> New menu day
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {active.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={ChefHat}
              title="Add catalog items first"
              description="Your menu is built from your catalog. Add dishes to your catalog before building a day's menu."
            />
          </CardContent>
        </Card>
      ) : null}

      {/* The builder needs a live clock for its defaults + completeness gate; it only
          opens on a click (post-hydration), so `nowMs` is always set by then. */}
      {building && nowMs !== null ? (
        <BuilderPanel
          providerId={providerId}
          catalog={active}
          timezone={timezone}
          nowMs={nowMs}
          onCreated={() => {
            setBuilding(false);
            router.refresh();
          }}
          onCancel={() => setBuilding(false)}
        />
      ) : null}

      {weeklyMenu.length === 0 && active.length > 0 && !building ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={CalendarRange}
              title="No menu days this week yet"
              description="Use “New menu day” to author and publish a day's menu."
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {weeklyMenu.map((day) => (
          <MenuDayCard
            key={day.menuDayId}
            day={day}
            timezone={timezone}
            nowMs={nowMs}
            publishing={publishingId === day.menuDayId}
            onPublish={() => onPublish(day.menuDayId)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The builder, with its date/cutoff defaults derived from the live clock. Split out so
 * the defaults are computed only when the builder is open (and `nowMs` is non-null),
 * keeping the parent render pure (no `Date.now()` during render).
 */
function BuilderPanel({
  providerId,
  catalog,
  timezone,
  nowMs,
  onCreated,
  onCancel,
}: {
  providerId: string;
  catalog: CatalogItemDto[];
  timezone: string;
  nowMs: number;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const defaultMenuDate = providerTodayDate(timezone, new Date(nowMs));
  const defaultCutoffLocal = isoToLocalDateTime(
    defaultCutoffIso(new Date(nowMs)),
  );
  return (
    <MenuBuilderForm
      providerId={providerId}
      catalog={catalog}
      defaultMenuDate={defaultMenuDate}
      defaultCutoffLocal={defaultCutoffLocal}
      now={nowMs}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  );
}

function MenuDayCard({
  day,
  timezone,
  nowMs,
  publishing,
  onPublish,
}: {
  day: MenuDayDto;
  timezone: string;
  nowMs: number | null;
  publishing: boolean;
  onPublish: () => void;
}) {
  const countdown =
    nowMs !== null ? formatCutoffCountdown(day.cutoffAt, nowMs) : null;
  // The publishable verdict is time-dependent (cutoff in the future); only compute it
  // once the client clock is live so SSR and the client agree.
  const issues =
    nowMs !== null ? validateMenuCompleteness(day, new Date(nowMs)) : null;
  const publishable = issues !== null && issues.length === 0;
  const isDraft = day.status === "draft";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{day.menuDate}</span>
          <Badge variant={PROVIDER_MENU_STATUS_BADGE_VARIANT[day.status]}>
            {providerMenuStatusLabel(day.status)}
          </Badge>
          {day.revision > 1 ? (
            <Badge variant="outline">Rev {day.revision}</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ChefHat className="size-4" />
            {dishCountLabel(day.components.length)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" />
            Cutoff {formatCutoffDateTime(day.cutoffAt, timezone)}
          </span>
          {countdown ? (
            <Badge variant={countdown.passed ? "neutral" : "emerald"}>
              {countdown.label}
            </Badge>
          ) : null}
        </div>

        {day.note ? (
          <p className="text-sm text-muted-foreground">{day.note}</p>
        ) : null}

        {isDraft ? (
          <div className="space-y-2">
            {issues !== null && !publishable ? (
              <ul
                className="ml-4 list-disc text-sm text-muted-foreground"
                data-testid="draft-blockers"
              >
                {summarizeMenuIssues(issues).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={onPublish}
              disabled={!publishable || publishing}
            >
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
