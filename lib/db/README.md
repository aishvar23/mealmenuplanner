# `lib/db` — Supabase clients

Three Supabase clients, **never interchanged** (design/02 § Supabase client
strategy, design/03 § 1). Pick by caller, not by convenience.

| Client                                                    | Factory                       | RLS                   | Use from                                                        | Never use for                             |
| --------------------------------------------------------- | ----------------------------- | --------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| **Server (RLS)** — [`server.ts`](./server.ts)             | `createServerSupabaseClient`  | ✅ applies (user JWT) | Server Components, Server Actions, Route Handlers — **default** | —                                         |
| **Browser (anon)** — [`browser.ts`](./browser.ts)         | `createBrowserSupabaseClient` | ✅ applies (anon)     | Client Components: auth flows + realtime                        | Privileged writes (use the server client) |
| **Service-role** — [`service-role.ts`](./service-role.ts) | `createServiceRoleClient`     | ⚠️ **bypassed**       | Edge Functions / cron jobs / admin tooling only                 | **Any** user-request path                 |

`server.ts` and `service-role.ts` import [`server-only`](https://www.npmjs.com/package/server-only),
so importing them into a Client Component is a build error.

The server factory is **async** because Next.js `cookies()` is async:

```ts
import { createServerSupabaseClient } from "@/lib/db/server";

const supabase = await createServerSupabaseClient();
const {
  data: { user },
} = await supabase.auth.getUser();
```

## Types

`SupabaseClient<Database>` is typed from [`database.types.ts`](./database.types.ts),
which is **generated** by `npm run db:types` once the schema migrations exist
(P0-5..P0-12). The committed file is a placeholder empty schema until then —
regenerate, don't hand-edit.

## Configuration

Env vars are read + validated in [`env.ts`](./env.ts):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), and
`SUPABASE_SERVICE_ROLE_KEY` (server-only). See `.env.example` and
`supabase/README.md`.
