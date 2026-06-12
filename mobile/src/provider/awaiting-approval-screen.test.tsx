import { render, screen } from "@testing-library/react-native";

import { AwaitingApprovalScreen } from "./awaiting-approval-screen";

// The holding screen is purely presentational: it shows the provider's name and
// the approval message, and — by construction — no menu data (spec §14.4).
describe("AwaitingApprovalScreen", () => {
  it("shows the provider name and the awaiting-approval message", () => {
    render(<AwaitingApprovalScreen providerName="Anna's Tiffins" />);

    expect(screen.getByText("Awaiting approval")).toBeOnTheScreen();
    expect(screen.getByText(/Anna's Tiffins/)).toBeOnTheScreen();
    expect(
      screen.getByText(/needs to approve your membership/),
    ).toBeOnTheScreen();
  });
});
