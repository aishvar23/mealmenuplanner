import { act, renderHook } from "@testing-library/react-native";

import { setActiveHousehold } from "@/api";
import { setActiveWorkspace } from "@/api/workspace";

import { useWorkspaceSwitch } from "./use-workspace-switch";

// The switch hook records the pointer then navigates. The test mocks the API
// calls, the router, and the query client so it can assert each happens, in order,
// without a real request or navigation. Households additionally move the
// household-level active pointer so the daily-loop tabs follow the choice.
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock("@/api/workspace", () => ({ setActiveWorkspace: jest.fn() }));
jest.mock("@/api", () => ({ setActiveHousehold: jest.fn() }));
jest.mock("@/household/use-household", () => ({
  householdsQueryKey: ["households"],
}));

const mockSetQueryData = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

const mockSetWorkspace = jest.mocked(setActiveWorkspace);
const mockSetHousehold = jest.mocked(setActiveHousehold);

beforeEach(() => {
  mockReplace.mockReset();
  mockSetQueryData.mockReset();
  mockSetWorkspace.mockReset();
  mockSetWorkspace.mockResolvedValue(undefined);
  mockSetHousehold.mockReset();
  mockSetHousehold.mockResolvedValue({ households: [] });
});

describe("useWorkspaceSwitch", () => {
  it("records the active pointer, then navigates to the workspace", async () => {
    const { result } = renderHook(() => useWorkspaceSwitch());

    await act(async () => {
      await result.current.switchTo({
        type: "provider_owner",
        id: "prov-a",
        route: "/(provider-owner)/prov-a/dashboard",
      });
    });

    expect(mockSetWorkspace).toHaveBeenCalledWith("provider_owner", "prov-a");
    expect(mockSetHousehold).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      "/(provider-owner)/prov-a/dashboard",
    );
  });

  it("also moves the household-active pointer when switching to a household", async () => {
    const households = [{ householdId: "hh-1", isActive: true }];
    mockSetHousehold.mockResolvedValue({ households } as never);
    const { result } = renderHook(() => useWorkspaceSwitch());

    await act(async () => {
      await result.current.switchTo({
        type: "household",
        id: "hh-1",
        route: "/(tabs)/today",
      });
    });

    expect(mockSetWorkspace).toHaveBeenCalledWith("household", "hh-1");
    expect(mockSetHousehold).toHaveBeenCalledWith("hh-1");
    expect(mockSetQueryData).toHaveBeenCalledWith(["households"], households);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/today");
  });

  it("navigates even when recording the pointer fails (destination re-verifies)", async () => {
    mockSetWorkspace.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useWorkspaceSwitch());

    await act(async () => {
      await result.current.switchTo({
        type: "household",
        id: "hh-1",
        route: "/(tabs)/today",
      });
    });

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/today");
  });
});
