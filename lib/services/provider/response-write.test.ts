import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { MemberResponseDto } from "@/packages/shared/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("./response-read", () => ({ getMyResponse: vi.fn() }));

import { getMyResponse } from "./response-read";
import {
  cancelMyResponse,
  confirmMyResponse,
  saveMyResponse,
} from "./response-write";

const MENU_DAY = "44444444-4444-4444-4444-444444444444";
const RESPONSE = "55555555-5555-5555-5555-555555555555";
const COMP = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";
const OPT = "33333333-3333-3333-3333-333333333333";

const DTO: MemberResponseDto = {
  responseId: RESPONSE,
  menuDayId: MENU_DAY,
  status: "draft",
  version: 1,
  memberNote: null,
  items: [],
  lockedAt: null,
};

const VALID_BODY = {
  expectedVersion: null,
  memberNote: "  no onions  ",
  items: [
    {
      menuComponentId: COMP,
      selectedCatalogItemId: ITEM,
      quantity: 999, // ignored by the validator / server-derived
      canonicalUnit: "ignored",
      spiceLevel: "regular",
      saltLevel: null,
      customizations: [{ customizationOptionId: OPT, quantity: 2 }],
    },
  ],
};

/** Stub the per-request client's single `.rpc()` call. */
function stubRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "u1" } as never);
  vi.mocked(getMyResponse).mockResolvedValue(DTO);
});

describe("saveMyResponse", () => {
  it("calls the RPC with derived-free items + trimmed note, then re-reads the DTO", async () => {
    const rpc = stubRpc({ data: RESPONSE, error: null });

    const result = await saveMyResponse(MENU_DAY, VALID_BODY as never);

    expect(rpc).toHaveBeenCalledWith("save_provider_response", {
      p_menu_day_id: MENU_DAY,
      p_expected_version: null,
      p_member_note: "no onions",
      p_items: [
        {
          menuComponentId: COMP,
          selectedCatalogItemId: ITEM,
          spiceLevel: "regular",
          saltLevel: null,
          customizations: [{ customizationOptionId: OPT, quantity: 2 }],
        },
      ],
    });
    expect(getMyResponse).toHaveBeenCalledWith(MENU_DAY);
    expect(result).toBe(DTO);
  });

  it("404s a malformed menu-day id without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      saveMyResponse("nope", VALID_BODY as never),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed body as a ValidationError without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(
      saveMyResponse(MENU_DAY, { items: "nope" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps PRVER → CONFLICT stale_version with the current version from the hint", async () => {
    stubRpc({ data: null, error: { code: "PRVER", hint: "7" } });
    const err = await saveMyResponse(MENU_DAY, VALID_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).details).toMatchObject({
      reason: "stale_version",
      currentVersion: 7,
    });
  });

  it("maps PRCUT → CONFLICT cutoff_passed", async () => {
    stubRpc({ data: null, error: { code: "PRCUT" } });
    const err = await saveMyResponse(MENU_DAY, VALID_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).details).toMatchObject({
      reason: "cutoff_passed",
    });
  });

  it("maps PRMEM → FORBIDDEN provider_membership_required", async () => {
    stubRpc({ data: null, error: { code: "PRMEM" } });
    const err = await saveMyResponse(MENU_DAY, VALID_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).details).toMatchObject({
      reason: "provider_membership_required",
    });
  });

  it("maps PRALT → VALIDATION_ERROR with rule invalid_menu_alternative", async () => {
    stubRpc({ data: null, error: { code: "PRALT" } });
    const err = await saveMyResponse(MENU_DAY, VALID_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toContainEqual({
      field: "items",
      rule: "invalid_menu_alternative",
    });
  });

  it("maps PRLIM → VALIDATION_ERROR with rule customization_limit_exceeded", async () => {
    stubRpc({ data: null, error: { code: "PRLIM" } });
    const err = await saveMyResponse(MENU_DAY, VALID_BODY as never).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toContainEqual({
      field: "items",
      rule: "customization_limit_exceeded",
    });
  });

  it("maps an unknown RPC error to InternalError", async () => {
    stubRpc({ data: null, error: { code: "XX999" } });
    await expect(
      saveMyResponse(MENU_DAY, VALID_BODY as never),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe("confirmMyResponse / cancelMyResponse", () => {
  it("confirm re-reads using the menu_day_id the RPC returns", async () => {
    const rpc = stubRpc({ data: MENU_DAY, error: null });
    const result = await confirmMyResponse(RESPONSE);
    expect(rpc).toHaveBeenCalledWith("confirm_provider_response", {
      p_response_id: RESPONSE,
    });
    expect(getMyResponse).toHaveBeenCalledWith(MENU_DAY);
    expect(result).toBe(DTO);
  });

  it("confirm maps PREMP → VALIDATION_ERROR (empty response)", async () => {
    stubRpc({ data: null, error: { code: "PREMP" } });
    await expect(confirmMyResponse(RESPONSE)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("confirm maps a missing response (P0002) → 404", async () => {
    stubRpc({ data: null, error: { code: "P0002" } });
    await expect(confirmMyResponse(RESPONSE)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("confirm maps PRRLK → CONFLICT response_already_locked", async () => {
    stubRpc({ data: null, error: { code: "PRRLK" } });
    const err = await confirmMyResponse(RESPONSE).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).details).toMatchObject({
      reason: "response_already_locked",
    });
  });

  it("404s a malformed response id without an RPC call", async () => {
    const rpc = stubRpc({ data: null, error: null });
    await expect(confirmMyResponse("nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancel runs the cancel RPC and re-reads", async () => {
    const rpc = stubRpc({ data: MENU_DAY, error: null });
    const result = await cancelMyResponse(RESPONSE);
    expect(rpc).toHaveBeenCalledWith("cancel_provider_response", {
      p_response_id: RESPONSE,
    });
    expect(result).toBe(DTO);
  });
});
