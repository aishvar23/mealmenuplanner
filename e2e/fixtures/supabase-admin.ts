import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

/**
 * Service-role Supabase client for e2e test plumbing only — provisioning the
 * spec users, minting per-test ephemeral users, and cleaning up the households
 * they create. It bypasses RLS, which is exactly why it lives ONLY here in the
 * test harness and is never imported by app code (the app's own service-role
 * client is `server-only`). Decoupled from app modules on purpose so Playwright's
 * transpiler doesn't have to resolve the `@/` alias or `server-only`.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "(put them in .env.local or .env.e2e — see e2e/README.md).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";

/**
 * Role → default `can_*` flags. Mirrors `defaultPermissionsForRole` in
 * lib/auth/permissions.ts so service-role-inserted members match what the app
 * would create at invite/accept time. Keep in sync if the app's matrix changes.
 */
export const ROLE_PERMISSIONS: Record<MemberRole, Record<string, boolean>> = {
  owner: {
    can_view_plan: true,
    can_suggest_meals: true,
    can_change_today_menu: true,
    can_change_weekly_schedule: true,
    can_manage_grocery_list: true,
    can_invite_members: true,
    can_remove_members: true,
    can_edit_household_preferences: true,
  },
  admin: {
    can_view_plan: true,
    can_suggest_meals: true,
    can_change_today_menu: true,
    can_change_weekly_schedule: true,
    can_manage_grocery_list: true,
    can_invite_members: true,
    can_remove_members: false,
    can_edit_household_preferences: true,
  },
  member: {
    can_view_plan: true,
    can_suggest_meals: true,
    can_change_today_menu: false,
    can_change_weekly_schedule: false,
    can_manage_grocery_list: false,
    can_invite_members: false,
    can_remove_members: false,
    can_edit_household_preferences: false,
  },
  viewer: {
    can_view_plan: true,
    can_suggest_meals: false,
    can_change_today_menu: false,
    can_change_weekly_schedule: false,
    can_manage_grocery_list: false,
    can_invite_members: false,
    can_remove_members: false,
    can_edit_household_preferences: false,
  },
};

/** Grant app-operator access by setting `app_metadata.app_role = "admin"`. */
export async function setAdminAppRole(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { app_role: "admin" },
  });
  if (error) {
    throw new Error(
      `E2E: could not grant admin role to ${userId}: ${error.message}`,
    );
  }
}

/** The household a user created (their owned household), or null. */
export async function findHouseholdIdByOwner(
  admin: SupabaseClient,
  ownerUserId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("households")
    .select("id")
    .eq("created_by_user_id", ownerUserId)
    .maybeSingle();
  if (error)
    throw new Error(`E2E: findHouseholdIdByOwner failed: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

/**
 * Insert an active membership directly (bypassing the invite/accept flow) so a
 * test can stand up a multi-role household quickly. `expiresAt` set for guests.
 */
export async function addHouseholdMember(
  admin: SupabaseClient,
  args: {
    householdId: string;
    userId: string;
    role: MemberRole;
    membershipType?: "permanent" | "temporary_guest";
    status?: "active" | "invited" | "removed" | "left" | "expired";
    expiresAt?: string | null;
    permissionOverrides?: Record<string, boolean>;
  },
): Promise<void> {
  const {
    householdId,
    userId,
    role,
    membershipType = "permanent",
    status = "active",
    expiresAt = null,
    permissionOverrides = {},
  } = args;
  const { error } = await admin.from("household_members").insert({
    household_id: householdId,
    user_id: userId,
    role,
    membership_type: membershipType,
    status,
    expires_at: expiresAt,
    joined_at: status === "active" ? new Date().toISOString() : null,
    ...ROLE_PERMISSIONS[role],
    ...permissionOverrides,
  });
  if (error) {
    throw new Error(
      `E2E: addHouseholdMember failed for ${userId}: ${error.message}`,
    );
  }
}

/** "User already exists" is the success path when re-provisioning a spec user. */
function isAlreadyExists(error: {
  message?: string;
  status?: number;
  code?: string;
}): boolean {
  return (
    error.code === "email_exists" ||
    error.status === 422 ||
    /already.*registered|already been registered|already exists/i.test(
      error.message ?? "",
    )
  );
}

/**
 * Idempotently ensure an account exists, is email-confirmed, and has the given
 * password (so a real email/password sign-in works without an email round-trip).
 * Returns the user id (== `auth.users.id` == `public.users.id`).
 */
export async function ensureUserWithPassword(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error && created.data.user) {
    return created.data.user.id;
  }
  if (created.error && !isAlreadyExists(created.error)) {
    throw new Error(
      `E2E: could not provision ${email}: ${created.error.message}`,
    );
  }

  // Already exists → find it and re-assert the known password (keeps reruns green
  // even if the password was rotated).
  const existing = await findUserByEmail(admin, email);
  if (!existing) {
    throw new Error(
      `E2E: ${email} reported as existing but could not be found.`,
    );
  }
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  return existing.id;
}

/** Page through admin.listUsers to find a user by email (case-insensitive). */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`E2E: listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

/**
 * Tear down a per-test ephemeral user. Households created during onboarding must
 * go first: `households.created_by_user_id` references `users(id)` with NO
 * cascade, so deleting the auth user while a household references it would fail.
 * Deleting the household cascades its preferences/members; deleting the auth user
 * then cascades the mirrored `public.users` row. Best-effort: a teardown hiccup
 * is logged, not thrown, so it never fails an otherwise-green test.
 */
export async function cleanupUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const households = await admin
    .from("households")
    .delete()
    .eq("created_by_user_id", userId);
  if (households.error) {
    console.warn(
      `E2E cleanup: failed to delete households for ${userId}: ${households.error.message}`,
    );
  }
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error) {
    console.warn(
      `E2E cleanup: failed to delete user ${userId}: ${deleted.error.message}`,
    );
  }
}
