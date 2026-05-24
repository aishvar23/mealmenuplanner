/**
 * Draft-save validation + inbound translation, the input half of the onboarding
 * translation boundary (design/04 § 1; design/06 § 5/§ 9). Pure and I/O-free — no
 * `server-only`, no Supabase — so it is trivially unit-testable and the service
 * just calls it.
 *
 * Autosave is deliberately **lenient**: a draft is partial by definition, so we
 * validate only the envelope — `currentStep` is a known wizard step, and
 * `draftData` is a JSON object — and store the payload as-is. The client's
 * advisory `completionPercentage` is ignored; the service recomputes it from the
 * required set. Strict leaf validation (valid enums, integer ranges) is the
 * completion transaction's job (P2-6), not autosave's.
 */

import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import {
  isValidStep,
  STEP_IDS,
  type DraftData,
  type StepId,
} from "@/lib/onboarding";

/** The validated, translation-ready fields a `PUT` draft save persists. */
export interface DraftUpdate {
  currentStep: StepId;
  draftData: DraftData;
}

/** A plain JSON object (not an array or scalar) — the shape `draftData` must take. */
function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a `PUT /api/onboarding/draft` body into the fields to persist. Throws
 * a single `ValidationError` (400) collecting every envelope issue.
 *
 * `currentStep` must be one of the known wizard steps (a stale/unknown value
 * can't deep-link the resume). `draftData` must be a JSON object — its leaves are
 * left unchecked here (lenient autosave). `completionPercentage`, if sent, is
 * ignored.
 */
export function parseDraftUpdate(body: JsonObject): DraftUpdate {
  const issues: ValidationIssue[] = [];

  const currentStepRaw = body.currentStep;
  let currentStep: StepId | undefined;
  if (typeof currentStepRaw === "string" && isValidStep(currentStepRaw)) {
    currentStep = currentStepRaw;
  } else {
    issues.push({ field: "currentStep", rule: "enum", allowed: STEP_IDS });
  }

  const draftDataRaw = body.draftData;
  let draftData: DraftData | undefined;
  if (isPlainObject(draftDataRaw)) {
    draftData = draftDataRaw as DraftData;
  } else {
    issues.push({ field: "draftData", rule: "object" });
  }

  if (currentStep === undefined || draftData === undefined) {
    throw new ValidationError("Invalid onboarding draft payload.", issues);
  }

  return { currentStep, draftData };
}
