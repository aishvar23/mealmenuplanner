import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("./resolve", () => ({ resolveWorkspaces: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, ValidationError } from "@/lib/errors";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";
import type { WorkspaceRef } from "@/packages/shared/provider";

import { resolveWorkspaces } from "./resolve";
import { setActiveWorkspace } from "./set-active";

const OWNED: WorkspaceRef[] = [
  { type: "provider_owner", id: "prov-a", role: "owner", defaultPath: "/x" },
  {
    type: "household",
    id: "hh-1",
    role: "owner",
    defaultPath: "/today",
  },
];

function stubWith(rpcError: { code?: string; message?: string } | null) {
  const stub = createSupabaseStub({
    rpcs: { set_active_workspace: { data: null, error: rpcError } },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client as never);
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(resolveWorkspaces).mockResolvedValue(OWNED);
});

describe("setActiveWorkspace", () => {
  it("calls the RPC with the workspace type and id on success", async () => {
    const stub = stubWith(null);

    await setActiveWorkspace("provider_owner", "prov-a");

    const rpcCall = stub.calls.find((c) => c.method === "rpc");
    expect(rpcCall?.target).toBe("set_active_workspace");
    expect(rpcCall?.args[0]).toEqual({
      p_workspace_type: "provider_owner",
      p_workspace_id: "prov-a",
    });
  });

  it("rejects a workspace the caller does not belong to before touching the DB", async () => {
    const stub = stubWith(null);

    await expect(
      setActiveWorkspace("provider_customer", "not-mine"),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // App-layer guard short-circuits — the RPC is never called.
    expect(stub.calls.some((c) => c.method === "rpc")).toBe(false);
  });

  it("maps the RPC's 42501 (not a member) to ForbiddenError", async () => {
    stubWith({ code: "42501", message: "not a member" });
    await expect(
      setActiveWorkspace("provider_owner", "prov-a"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps the RPC's 22023 (unknown type) to ValidationError", async () => {
    stubWith({ code: "22023", message: "unknown type" });
    await expect(
      setActiveWorkspace("provider_owner", "prov-a"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("wraps any other RPC error as InternalError", async () => {
    stubWith({ code: "XX000", message: "boom" });
    await expect(
      setActiveWorkspace("provider_owner", "prov-a"),
    ).rejects.toBeInstanceOf(InternalError);
  });
});
