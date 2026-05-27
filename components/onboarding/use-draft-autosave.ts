"use client";

import { useEffect, useRef, useState } from "react";

import type { SaveStatus } from "@/lib/onboarding";
import type { DraftDto } from "@/lib/services/onboarding/dto";

import { fetchDraft, putDraft, type DraftSnapshot } from "./draft-client";

/**
 * Onboarding autosave hook (P2-3) — design/06 § 5.
 *
 * Owns the wizard's persistence: a debounced field autosave (~800 ms) plus an
 * immediate per-step save, both hitting the idempotent `PUT /api/onboarding/draft`.
 * Tracks the {@link SaveStatus} for the save-state indicator, keeps the
 * `lastSavedAt`, and remembers the draft id so completion (P2-6) can `POST`.
 *
 * Robustness (design/06 § 5):
 *  - **Keep local state** — a failed save never discards edits; status goes
 *    `error` and the user can retry.
 *  - **Serialized saves** — overlapping requests are chained (a promise queue) so
 *    the last write wins and `saveNow()` resolves to the most recent server draft.
 *  - **Coalesced** — an unchanged snapshot is not re-sent.
 *  - **409 reconcile** — a lost-race `409` triggers a `GET` then one retry.
 *  - **Backoff retry** — failures auto-retry (1s/2s/4s, capped) on top of the
 *    manual retry control.
 *  - **Warn before leaving** — `beforeunload` fires while edits are unsaved.
 *
 * Internal helpers are hoisted `function` declarations closing over refs, so the
 * three mutually-recursive operations (save → backoff → enqueue → save) resolve
 * at call time without stale closures or dependency churn.
 */

const DEFAULT_DEBOUNCE_MS = 800;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 4000;

export interface UseDraftAutosaveOptions {
  /** Draft id to resume into (from a loaded draft), else `null` for a fresh one. */
  initialDraftId: string | null;
  /** `lastSavedAt` of the resumed draft, for the initial relative string. */
  initialLastSavedAt: string | null;
  debounceMs?: number;
}

export interface UseDraftAutosaveResult {
  status: SaveStatus;
  lastSavedAt: string | null;
  draftId: string | null;
  hasUnsavedChanges: boolean;
  /** Buffer an edit; saved after the debounce window (field autosave). */
  queueSave: (snapshot: DraftSnapshot) => void;
  /** Save immediately and resolve to the server draft (step nav / finish). */
  saveNow: (snapshot: DraftSnapshot) => Promise<DraftDto | null>;
  /** Re-attempt the latest snapshot after a failure. */
  retry: () => void;
}

export function useDraftAutosave({
  initialDraftId,
  initialLastSavedAt,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDraftAutosaveOptions): UseDraftAutosaveResult {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialLastSavedAt,
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Mutable machinery the async code reads without re-subscribing to renders.
  const latestRef = useRef<DraftSnapshot | null>(null);
  const savedJsonRef = useRef<string | null>(null);
  const savedDtoRef = useRef<DraftDto | null>(null);
  const runRef = useRef<Promise<DraftDto | null>>(Promise.resolve(null));
  const statusRef = useRef<SaveStatus>("idle");
  const unsavedRef = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const mountedRef = useRef(true);

  function setStatusSafe(next: SaveStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }

  function markUnsaved(value: boolean) {
    unsavedRef.current = value;
    if (mountedRef.current) setHasUnsavedChanges(value);
  }

  // One PUT cycle for `snapshot`, with a single 409-reconcile retry.
  async function performSave(
    snapshot: DraftSnapshot,
  ): Promise<DraftDto | null> {
    const json = JSON.stringify(snapshot);
    // Coalesce: nothing changed since the last successful save.
    if (json === savedJsonRef.current && statusRef.current !== "error") {
      // The buffered snapshot already matches what's persisted. If it's still
      // the latest edit, clear the dirty flag that saveNow/queueSave optimistically
      // set so the `beforeunload` guard doesn't warn on an already-saved draft —
      // e.g. clicking Finish right after a per-step save persisted the identical
      // snapshot (BUG-019: spurious "changes may not be saved" leave dialog).
      if (JSON.stringify(latestRef.current) === json) {
        markUnsaved(false);
        setStatusSafe("saved");
      }
      return savedDtoRef.current;
    }

    setStatusSafe("saving");
    try {
      let result = await putDraft(snapshot);
      if (result.kind === "conflict") {
        // A concurrent device won the in-progress slot — reconcile, then retry.
        const existing = await fetchDraft();
        if (existing && mountedRef.current) {
          setDraftId(existing.id);
          setLastSavedAt(existing.lastSavedAt);
        }
        result = await putDraft(snapshot);
        if (result.kind === "conflict") {
          throw new Error("Draft conflict could not be reconciled.");
        }
      }

      const draft = result.draft;
      savedJsonRef.current = json;
      savedDtoRef.current = draft;
      backoffRef.current = INITIAL_BACKOFF_MS;
      if (mountedRef.current) {
        setDraftId(draft.id);
        setLastSavedAt(draft.lastSavedAt);
      }
      // Clear "unsaved"/"saved" only if this was the latest snapshot; a newer
      // edit mid-request keeps the dirty flag and re-saves on the next enqueue.
      if (JSON.stringify(latestRef.current) === json) {
        markUnsaved(false);
        setStatusSafe("saved");
      }
      return draft;
    } catch {
      setStatusSafe("error");
      scheduleBackoffRetry();
      return null;
    }
  }

  // Chain saves so they never overlap; each runs the *latest* snapshot.
  function enqueueSave(): Promise<DraftDto | null> {
    const snapshot = latestRef.current;
    if (!snapshot) return Promise.resolve(null);
    const next = runRef.current.then(() => performSave(snapshot));
    runRef.current = next.catch(() => null);
    return next;
  }

  // Auto-retry after a failure (1s → 2s → 4s, capped).
  function scheduleBackoffRetry() {
    if (backoffTimer.current) clearTimeout(backoffTimer.current);
    const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS);
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    backoffTimer.current = setTimeout(() => {
      if (mountedRef.current) void enqueueSave();
    }, delay);
  }

  function queueSave(snapshot: DraftSnapshot) {
    latestRef.current = snapshot;
    markUnsaved(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void enqueueSave();
    }, debounceMs);
  }

  function saveNow(snapshot: DraftSnapshot): Promise<DraftDto | null> {
    latestRef.current = snapshot;
    markUnsaved(true);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    return enqueueSave();
  }

  function retry() {
    if (backoffTimer.current) clearTimeout(backoffTimer.current);
    backoffRef.current = INITIAL_BACKOFF_MS;
    void enqueueSave();
  }

  // Warn before leaving with unsaved buffered edits (design/06 § 5).
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (unsavedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Clear timers on unmount and stop touching state after it.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (backoffTimer.current) clearTimeout(backoffTimer.current);
    };
  }, []);

  return {
    status,
    lastSavedAt,
    draftId,
    hasUnsavedChanges,
    queueSave,
    saveNow,
    retry,
  };
}
