import "server-only";

import { requireAuthUser } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, NotFoundError, RateLimitedError } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";
import { isUuid } from "@/lib/validation/uuid";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";
import type { ProviderSuggestionDto } from "@/packages/shared/provider";

import { requireProviderOwner } from "./access";
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
 * day, requires active membership, AND requires the day be readable to the caller
 * (`can_read_provider_menu_day` — published/locked for a member), so a direct
 * PostgREST insert can't target an owner-private draft (migration `pmp_13`);
 * `pms_update` requires `is_provider_owner`.
 *
 * Creation is rate-limited at the service (§ 19.1, BR-012): a member may file at
 * most {@link SUGGESTION_RATE_MAX} suggestions to a given provider within a rolling
 * {@link SUGGESTION_RATE_WINDOW_MS} window. The window is scoped per provider for
 * tenant isolation — activity in one workspace never throttles another. Resolution
 * is `pending`-only — re-resolving an already-resolved suggestion is a
 * `409 { reason: "suggestion_not_pending" }`.
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
 * `GET /api/provider-menu-days/{menuDayId}/suggestions` — list the suggestions for
 * the day that the caller may see (MP-A-131; the read foundation the write flows
 * lacked). The result is purely RLS-scoped via `pms_select`: the provider **owner**
 * sees every suggestion filed against their day (the triage view), while a **member**
 * sees only their own (their status view). No role branch is needed in this code —
 * the same query returns the right rows for whoever calls it, and a caller with no
 * access to the day (or an empty day) just gets `[]`. Ordered newest-first
 * (`created_at desc`) for a deterministic, triage-friendly list. A malformed
 * `menuDayId` can't name a real day, so it short-circuits to an empty list without a
 * round trip — symmetric with the existence-hiding 404 the write paths use, but a
 * list never leaks existence, so `[]` is the natural answer.
 */
export async function listSuggestions(
  menuDayId: string,
): Promise<ProviderSuggestionDto[]> {
  await requireAuthUser();
  if (!isUuid(menuDayId)) return [];

  const supabase: SupabaseClient = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("provider_meal_suggestions")
    .select(SUGGESTION_COLUMNS)
    .eq("menu_day_id", menuDayId)
    .order("created_at", { ascending: false });
  if (error) mapReadError(error, "Failed to load the suggestions.");
  return (data ?? []).map((row) => toSuggestionDto(row as SuggestionRow));
}

/**
 * `POST /api/provider-menu-days/{menuDayId}/suggestions` — the caller files a
 * suggestion for the day (UC-SUGGEST-001). The day's `provider_id` is read via RLS
 * (the member can see a published/locked day) — an unreadable/unknown id is an
 * existence-hiding `NotFoundError`, never the client-supplied value — then the row
 * is inserted with the route's menu day, the derived provider, and the caller as
 * author. RLS `pms_insert` independently re-checks the author, the day→provider
 * binding, active membership, AND the day's readable (non-draft) status — so it is a
 * complete backstop, not just a partial one. Rate-limited (per provider) before the
 * insert.
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

  await enforceSuggestionRateLimit(supabase, user.id, providerId);

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

/**
 * Throw `RateLimitedError` if the caller has hit the rolling-window cap for this
 * provider. The count is scoped to `providerId` (not just the member) so the limit
 * is per workspace — being active in several providers can't make one provider's
 * suggestions throttle another's. (MVP choice: a coarse per-provider abuse guard;
 * a global or weighted limit can come later if needed.)
 */
async function enforceSuggestionRateLimit(
  supabase: SupabaseClient,
  userId: string,
  providerId: string,
): Promise<void> {
  const windowStart = new Date(
    Date.now() - SUGGESTION_RATE_WINDOW_MS,
  ).toISOString();
  const { count, error } = await supabase
    .from("provider_meal_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("member_user_id", userId)
    .eq("provider_id", providerId)
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
 * Resolve a pending suggestion (owner only). Reads the row's `provider_id` via RLS —
 * `pms_select` lets BOTH the owner and the authoring member see it, so reading alone
 * doesn't prove ownership: a non-owner (including the author-member) is gated by the
 * shared {@link requireProviderOwner} check and gets an existence-hiding
 * `NotFoundError`. The `.eq("status", "pending")` on the UPDATE then guards the
 * transition atomically and is the SOLE not-pending detector — an UPDATE that matches
 * no pending row (already resolved, or a concurrent resolve that won the race) yields
 * `null` → `409 { reason: "suggestion_not_pending" }`. RLS `pms_update` is the
 * authoritative backstop.
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

  // Read only the provider_id — needed to gate ownership. The pending-status check
  // is left to the guarded UPDATE below (its `.eq("status","pending")` is the single
  // source of the not-pending conflict), so no status is pre-read.
  const existing = await supabase
    .from("provider_meal_suggestions")
    .select("provider_id")
    .eq("id", suggestionId)
    .maybeSingle();
  if (existing.error) {
    mapReadError(existing.error, "Failed to load the suggestion.");
  }
  if (!existing.data) throw new NotFoundError("Suggestion not found.");

  // The author-member can READ their own suggestion (pms_select), so confirm the
  // caller actually OWNS the provider before treating this as a resolvable row.
  // A non-owner is answered with the same existence-hiding 404 as an unknown id.
  await requireProviderOwner(supabase, existing.data.provider_id);

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
