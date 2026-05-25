# Vercel deployment — onboarding checklist

Runbook for putting Home Meal Planner on **Vercel** (web) in front of
**Supabase** (DB/auth). This is an ops/infra task: it lives in the Vercel and
Supabase dashboards and touches almost no application code, so it runs safely in
parallel with feature work on the [implementation tracker](IMPLEMENTATION_TRACKER.md).

> Supabase project creation, auth-provider wiring, and the Google/Supabase
> callback split are covered in [supabase/README.md](supabase/README.md) —
> especially its **"Cloud projects (dev + prod)"** and **"Production domain &
> auth checklist"** sections. This doc only adds the **Vercel** half and points
> back there instead of repeating it.

## Two phases

Onboard Vercel in two passes so it never blocks parallel work:

- **Phase A — staging now.** A live preview/staging app wired to the existing
  **cloud dev** Supabase project (`dultruvperqxtqtbochp`). Validates the deploy
  pipeline and finally lets us exercise the authenticated flows (onboarding,
  Today/Plan, admin) that have been build-only because there's no local
  `.env.local`.
- **Phase B — production cutover.** Repoint Production at the **prod** Supabase
  project and attach the real domain. Gated on tracker items that aren't done
  yet (see [Tracker dependencies](#tracker-dependencies)).

---

## Phase A — staging now (points at dev Supabase)

### Connect the project

- [ ] Create a Vercel project and import the GitHub repo (Vercel account / team
      with access to the repo).
- [ ] Confirm the **Framework Preset** is auto-detected as **Next.js**. Leave
      Build Command (`next build`), Install Command (`npm install`), and Output
      at their Next.js defaults — `package.json` matches them.
- [ ] Pin the build to **Node 22** to match CI (`.github/workflows/ci.yml` and
      the Supabase README both use 22). Either set Project Settings → Node.js
      Version to 22.x, or add a repo `.nvmrc` containing `22` (a new file — no
      conflict with any in-flight branch). The default Vercel Node may differ, so
      pin it explicitly.

### Environment variables (Vercel → Settings → Environment Variables)

Set these for the **Production** and **Preview** scopes (point both at the dev
project for now; Production gets repointed in Phase B). See the
[full reference](#environment-variable-reference) for what each one is.

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — the dev project URL (`https://dultruvperqxtqtbochp.supabase.co`).
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — dev anon key (Dashboard → Project Settings → API).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — dev service-role key. Mark **Sensitive**.
      Server/edge only; it is intentionally not `NEXT_PUBLIC_*` so it never
      reaches the browser. Do **not** add it to any client bundle.
- [ ] `NEXT_PUBLIC_APP_URL` — the deployed base URL. For the Production scope
      use the project's stable `*.vercel.app` URL until the domain is attached;
      previews are handled by the wildcard step below.
- [ ] **Skip** `RESEND_API_KEY` for now — it's only needed once P8 (invite
      emails) lands. Add it then.
- [ ] **Do not** add `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` /
      `_SECRET` to Vercel — those configure the Supabase CLI/dashboard provider,
      not the app runtime (see [What does NOT go in Vercel](#what-does-not-go-in-vercel)).

### Wire the deployed URLs into Supabase auth

The deployed app uses the bare `/auth/callback` PKCE route (see the
`auth-email-redirect-bare-callback` convention). Supabase must allow-list the
Vercel URLs or sign-in will fail post-deploy.

- [ ] In the **dev** Supabase project → Authentication → URL Configuration, add
      to the **Redirect URLs** allow-list:
  - [ ] the Production `*.vercel.app` callback, e.g. `https://<project>.vercel.app/auth/callback`
  - [ ] a **preview wildcard** so per-deploy preview URLs can complete OAuth,
        e.g. `https://<project>-*.vercel.app/auth/callback` (scope the pattern to
        this project's preview domain — a bare `https://*.vercel.app/**` is too
        broad). Supabase allow-list entries support `*`/`**` wildcards; without
        one the dynamic preview hostname won't match.
- [ ] Leave the **Google** Authorized redirect URI on the Supabase endpoint
      (`https://dultruvperqxtqtbochp.supabase.co/auth/v1/callback`) — it does
      **not** change with the Vercel/app domain.

### Guard rails while branches are in flux

- [ ] Enable **Vercel Authentication** (Deployment Protection) on **Preview**
      deployments — staging is wired to a real dev DB, so don't leave it open to
      the public web.
- [ ] Do **not** mark the Vercel build as a **required** GitHub status check
      yet. In-flight branches that aren't green will produce failing previews;
      that's harmless noise unless it's required. (Optionally use Vercel's
      "Ignored Build Step" to skip previews on WIP branches.)
- [ ] No `vercel.json` is required for a standard Next.js app — don't add one
      unless you need custom headers/regions. In particular, **do not add Vercel
      Cron**: the scheduled jobs (`abandon_stale_drafts` P2-7, `expire_guests`
      P6-9, `prep_reminders` P7-6) run as Supabase **pg_cron** in the database,
      not on Vercel.
- [ ] The edge middleware (`proxy.ts`, Next 16's renamed `middleware`) deploys to
      the Vercel edge automatically — no config needed; it's the auth gate.

### Verify the deploy

- [ ] Production/preview build succeeds (same `next build` as CI).
- [ ] `/` (landing) and `/sign-in` render.
- [ ] A protected route (`/today`, `/admin`) 307-redirects to `/sign-in?next=…`
      when signed out — confirms `proxy.ts` runs on the edge.
- [ ] Sign in against the dev project and walk **onboarding → complete →
      Today**. This is the authenticated path that's been typecheck/build-only;
      a working preview is the payoff of Phase A.

---

## Phase B — production cutover (gated on tracker)

Do these only when the gating tracker items are done; until then Phase A staging
is the live environment.

- [ ] **P0-3:** the **prod** Supabase project exists (created + linked + schema
      pushed via migrations, per supabase/README.md). Repoint the Vercel
      **Production** env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon, service-role) at
      the prod project. Keep **Preview** on dev.
- [ ] **P0-14:** the dish/ingredient catalog is seeded in prod — otherwise the
      recommender has nothing to suggest and the live app looks empty.
- [ ] **P1-1 / P1-2 (auth ops):** in the prod project, enable the Google provider
      (paste client ID/secret in the dashboard), set the email-confirmation
      toggle to the intended prod UX (prod should require it), and confirm the
      Email provider is on.
- [ ] **Domain:** attach `mymealtoday.com` (and `www.` if used) to the Vercel
      project; set DNS as Vercel instructs.
- [ ] Set Production `NEXT_PUBLIC_APP_URL=https://mymealtoday.com`.
- [ ] In the **prod** Supabase project, set **Site URL** + add
      `https://mymealtoday.com/auth/callback` (and `www.`) to the Redirect URLs
      allow-list. Add the prod Google Authorized redirect URI
      `https://<prod-ref>.supabase.co/auth/v1/callback`.
- [ ] **P8:** add `RESEND_API_KEY` to Vercel (and verify the sending domain) when
      invite emails ship.
- [ ] Re-run the [verify](#verify-the-deploy) steps against the prod domain.

---

## Environment variable reference

| Variable                        | Scope          | Sensitive | Source / value                                                 |
| ------------------------------- | -------------- | --------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Prod + Preview | no        | Supabase Dashboard → Project Settings → API (per project)      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod + Preview | no        | same — anon (public) key                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Prod + Preview | **yes**   | same — service-role key; server/edge only, never in browser    |
| `NEXT_PUBLIC_APP_URL`           | Prod + Preview | no        | deployed base URL (vercel.app, then `https://mymealtoday.com`) |
| `RESEND_API_KEY`                | Prod (+ Prev)  | **yes**   | Resend dashboard — only needed from P8 (invite emails)         |

## What does NOT go in Vercel

- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
  — these are read by the **Supabase CLI** to configure the provider in
  `config.toml`, and the cloud provider secret is set in the **Supabase
  dashboard**. The app never reads them at runtime.
- `SUPABASE_ACCESS_TOKEN` — only for CLI/MCP, not the app.

## Tracker dependencies

Vercel onboarding itself has **no code conflict** with parallel tracker work
(disjoint file set; config lives in dashboards). These items only gate **how far
into Phase B** you can go:

| Tracker item  | Blocks                                                         |
| ------------- | -------------------------------------------------------------- |
| `P0-3`        | Production cutover — prod Supabase project must exist first    |
| `P0-14`       | A non-empty live app — recommender needs seeded dishes         |
| `P1-1`/`P1-2` | Working sign-in on the deployed app — provider/email ops steps |
| `P8`          | `RESEND_API_KEY` + invite-email send                           |
