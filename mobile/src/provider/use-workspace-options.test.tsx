import { renderHook } from "@testing-library/react-native";

import { useHouseholds } from "@/household/use-household";

import { useProviders } from "./use-providers";
import { useWorkspaceOptions } from "./use-workspace-options";

// Combines the household + provider discovery queries into switcher options, so the
// test mocks both and asserts the merged shape (order, routes, subtitles).
jest.mock("@/household/use-household", () => ({ useHouseholds: jest.fn() }));
jest.mock("./use-providers", () => ({ useProviders: jest.fn() }));

const mockHouseholds = jest.mocked(useHouseholds);
const mockProviders = jest.mocked(useProviders);

function asResult<T>(data: T) {
  return { data, isLoading: false, isError: false } as never;
}

beforeEach(() => {
  mockHouseholds.mockReset();
  mockProviders.mockReset();
});

describe("useWorkspaceOptions", () => {
  it("lists households first, then providers, each with route + subtitle", () => {
    mockHouseholds.mockReturnValue(
      asResult([
        { householdId: "hh-1", name: "Suhane Household", role: "owner" },
      ]),
    );
    mockProviders.mockReturnValue(
      asResult([
        {
          providerId: "prov-a",
          name: "Anna's Tiffins",
          role: "owner",
          membershipStatus: "active",
          timezone: "Asia/Kolkata",
        },
        {
          providerId: "prov-b",
          name: "Bay Bhojan",
          role: "customer",
          membershipStatus: "awaiting_approval",
          timezone: "UTC",
        },
      ]),
    );

    const { result } = renderHook(() => useWorkspaceOptions());

    expect(result.current.options).toEqual([
      {
        type: "household",
        id: "hh-1",
        route: "/(tabs)/today",
        name: "Suhane Household",
        subtitle: "Household · owner",
        kind: "household",
      },
      {
        type: "provider_owner",
        id: "prov-a",
        route: "/(provider-owner)/prov-a/dashboard",
        name: "Anna's Tiffins",
        subtitle: "Meal provider · owner",
        kind: "provider",
      },
      {
        type: "provider_customer",
        id: "prov-b",
        route: "/(provider-member)/prov-b/awaiting-approval",
        name: "Bay Bhojan",
        subtitle: "Meal provider · awaiting approval",
        kind: "provider",
      },
    ]);
  });

  it("is empty when the caller belongs to nothing", () => {
    mockHouseholds.mockReturnValue(asResult([]));
    mockProviders.mockReturnValue(asResult([]));
    const { result } = renderHook(() => useWorkspaceOptions());
    expect(result.current.options).toEqual([]);
  });
});
