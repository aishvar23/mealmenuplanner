import { fireEvent, render, screen } from "@testing-library/react-native";

import type { ProviderSummaryDto } from "@mmp/shared/provider";

import ProviderOnboardingScreen from "./provider-onboarding-screen";
import { useProviders } from "./use-providers";
import {
  useProviderOnboarding,
  type ProviderOnboardingController,
} from "./use-provider-onboarding";

// The screen is presentational over `useProviderOnboarding`; the controller's flow
// is unit-tested in `use-provider-onboarding.test`. Here we mock it to assert the
// two-step rendering, the required-field gating on the buttons, and that pressing
// the primary action invokes the controller. UI E2E (Detox/Maestro) is deferred.
// Fully mock the controller module so the screen test never pulls the real hook's
// `providerClient` → supabase-config import chain (env-gated, unavailable in Jest).
// `timezoneOptions` is the only other export the screen uses at runtime.
jest.mock("./use-provider-onboarding", () => ({
  useProviderOnboarding: jest.fn(),
  timezoneOptions: () => ["UTC", "Asia/Kolkata"],
}));
// The screen guards "one active provider per owner" via `useProviders` and
// redirects an existing owner through the router; mock both so the form renders
// without a query/navigation and the redirect is observable.
jest.mock("./use-providers", () => ({ useProviders: jest.fn() }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockController = jest.mocked(useProviderOnboarding);
const mockUseProviders = jest.mocked(useProviders);

function providersResult(data: ProviderSummaryDto[]) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useProviders>;
}

function controller(
  over: Partial<ProviderOnboardingController> = {},
): ProviderOnboardingController {
  return {
    form: {
      name: "",
      timezone: "UTC",
      email: "",
      phone: "",
      city: "",
      state: "",
      country: "",
      defaultCutoffLocalTime: "",
      summaryEmailRecipients: "",
    },
    step: 0,
    busy: false,
    error: null,
    canAdvance: false,
    setField: jest.fn(),
    goNext: jest.fn(),
    goBack: jest.fn(),
    finish: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockController.mockReset();
  mockUseProviders.mockReset();
  mockReplace.mockReset();
  // Default: caller owns no provider, so the create form renders.
  mockUseProviders.mockReturnValue(providersResult([]));
});

describe("ProviderOnboardingScreen", () => {
  it("disables Continue until required fields are set (step 1)", () => {
    mockController.mockReturnValue(controller({ canAdvance: false }));
    render(<ProviderOnboardingScreen />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
  });

  it("invokes goNext when Continue is pressed and allowed", () => {
    const goNext = jest.fn();
    mockController.mockReturnValue(controller({ canAdvance: true, goNext }));
    render(<ProviderOnboardingScreen />);
    fireEvent.press(screen.getByText("Continue"));
    expect(goNext).toHaveBeenCalled();
  });

  it("renders the service-defaults step with a Finish action", () => {
    const finish = jest.fn();
    mockController.mockReturnValue(
      controller({ step: 1, canAdvance: true, finish }),
    );
    render(<ProviderOnboardingScreen />);
    expect(screen.getByText("Service defaults")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("Finish setup"));
    expect(finish).toHaveBeenCalled();
  });

  it("surfaces a controller error", () => {
    mockController.mockReturnValue(
      controller({ error: "Couldn't create the provider." }),
    );
    render(<ProviderOnboardingScreen />);
    expect(screen.getByText("Couldn't create the provider.")).toBeOnTheScreen();
  });

  it("redirects an existing owner to their dashboard instead of the form (MVP: one provider per owner)", () => {
    mockController.mockReturnValue(controller());
    mockUseProviders.mockReturnValue(
      providersResult([
        {
          providerId: "prov-own",
          name: "Anna's Kitchen",
          role: "owner",
          membershipStatus: "active",
          timezone: "UTC",
        },
      ]),
    );
    render(<ProviderOnboardingScreen />);
    expect(mockReplace).toHaveBeenCalledWith(
      "/(provider-owner)/prov-own/dashboard",
    );
    // The create form is not shown while redirecting.
    expect(screen.queryByText("Continue")).toBeNull();
  });
});
