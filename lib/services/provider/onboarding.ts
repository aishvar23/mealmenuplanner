import "server-only";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";
import type {
  ProviderDto,
  ProviderUpdateInput,
} from "@/packages/shared/provider";

import {
  isValidTimeZone,
  validateProviderName,
  validateProviderUpdate,
} from "./validation";

/**
 * Provider owner onboarding + settings service (MP-A-101, contract 03 § 8).
 *
 * The write path the onboarding wizard (web MP-B-020, mobile MP-C-020) drives:
 *   • `createProviderDraft` — `POST /api/providers`; mints the draft org + active
 *     owner membership atomically via the `create_provider_draft` RPC (org INSERT
 *     is RPC-only since pmp_7b dropped `porg_insert`). The draft org IS the
 *     provider-specific onboarding draft store (ADR-6 Option 2), resumable.
 *   • `getProvider` — `GET /api/providers/{id}`; the full org for the settings
 *     form + resume, gated by RLS `porg_select` (awaiting/active members).
 *   • `updateProvider` — `PATCH /api/providers/{id}`; partial settings update
 *     through RLS `porg_update` (active owner only; the guard trigger freezes the
 *     server-controlled `status`/`owner_user_id`).
 *   • `completeProviderOnboarding` — `POST .../complete-onboarding`; flips the
 *     draft to `active` via the owner-scoped `complete_provider_onboarding` RPC.
 *
 * Route handlers stay thin (design/04 § 1): they parse, call one of these, and
 * serialize. All authorization is server-side (RLS + the DEFINER RPCs); the
 * camelCase↔snake_case translation lives here at the service boundary.
 */

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** The org columns the DTO needs — selected explicitly, never `*`. */
const ORG_COLUMNS =
  "id, name, email, phone, city, state, country, timezone, status, default_cutoff_local_time, summary_email_recipients";

interface ProviderOrgRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string;
  status: string;
  default_cutoff_local_time: string | null;
  summary_email_recipients: string[] | null;
}

/** Map a `provider_organizations` row to its wire DTO (snake_case → camelCase). */
function toProviderDto(row: ProviderOrgRow): ProviderDto {
  return {
    providerId: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    country: row.country,
    timezone: row.timezone,
    status: row.status,
    defaultCutoffLocalTime: row.default_cutoff_local_time,
    summaryEmailRecipients: row.summary_email_recipients ?? [],
  };
}

/** Read one org by id (RLS-scoped); `null` when absent or not visible to the caller. */
async function readOrg(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderOrgRow | null> {
  const { data, error } = await supabase
    .from("provider_organizations")
    .select(ORG_COLUMNS)
    .eq("id", providerId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load the provider.", { cause: error });
  }
  return (data as ProviderOrgRow | null) ?? null;
}

/**
 * `POST /api/providers` — create the caller's draft provider org + active owner
 * membership (atomic, RPC-only). Returns the new `ProviderDto` (status `draft`).
 * Resumable: a caller who already has an open draft gets it back, not a duplicate.
 */
export async function createProviderDraft(name: unknown): Promise<ProviderDto> {
  await requireAuthUser();
  const cleanName = validateProviderName(name);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_provider_draft", {
    p_name: cleanName,
  });

  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    if (error.code === "23514") {
      throw new ValidationError("Provider name is required.", [
        { field: "name", rule: "required" },
      ]);
    }
    throw new InternalError("Failed to create the provider.", { cause: error });
  }

  const providerId = data as string;
  const row = await readOrg(supabase, providerId);
  if (!row) {
    // The RPC just created (or resumed) it under the same RLS scope, so a miss
    // here is a genuine internal inconsistency, not a normal not-found.
    throw new InternalError("Provider created but could not be read back.");
  }
  return toProviderDto(row);
}

/**
 * The caller's open draft provider, if any — drives the onboarding page's resume.
 * A draft org is deliberately excluded from the workspace resolver (it is the
 * in-progress onboarding store, not an enterable workspace until completed — see
 * `loadProviderMemberships`), so the page can't discover it via
 * `listProviderSummaries`; it reads the owner's own draft directly here, RLS-scoped
 * by `porg_select` plus the `owner_user_id` match.
 */
export async function getOwnerDraftProvider(): Promise<ProviderDto | null> {
  const user = await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_organizations")
    .select(ORG_COLUMNS)
    .eq("owner_user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load your draft provider.", {
      cause: error,
    });
  }
  return data ? toProviderDto(data as ProviderOrgRow) : null;
}

/** `GET /api/providers/{id}` — the full org for the settings form / resume. */
export async function getProvider(providerId: string): Promise<ProviderDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();
  const row = await readOrg(supabase, providerId);
  if (!row) {
    throw new NotFoundError("Provider not found.");
  }
  return toProviderDto(row);
}

/**
 * `PATCH /api/providers/{id}` — partial settings update (owner only via RLS). An
 * empty patch is a no-op that returns the current state. A row the caller can't
 * update (not owner, or absent) surfaces as `NotFoundError` — we never distinguish
 * "forbidden" from "absent" (design/04 § 2, no cross-tenant existence leak).
 */
export async function updateProvider(
  providerId: string,
  input: Partial<Record<keyof ProviderUpdateInput, unknown>>,
): Promise<ProviderDto> {
  await requireAuthUser();
  const patch = validateProviderUpdate(input);
  const supabase = await createServerSupabaseClient();

  if (Object.keys(patch).length === 0) {
    return getProvider(providerId);
  }

  const { data, error } = await supabase
    .from("provider_organizations")
    .update(patch)
    .eq("id", providerId)
    .select(ORG_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update the provider.", { cause: error });
  }
  if (!data) {
    throw new NotFoundError("Provider not found.");
  }
  return toProviderDto(data as ProviderOrgRow);
}

/**
 * `POST /api/providers/{id}/complete-onboarding` — promote the caller's draft to
 * `active`. Defense-in-depth gate: the org must have the minimum required fields
 * (name + a valid IANA timezone) before completion, mirroring the wizard's
 * required-field gating. Idempotent — an already-active org returns unchanged.
 */
export async function completeProviderOnboarding(
  providerId: string,
): Promise<ProviderDto> {
  await requireAuthUser();
  const supabase = await createServerSupabaseClient();

  const row = await readOrg(supabase, providerId);
  if (!row) {
    throw new NotFoundError("Provider not found.");
  }

  if (row.name.trim().length === 0 || !isValidTimeZone(row.timezone)) {
    throw new ValidationError(
      "Add the required details before finishing setup.",
      [
        ...(row.name.trim().length === 0
          ? [{ field: "name", rule: "required" }]
          : []),
        ...(!isValidTimeZone(row.timezone)
          ? [{ field: "timezone", rule: "timezone" }]
          : []),
      ],
    );
  }

  const { error } = await supabase.rpc("complete_provider_onboarding", {
    p_provider_id: providerId,
  });
  if (error) {
    if (error.code === "28000") throw new UnauthenticatedError();
    if (error.code === "P0002") throw new NotFoundError("Provider not found.");
    if (error.code === "23514") {
      throw new ConflictError("This provider has already been set up.");
    }
    throw new InternalError("Failed to finish provider setup.", {
      cause: error,
    });
  }

  // The RPC flips the org to 'active' (or it already was — idempotent replay).
  // `status` is the only column it touches, so reuse the row we just read for the
  // gate instead of a second round-trip to read it back.
  return toProviderDto({ ...row, status: "active" });
}
