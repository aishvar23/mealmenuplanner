"use client";

import { CalendarRange, ChefHat, Clock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
  activeCatalog,
  defaultCutoffLocalIso,
  dishCountLabel,
  editCatalog,
  emptyMenuBuilderState,
  formatCutoffCountdown,
  formatCutoffDateTime,
  isMenuDayEditable,
  isMenuDayNoteEditable,
  menuBuilderStateFromMenuDay,
  menuDayNoteChanged,
  MENU_NOTE_MAX_LENGTH,
  PROVIDER_MENU_STATUS_BADGE_VARIANT,
  providerMenuStatusLabel,
  providerTodayDate,
  summarizeMenuIssues,
  toUpdateMenuDayNoteInput,
  validateMenuCompleteness,
  type CatalogItemDto,
  type MenuBuilderState,
  type MenuDayDto,
} from "@/packages/shared/provider";

import { OwnerDaySuggestions } from "@/components/provider-suggestions/owner-day-suggestions";

import { MenuBuilderForm } from "./menu-builder-form";
import { publishMenuDay, updateMenuDayNote } from "./menu-client";

/**
 * Owner menu manager (MP-B-030, spec §13.3). Lists the week's menu days the server
 * read (`getWeeklyMenu`) with their status, cutoff + live countdown, and dish count;
 * lets the owner author a new DRAFT day via the structured builder and publish a
 * complete draft. Publishing is completeness-gated by the SHARED
 * `validateMenuCompleteness` (the #84 validator), so the button mirrors the server's
 * publish gate. Each non-terminal day also carries a lightweight in-place NOTE editor
 * (`updateMenuDayNote` / PATCH) — distinct from the structural builder: a note edit never
 * starts a revision and stays available on locked / past-cutoff days. Member suggestions
 * UI is the remainder of #22. A client component so the countdown re-ticks and the builder
 * is interactive; the data itself is server-read and re-fetched via `router.refresh()`
 * after a write.
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
  const [editing, setEditing] = useState<MenuDayDto | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = activeCatalog(catalog);
  const builderOpen = building || editing !== null;

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

  // Save just the day's note via the PATCH route (in place, never a revision). Returns
  // whether the write landed so the card can close its inline editor only on success.
  async function onSaveNote(day: MenuDayDto, raw: string): Promise<boolean> {
    setSavingNoteId(day.menuDayId);
    setError(null);
    try {
      await updateMenuDayNote(day.menuDayId, toUpdateMenuDayNoteInput(raw));
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the note.");
      return false;
    } finally {
      setSavingNoteId(null);
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
        {active.length > 0 && !builderOpen ? (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setBuilding(true);
            }}
          >
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
      {builderOpen && nowMs !== null ? (
        <BuilderPanel
          providerId={providerId}
          catalog={active}
          timezone={timezone}
          nowMs={nowMs}
          editing={editing}
          onSaved={() => {
            setBuilding(false);
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => {
            setBuilding(false);
            setEditing(null);
          }}
        />
      ) : null}

      {weeklyMenu.length === 0 && active.length > 0 && !builderOpen ? (
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
            editable={
              !builderOpen && nowMs !== null && isMenuDayEditable(day, nowMs)
            }
            onEdit={() => {
              setError(null);
              setBuilding(false);
              setEditing(day);
            }}
            noteEditable={!builderOpen && isMenuDayNoteEditable(day)}
            savingNote={savingNoteId === day.menuDayId}
            onSaveNote={(raw) => onSaveNote(day, raw)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The builder, with its starting state derived from the live clock. Split out so the
 * defaults (or the loaded day, for an edit) are computed only when the builder is open (and
 * `nowMs` is non-null), keeping the parent render pure (no `Date.now()` during render). When
 * `editing` is set the builder opens in EDIT mode on that day's current structure; otherwise
 * it opens in CREATE mode on a fresh day defaulted to today + an 8h cutoff.
 */
function BuilderPanel({
  providerId,
  catalog,
  timezone,
  nowMs,
  editing,
  onSaved,
  onCancel,
}: {
  providerId: string;
  catalog: CatalogItemDto[];
  timezone: string;
  nowMs: number;
  editing: MenuDayDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const initialState: MenuBuilderState = editing
    ? menuBuilderStateFromMenuDay(editing)
    : emptyMenuBuilderState(
        providerTodayDate(timezone, new Date(nowMs)),
        defaultCutoffLocalIso(new Date(nowMs)),
      );
  // For an edit, surface any archived item the day still references so the owner can
  // see/replace it instead of it silently vanishing from the picker (review #1/#2).
  const builderCatalog = editing ? editCatalog(catalog, editing) : catalog;
  return (
    <MenuBuilderForm
      providerId={providerId}
      catalog={builderCatalog}
      mode={editing ? "edit" : "create"}
      menuDayId={editing?.menuDayId}
      initialState={initialState}
      showRevisionWarning={editing?.status === "published"}
      requirePublishable={editing?.status === "published"}
      now={nowMs}
      onSaved={onSaved}
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
  editable,
  onEdit,
  noteEditable,
  savingNote,
  onSaveNote,
}: {
  day: MenuDayDto;
  timezone: string;
  nowMs: number | null;
  publishing: boolean;
  onPublish: () => void;
  editable: boolean;
  onEdit: () => void;
  noteEditable: boolean;
  savingNote: boolean;
  onSaveNote: (raw: string) => Promise<boolean>;
}) {
  const countdown =
    nowMs !== null ? formatCutoffCountdown(day.cutoffAt, nowMs) : null;
  // The publishable verdict is time-dependent (cutoff in the future); only compute it
  // once the client clock is live so SSR and the client agree.
  const issues =
    nowMs !== null ? validateMenuCompleteness(day, new Date(nowMs)) : null;
  const publishable = issues !== null && issues.length === 0;
  const isDraft = day.status === "draft";

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(day.note ?? "");

  function openNoteEditor() {
    setNoteDraft(day.note ?? "");
    setEditingNote(true);
  }

  async function saveNote() {
    const ok = await onSaveNote(noteDraft);
    if (ok) setEditingNote(false);
  }

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

        {editingNote ? (
          <div className="space-y-2">
            <Textarea
              aria-label="Menu day note"
              value={noteDraft}
              maxLength={MENU_NOTE_MAX_LENGTH}
              placeholder="A note shown to members for this day's menu."
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={saveNote}
                disabled={savingNote || !menuDayNoteChanged(day, noteDraft)}
              >
                {savingNote ? "Saving…" : "Save note"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditingNote(false)}
                disabled={savingNote}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : day.note ? (
          <p className="text-sm text-muted-foreground">{day.note}</p>
        ) : null}

        {isDraft && issues !== null && !publishable ? (
          <ul
            className="ml-4 list-disc text-sm text-muted-foreground"
            data-testid="draft-blockers"
          >
            {summarizeMenuIssues(issues).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}

        {!editingNote && (isDraft || editable || noteEditable) ? (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Button
                type="button"
                size="sm"
                onClick={onPublish}
                disabled={!publishable || publishing}
              >
                {publishing ? "Publishing…" : "Publish"}
              </Button>
            ) : null}
            {editable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEdit}
              >
                Edit
              </Button>
            ) : null}
            {noteEditable ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={openNoteEditor}
              >
                {day.note ? "Edit note" : "Add note"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Members can only suggest on a published/locked day (RLS gates the insert to
            those), so the owner triage shows only there — not on draft and not on a
            terminal archived/cancelled day where it would be a dead, always-empty panel. */}
        {day.status === "published" || day.status === "locked" ? (
          <OwnerDaySuggestions menuDayId={day.menuDayId} />
        ) : null}
      </CardContent>
    </Card>
  );
}
