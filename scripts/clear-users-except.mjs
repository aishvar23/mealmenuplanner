/**
 * Delete every user EXCEPT the ones you name — the inverse of the "delete all"
 * path of /api/dev/clear-users, handy for resetting the dev DB down to one or two
 * known test accounts. Like scripts/record-demo.mjs it talks to Supabase directly
 * via the SERVICE-ROLE key from `.env.local`, so it needs neither the dev server
 * running nor DEV_LOGIN_ENABLED — but it bypasses RLS, so it is a LOCAL/DEV tool
 * only. It targets whatever project `.env.local` points at (currently cloud dev,
 * a shared project — coordinate before running).
 *
 * It mirrors the route's FK-safe ordering (filters inverted to "everyone except
 * the kept ids"): delete the other users' households first — cascading their
 * members/invites/drafts/prefs/plans/grocery/activity/notifications — then clear
 * the leftover RESTRICT refs (`invited_by`/`accepted_by`) that point at deleted
 * users from the KEPT households, then delete the auth users (their `public.users`
 * profile + remaining scoped data cascade from `auth.users ON DELETE CASCADE`).
 * The shared content catalog (dishes, ingredients, combinations) is untouched.
 *
 * Safety: DRY-RUN by default — it prints who would be kept/deleted and exits
 * without `--yes`. It also ABORTS if any --keep target can't be resolved, so a
 * mistyped email can't delete the very account you meant to spare.
 *
 * Usage:
 *   node scripts/clear-users-except.mjs <email-or-id> [...]          # dry run
 *   node scripts/clear-users-except.mjs dev@local.test --yes         # execute
 *   node scripts/clear-users-except.mjs --keep dev@local.test --keep <uuid> --yes
 *
 * Note: deleting a household's creator removes the whole household (and other
 * members' access) — so keeping user A but not the owner of a household A belongs
 * to will still drop that household. Keep the owners you care about too.
 */
import path from "node:path";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const keep = [];
  let yes = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes") yes = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node scripts/clear-users-except.mjs <email-or-id> [...] [--yes]",
      );
      process.exit(0);
    } else if (arg === "--keep") {
      const value = argv[(i += 1)];
      if (!value || value.startsWith("--")) fail("--keep needs a value.");
      keep.push(value);
    } else if (arg.startsWith("--")) {
      fail(`Unknown option: ${arg}`);
    } else {
      keep.push(arg); // bare positional → a keep target (email or uuid)
    }
  }
  return { keep, yes };
}

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listAllUsers(admin) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Could not list users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return users;
}

/** Map each --keep target (email or uuid) to a real user id, or abort. */
function resolveKeepIds(targets, users) {
  const byEmail = new Map(users.map((u) => [u.email, u.id]));
  const ids = new Set(users.map((u) => u.id));
  const keepIds = new Set();
  const unresolved = [];
  for (const t of targets) {
    if (UUID_RE.test(t)) {
      if (ids.has(t)) keepIds.add(t);
      else unresolved.push(t);
    } else {
      const id = byEmail.get(t);
      if (id) keepIds.add(id);
      else unresolved.push(t);
    }
  }
  if (unresolved.length > 0) {
    fail(
      `These --keep targets don't match any user (aborting so they aren't deleted): ${unresolved.join(", ")}`,
    );
  }
  return keepIds;
}

async function main() {
  const { keep, yes } = parseArgs(process.argv.slice(2));
  if (keep.length === 0) {
    fail(
      "Name at least one user to keep (email or id). To delete everyone, use clear-users.mjs --all --yes.",
    );
  }

  const admin = makeAdmin();
  const users = await listAllUsers(admin);
  const keepIds = resolveKeepIds(keep, users);
  const toDelete = users.filter((u) => !keepIds.has(u.id));
  const keptList = users.filter((u) => keepIds.has(u.id));

  console.log(`Keeping ${keptList.length}:`);
  for (const u of keptList) console.log(`  ✓ ${u.email}  |  ${u.id}`);
  console.log(`Deleting ${toDelete.length}:`);
  for (const u of toDelete) console.log(`  ✗ ${u.email}  |  ${u.id}`);

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    return;
  }
  if (!yes) {
    console.log(
      `\nDry run — re-run with --yes to delete these ${toDelete.length} user(s).`,
    );
    return;
  }

  const keepList = `(${[...keepIds].join(",")})`;

  // 1. Other users' households → cascades their household-scoped data.
  const { data: delHh, error: e1 } = await admin
    .from("households")
    .delete()
    .not("created_by_user_id", "in", keepList)
    .select("id");
  if (e1) fail(`delete households: ${e1.message}`);

  // 2-4. Leftover RESTRICT refs to deleted users inside the KEPT households.
  const { error: e2 } = await admin
    .from("household_invites")
    .delete()
    .not("invited_by_user_id", "in", keepList);
  if (e2) fail(`delete invites: ${e2.message}`);
  const { error: e3 } = await admin
    .from("household_invites")
    .update({ accepted_by_user_id: null })
    .not("accepted_by_user_id", "in", keepList);
  if (e3) fail(`clear accepted_by: ${e3.message}`);
  const { error: e4 } = await admin
    .from("household_members")
    .update({ invited_by_user_id: null })
    .not("invited_by_user_id", "in", keepList);
  if (e4) fail(`clear member inviter: ${e4.message}`);

  // 5. The auth users themselves.
  let deleted = 0;
  const failures = [];
  for (const u of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) failures.push({ email: u.email, message: error.message });
    else deleted += 1;
  }

  console.log(
    `\n✓ Deleted ${deleted} user(s) and ${delHh.length} household(s). Failures: ${failures.length}.`,
  );
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
}

main();
