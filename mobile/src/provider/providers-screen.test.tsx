import { fireEvent, render, screen } from "@testing-library/react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import ProvidersScreen from "./providers-screen";
import { useProviders } from "./use-providers";
import { useWorkspaceSwitch } from "./use-workspace-switch";

// The screen renders from the `useProviders` hook and enters a workspace through
// `useWorkspaceSwitch`, so the unit test mocks both: it asserts each state
// (loading / error / empty / list) and that a row enters the right shell, without
// a real query or navigation. Pairs with the web provider-shell tests (#18).
jest.mock("./use-providers", () => ({ useProviders: jest.fn() }));
jest.mock("./use-workspace-switch", () => ({ useWorkspaceSwitch: jest.fn() }));

const mockUseProviders = jest.mocked(useProviders);
const mockUseWorkspaceSwitch = jest.mocked(useWorkspaceSwitch);
const switchTo = jest.fn();

function result(over: Partial<ReturnType<typeof useProviders>>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...over,
  } as unknown as ReturnType<typeof useProviders>;
}

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

beforeEach(() => {
  mockUseProviders.mockReset();
  switchTo.mockReset();
  mockUseWorkspaceSwitch.mockReturnValue({ switchTo, pending: false });
});

describe("ProvidersScreen", () => {
  it("shows the empty state when the caller belongs to no provider", () => {
    mockUseProviders.mockReturnValue(result({ data: [] }));
    render(<ProvidersScreen />);
    expect(screen.getByText("No meal providers yet")).toBeOnTheScreen();
  });

  it("lists each provider with its name and membership label", () => {
    mockUseProviders.mockReturnValue(
      result({
        data: [
          summary({
            providerId: "p-own",
            name: "Anna's Kitchen",
            role: "owner",
          }),
          summary({
            providerId: "p-sub",
            name: "Bay Tiffins",
            role: "customer",
            membershipStatus: "active",
          }),
          summary({
            providerId: "p-wait",
            name: "Curry Co",
            role: "customer",
            membershipStatus: "awaiting_approval",
          }),
        ],
      }),
    );

    render(<ProvidersScreen />);

    expect(screen.getByText("Anna's Kitchen")).toBeOnTheScreen();
    expect(screen.getByText("Owner")).toBeOnTheScreen();
    expect(screen.getByText("Bay Tiffins")).toBeOnTheScreen();
    expect(screen.getByText("Subscriber")).toBeOnTheScreen();
    expect(screen.getByText("Curry Co")).toBeOnTheScreen();
    expect(screen.getByText("Awaiting approval")).toBeOnTheScreen();
  });

  it("surfaces an error state with a retry affordance", () => {
    mockUseProviders.mockReturnValue(result({ isError: true }));
    render(<ProvidersScreen />);
    expect(
      screen.getByText("We couldn't load your providers. Please try again."),
    ).toBeOnTheScreen();
  });

  it("enters the owner shell when an owned-provider row is pressed", () => {
    mockUseProviders.mockReturnValue(
      result({
        data: [
          summary({ providerId: "p-own", name: "My Kitchen", role: "owner" }),
        ],
      }),
    );

    render(<ProvidersScreen />);
    fireEvent.press(screen.getByText("My Kitchen"));

    expect(switchTo).toHaveBeenCalledWith({
      type: "provider_owner",
      id: "p-own",
      route: "/(provider-owner)/p-own/dashboard",
    });
  });

  it("enters the awaiting-approval shell when an awaiting row is pressed", () => {
    mockUseProviders.mockReturnValue(
      result({
        data: [
          summary({
            providerId: "p-wait",
            name: "Curry Co",
            role: "customer",
            membershipStatus: "awaiting_approval",
          }),
        ],
      }),
    );

    render(<ProvidersScreen />);
    fireEvent.press(screen.getByText("Curry Co"));

    expect(switchTo).toHaveBeenCalledWith({
      type: "provider_customer",
      id: "p-wait",
      route: "/(provider-member)/p-wait/awaiting-approval",
    });
  });
});
