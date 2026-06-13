import { fireEvent, render, screen } from "@testing-library/react-native";

import type { MemberDto } from "@mmp/shared/provider";

import { MembersScreen } from "./members-screen";
import { useMembers, useMemberActions } from "./use-members";

// The screen is presentational over the data hooks; mock them so the test renders
// the roster + invite form without a network or a QueryClient. UI E2E is deferred.
jest.mock("./use-members", () => ({
  useMembers: jest.fn(),
  useMemberActions: jest.fn(),
}));

const mockUseMembers = jest.mocked(useMembers);
const mockUseMemberActions = jest.mocked(useMemberActions);

const OWNER: MemberDto = {
  memberId: "m-owner",
  userId: "u-owner",
  displayName: "Anna",
  email: "anna@example.com",
  phone: null,
  role: "owner",
  status: "active",
  approvedAt: "2026-05-01T00:00:00Z",
  joinedAt: "2026-05-01T00:00:00Z",
};
const AWAITING: MemberDto = {
  memberId: "m-await",
  userId: "u-bilal",
  displayName: "Bilal",
  email: "bilal@example.com",
  phone: null,
  role: "customer",
  status: "awaiting_approval",
  approvedAt: null,
  joinedAt: null,
};
const ACTIVE: MemberDto = {
  memberId: "m-active",
  userId: "u-chitra",
  displayName: "Chitra",
  email: "chitra@example.com",
  phone: null,
  role: "customer",
  status: "active",
  approvedAt: "2026-05-20T00:00:00Z",
  joinedAt: "2026-05-20T00:00:00Z",
};

function mutation() {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null as unknown,
  };
}

function setMembers(data: MemberDto[]) {
  mockUseMembers.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMembers>);
}

let approve: ReturnType<typeof mutation>;
let reject: ReturnType<typeof mutation>;
let remove: ReturnType<typeof mutation>;
let invite: ReturnType<typeof mutation>;

beforeEach(() => {
  mockUseMembers.mockReset();
  mockUseMemberActions.mockReset();
  approve = mutation();
  reject = mutation();
  remove = mutation();
  invite = mutation();
  mockUseMemberActions.mockReturnValue({
    approve,
    reject,
    remove,
    invite,
  } as never);
});

describe("MembersScreen", () => {
  it("lists awaiting and active members", () => {
    setMembers([OWNER, AWAITING, ACTIVE]);
    render(<MembersScreen providerId="prov-1" />);
    expect(screen.getByText("Bilal")).toBeOnTheScreen();
    expect(screen.getByText("Chitra")).toBeOnTheScreen();
    expect(screen.getByText("Awaiting approval")).toBeOnTheScreen();
  });

  it("approves an awaiting member by id", () => {
    setMembers([AWAITING]);
    render(<MembersScreen providerId="prov-1" />);
    fireEvent.press(screen.getByText("Approve"));
    expect(approve.mutate).toHaveBeenCalledWith("m-await");
  });

  it("rejects an awaiting member by id", () => {
    setMembers([AWAITING]);
    render(<MembersScreen providerId="prov-1" />);
    fireEvent.press(screen.getByText("Reject"));
    expect(reject.mutate).toHaveBeenCalledWith("m-await");
  });

  it("offers Remove for an active customer but not the owner", () => {
    setMembers([OWNER, ACTIVE]);
    render(<MembersScreen providerId="prov-1" />);
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(1);
    fireEvent.press(removeButtons[0]!);
    expect(remove.mutate).toHaveBeenCalledWith("m-active");
  });

  it("shows an empty state when no one is awaiting", () => {
    setMembers([OWNER]);
    render(<MembersScreen providerId="prov-1" />);
    expect(
      screen.getByText("No one is waiting for approval."),
    ).toBeOnTheScreen();
  });
});
