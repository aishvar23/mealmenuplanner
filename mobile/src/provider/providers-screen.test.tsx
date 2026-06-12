import { render, screen } from "@testing-library/react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import ProvidersScreen from "./providers-screen";
import { useProviders } from "./use-providers";

// The screen renders purely from the `useProviders` hook, so the unit test mocks
// the hook and asserts each state (loading / error / empty / list) without a real
// query. Pairs with the web `/workspace` chooser tests for MP-B-010/MP-C-010.
jest.mock("./use-providers", () => ({ useProviders: jest.fn() }));

const mockUseProviders = jest.mocked(useProviders);

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
});
