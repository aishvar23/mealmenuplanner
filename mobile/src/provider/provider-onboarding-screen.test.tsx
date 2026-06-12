import { fireEvent, render, screen } from "@testing-library/react-native";

import ProviderOnboardingScreen from "./provider-onboarding-screen";
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

const mockController = jest.mocked(useProviderOnboarding);

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
});
