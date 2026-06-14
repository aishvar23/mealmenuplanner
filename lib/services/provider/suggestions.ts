import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { mapPgError } from "@/lib/db/rpc-error";
import { ConflictError, NotFoundError, RateLimitedError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type { ProviderSuggestionDto } from "@/packages/shared/provider";

import { mapReadError, type SupabaseClient } from "./read-utils";
import {
  validateCreateSuggestion,
  validateResolveSuggestion,
} from "./suggestion-validation";

/**
 * Provider meal-suggestion service (MP-A-131, contract 03 § 8). A member files a
 * non-binding free-text suggestion for a menu day; the owner resolves it
 * (accept-as-option / reject) with an optional note. Suggestions NEVER touch a
 * response or batch (BR-012) — they are an out-of-band channel only.
 *
 *   • `createSuggestion`          — `POST /api/provider-menu-days/{id}/suggestions`
 *   • `acceptSuggestionAsOption`  — `POST /api/provider-suggestions/{id}/accept-as-option`
 *   • `rejectSuggestion`          — `POST /api/provider-suggestions/{id}/reject`
 *
 * Unlike the response tables (SELECT-only, mutated through SECURITY DEFINER RPCs),
 * `provider_meal_suggestions` grants the member self-INSERT and the owner UPDATE
 * directly (migration `pmp_5_responses`, policies `pms_insert`/`pms_update`), so
 * these writes go straight through the RLS-scoped request client — no RPC needed.
 * RLS is the authoritative backstop: `pms_insert` re-derives `provider_id` from the
 * day and requires active membership; `pms_update` requires `is_provider_owner`.
 *
 * Creation is rate-limited at the service (§ 19.1, BR-012): a member may file at
 * most {@link SUGGESTION_RATE_MAX} suggestions within a rolling
 * {@link SUGGESTION_RATE_WINDOW_MS} window, counted over their own rows (visible via
 * `pms_select`). Resolution is `pending`-only — re-resolving an already-resolved
 * suggestion is a `409 { reason: "suggestion_not_pending" }`.
 */

type SuggestionRow =
  Database["public"]["Tables"]["provider_meal_suggestions"]["Row"];

/** Max suggestions a member may file within {@link SUGGESTION_RATE_WINDOW_MS}. */
export const SUGGESTION_RATE_MAX = 10;
/** The rolling rate-limit window (1 hour). */
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000;

/** The columns the DTO needs — selected explicitly, never `*`. */
const SUGGESTION_COLUMNS =
  "id, menu_day_id, member_user_id, suggestion_text, status, provider_response, created_at, updated_at";

/** Map a `provider_meal_suggestions` row to its wire DTO (snake_case → camelCase). */
function toSuggestionDto(row: SuggestionRow): ProviderSuggestionDto {
  return {
    suggestionId: row.id,
    menuDayId: row.menu_day_id,
    memberUserId: row.member_user_id,
    suggestionText: row.suggestion_text,
    status: row.status,
    providerResponse: row.provider_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `POST /api/provider-menu-days/{menuDayId}/suggestions` — the caller files a
 * suggestion for the day (UC-SUGGEST-001). The day's `provider_id` is read via RLS
 * (the member can see a published/locked day) — an unreadable/unknown id is an
 * existence-hiding `NotFoundError`, never the client-supplied value — then the row
 * is inserted with the route's menu day, the derived provider, and the caller as
 * author. RLS `pms_insert` re-checks all three. Rate-limited before the insert.
 */
export async function createSuggestion(
  menuDayId: string,
  body: JsonObject,
): Promise<ProviderSuggestionDto> {
  const user = await requireAuthUser();
  if (!isUuid(menuDayId)) throw new NotFoundError("Menu not found.");
  const { suggestionText } = validateCreateSuggestion(body);

  const supabase: SupabaseClient = await createServerSupabaseClient();

  // Resolve the day's provider via RLS — a member sees only published/locked days
  // of providers they're active in, so this also gates which days are suggestable.
  const day = await supabase
    .from("provider_menu_days")
    .select("provider_id")
    .eq("id", menuDayId)
    .maybeSingle();
  if (day.error) mapReadError(day.error, "Failed to load the menu.");
  if (!day.data) throw new NotFoundError("Menu not found.");
  const providerId = day.data.provider_id;

  await enforceSuggestionRateLimit(supabase, user.id);

  const { data, error } = await supabase
    .from("provider_meal_suggestions")
    .insert({
      provider_id: providerId,
      menu_day_id: menuDayId,
      member_user_id: user.id,
      suggestion_text: suggestionText,
    })
    .select(SUGGESTION_COLUMNS)
    .single();
  // A 42501 means RLS rejected the insert (not an active member of the day's
  // provider) — existence-hiding 404, uniform with the read above.
  if (error) {
    if (error.code === "42501") throw new NotFoundError("Menu not found.");
    mapReadError(error, "Failed to save your suggestion.");
  }
  return toSuggestionDto(data as SuggestionRow);
}

/** Throw `RateLimitedError` if the caller has hit the rolling-window cap. */
async function enforceSuggestionRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const windowStart = new Date(
    Date.now() - SUGGESTION_RATE_WINDOW_MS,
  ).toISOString();
  const { count, error } = await supabase
    .from("provider_meal_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("member_user_id", userId)
    .gte("created_at", windowStart);
  if (error) mapReadError(error, "Failed to check the suggestion rate limit.");
  if ((count ?? 0) >= SUGGESTION_RATE_MAX) {
    throw new RateLimitedError(
      "You've sent too many suggestions. Please try again later.",
      Math.ceil(SUGGESTION_RATE_WINDOW_MS / 1000),
    );
  }
}

/** The status a resolution transitions a pending suggestion to. */
type ResolvedStatus = Extract<
  Database["public"]["Enums"]["provider_suggestion_status"],
  "accepted_as_option" | "rejected"
>;

/**
 * Resolve a pending suggestion (owner only). Reads the row via RLS — `pms_select`
 * lets BOTH the owner and the authoring member see it, so reading alone doesn't
 * prove ownership: a non-owner (including the author-member) is gated by an explicit
 * `is_provider_owner` check and gets an existence-hiding `NotFoundError`, not a
 * misleading not-pending 409. Then it guards `pending` (re-resolving is a
 * `409 { reason: "suggestion_not_pending" }`) and updates status + the optional note.
 * The `.eq("status", "pending")` on the UPDATE makes the transition atomic — a
 * concurrent resolve loses the race and re-reads as not-pending. RLS `pms_update`
 * is the authoritative backstop.
 */
async function resolveSuggestion(
  suggestionId: string,
  status: ResolvedStatus,
  body: JsonObject,
): Promise<ProviderSuggestionDto> {
  await requireAuthUser();
  if (!isUuid(suggestionId)) {
    throw new NotFoundError("Suggestion not found.");
  }
  const { providerResponse } = validateResolveSuggestion(body);

  const supabase: SupabaseClient = await createServerSupabaseClient();

  const existing = await supabase
    .from("provider_meal_suggestions")
    .select("status, provider_id")
    .eq("id", suggestionId)
    .maybeSingle();
  if (existing.error) {
    mapReadError(existing.error, "Failed to load the suggestion.");
  }
  if (!existing.data) throw new NotFoundError("Suggestion not found.");

  // The author-member can READ their own suggestion (pms_select), so confirm the
  // caller actually OWNS the provider before treating this as a resolvable row.
  // A non-owner is answered with the same existence-hiding 404 as an unknown id.
  const owner = await supabase.rpc("is_provider_owner", {
    p: existing.data.provider_id,
  });
  if (owner.error) {
    mapPgError(owner.error, "Failed to verify provider ownership.");
  }
  if (!owner.data) throw new NotFoundError("Suggestion not found.");

  if (existing.data.status !== "pending") {
    throw new ConflictError("This suggestion has already been resolved.", {
      reason: PROVIDER_ERROR_REASONS.suggestion_not_pending,
    });
  }

  const patch: Database["public"]["Tables"]["provider_meal_suggestions"]["Update"] =
    { status };
  // Only overwrite the note when the key was supplied (undefined = leave as-is).
  if (providerResponse !== undefined)
    patch.provider_response = providerResponse;

  const { data, error } = await supabase
    .from("provider_meal_suggestions")
    .update(patch)
    .eq("id", suggestionId)
    .eq("status", "pending")
    .select(SUGGESTION_COLUMNS)
    .maybeSingle();
  if (error) mapReadError(error, "Failed to resolve the suggestion.");
  // Null here means the row stopped being pending between the read and the update
  // (concurrent resolve) — surface the same not-pending conflict.
  if (!data) {
    throw new ConflictError("This suggestion has already been resolved.", {
      reason: PROVIDER_ERROR_REASONS.suggestion_not_pending,
    });
  }
  return toSuggestionDto(data as SuggestionRow);
}

/** `POST /api/provider-suggestions/{id}/accept-as-option` — owner accepts (UC-SUGGEST-002). */
export function acceptSuggestionAsOption(
  suggestionId: string,
  body: JsonObject,
): Promise<ProviderSuggestionDto> {
  return resolveSuggestion(suggestionId, "accepted_as_option", body);
}

/** `POST /api/provider-suggestions/{id}/reject` — owner rejects (UC-SUGGEST-003). */
export function rejectSuggestion(
  suggestionId: string,
  body: JsonObject,
): Promise<ProviderSuggestionDto> {
  return resolveSuggestion(suggestionId, "rejected", body);
}
