import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { ProviderDto } from "@mmp/shared/provider";

import { providerClient } from "./client";
import { useProviderOnboarding } from "./use-provider-onboarding";
import { useWorkspaceSwitch } from "./use-workspace-switch";

// The controller drives the create → patch → complete flow through the shared
// `providerClient` seam and enters the owner shell via `useWorkspaceSwitch`, so the
// test mocks both — proving the wiring + required-field gating without a network
// call or navigation. Pairs with the web provider-onboarding e2e (MP-B-020).
jest.mock("./client", () => ({
  providerClient: {
    createProvider: jest.fn(),
    updateProvider: jest.fn(),
    completeProviderOnboarding: jest.fn(),
  },
}));
jest.mock("./use-workspace-switch", () => ({ useWorkspaceSwitch: jest.fn() }));

const mockCreate = providerClient.createProvider as jest.Mock;
const mockUpdate = providerClient.updateProvider as jest.Mock;
const mockComplete = providerClient.completeProviderOnboarding as jest.Mock;
const switchTo = jest.fn();

const DRAFT: ProviderDto = {
  providerId: "prov-1",
  name: "Anna's Kitchen",
  email: null,
  phone: null,
  city: null,
  state: null,
  country: null,
  timezone: "UTC",
  status: "draft",
  defaultCutoffLocalTime: null,
  summaryEmailRecipients: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWorkspaceSwitch).mockReturnValue({ switchTo, pending: false });
  mockCreate.mockResolvedValue(DRAFT);
  mockUpdate.mockResolvedValue(DRAFT);
  mockComplete.mockResolvedValue({ ...DRAFT, status: "active" });
});

describe("useProviderOnboarding", () => {
  it("gates advancing until name + timezone are set", () => {
    const { result } = renderHook(() => useProviderOnboarding());
    // Timezone defaults to the detected zone, so only the name is missing.
    expect(result.current.canAdvance).toBe(false);
    act(() => result.current.setField("name", "Anna's Kitchen"));
    expect(result.current.canAdvance).toBe(true);
  });

  it("does not call the API when goNext runs before required fields are set", async () => {
    const { result } = renderHook(() => useProviderOnboarding());
    await act(async () => {
      await result.current.goNext();
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the draft then patches identity on the first goNext", async () => {
    const { result } = renderHook(() => useProviderOnboarding());
    act(() => {
      result.current.setField("name", "Anna's Kitchen");
      result.current.setField("email", "hi@anna.com");
    });

    await act(async () => {
      await result.current.goNext();
    });

    expect(mockCreate).toHaveBeenCalledWith({ name: "Anna's Kitchen" });
    expect(mockUpdate).toHaveBeenCalledWith(
      "prov-1",
      expect.objectContaining({ name: "Anna's Kitchen", email: "hi@anna.com" }),
    );
    expect(result.current.step).toBe(1);
  });

  it("reuses the existing draft id on a second goNext (no duplicate create)", async () => {
    const { result } = renderHook(() => useProviderOnboarding());
    act(() => result.current.setField("name", "Anna's Kitchen"));

    await act(async () => {
      await result.current.goNext();
    });
    act(() => result.current.goBack());
    await act(async () => {
      await result.current.goNext();
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("finishes by patching defaults, completing, and entering the owner shell", async () => {
    const { result } = renderHook(() => useProviderOnboarding());
    act(() => {
      result.current.setField("name", "Anna's Kitchen");
      result.current.setField("summaryEmailRecipients", "a@x.com, b@x.com");
    });
    await act(async () => {
      await result.current.goNext();
    });
    await act(async () => {
      await result.current.finish();
    });

    expect(mockUpdate).toHaveBeenLastCalledWith("prov-1", {
      defaultCutoffLocalTime: null,
      summaryEmailRecipients: ["a@x.com", "b@x.com"],
    });
    expect(mockComplete).toHaveBeenCalledWith("prov-1");
    expect(switchTo).toHaveBeenCalledWith({
      type: "provider_owner",
      id: "prov-1",
      route: "/(provider-owner)/prov-1/dashboard",
    });
  });

  it("surfaces an API error instead of advancing", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Provider name is required."));
    const { result } = renderHook(() => useProviderOnboarding());
    act(() => result.current.setField("name", "X"));

    await act(async () => {
      await result.current.goNext();
    });

    await waitFor(() =>
      expect(result.current.error).toBe("Provider name is required."),
    );
    expect(result.current.step).toBe(0);
  });
});
