import { render, screen } from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";
import type { MemberResponseDto, MenuDayDto } from "@mmp/shared/provider";

import { ResponsesRecapScreen } from "./responses-recap-screen";
import { useTodayResponse } from "./use-today-response";

jest.mock("./use-today-response", () => ({
  useTodayResponse: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockUseTodayResponse = jest.mocked(useTodayResponse);

// A far-future cutoff so an unlocked response is genuinely still open (the recap CTA
// now reflects the cutoff, not just the lock sweep). Lock-state tests use a locked
// response, which is read-only regardless of the cutoff time.
const menu: MenuDayDto = {
  ...providerFixtures.publishedMenuDay,
  cutoffAt: "2999-01-01T00:00:00Z",
};

function hookValue(
  response: MemberResponseDto | undefined,
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useTodayResponse> {
  return {
    menu,
    response,
    isLoading: false,
    error: null,
    refetchResponse: jest.fn(),
    save: {},
    confirm: {},
    cancel: {},
    ...overrides,
  } as unknown as ReturnType<typeof useTodayResponse>;
}

describe("ResponsesRecapScreen", () => {
  it("shows the confirmed status + note + edit CTA", () => {
    mockUseTodayResponse.mockReturnValue(
      hookValue(providerFixtures.confirmedResponse),
    );
    render(<ResponsesRecapScreen providerId="p1" />);
    expect(screen.getByText("Confirmed")).toBeOnTheScreen();
    expect(screen.getByText(/Less oil/)).toBeOnTheScreen();
    expect(screen.getByText("Review & respond")).toBeOnTheScreen();
  });

  it("shows a view-only CTA once locked", () => {
    mockUseTodayResponse.mockReturnValue(
      hookValue(providerFixtures.lockedResponse),
    );
    render(<ResponsesRecapScreen providerId="p1" />);
    expect(screen.getByText("Locked")).toBeOnTheScreen();
    expect(screen.getByText("View today's menu")).toBeOnTheScreen();
  });

  it("shows an empty hint when no menu is published", () => {
    mockUseTodayResponse.mockReturnValue(hookValue(undefined, { menu: null }));
    render(<ResponsesRecapScreen providerId="p1" />);
    expect(
      screen.getByText(/your response status will show here/),
    ).toBeOnTheScreen();
  });
});
