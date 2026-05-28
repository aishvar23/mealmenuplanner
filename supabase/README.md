# Supabase — local dev & project setup

This folder holds everything Supabase-related: local config (`config.toml`),
ordered SQL `migrations/`, Edge `functions/` (scheduled jobs), and `seed.sql`.
The CLI is pinned as a dev dependency (`supabase` in `package.json`) and run via
the `db:*` npm scripts below — no global install needed.

> Architecture context: [design/02 § Environments](../design/02_system_architecture.md)
> and the three-client strategy. Schema lives in
> [design/01](../design/01_database_design.md); auth/RLS in
> [design/03](../design/03_auth_and_security_design.md).

## Prerequisites

- **Node** ≥ 20 (repo uses 22).
- **Docker Desktop**, running. `supabase start` spins up Postgres, Auth, Studio,
  and the email-testing inbox (Inbucket) as local containers. Without Docker the
  local stack cannot run — install it before `npm run db:start`.

## Local development

```bash
npm install            # installs the pinned Supabase CLI too
npm run db:start       # boots the local stack (first run pulls Docker images)
```

`db:start` prints the local URLs and keys. Put them in `.env.local` (copy from
`.env.example`) for the Next.js app:

| Variable                        | Local value                                   |
| ------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://127.0.0.1:54321`                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon key` from `db:start` output         |
| `SUPABASE_SERVICE_ROLE_KEY`     | the `service_role key` from `db:start` output |

Local service URLs:

| Service           | URL                                                       |
| ----------------- | --------------------------------------------------------- |
| API / Auth        | http://127.0.0.1:54321                                    |
| Postgres          | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (admin UI) | http://127.0.0.1:54323                                    |
| Inbucket (email)  | http://127.0.0.1:54324                                    |

### Everyday commands

| Script              | Does                                                           |
| ------------------- | -------------------------------------------------------------- |
| `npm run db:start`  | Start the local stack.                                         |
| `npm run db:stop`   | Stop it (add `--no-backup` via the CLI to also drop data).     |
| `npm run db:status` | Show running services + keys.                                  |
| `npm run db:reset`  | Drop, re-run all `migrations/`, then apply `seed.sql`.         |
| `npm run db:new`    | Scaffold a new timestamped migration: `npm run db:new <name>`. |
| `npm run db:diff`   | Diff local DB against migrations (capture manual changes).     |
| `npm run db:push`   | Apply local migrations to the **linked** remote project.       |
| `npm run db:lint`   | Lint the database schema.                                      |
| `npm run db:types`  | Generate `lib/db/database.types.ts` from the local schema.     |

Schema changes flow **dev → prod only through migrations** — never edit a remote
schema by hand (design/02 § Environments).

## Clearing users (dev reset)

To wipe test accounts between manual runs without touching the shared content
catalog (dishes, ingredients, combinations), use the dev-only
`POST /api/dev/clear-users` route — or the `clear-users` script wrapping it.
Both delete the users **and** the household-scoped data hanging off them
(members, invites, drafts, preferences, meal plans, grocery lists, activity,
notifications). The route handles the FK ordering: it deletes households first
(so `households.created_by_user_id` and the `invited_by`/`accepted_by` RESTRICT
refs stop blocking), then the auth users — whose `public.users` profile cascades
from `auth.users ON DELETE CASCADE`.

**Safety:** the route is hard-gated on `NODE_ENV !== "production"` **and**
`DEV_LOGIN_ENABLED="true"` (same gate as the dev sign-in button), so it 404s in
any production build. Set `DEV_LOGIN_ENABLED="true"` in `.env.local` to use it.
It targets whatever project `.env.local` points at — currently **cloud dev**, a
shared project, so coordinate before wiping everything.

```bash
# Script (needs `npm run dev` running). Args after -- are passed through:
npm run users:clear -- alice@test.com bob@test.com   # delete specific users by email
npm run users:clear -- --id <auth-user-uuid>         # ...or by auth user id
npm run users:clear -- --all --yes                   # delete EVERY user

# Or call the route directly:
curl -X POST http://localhost:3000/api/dev/clear-users \
  -H "content-type: application/json" \
  -d '{"emails":["alice@test.com"]}'                 # specific
curl -X POST http://localhost:3000/api/dev/clear-users \
  -H "content-type: application/json" \
  -d '{"confirm":"DELETE ALL USERS"}'                # everything
```

The response reports `{ deletedUsers, deletedHouseholds }` (plus `notFoundEmails`
for any email that didn't match, and `failures[]` if a delete errored).

To keep only a few accounts and clear the rest (e.g. reset to just the test
user), use the inverse `clear-users-except` script. It talks to Supabase
directly via the service-role key (no dev server / flag needed), is **dry-run by
default**, and aborts if a kept target can't be resolved (so a typo can't delete
the account you meant to spare):

```bash
npm run users:clear-except -- dev@local.test            # dry run: shows keep/delete
npm run users:clear-except -- dev@local.test --yes      # execute
npm run users:clear-except -- --keep dev@local.test --keep <uuid> --yes
```

> Deleting a household's creator removes the **whole household** (and other
> members' access) — `created_by_user_id` is NOT NULL, so a bare delete can't
> reassign ownership. To hand a household to another member instead, use the
> `transfer_ownership` RPC (P6) before deleting.

## Auth providers locally

- **Email / magic link** work out of the box; messages are captured by Inbucket
  (http://127.0.0.1:54324) rather than actually sent. Email confirmation is off
  locally for convenience (`[auth.email].enable_confirmations`); prod requires it.
- **Google OAuth** is wired up in P1-1 and `enabled = true` in `config.toml`
  (`[auth.external.google]`, env-based creds). Because we run against the **cloud
  dev project** (no Docker here), enable Google and paste its client ID/secret in
  the **dashboard** (Authentication → Providers → Google) — not in the app env.
  For the _local_ stack instead, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (the CLI auto-loads `.env`, or pass
  `supabase start --env-file .env.local`).

## Cloud projects (dev + prod) — one-time, account owner only

The CLI cannot create cloud projects without your Supabase login, so do this once
per environment in your own account. Create **two separate projects** — keep dev
and prod isolated (design/02 § Environments).

1. **Log in** (opens a browser to mint an access token):

   ```bash
   npx supabase login
   ```

2. **Create the projects** — via the dashboard (https://supabase.com/dashboard)
   or the CLI. Record each project's **ref** (the `xxxx` in `xxxx.supabase.co`):

   ```bash
   npx supabase projects create meal-planner-dev  --org-id <org> --region <region>
   npx supabase projects create meal-planner-prod --org-id <org> --region <region>
   ```

3. **Link** the repo to one project at a time when pushing schema:

   ```bash
   npx supabase link --project-ref <dev-ref>     # then: npm run db:push
   # switch to prod only for a release:
   npx supabase link --project-ref <prod-ref>    # then: npm run db:push
   ```

4. **Push config** (auth settings, redirect URLs from `config.toml`) to the linked
   project, and set provider secrets in the dashboard (Authentication → Providers):

   ```bash
   npx supabase config push
   ```

5. **App env vars**: copy each project's URL + anon + service-role keys from
   Dashboard → Project Settings → API into the matching environment
   (`.env.local` for local against a cloud DB; Vercel env vars for deploys).
   `SUPABASE_SERVICE_ROLE_KEY` is server-only — never expose it to the browser.

### Production domain & auth checklist (set in the dashboard, not committed)

**Production domain: `mymealtoday.com`** — the Next.js app on Vercel. There are
**two callback URLs in two different places**; don't mix them up:

- **Google** (Authorized redirect URI) → always the **Supabase** endpoint, which
  stays on `*.supabase.co` regardless of the app domain:
  `https://<ref>.supabase.co/auth/v1/callback` (dev ref `dultruvperqxtqtbochp`; use
  the prod ref for prod). This only changes if you adopt a Supabase **Custom
  Domain** add-on.
- **Supabase** (Site URL + Redirect URLs allow-list) → the **app** route
  `/auth/callback`: add `https://mymealtoday.com/auth/callback` (and the `www.`
  variant if used) for prod, and keep `http://localhost:3000/auth/callback` for
  dev.

Also set `NEXT_PUBLIC_APP_URL=https://mymealtoday.com` in the Vercel (prod) env.

Remaining prod items: email confirmation **enabled** with an SMTP/transactional
sender; the OAuth consent screen **Published** (or your test users added) — only
the non-sensitive `email`/`profile`/`openid` scopes are requested, so full Google
verification isn't required for the beta.

> The `db:link` step writes `supabase/.temp/` (gitignored). Project refs are not
> secret, but access tokens and keys are — they live only in env vars / your
> machine, never in the repo.

## Supabase MCP server (Claude Code)

`.mcp.json` (repo root) registers the **hosted** Supabase MCP server
(`https://mcp.supabase.com/mcp`) so Claude Code can inspect and operate on your
Supabase projects. It is project-scoped (shared via git) and authenticates via
**browser OAuth** — no token in config.

To enable it:

1. Run `/mcp` in Claude Code, select **supabase**, and **sign in** to Supabase in
   the browser when prompted (and approve the project-scoped server). It then
   shows as `✓ Connected` — no `SUPABASE_ACCESS_TOKEN` needed.

The server runs in **read-write** mode by default. Scope it with URL query params
in `.mcp.json` (`url` field):

| Param                | Effect                                            |
| -------------------- | ------------------------------------------------- |
| `?read_only=true`    | Execute all queries as a read-only Postgres user. |
| `?project_ref=<ref>` | Restrict the server to a single project.          |

Combine them, e.g. `https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true`.

> **Security:** read-write + account-wide right now. Once the dev project exists,
> add `?project_ref=<dev-ref>` to the URL, and **never point a read-write server
> at the prod project** (use `?read_only=true` for prod).
