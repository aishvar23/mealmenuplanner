import { renderHook } from "@testing-library/react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { useProviderMembership } from "./use-provider-membership";
import { useProviders } from "./use-providers";

// The membership hook is a pure selector over the shared providers query, so the
// test mocks `useProviders` and asserts it picks the right row — and, crucially,
// returns nothing for a provider the caller does not belong to (cross-provider
// isolation, spec §14.4).
jest.mock("./use-providers", () => ({ useProviders: jest.fn() }));

const mockUseProviders = jest.mocked(useProviders);

const summary = (
  over: Partial<ProviderSummaryDto> = {},
): ProviderSummaryDto => ({
  providerId: "prov-a",
  name: "Anna's Kitchen",
  role: "customer",
  membershipStatus: "active",
  timezone: "Asia/Kolkata",
  ...over,
});

function result(data: ProviderSummaryDto[] | undefined) {
  return {
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useProviders>;
}

beforeEach(() => mockUseProviders.mockReset());

describe("useProviderMembership", () => {
  it("resolves the membership for a provider the caller belongs to", () => {
    mockUseProviders.mockReturnValue(
      result([summary({ providerId: "prov-a", name: "Anna's" })]),
    );
    const { result: hook } = renderHook(() => useProviderMembership("prov-a"));
    expect(hook.current.membership?.name).toBe("Anna's");
  });

  it("returns undefined for a provider the caller is not a member of", () => {
    mockUseProviders.mockReturnValue(
      result([summary({ providerId: "prov-a" })]),
    );
    const { result: hook } = renderHook(() => useProviderMembership("prov-b"));
    expect(hook.current.membership).toBeUndefined();
  });
});
