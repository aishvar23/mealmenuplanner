import { beforeEach, describe, expect, it, vi } from "vitest";

// `lib/db/server.ts` is server-only and resolves its config + request context
// from `next/headers`, then hands options to `@supabase/ssr`'s
// `createServerClient`. We stub the `server-only` marker (it throws when imported
// outside a Server Component) and those I/O dependencies so we can assert, in a
// plain Node test, the bearer-token forwarding contract from design/10 § 3.
vi.mock("server-only", () => ({}));

// Stable spies referenced from the (hoisted) module mocks below, so they survive
// `vi.resetModules()` between cases.
const headerGet = vi.fn<(name: string) => string | null>();
const cookieGetAll = vi.fn<() => { name: string; value: string }[]>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: cookieGetAll, set: vi.fn() })),
  headers: vi.fn(async () => ({ get: headerGet })),
}));

// Capture the options `createServerSupabaseClient` passes to `createServerClient`,
// and return a fake client whose `auth.getUser()` resolves a user ONLY when a
// bearer token was forwarded via `global.headers` — proving the JWT reaches
// `supabase.auth.getUser()`.
const RESOLVED_USER_ID = "11111111-1111-1111-1111-111111111111";
let lastCreateOptions:
  | {
      global?: { headers?: Record<string, string> };
      cookies?: unknown;
    }
  | undefined;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _anonKey: string,
      options: { global?: { headers?: Record<string, string> } },
    ) => {
      lastCreateOptions = options;
      const forwarded = options?.global?.headers?.Authorization;
      const hasBearer =
        typeof forwarded === "string" && forwarded.startsWith("Bearer ");
      return {
        auth: {
          getUser: vi.fn(async () =>
            hasBearer
              ? { data: { user: { id: RESOLVED_USER_ID } }, error: null }
              : { data: { user: null }, error: null },
          ),
        },
      };
    },
  ),
}));

const VALID_JWT = "header.payload.signature";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  lastCreateOptions = undefined;
  headerGet.mockReturnValue(null);
  cookieGetAll.mockReturnValue([]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

describe("createServerSupabaseClient — bearer-token auth (design/10 § 3)", () => {
  it("forwards an incoming Authorization header via global.headers", async () => {
    headerGet.mockImplementation((name) =>
      name.toLowerCase() === "authorization" ? `Bearer ${VALID_JWT}` : null,
    );

    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

    expect(lastCreateOptions?.global).toEqual({
      headers: { Authorization: `Bearer ${VALID_JWT}` },
    });
  });

  it("omits global headers for a cookie-only (browser) request — no web change", async () => {
    headerGet.mockReturnValue(null);

    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

    expect(lastCreateOptions?.global).toBeUndefined();
    // The cookie adapter is always wired up, regardless of the header path.
    expect(lastCreateOptions?.cookies).toBeDefined();
  });
});

describe("auth resolution through the bearer path", () => {
  it("resolves the user when a valid bearer token is present", async () => {
    headerGet.mockImplementation((name) =>
      name.toLowerCase() === "authorization" ? `Bearer ${VALID_JWT}` : null,
    );

    const { requireAuthUser } = await import("@/lib/auth/session");
    const user = await requireAuthUser();

    expect(user.id).toBe(RESOLVED_USER_ID);
  });

  it("401s an unauthenticated request (no bearer, no cookie session)", async () => {
    headerGet.mockReturnValue(null);

    const { requireAuthUser } = await import("@/lib/auth/session");
    const { UnauthenticatedError } = await import("@/lib/errors");

    await expect(requireAuthUser()).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
