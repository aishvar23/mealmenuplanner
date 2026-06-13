import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));

import {
  completeMemberOnboarding,
  getMyProviderMembership,
} from "./member-onboarding";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const VALID_BODY = {
  displayName: "Chitra",
  phone: "+15555550301",
  defaultSpiceLevel: "regular",
  allergyAck: true,
  termsAck: true,
  autoAcceptConsent: false,
};

/** A chainable select builder whose terminal `maybeSingle` resolves to `result`. */
function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

/** Mock `supabase.from(table)` to a per-table select chain. */
function stubFrom(byTable: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn((table: string) =>
    selectChain(byTable[table] ?? { data: null, error: null }),
  );
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return from;
}

describe("getMyProviderMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("maps membership + subscription into the self DTO", async () => {
    stubFrom({
      provider_memberships: {
        data: {
          role: "customer",
          status: "active",
          member_display_name: "Chitra",
          member_phone: "+15555550301",
          default_spice_level: "regular",
          onboarding_completed_at: "2026-06-12T00:00:00Z",
        },
        error: null,
      },
      provider_subscriptions: {
        data: {
          auto_accept_enabled: true,
          auto_accept_consented_at: "2026-06-12T00:00:00Z",
        },
        error: null,
      },
    });

    const result = await getMyProviderMembership("prov-1");
    expect(result).toEqual({
      providerId: "prov-1",
      role: "customer",
      status: "active",
      onboardingComplete: true,
      displayName: "Chitra",
      phone: "+15555550301",
      defaultSpiceLevel: "regular",
      autoAcceptEligible: true,
      autoAcceptConsented: true,
    });
  });

  it("reports not-onboarded + not-eligible when columns are null/absent", async () => {
    stubFrom({
      provider_memberships: {
        data: {
          role: "customer",
          status: "active",
          member_display_name: null,
          member_phone: null,
          default_spice_level: null,
          onboarding_completed_at: null,
        },
        error: null,
      },
      provider_subscriptions: { data: null, error: null },
    });

    const result = await getMyProviderMembership("prov-1");
    expect(result.onboardingComplete).toBe(false);
    expect(result.autoAcceptEligible).toBe(false);
    expect(result.autoAcceptConsented).toBe(false);
  });
});

describe("completeMemberOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue({ id: USER_ID } as never);
  });

  it("maps 42501 (not approved) to Forbidden", async () => {
    stubRpc({ data: null, error: { code: "42501" } });
    await expect(
      completeMemberOnboarding("prov-1", VALID_BODY),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps 23514 (missing acks at the DB) to ValidationError", async () => {
    stubRpc({ data: null, error: { code: "23514" } });
    await expect(
      completeMemberOnboarding("prov-1", VALID_BODY),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an invalid body before calling the RPC", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      completeMemberOnboarding("prov-1", { ...VALID_BODY, allergyAck: false }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
