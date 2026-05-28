"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EMAIL_CATEGORY_OPTIONS } from "@/lib/events/categories";
import type { NotificationEmailPreferencesDto } from "@/lib/services/notification-preferences";

/**
 * Notification-settings form (P9). One checkbox per email category, all off for
 * a fresh user, plus an "All updates in household" master that toggles every box.
 * Saving PUTs the full map to `/api/notification-preferences`. Pure client state
 * over a server-rendered `initial`; the type-only DTO import is erased so no
 * server module reaches the bundle (mirrors `notification-client.ts`).
 */
export function NotificationSettingsForm({
  householdId,
  initial,
}: {
  householdId: string;
  initial: NotificationEmailPreferencesDto;
}) {
  const [categories, setCategories] = useState<Record<string, boolean>>(
    initial.categories,
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allOn = EMAIL_CATEGORY_OPTIONS.every((o) => categories[o.category]);

  const setOne = (category: string, value: boolean) => {
    setCategories((prev) => ({ ...prev, [category]: value }));
    setSaved(false);
  };

  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const option of EMAIL_CATEGORY_OPTIONS) next[option.category] = value;
    setCategories(next);
    setSaved(false);
  };

  const onSave = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, categories }),
      });
      if (!res.ok) {
        let message = `Couldn't save your settings (${res.status}).`;
        try {
          const envelope = (await res.json()) as {
            error?: { message?: string };
          };
          message = envelope.error?.message ?? message;
        } catch {
          // Non-JSON body — keep the status-derived message.
        }
        throw new Error(message);
      }
      const dto = (await res.json()) as NotificationEmailPreferencesDto;
      setCategories(dto.categories);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4">
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-border accent-primary"
          checked={allOn}
          onChange={(e) => setAll(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            All updates in household
          </span>
          <span className="block text-xs text-muted-foreground">
            Turn every email below on or off at once.
          </span>
        </span>
      </label>

      <ul className="mt-4 divide-y rounded-lg border">
        {EMAIL_CATEGORY_OPTIONS.map((option) => (
          <li
            key={option.category}
            className="flex items-start gap-3 px-4 py-3"
          >
            <input
              id={`nep-${option.category}`}
              type="checkbox"
              className="mt-0.5 size-4 rounded border-border accent-primary"
              checked={Boolean(categories[option.category])}
              onChange={(e) => setOne(option.category, e.target.checked)}
            />
            <label
              htmlFor={`nep-${option.category}`}
              className="min-w-0 flex-1 cursor-pointer"
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && !pending && (
          <span className="text-sm text-muted-foreground">Saved.</span>
        )}
      </div>
    </div>
  );
}
