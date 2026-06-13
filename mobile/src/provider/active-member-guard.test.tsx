import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import type {
  MyProviderMembershipDto,
  ProviderSummaryDto,
} from "@mmp/shared/provider";

import { ActiveMemberGuard } from "./active-member-guard";
import { useMyMembership } from "./use-my-membership";
import { useProviderMembership } from "./use-provider-membership";

// The guard gates a member menu screen on an *approved, onboarded* membership
// (MP-C-012/021): an active+onboarded customer sees the children; an awaiting one
// is redirected to the holding screen, a not-yet-onboarded one to the onboarding
// screen, and a non-member to the providers list. The hooks are mocked and
// `Redirect` is rendered as a marker so each branch is observable.
jest.mock("./use-provider-membership", () => ({
  useProviderMembership: jest.fn(),
}));
jest.mock("./use-my-membership", () => ({
  useMyMembership: jest.fn(),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: RNText } = require("react-native");
    return <RNText>{`redirect:${href}`}</RNText>;
  },
}));

const mockMembership = jest.mocked(useProviderMembership);
const mockMyMembership = jest.mocked(useMyMembership);

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

function setMyMembership(onboardingComplete: boolean) {
  mockMyMembership.mockReturnValue({
    data: {
      providerId: "prov-a",
      role: "customer",
      status: "active",
      onboardingComplete,
      displayName: null,
      phone: null,
      defaultSpiceLevel: null,
      autoAcceptEligible: false,
      autoAcceptConsented: false,
    } satisfies MyProviderMembershipDto,
    isLoading: false,
  } as unknown as ReturnType<typeof useMyMembership>);
}

beforeEach(() => {
  mockMembership.mockReset();
  mockMyMembership.mockReset();
  setMyMembership(true); // onboarded by default
});

describe("ActiveMemberGuard", () => {
  it("renders the children for an approved, onboarded customer", () => {
    mockMembership.mockReturnValue(membershipResult(summary()));
    render(
      <ActiveMemberGuard providerId="prov-a">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.getByText("Today menu")).toBeOnTheScreen();
  });

  it("redirects an approved-but-not-onboarded customer to onboarding", () => {
    mockMembership.mockReturnValue(membershipResult(summary()));
    setMyMembership(false);
    render(
      <ActiveMemberGuard providerId="prov-a">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.queryByText("Today menu")).not.toBeOnTheScreen();
    expect(
      screen.getByText("redirect:/(provider-member)/prov-a/onboarding"),
    ).toBeOnTheScreen();
  });

  it("fails CLOSED when the self-membership read errors (no menu leak)", () => {
    // An active membership, but the self read returned no data (transient error):
    // the guard must NOT render the menu — it routes to onboarding instead.
    mockMembership.mockReturnValue(membershipResult(summary()));
    mockMyMembership.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useMyMembership>);
    render(
      <ActiveMemberGuard providerId="prov-a">
        <Text>Today menu</Text>
      </ActiveMemberGuard>,
    );
    expect(screen.queryByText("Today menu")).not.toBeOnTheScreen();
    expect(
      screen.getByText("redirect:/(provider-member)/prov-a/onboarding"),
    ).toBeOnTheScreen();
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
