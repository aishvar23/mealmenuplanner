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

## Auth providers locally

- **Email / magic link** work out of the box; messages are captured by Inbucket
  (http://127.0.0.1:54324) rather than actually sent. Email confirmation is off
  locally for convenience (`[auth.email].enable_confirmations`); prod requires it.
- **Google OAuth** is scaffolded in `config.toml` as `[auth.external.google]` but
  **disabled** so the stack starts without credentials. To test it locally
  (wired up in task P1-1): set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (the CLI auto-loads `.env`, or pass
  `supabase start --env-file .env.local`), then flip `enabled = true`.

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

### Production auth checklist (set in the dashboard, not committed)

- Site URL + redirect allow-list pointing at the deployed Vercel domain
  (`<domain>/auth/callback`).
- Google OAuth client configured with the project's
  `https://<ref>.supabase.co/auth/v1/callback` redirect URI.
- Email confirmation **enabled** and an SMTP/transactional sender configured.

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
