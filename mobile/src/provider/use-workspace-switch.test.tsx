import { act, renderHook } from "@testing-library/react-native";

import { setActiveWorkspace } from "@/api/workspace";

import { useWorkspaceSwitch } from "./use-workspace-switch";

// The switch hook records the pointer then navigates. The test mocks the API call
// and the router so it can assert both happen, in order, without a real request or
// navigation.
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock("@/api/workspace", () => ({ setActiveWorkspace: jest.fn() }));

const mockSet = jest.mocked(setActiveWorkspace);

beforeEach(() => {
  mockReplace.mockReset();
  mockSet.mockReset();
  mockSet.mockResolvedValue(undefined);
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

    expect(mockSet).toHaveBeenCalledWith("provider_owner", "prov-a");
    expect(mockReplace).toHaveBeenCalledWith(
      "/(provider-owner)/prov-a/dashboard",
    );
  });

  it("navigates even when recording the pointer fails (destination re-verifies)", async () => {
    mockSet.mockRejectedValue(new Error("network"));
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
