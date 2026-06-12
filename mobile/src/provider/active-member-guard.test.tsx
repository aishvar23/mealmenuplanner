import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { ActiveMemberGuard } from "./active-member-guard";
import { useProviderMembership } from "./use-provider-membership";

// The guard gates a member menu screen on an *approved* membership (MP-C-012): an
// active customer sees the children; an awaiting one is redirected to the holding
// screen, and a non-member to the providers list. The test mocks the membership
// hook and renders `Redirect` as a marker so each branch is observable.
jest.mock("./use-provider-membership", () => ({
  useProviderMembership: jest.fn(),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: RNText } = require("react-native");
    return <RNText>{`redirect:${href}`}</RNText>;
  },
}));

const mockMembership = jest.mocked(useProviderMembership);

function membershipResult(
  membership: ProviderSummaryDto | undefined,
  isLoading = false,
) {
  return { membership, isLoading, isError: false };
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

beforeEach(() => mockMembership.mockReset());

describe("ActiveMemberGuard", () => {
  it("renders the children for an approved customer", () => {
    mockMembership.mockReturnValue(membershipResult(summary()));
    render(
      <ActiveMemberGuard providerId="prov-a">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.getByText("Today menu")).toBeOnTheScreen();
  });

  it("redirects an awaiting customer to the holding screen, not the menu", () => {
    mockMembership.mockReturnValue(
      membershipResult(summary({ membershipStatus: "awaiting_approval" })),
    );
    render(
      <ActiveMemberGuard providerId="prov-a">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.queryByText("Today menu")).not.toBeOnTheScreen();
    expect(
      screen.getByText("redirect:/(provider-member)/prov-a/awaiting-approval"),
    ).toBeOnTheScreen();
  });

  it("redirects a non-member to the providers list", () => {
    mockMembership.mockReturnValue(membershipResult(undefined));
    render(
      <ActiveMemberGuard providerId="prov-b">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.queryByText("Today menu")).not.toBeOnTheScreen();
    expect(
      screen.getByText("redirect:/(settings)/providers"),
    ).toBeOnTheScreen();
  });
});
