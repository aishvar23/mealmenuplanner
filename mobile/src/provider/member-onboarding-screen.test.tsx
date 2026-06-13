import { fireEvent, render, screen } from "@testing-library/react-native";

import type { MyProviderMembershipDto } from "@mmp/shared/provider";

import { MemberOnboardingScreen } from "./member-onboarding-screen";
import { useMyMembership } from "./use-my-membership";

// Mock the data + mutation layer so the screen renders without a QueryClient or
// network. We assert the required-field gating and that submitting fires the
// mutation. UI E2E (Detox/Maestro) is deferred.
const mockMutate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useMutation: jest.fn(() => ({
    mutate: mockMutate,
    isPending: false,
    error: null,
  })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock("./use-my-membership", () => ({
  useMyMembership: jest.fn(),
  myMembershipQueryKey: (id: string) => ["provider-my-membership", id],
}));
// The screen imports `providerClient` from `./client`, whose transitive supabase
// config is env-gated and unavailable in Jest; the mutation is mocked anyway.
jest.mock("./client", () => ({ providerClient: {} }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUseMyMembership = jest.mocked(useMyMembership);

const PENDING: MyProviderMembershipDto = {
  providerId: "prov-1",
  role: "customer",
  status: "active",
  onboardingComplete: false,
  displayName: null,
  phone: null,
  defaultSpiceLevel: null,
  autoAcceptEligible: false,
  autoAcceptConsented: false,
};

function setMembership(over: Partial<MyProviderMembershipDto> = {}) {
  mockUseMyMembership.mockReturnValue({
    data: { ...PENDING, ...over },
    isLoading: false,
  } as unknown as ReturnType<typeof useMyMembership>);
}

beforeEach(() => {
  mockMutate.mockReset();
  mockReplace.mockReset();
  mockUseMyMembership.mockReset();
  setMembership();
});

describe("MemberOnboardingScreen", () => {
  it("disables submit until name + both acknowledgments are set", () => {
    render(<MemberOnboardingScreen providerId="prov-1" />);
    const submit = screen.getByRole("button", {
      name: "Continue to today's menu",
    });
    expect(submit).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText("Chitra"), "Chitra");
    expect(submit).toBeDisabled(); // acks still unchecked

    const [allergy, terms] = screen.getAllByRole("checkbox");
    fireEvent.press(allergy!);
    fireEvent.press(terms!);
    expect(submit).toBeEnabled();
  });

  it("submits once required fields are set", () => {
    render(<MemberOnboardingScreen providerId="prov-1" />);
    fireEvent.changeText(screen.getByPlaceholderText("Chitra"), "Chitra");
    const [allergy, terms] = screen.getAllByRole("checkbox");
    fireEvent.press(allergy!);
    fireEvent.press(terms!);
    fireEvent.press(
      screen.getByRole("button", { name: "Continue to today's menu" }),
    );
    expect(mockMutate).toHaveBeenCalled();
  });

  it("hides the auto-accept consent toggle when not eligible", () => {
    setMembership({ autoAcceptEligible: false });
    render(<MemberOnboardingScreen providerId="prov-1" />);
    // Only the two acknowledgments are present (no consent row).
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows the consent toggle when subscription-eligible", () => {
    setMembership({ autoAcceptEligible: true });
    render(<MemberOnboardingScreen providerId="prov-1" />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("never shows any household input field", () => {
    render(<MemberOnboardingScreen providerId="prov-1" />);
    expect(screen.queryByText(/family size/i)).toBeNull();
    expect(screen.queryByText(/cuisine/i)).toBeNull();
    expect(screen.queryByText(/grocery/i)).toBeNull();
    expect(screen.queryByText(/cooking time/i)).toBeNull();
  });
});
