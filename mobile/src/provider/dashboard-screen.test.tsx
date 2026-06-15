import { fireEvent, render, screen } from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { DashboardScreen } from "./dashboard-screen";
import { useDashboard } from "./use-dashboard";

// The screen is presentational over its data hook; mock it so the test renders the
// cards without a network or a QueryClient. Mobile UI E2E is deferred (ADR-17/Q-8) —
// this is the unit/hook bar (MP-C-060).
jest.mock("./use-dashboard", () => ({ useDashboard: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

const mockUseDashboard = jest.mocked(useDashboard);

function value(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useDashboard> {
  return {
    data: providerFixtures.dashboard,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDashboard>;
}

beforeEach(() => {
  mockUseDashboard.mockReset();
  mockNavigate.mockReset();
});

describe("DashboardScreen (MP-C-060)", () => {
  it("shows a spinner while the dashboard is loading", () => {
    mockUseDashboard.mockReturnValue(
      value({ isLoading: true, data: undefined }),
    );
    render(<DashboardScreen providerId="p1" />);
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("shows an error state with retry", () => {
    const refetch = jest.fn();
    mockUseDashboard.mockReturnValue(
      value({ error: new Error("boom"), data: undefined, refetch }),
    );
    render(<DashboardScreen providerId="p1" />);
    expect(screen.getByText("Couldn't load the dashboard.")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders today's menu state and the response census from the batch", () => {
    mockUseDashboard.mockReturnValue(value());
    render(<DashboardScreen providerId="p1" />);

    const d = providerFixtures.dashboard;
    expect(screen.getByText("Today's menu")).toBeOnTheScreen();
    expect(screen.getByText(d.today!.menuDate)).toBeOnTheScreen();
    expect(screen.getByText("Published")).toBeOnTheScreen();
    // Census cells from the batch totals.
    expect(screen.getByText("Confirmed")).toBeOnTheScreen();
    expect(
      screen.getByText(String(d.batch!.totals.confirmed)),
    ).toBeOnTheScreen();
    expect(screen.getByText("Email sent")).toBeOnTheScreen();
  });

  it("navigates to preparation from the responses card", () => {
    mockUseDashboard.mockReturnValue(value());
    render(<DashboardScreen providerId="p1" />);
    fireEvent.press(screen.getByText("View preparation"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/(provider-owner)/p1/preparation",
    );
  });

  it("shows the no-menu state and hides the responses card when there is no menu today", () => {
    mockUseDashboard.mockReturnValue(
      value({ data: { ...providerFixtures.dashboard, today: null } }),
    );
    render(<DashboardScreen providerId="p1" />);
    expect(
      screen.getByText("No menu is published for today."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Responses")).toBeNull();
  });

  it("shows the pre-cutoff empty census when today has no batch yet", () => {
    mockUseDashboard.mockReturnValue(
      value({ data: { ...providerFixtures.dashboard, batch: null } }),
    );
    render(<DashboardScreen providerId="p1" />);
    expect(screen.getByText("Responses")).toBeOnTheScreen();
    expect(screen.getByText("No counts yet")).toBeOnTheScreen();
    expect(screen.queryByText("Confirmed")).toBeNull();
  });
});
