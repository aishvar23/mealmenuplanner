/**
 * `onboarding` service DTOs — the snake_case-row → camelCase-payload translation
 * for the onboarding draft (design/04 § 1, "the translation boundary"; design/06
 * § 9). Pure mappers, no I/O, so the service produces a client-ready DTO and the
 * route handler just serializes it. Shared by the draft read (P2-2 GET) and the
 * draft save (P2-2 PUT) so both return an identical shape.
 *
 * Enum **values** (`status`) pass through unchanged — data, not naming
 * convention.
 */

import type { Database } from "@/lib/db/database.types";
import type { DraftData } from "@/lib/onboarding";

type DraftStatus = Database["public"]["Enums"]["draft_status"];
type DraftRow = Database["public"]["Tables"]["household_profile_drafts"]["Row"];

/** The `household_profile_drafts` columns projected into the API DTO. */
export type DraftProjection = Pick<
  DraftRow,
  | "status"
  | "current_step"
  | "completion_percentage"
  | "last_saved_at"
  | "draft_data"
>;

/**
 * The single in-progress onboarding draft, as the API exposes it (design/06
 * § 9). `GET` returns this (or `null` when none exists); `PUT` returns it with
 * the server-recomputed `completionPercentage` and re-stamped `lastSavedAt`.
 */
export interface DraftDto {
  status: DraftStatus;
  /** A `current_step` value (a `StepId`); deep-links the resume. */
  currentStep: string;
  completionPercentage: number;
  lastSavedAt: string;
  /**
   * The wizard payload (design/06 § 3). Stored as opaque `jsonb`; the leaf shapes
   * are validated only at completion (P2-6), so this is the app-level
   * interpretation of whatever was last saved.
   */
  draftData: DraftData;
}

/** Map a `household_profile_drafts` row to its camelCase DTO. */
export function toDraftDto(row: DraftProjection): DraftDto {
  return {
    status: row.status,
    currentStep: row.current_step,
    completionPercentage: row.completion_percentage,
    lastSavedAt: row.last_saved_at,
    // `draft_data` is an opaque `Json` column; treat the stored object as the
    // (partial, structurally-validated) DraftData it always is in practice.
    draftData: (row.draft_data ?? {}) as DraftData,
  };
}
