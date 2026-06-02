import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError, onboardingApi, type OnboardingDraft } from "@/api";
import { householdsQueryKey } from "@/household/use-household";

import {
  computeCompletionPercentage,
  isDraftComplete,
  missingRequiredFields,
  type RequiredFieldId,
} from "./completion";
import { EMPTY_DRAFT_DATA, type DraftData } from "./draft";
import { STEPS, stepIndexById, type StepId } from "./steps";

/**
 * Onboarding wizard orchestration (M2-1, design/06). Owns the merged `draftData`
 * in memory, autosaves it (debounced field edits + an immediate save on every
 * step change, design/06 § 5), recomputes the same completion bar the server
 * stores, and promotes the draft into a live household on finish — invalidating
 * the households cache so the app routes on to Today.
 *
 * Resume (design/06 § 6): on load we `GET` the single `in_progress` draft. If one
 * exists the wizard opens in the `resume` phase (prompt to continue or start
 * over); otherwise it starts fresh at step 1 and the first save creates the row.
 */

const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveState {
  status: SaveStatus;
  /** ISO timestamp of the last successful save (drives "Saved 2 minutes ago"). */
  lastSavedAt: string | null;
  /** Friendly message when `status === "error"`. */
  error: string | null;
}

export type Phase = "loading" | "resume" | "wizard" | "error";

export interface OnboardingController {
  phase: Phase;
  /** The draft as loaded (for the resume prompt: percentage + lastSavedAt). */
  resumeInfo: { completionPercentage: number; lastSavedAt: string } | null;
  loadError: string | null;
  retryLoad: () => void;

  resume: () => void;
  startOver: () => void;

  draftData: DraftData;
  stepIndex: number;
  stepId: StepId;
  totalSteps: number;
  completionPercentage: number;
  missing: RequiredFieldId[];
  canFinish: boolean;

  /** Merge a step slice into the draft and schedule a debounced autosave. */
  updateDraft: (patch: Partial<DraftData>) => void;
  next: () => void;
  back: () => void;

  save: SaveState;
  /** Manual retry for the "Save failed. Retry." affordance. */
  retrySave: () => void;

  finish: () => Promise<string>;
  finishing: boolean;
  finishError: string | null;
}

export function useOnboarding(): OnboardingController {
  const qc = useQueryClient();

  const draftQuery = useQuery({
    queryKey: ["onboardingDraft"],
    queryFn: onboardingApi.getDraft,
    // Hydrated once into local state; never refetch over the user's live edits.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const [phase, setPhase] = useState<Phase>("loading");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<DraftData>(EMPTY_DRAFT_DATA);
  const [stepIndex, setStepIndex] = useState(0);
  const [resumeInfo, setResumeInfo] = useState<{
    completionPercentage: number;
    lastSavedAt: string;
  } | null>(null);
  const [save, setSave] = useState<SaveState>({
    status: "idle",
    lastSavedAt: null,
    error: null,
  });
  const [finishError, setFinishError] = useState<string | null>(null);

  // Refs the debounce + finish flush read so they always see the latest values
  // without re-creating the timer on every keystroke.
  const dataRef = useRef<DraftData>(EMPTY_DRAFT_DATA);
  const stepRef = useRef<StepId>(STEPS[0]!.id);
  const draftIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef<OnboardingDraft | null>(null);

  dataRef.current = draftData;
  stepRef.current = STEPS[stepIndex]!.id;
  draftIdRef.current = draftId;

  // Decide the initial phase once the GET settles.
  useEffect(() => {
    if (draftQuery.isLoading) return;
    if (draftQuery.isError) {
      setPhase("error");
      return;
    }
    const draft = draftQuery.data;
    loadedRef.current = draft ?? null;
    if (draft) {
      setResumeInfo({
        completionPercentage: draft.completionPercentage,
        lastSavedAt: draft.lastSavedAt,
      });
      setPhase("resume");
    } else {
      setPhase("wizard");
    }
  }, [draftQuery.isLoading, draftQuery.isError, draftQuery.data]);

  /** The single write path: persist `data` at `step`, tracking save state. */
  const doSave = useCallback(
    async (data: DraftData, step: StepId): Promise<OnboardingDraft> => {
      setSave((s) => ({ ...s, status: "saving", error: null }));
      try {
        const saved = await onboardingApi.saveDraft({
          currentStep: step,
          completionPercentage: computeCompletionPercentage(data),
          draftData: data,
        });
        setDraftId(saved.id);
        draftIdRef.current = saved.id;
        setSave({
          status: "saved",
          lastSavedAt: saved.lastSavedAt,
          error: null,
        });
        return saved;
      } catch (e) {
        setSave((s) => ({ ...s, status: "error", error: errorMessage(e) }));
        throw e;
      }
    },
    [],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave(dataRef.current, stepRef.current).catch(() => {
      // Error is reflected in `save.status`; keep local edits (design/06 § 5).
    });
  }, [doSave]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doSave(dataRef.current, stepRef.current).catch(() => {});
    }, AUTOSAVE_DELAY_MS);
  }, [doSave]);

  // Flush any pending debounce on unmount so a quick exit doesn't lose the last edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void doSave(dataRef.current, stepRef.current).catch(() => {});
      }
    };
  }, [doSave]);

  const updateDraft = useCallback(
    (patch: Partial<DraftData>) => {
      setDraftData((prev) => {
        const nextData = { ...prev, ...patch };
        dataRef.current = nextData;
        return nextData;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const goToStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, STEPS.length - 1));
      setStepIndex(clamped);
      stepRef.current = STEPS[clamped]!.id;
      // Per-step autosave (design/06 § 5): persist immediately on navigation.
      void flush();
    },
    [flush],
  );

  const next = useCallback(
    () => goToStep(stepIndex + 1),
    [goToStep, stepIndex],
  );
  const back = useCallback(
    () => goToStep(stepIndex - 1),
    [goToStep, stepIndex],
  );

  const resume = useCallback(() => {
    const draft = loadedRef.current;
    if (draft) {
      setDraftId(draft.id);
      setDraftData(draft.draftData ?? EMPTY_DRAFT_DATA);
      dataRef.current = draft.draftData ?? EMPTY_DRAFT_DATA;
      setStepIndex(stepIndexById(draft.currentStep));
      setSave({ status: "saved", lastSavedAt: draft.lastSavedAt, error: null });
    }
    setPhase("wizard");
  }, []);

  const startOver = useCallback(() => {
    // Reuse the same in-progress row: clear the data and overwrite on next save
    // (the partial unique index stays satisfied — one in_progress draft per user).
    setDraftId(loadedRef.current?.id ?? null);
    draftIdRef.current = loadedRef.current?.id ?? null;
    setDraftData(EMPTY_DRAFT_DATA);
    dataRef.current = EMPTY_DRAFT_DATA;
    setStepIndex(0);
    stepRef.current = STEPS[0]!.id;
    setSave({ status: "idle", lastSavedAt: null, error: null });
    setPhase("wizard");
    void flush();
  }, [flush]);

  const retrySave = useCallback(() => {
    void flush();
  }, [flush]);

  const finishMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      setFinishError(null);
      // Cancel any pending debounced save first: once the draft is `completed`,
      // a stray `PUT` would find no `in_progress` row to update and insert a
      // fresh empty draft, leaving a phantom resume prompt behind.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Guarantee the draft exists and the latest edits are persisted, then promote.
      const saved = await doSave(dataRef.current, stepRef.current);
      const result = await onboardingApi.completeOnboarding(saved.id);
      // Force-refetch the households list (not just invalidate) and await it, so
      // the new household is in cache before we route to Today — otherwise the
      // tabs gate would read the stale empty list and bounce back to onboarding.
      await qc.refetchQueries({ queryKey: householdsQueryKey });
      // The draft is `completed` now; drop the cached `in_progress` read.
      qc.removeQueries({ queryKey: ["onboardingDraft"] });
      return result.householdId;
    },
    onError: (e) => setFinishError(errorMessage(e)),
  });

  return {
    phase,
    resumeInfo,
    loadError: draftQuery.isError ? errorMessage(draftQuery.error) : null,
    retryLoad: () => void draftQuery.refetch(),
    resume,
    startOver,
    draftData,
    stepIndex,
    stepId: STEPS[stepIndex]!.id,
    totalSteps: STEPS.length,
    completionPercentage: computeCompletionPercentage(draftData),
    missing: missingRequiredFields(draftData),
    canFinish: isDraftComplete(draftData),
    updateDraft,
    next,
    back,
    save,
    retrySave,
    finish: () => finishMutation.mutateAsync(),
    finishing: finishMutation.isPending,
    finishError,
  };
}

function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Something went wrong. Please try again.";
}
