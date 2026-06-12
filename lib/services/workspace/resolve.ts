import "server-only";

import { cache } from "react";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { InternalError } from "@/lib/errors";
import { listUserHouseholds } from "@/lib/services/household";
import type {
  ProviderMembershipRole,
  ProviderMembershipStatus,
  ProviderSummaryDto,
  WorkspaceDiscovery,
  WorkspaceRef,
} from "@/packages/shared/provider";

/**
 * Workspace resolver (MP-A-100, ADR-1). A single user can be a household member,
 * a provider owner, and a customer of several providers at once (design spec
 * §4.2). This service is the one place that enumerates every workspace the caller
 * can enter and where each one lands, so post-login routing (MP-B-010) and the
 * workspace switcher consume `WorkspaceRef[]` instead of re-deriving membership.
 *
 * It is the provider-aware extension of `resolveCurrentHousehold`: household
 * workspaces come from the existing `listUserHouseholds()` (same RLS, same
 * active/preferred selection), provider workspaces from the caller's enterable
 * `provider_memberships` (awaiting_approval / active) joined to the org for its
 * name + timezone. `invited` is deliberately NOT enterable: the pmp_7b hardening
 * (porg_select → `can_view_provider_identity`) grants provider-identity reads only
 * to awaiting_approval + active members, so a merely-invited user can neither read
 * their org nor should be routed into a provider workspace before accepting.
 * Removed/rejected memberships are not live and never surface. Everything reads
 * under the per-request RLS client — `pmem_select` lets a member read their own
 * rows, `porg_select` exposes the org to awaiting_approval/active members.
 */

/** Default destination per workspace (contract 03 §2; spec §12.4). */
const HOUSEHOLD_DEFAULT_PATH = "/today";

function providerOwnerPath(): string {
  return "/provider/dashboard";
}

function providerCustomerPath(
  providerId: string,
  status: ProviderMembershipStatus,
): string {
  // An approved customer lands on today's menu; an awaiting-approval customer
  // lands on the holding screen until the owner approves them.
  return status === "active"
    ? `/providers/${providerId}/today`
    : `/providers/${providerId}/awaiting-approval`;
}

/**
 * The provider statuses that grant an enterable workspace. `invited` is excluded:
 * a not-yet-accepted invite confers no provider access (pmp_7b §5 revoked org
 * reads for invited members), so it must not surface as a workspace — it would
 * only render with placeholder identity and route the user in prematurely. This
 * set matches `can_view_provider_identity` (the porg_select gate).
 */
const LIVE_PROVIDER_STATUSES: ProviderMembershipStatus[] = [
  "awaiting_approval",
  "active",
];

type ProviderMembershipJoin = {
  provider_id: string;
  role: ProviderMembershipRole;
  status: ProviderMembershipStatus;
  provider_organizations: {
    name: string;
    timezone: string;
    status: string;
  } | null;
};

/**
 * The caller's enterable provider memberships, joined to org identity, oldest
 * first. Wrapped in React `cache()` keyed on `userId` so a single request that
 * resolves both summaries and workspaces (e.g. the `/workspace` chooser, which
 * calls `listProviderSummaries` and `resolveWorkspaceDiscovery`) issues exactly
 * one `provider_memberships` query instead of one per caller. Creates its own
 * per-request RLS client so the cache key is just the user, not a client handle.
 */
const loadProviderMemberships = cache(async function loadProviderMemberships(
  userId: string,
): Promise<ProviderMembershipJoin[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("provider_memberships")
    .select(
      "provider_id, role, status, provider_organizations(name, timezone, status)",
    )
    .eq("user_id", userId)
    .in("status", LIVE_PROVIDER_STATUSES)
    .order("created_at", { ascending: true });
  if (error) {
    throw new InternalError("Failed to resolve your provider workspaces.", {
      cause: error,
    });
  }
  const rows = (data ?? []) as unknown as ProviderMembershipJoin[];
  // A `draft` org is the in-progress onboarding store (ADR-6), not an enterable
  // workspace. Its owner membership is created `active` immediately (so the owner
  // can PATCH settings + resume across devices), but it must not surface in the
  // chooser/switcher or auto-routing until onboarding completes (status → active).
  return rows.filter((m) => m.provider_organizations?.status !== "draft");
});

/**
 * Provider summaries for the caller — the `GET /api/providers` payload. One entry
 * per live provider membership; the org name/timezone come from the joined org.
 */
export const listProviderSummaries = cache(
  async function listProviderSummaries(): Promise<ProviderSummaryDto[]> {
    const user = await requireAuthUser();
    const memberships = await loadProviderMemberships(user.id);

    return memberships.map((m) => ({
      providerId: m.provider_id,
      name: m.provider_organizations?.name ?? "Your provider",
      role: m.role,
      membershipStatus: m.status,
      timezone: m.provider_organizations?.timezone ?? "UTC",
    }));
  },
);

/**
 * Every workspace the caller can enter, household workspaces first (the historical
 * default) then provider workspaces, each tagged with its default destination.
 * Empty only for a brand-new user who belongs to nothing yet (routed to
 * onboarding by the caller).
 */
export const resolveWorkspaces = cache(
  async function resolveWorkspaces(): Promise<WorkspaceRef[]> {
    const user = await requireAuthUser();

    const [households, providers] = await Promise.all([
      listUserHouseholds(),
      loadProviderMemberships(user.id),
    ]);

    const householdRefs: WorkspaceRef[] = households.map((h) => ({
      type: "household",
      id: h.householdId,
      role: h.role,
      defaultPath: HOUSEHOLD_DEFAULT_PATH,
    }));

    const providerRefs: WorkspaceRef[] = providers.map((m) =>
      m.role === "owner"
        ? {
            type: "provider_owner",
            id: m.provider_id,
            role: "owner",
            defaultPath: providerOwnerPath(),
          }
        : {
            type: "provider_customer",
            id: m.provider_id,
            role: "customer",
            status: m.status,
            defaultPath: providerCustomerPath(m.provider_id, m.status),
          },
    );

    return [...householdRefs, ...providerRefs];
  },
);

/** The caller's persisted active-workspace pointer (`user_active_workspace`). */
async function loadActiveWorkspacePointer(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<{ type: WorkspaceRef["type"]; id: string } | null> {
  const { data, error } = await supabase
    .from("user_active_workspace")
    .select("workspace_type, workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to resolve your active workspace.", {
      cause: error,
    });
  }
  if (!data) return null;
  return {
    type: data.workspace_type as WorkspaceRef["type"],
    id: data.workspace_id,
  };
}

/**
 * The caller's workspaces plus the one they last chose (`user_active_workspace`),
 * validated against the current list — a pointer at a workspace they no longer
 * belong to resolves to `null` so the chooser falls back cleanly. Drives the
 * `/workspace` entry and the switcher.
 */
export const resolveWorkspaceDiscovery = cache(
  async function resolveWorkspaceDiscovery(): Promise<WorkspaceDiscovery> {
    const user = await requireAuthUser();
    const supabase = await createServerSupabaseClient();

    const [workspaces, pointer] = await Promise.all([
      resolveWorkspaces(),
      loadActiveWorkspacePointer(supabase, user.id),
    ]);

    const activeWorkspace =
      pointer &&
      workspaces.some((w) => w.type === pointer.type && w.id === pointer.id)
        ? pointer
        : null;

    return { workspaces, activeWorkspace };
  },
);

/**
 * Where to send a user who has no active household (MP-B-012, spec §12.3). The
 * entry-routing rule, minus the explicit-return-URL step the auth callback owns:
 *   - belongs to nothing → `/onboarding` (brand-new household signup);
 *   - exactly one workspace → straight into it (no chooser for a single place);
 *   - several, with a valid stored active pointer → that workspace;
 *   - several, no valid pointer → the `/workspace` chooser.
 * The `(app)` onboarding gate calls this once it finds no household, so a
 * provider-only user is auto-entered (the auto-redirect MP-B-010 deferred to the
 * provider shells) instead of always landing on the chooser.
 */
export const resolveWorkspaceEntryPath = cache(
  async function resolveWorkspaceEntryPath(): Promise<string> {
    const { workspaces, activeWorkspace } = await resolveWorkspaceDiscovery();

    if (workspaces.length === 0) return "/onboarding";
    if (workspaces.length === 1) return workspaces[0]!.defaultPath;

    // `activeWorkspace` is already validated against `workspaces` in discovery, so
    // when present it always resolves to a ref; absent (no pointer, or a stale one
    // for a workspace the user left) → the chooser.
    const active = activeWorkspace
      ? workspaces.find(
          (w) => w.type === activeWorkspace.type && w.id === activeWorkspace.id,
        )
      : undefined;
    return active?.defaultPath ?? "/workspace";
  },
);
