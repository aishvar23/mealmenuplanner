/**
 * Clear user accounts from the dev database — a thin CLI over the dev-only
 * `POST /api/dev/clear-users` route, so the (FK-careful) deletion logic lives in
 * exactly one place. Deletes users and the household-scoped data hanging off them
 * (members, invites, drafts, preferences, meal plans, grocery lists, activity,
 * notifications); the shared content catalog (dishes, ingredients, combinations)
 * is left intact.
 *
 * Requires the dev server running with the route enabled:
 *   - `npm run dev`
 *   - `DEV_LOGIN_ENABLED="true"` in `.env.local` (the route 404s otherwise — it
 *     is hard-gated to non-production, exactly like the dev sign-in button).
 *
 * Usage:
 *   node scripts/clear-users.mjs <email> [<email> ...]   # delete these users by email
 *   node scripts/clear-users.mjs --id <uuid> [--id ...]  # ...or by auth user id
 *   node scripts/clear-users.mjs --all --yes             # delete EVERY user
 *
 * Options:
 *   --email <e>   user email to delete (repeatable; positional args are emails too)
 *   --id <uuid>   auth user id to delete (repeatable)
 *   --all         delete ALL users — requires --yes as well
 *   --yes         confirm the destructive --all
 *   --url <base>  app base URL (default: $E2E_BASE_URL or http://localhost:3000)
 *   -h, --help    show this help
 */
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

function parseArgs(argv) {
  const opts = { emails: [], ids: [], all: false, yes: false, url: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        printHelpAndExit(0);
        break;
      case "--all":
        opts.all = true;
        break;
      case "--yes":
        opts.yes = true;
        break;
      case "--email":
        opts.emails.push(requireValue(argv, (i += 1), arg));
        break;
      case "--id":
        opts.ids.push(requireValue(argv, (i += 1), arg));
        break;
      case "--url":
        opts.url = requireValue(argv, (i += 1), arg);
        break;
      default:
        if (arg.startsWith("--")) fail(`Unknown option: ${arg}`);
        else opts.emails.push(arg); // bare positional → treated as an email
    }
  }
  return opts;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    fail(`${flag} needs a value.`);
  }
  return value;
}

function printHelpAndExit(code) {
  // The usage block above is the canonical help; reprint its essentials.
  console.log(
    [
      "Clear users from the dev DB (calls POST /api/dev/clear-users).",
      "",
      "  node scripts/clear-users.mjs <email> [<email> ...]   delete by email",
      "  node scripts/clear-users.mjs --id <uuid> [--id ...]  delete by user id",
      "  node scripts/clear-users.mjs --all --yes             delete EVERY user",
      "",
      "Needs: `npm run dev` running and DEV_LOGIN_ENABLED=true in .env.local.",
    ].join("\n"),
  );
  process.exit(code);
}

function fail(message) {
  console.error(`✖ ${message}\n`);
  printHelpAndExit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = (
    opts.url ??
    process.env.E2E_BASE_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const hasTargets = opts.emails.length > 0 || opts.ids.length > 0;
  if (opts.all && hasTargets) {
    fail("Use either --all or specific --email/--id targets, not both.");
  }
  if (!opts.all && !hasTargets) {
    fail(
      "Nothing to do: pass an email/--id, or --all --yes to wipe everything.",
    );
  }
  if (opts.all && !opts.yes) {
    fail("--all deletes EVERY user. Re-run with --all --yes to confirm.");
  }

  const body = opts.all
    ? { confirm: "DELETE ALL USERS" }
    : { emails: opts.emails, userIds: opts.ids };

  const target = opts.all
    ? "ALL users"
    : [
        opts.emails.length ? `${opts.emails.length} email(s)` : null,
        opts.ids.length ? `${opts.ids.length} id(s)` : null,
      ]
        .filter(Boolean)
        .join(" + ");
  console.log(`→ Deleting ${target} via ${baseUrl}/api/dev/clear-users …`);

  let res;
  try {
    res = await fetch(`${baseUrl}/api/dev/clear-users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    fail(
      `Could not reach ${baseUrl}. Is the dev server running (npm run dev)?\n  ${err.message}`,
    );
  }

  const payload = await res.json().catch(() => ({}));

  if (res.status === 404) {
    fail(
      "Route returned 404 — it is disabled. Set DEV_LOGIN_ENABLED=true in .env.local and restart `npm run dev`.",
    );
  }
  if (!res.ok || payload.ok === false) {
    console.error(`✖ Request failed (HTTP ${res.status}).`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  console.log(
    `✓ Done — deleted ${payload.deletedUsers} user(s) and ${payload.deletedHouseholds} household(s).`,
  );
  if (payload.notFoundEmails?.length) {
    console.log(`  Not found (skipped): ${payload.notFoundEmails.join(", ")}`);
  }
}

main();
