"use client";

import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT,
  providerSuggestionStatusLabel,
  SUGGESTION_RESPONSE_MAX_LENGTH,
} from "@/packages/shared/provider";
import type { ProviderSuggestionDto } from "@/packages/shared/provider";

import {
  acceptSuggestion,
  listSuggestions,
  rejectSuggestion,
} from "./suggestion-client";

/**
 * Owner suggestion triage for one menu day (MP-A-131, UC-SUGGEST-002/003) on the Weekly
 * Menu screen. Collapsed by default and lazy-loads the day's suggestions on first expand
 * (so the week list doesn't fan out a read per day on mount); the owner can then accept a
 * pending suggestion "as an option" or reject it, each with an optional note back to the
 * member. A resolution is `pending`-only at the server — once resolved the row shows the
 * outcome + note read-only. Suggestions never touch a response or batch (BR-012).
 */
export function OwnerDaySuggestions({ menuDayId }: { menuDayId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ProviderSuggestionDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Load once, on first expand. A collapse keeps what we have for a cheap re-open.
    if (next && items === null && loadError === null) {
      try {
        setItems(await listSuggestions(menuDayId));
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Couldn't load suggestions.",
        );
      }
    }
  }

  function onResolved(updated: ProviderSuggestionDto) {
    setItems(
      (prev) =>
        prev?.map((s) =>
          s.suggestionId === updated.suggestionId ? updated : s,
        ) ?? null,
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        <MessageSquare className="size-4" aria-hidden />
        Member suggestions
      </button>

      {open ? (
        <div className="space-y-3 pl-5" data-testid="owner-suggestion-panel">
          {loadError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {loadError}
            </p>
          ) : items === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions for this day yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((s) => (
                <SuggestionRow
                  key={s.suggestionId}
                  suggestion={s}
                  onResolved={onResolved}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onResolved,
}: {
  suggestion: ProviderSuggestionDto;
  onResolved: (updated: ProviderSuggestionDto) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = suggestion.status === "pending";

  async function resolve(kind: "accept" | "reject") {
    setBusy(true);
    setError(null);
    const trimmed = note.trim();
    const body = trimmed.length > 0 ? { providerResponse: trimmed } : undefined;
    try {
      const updated =
        kind === "accept"
          ? await acceptSuggestion(suggestion.suggestionId, body)
          : await rejectSuggestion(suggestion.suggestionId, body);
      onResolved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">{suggestion.suggestionText}</p>
        <Badge
          variant={PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT[suggestion.status]}
        >
          {providerSuggestionStatusLabel(suggestion.status)}
        </Badge>
      </div>

      {pending ? (
        <div className="space-y-2">
          <label
            htmlFor={`note-${suggestion.suggestionId}`}
            className="sr-only"
          >
            Note to the member (optional)
          </label>
          <Textarea
            id={`note-${suggestion.suggestionId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={SUGGESTION_RESPONSE_MAX_LENGTH}
            placeholder="Optional note back to the member"
          />
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => resolve("accept")}
            >
              {busy ? "Saving…" : "Accept as option"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => resolve("reject")}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : suggestion.providerResponse ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {suggestion.providerResponse}
        </p>
      ) : null}
    </li>
  );
}
