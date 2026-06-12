import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  createSupabaseStub,
  type StubPlan,
} from "@/lib/services/recommendation/query-stub";

import {
  completeProviderOnboarding,
  createProviderDraft,
  getProvider,
  updateProvider,
} from "./onboarding";

const DRAFT_ROW = {
  id: "prov-1",
  name: "Anna's Kitchen",
  email: null,
  phone: null,
  city: null,
  state: null,
  country: null,
  timezone: "Asia/Kolkata",
  status: "draft",
  default_cutoff_local_time: null,
  summary_email_recipients: null,
};

function stub(plan: StubPlan) {
  const s = createSupabaseStub(plan);
  vi.mocked(createServerSupabaseClient).mockResolvedValue(s.client as never);
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("createProviderDraft", () => {
  it("calls the RPC with the trimmed name and returns the mapped DTO", async () => {
    const s = stub({
      rpcs: { create_provider_draft: { data: "prov-1", error: null } },
      tables: { provider_organizations: { data: DRAFT_ROW, error: null } },
    });

    const dto = await createProviderDraft("  Anna's Kitchen  ");

    const rpc = s.calls.find((c) => c.method === "rpc");
    expect(rpc?.target).toBe("create_provider_draft");
    expect(rpc?.args[0]).toEqual({ p_name: "Anna's Kitchen" });
    expect(dto).toMatchObject({
      providerId: "prov-1",
      name: "Anna's Kitchen",
      status: "draft",
      summaryEmailRecipients: [],
    });
  });

  it("rejects a blank name before touching the DB", async () => {
    const s = stub({});
    await expect(createProviderDraft("   ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(s.calls.some((c) => c.method === "rpc")).toBe(false);
  });

  it("maps the RPC's 23514 to a ValidationError", async () => {
    stub({
      rpcs: {
        create_provider_draft: { data: null, error: { code: "23514" } },
      },
    });
    await expect(createProviderDraft("X")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("getProvider", () => {
  it("returns the mapped DTO when visible", async () => {
    stub({
      tables: { provider_organizations: { data: DRAFT_ROW, error: null } },
    });
    const dto = await getProvider("prov-1");
    expect(dto.providerId).toBe("prov-1");
    expect(dto.timezone).toBe("Asia/Kolkata");
  });

  it("throws NotFound when the org is absent or hidden by RLS", async () => {
    stub({ tables: { provider_organizations: { data: null, error: null } } });
    await expect(getProvider("prov-x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateProvider", () => {
  it("writes only the validated patch columns and returns the DTO", async () => {
    const updated = { ...DRAFT_ROW, timezone: "America/New_York" };
    const s = stub({
      tables: { provider_organizations: { data: updated, error: null } },
    });

    const dto = await updateProvider("prov-1", {
      timezone: "America/New_York",
      email: "hi@anna.com",
    });

    const update = s.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({
      timezone: "America/New_York",
      email: "hi@anna.com",
    });
    expect(dto.timezone).toBe("America/New_York");
  });

  it("is a no-op read when the patch is empty", async () => {
    const s = stub({
      tables: { provider_organizations: { data: DRAFT_ROW, error: null } },
    });
    await updateProvider("prov-1", {});
    expect(s.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("rejects an invalid field without writing", async () => {
    const s = stub({});
    await expect(
      updateProvider("prov-1", { timezone: "Bad/Zone" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(s.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("maps an update that hits no row to NotFound", async () => {
    stub({ tables: { provider_organizations: { data: null, error: null } } });
    await expect(
      updateProvider("prov-1", { name: "New" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("completeProviderOnboarding", () => {
  it("gates on required fields, calls the RPC, and returns the DTO", async () => {
    const active = { ...DRAFT_ROW, status: "active" };
    const s = stub({
      rpcs: { complete_provider_onboarding: { data: null, error: null } },
      tables: { provider_organizations: { data: active, error: null } },
    });

    const dto = await completeProviderOnboarding("prov-1");

    const rpc = s.calls.find((c) => c.method === "rpc");
    expect(rpc?.target).toBe("complete_provider_onboarding");
    expect(rpc?.args[0]).toEqual({ p_provider_id: "prov-1" });
    expect(dto.status).toBe("active");
  });

  it("rejects completion of a draft missing a valid timezone", async () => {
    const bad = { ...DRAFT_ROW, timezone: "Not/AZone" };
    const s = stub({
      tables: { provider_organizations: { data: bad, error: null } },
    });
    await expect(completeProviderOnboarding("prov-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(s.calls.some((c) => c.method === "rpc")).toBe(false);
  });

  it("throws NotFound when the provider is absent", async () => {
    stub({ tables: { provider_organizations: { data: null, error: null } } });
    await expect(completeProviderOnboarding("prov-x")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps the RPC's 23514 (not a draft) to a ConflictError", async () => {
    stub({
      rpcs: {
        complete_provider_onboarding: { data: null, error: { code: "23514" } },
      },
      tables: { provider_organizations: { data: DRAFT_ROW, error: null } },
    });
    await expect(completeProviderOnboarding("prov-1")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
