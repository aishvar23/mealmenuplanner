"use client";

import { Lightbulb, MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT,
  providerSuggestionStatusLabel,
  SUGGESTION_TEXT_MAX_LENGTH,
} from "@/packages/shared/provider";
import type { ProviderSuggestionDto } from "@/packages/shared/provider";

import { createSuggestion, listSuggestions } from "./suggestion-client";

/**
 * Member meal-suggestions panel (MP-A-131, UC-SUGGEST-001) on the Today's Menu screen.
 * Lets an approved member send the provider a free-text, NON-BINDING suggestion for the
 * day and see the status of the ones they've sent (the list is RLS-scoped to their own).
 * A suggestion NEVER changes their order or the batch (BR-012) — it is an out-of-band
 * channel — so this sits below the response form as a distinct section. Self-contained:
 * fetches its own list client-side, so the well-tested response view is untouched.
 */
export function MemberSuggestions({
  menuDayId,
  providerName,
}: {
  menuDayId: string;
  providerName: string;
}) {
  const [suggestions, setSuggestions] = useState<
    ProviderSuggestionDto[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listSuggestions(menuDayId)
      .then((items) => {
        if (active) setSuggestions(items);
      })
      .catch((err: unknown) => {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Couldn't load suggestions.",
          );
      });
    return () => {
      active = false;
    };
  }, [menuDayId]);

  const trimmed = text.trim();
  const canSend = !busy && trimmed.length > 0;

  async function onSend() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createSuggestion(menuDayId, {
        suggestionText: trimmed,
      });
      // Prepend (the list is newest-first) so the member sees it land immediately.
      setSuggestions((prev) => [created, ...(prev ?? [])]);
      setText("");
      setNotice("Suggestion sent. Thanks!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-10 lg:px-8">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Lightbulb className="size-5 text-muted-foreground" aria-hidden />
          Suggest a change
        </h2>
        <p className="text-sm text-muted-foreground">
          Send {providerName} an idea for today&rsquo;s menu. Suggestions are
          optional and don&rsquo;t change your order.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="suggestion-text" className="sr-only">
          Your suggestion
        </label>
        <Textarea
          id="suggestion-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setNotice(null);
            setError(null);
          }}
          rows={2}
          maxLength={SUGGESTION_TEXT_MAX_LENGTH}
          placeholder="e.g. Could you add a millet roti option?"
        />
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            {notice}
          </p>
        ) : null}
        <Button onClick={onSend} disabled={!canSend}>
          <MessageSquarePlus /> {busy ? "Sending…" : "Send suggestion"}
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Your suggestions
        </h3>
        {loadError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {loadError}
          </p>
        ) : suggestions === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&rsquo;t sent any suggestions for today.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="member-suggestion-list">
            {suggestions.map((s) => (
              <li
                key={s.suggestionId}
                className="space-y-1.5 rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{s.suggestionText}</p>
                  <Badge
                    variant={PROVIDER_SUGGESTION_STATUS_BADGE_VARIANT[s.status]}
                  >
                    {providerSuggestionStatusLabel(s.status)}
                  </Badge>
                </div>
                {s.providerResponse ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    <span className="font-medium">{providerName}:</span>{" "}
                    {s.providerResponse}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
