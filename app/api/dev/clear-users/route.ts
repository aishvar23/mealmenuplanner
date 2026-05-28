import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isDevLoginEnabled } from "@/lib/auth/dev-login";
import { ValidationError, withErrorBoundary } from "@/lib/errors";
import { readJsonObject, type JsonObject } from "@/lib/http";
import { createServiceRoleClient } from "@/lib/db/service-role";
import type { Database } from "@/lib/db/database.types";

// Destructive + reads no cache; never statically cached.
export const dynamic = "force-dynamic";

/** The exact phrase the body must carry to wipe *every* user, so this can't fire by accident. */
const CONFIRM_PHRASE = "DELETE ALL USERS";

type Admin = SupabaseClient<Database>;

interface DeletionResult {
  deletedHouseholds: number;
  deletedUsers: number;
  failures: { id: string; message: string }[];
}

/**
 * `POST /api/dev/clear-users` — ⚠️ DEV-ONLY deletion of user accounts.
 *
 * Two modes, chosen by the request body:
 *  • **Specific users** — `{ "emails": [...] }` and/or `{ "userIds": [...] }`.
 *    Deletes just those accounts (the explicit list is the confirmation).
 *  • **Everything** — `{ "confirm": "DELETE ALL USERS" }`. Wipes every user.
 *
 * Either way the shared content catalog (dishes, ingredients, combinations) is
 * left intact; only users and the household-scoped data hanging off them go.
 *
 * SAFETY — hard-gated on {@link isDevLoginEnabled} (NODE_ENV !== "production"
 * AND DEV_LOGIN_ENABLED=true), so a production build 404s here exactly as it
 * does for `/api/dev/sign-in` — the route's existence isn't even observable.
 *
 * FK ordering: `households.created_by_user_id` and the `invited_by`/`accepted_by`
 * refs on members/invites point at `users` with the default RESTRICT, so a user
 * can't be removed while a household-scoped row still references them. The
 * `public.users` profile itself cascades from `auth.users ON DELETE CASCADE`, as
 * do memberships, drafts, food prefs and notifications — so we only have to clear
 * the RESTRICT refs by hand before deleting the auth users.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!isDevLoginEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const body = await readJsonObject(request);
  const admin = createServiceRoleClient();

  // Specific-user mode is selected by the presence of either targeting key.
  if (body.emails !== undefined || body.userIds !== undefined) {
    return clearSpecificUsers(admin, body);
  }

  // Otherwise it's the wipe-everything path, which demands the confirm phrase.
  if (body.confirm !== CONFIRM_PHRASE) {
    throw new ValidationError(
      `Provide "emails"/"userIds" to delete specific users, or { "confirm": "${CONFIRM_PHRASE}" } to delete all.`,
      [{ field: "confirm", rule: "equals", expected: CONFIRM_PHRASE }],
    );
  }

  const result = await clearAllUsers(admin);
  return summaryResponse({ mode: "all", ...result });
});

/** Wipe every user. Deleting all households first clears every RESTRICT ref. */
async function clearAllUsers(admin: Admin): Promise<DeletionResult> {
  // `.not("id", "is", null)` matches every row (PostgREST requires a filter on
  // delete; id is never null). Cascades all household-scoped data.
  const { data: deletedHouseholds, error: householdsError } = await admin
    .from("households")
    .delete()
    .not("id", "is", null)
    .select("id");
  if (householdsError) {
    throw new Error(`Failed to delete households: ${householdsError.message}`);
  }

  const ids = await listAllUserIds(admin);
  const failures = await deleteAuthUsers(admin, ids);
  return {
    deletedHouseholds: deletedHouseholds?.length ?? 0,
    deletedUsers: ids.length - failures.length,
    failures,
  };
}

/** Resolve the requested emails/userIds, then delete exactly those accounts. */
async function clearSpecificUsers(
  admin: Admin,
  body: JsonObject,
): Promise<Response> {
  const emails = readStringArray(body, "emails");
  const userIds = readStringArray(body, "userIds");

  const ids = new Set(userIds);
  const notFoundEmails: string[] = [];
  if (emails.length > 0) {
    const { data, error } = await admin
      .from("users")
      .select("id, email")
      .in("email", emails);
    if (error) {
      throw new Error(`Failed to look up users by email: ${error.message}`);
    }
    const byEmail = new Map(data.map((u) => [u.email, u.id]));
    for (const email of emails) {
      const id = byEmail.get(email);
      if (id) ids.add(id);
      else notFoundEmails.push(email);
    }
  }

  const targetIds = [...ids];
  if (targetIds.length === 0) {
    if (notFoundEmails.length > 0) {
      return summaryResponse({
        mode: "specific",
        deletedHouseholds: 0,
        deletedUsers: 0,
        failures: [],
        notFoundEmails,
      });
    }
    throw new ValidationError(
      'Provide at least one entry in "emails" or "userIds".',
      [{ field: "emails", rule: "nonEmpty" }],
    );
  }

  const result = await deleteUsersById(admin, targetIds);
  return summaryResponse({ mode: "specific", ...result, notFoundEmails });
}

/**
 * Delete a known set of users. Clears every RESTRICT ref pointing at them —
 * including those in households they don't own — then deletes the auth users.
 */
async function deleteUsersById(
  admin: Admin,
  ids: string[],
): Promise<DeletionResult> {
  // 1. Households they created → cascades members/invites/plans within them.
  const { data: deletedHouseholds, error: householdsError } = await admin
    .from("households")
    .delete()
    .in("created_by_user_id", ids)
    .select("id");
  if (householdsError) {
    throw new Error(`Failed to delete households: ${householdsError.message}`);
  }

  // 2. Remaining RESTRICT refs in households owned by *others*. invited_by on
  //    invites is NOT NULL so the row must go; the nullable refs are blanked so
  //    the surrounding invite/membership history survives.
  const { error: invitesError } = await admin
    .from("household_invites")
    .delete()
    .in("invited_by_user_id", ids);
  if (invitesError) {
    throw new Error(`Failed to clear sent invites: ${invitesError.message}`);
  }
  const { error: acceptedError } = await admin
    .from("household_invites")
    .update({ accepted_by_user_id: null })
    .in("accepted_by_user_id", ids);
  if (acceptedError) {
    throw new Error(
      `Failed to clear accepted invites: ${acceptedError.message}`,
    );
  }
  const { error: memberInviterError } = await admin
    .from("household_members")
    .update({ invited_by_user_id: null })
    .in("invited_by_user_id", ids);
  if (memberInviterError) {
    throw new Error(
      `Failed to clear member inviters: ${memberInviterError.message}`,
    );
  }

  // 3. The auth users themselves — profile + remaining scoped data cascade.
  const failures = await deleteAuthUsers(admin, ids);
  return {
    deletedHouseholds: deletedHouseholds?.length ?? 0,
    deletedUsers: ids.length - failures.length,
    failures,
  };
}

/** Page through every auth user id (collect first, then delete — see callers). */
async function listAllUserIds(admin: Admin): Promise<string[]> {
  const ids: string[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }
    ids.push(...data.users.map((user) => user.id));
    if (data.users.length < perPage) break;
  }
  return ids;
}

/** Delete each auth user via the admin API; collect (don't throw on) failures. */
async function deleteAuthUsers(
  admin: Admin,
  ids: string[],
): Promise<DeletionResult["failures"]> {
  const failures: DeletionResult["failures"] = [];
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push({ id, message: error.message });
  }
  return failures;
}

/** Validate that an optional body field is an array of non-empty strings. */
function readStringArray(body: JsonObject, field: string): string[] {
  const value = body[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ValidationError(`"${field}" must be an array of strings.`, [
      { field, rule: "stringArray" },
    ]);
  }
  return (value as string[]).map((v) => v.trim()).filter(Boolean);
}

/** Shared response: 500 if any auth-user deletion failed, else 200. */
function summaryResponse(summary: {
  mode: "all" | "specific";
  deletedHouseholds: number;
  deletedUsers: number;
  failures: DeletionResult["failures"];
  notFoundEmails?: string[];
}): Response {
  const ok = summary.failures.length === 0;
  return NextResponse.json({ ok, ...summary }, { status: ok ? 200 : 500 });
}
