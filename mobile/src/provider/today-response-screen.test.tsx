import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";
import type { MemberResponseDto, MenuDayDto } from "@mmp/shared/provider";

import { TodayResponseScreen } from "./today-response-screen";
import { useTodayResponse } from "./use-today-response";

// The screen is presentational over the data hook; mock it so the test renders the
// menu + response controls without a network or a QueryClient. Mobile UI E2E is
// deferred (ADR-17/Q-8) — this is the unit/hook bar.
jest.mock("./use-today-response", () => ({
  useTodayResponse: jest.fn(),
}));

const mockUseTodayResponse = jest.mocked(useTodayResponse);

// A far-future cutoff so the response stays open for the interactive tests (the
// fixture's own cutoff is a fixed past date). Lock-state tests use a locked
// response, which is read-only regardless of the cutoff time.
const menu: MenuDayDto = {
  ...providerFixtures.publishedMenuDay,
  cutoffAt: "2999-01-01T00:00:00Z",
};
const draft: MemberResponseDto = providerFixtures.draftResponse;

interface MockMutation {
  mutate: jest.Mock;
  mutateAsync: jest.Mock;
  isPending: boolean;
  error: unknown;
}

function mutation(impl?: (arg: never) => Promise<unknown>): MockMutation {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(impl ?? (() => Promise.resolve(undefined))),
    isPending: false,
    error: null,
  };
}

function hookValue(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useTodayResponse> {
  return {
    menu,
    response: draft,
    isLoading: false,
    error: null,
    refetchResponse: jest.fn().mockResolvedValue({ data: draft }),
    save: mutation(),
    confirm: mutation(),
    cancel: mutation(),
    ...overrides,
  } as unknown as ReturnType<typeof useTodayResponse>;
}

describe("TodayResponseScreen", () => {
  it("shows a spinner while loading", () => {
    mockUseTodayResponse.mockReturnValue(
      hookValue({ isLoading: true, response: undefined }),
    );
    render(<TodayResponseScreen providerId="p1" />);
    // The loading branch shows only the spinner — none of the form chrome.
    expect(screen.queryByText("Today’s menu")).toBeNull();
    expect(screen.queryByText("Confirm order")).toBeNull();
  });

  it("renders the menu components and the confirm action for a draft", () => {
    mockUseTodayResponse.mockReturnValue(hookValue());
    render(<TodayResponseScreen providerId="p1" />);
    // Component group headers render (dal / bread / rice from the fixture).
    expect(screen.getByText(/Dal \/ legume/)).toBeOnTheScreen();
    expect(screen.getByText(/Bread/)).toBeOnTheScreen();
    // Choices are labelled by dish NAME, not "Default"/"Option N" (ADO #39):
    // the dal slot's Rajma chip and the single-choice bread slot's Roti both show.
    expect(screen.getByText(/Rajma/)).toBeOnTheScreen();
    expect(screen.getByText(/Roti/)).toBeOnTheScreen();
    expect(screen.getByText("Confirm order")).toBeOnTheScreen();
    expect(screen.getByText("Draft — not confirmed")).toBeOnTheScreen();
  });

  it("confirms the draft: saves first (new response), then confirms", async () => {
    const saved: MemberResponseDto = {
      ...draft,
      responseId: "resp-1",
      status: "draft",
      version: 1,
    };
    const save = mutation(() => Promise.resolve(saved));
    const confirm = mutation(() =>
      Promise.resolve({ ...saved, status: "confirmed" }),
    );
    mockUseTodayResponse.mockReturnValue(hookValue({ save, confirm }));

    render(<TodayResponseScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Confirm order"));

    // A brand-new response (responseId null) is saved before confirm, then the
    // returned id is confirmed.
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(confirm.mutateAsync).toHaveBeenCalledWith("resp-1"),
    );
  });

  it("is read-only once the response is locked (no actions, locked notice)", () => {
    mockUseTodayResponse.mockReturnValue(
      hookValue({ response: providerFixtures.lockedResponse }),
    );
    render(<TodayResponseScreen providerId="p1" />);
    expect(screen.getByText(/This menu is locked/)).toBeOnTheScreen();
    expect(screen.queryByText("Confirm order")).toBeNull();
    expect(screen.queryByText("Cancel order")).toBeNull();
  });

  it("cancels a confirmed order", async () => {
    const confirmed: MemberResponseDto = {
      ...draft,
      responseId: "resp-9",
      status: "confirmed",
      version: 2,
    };
    const cancel = mutation(() =>
      Promise.resolve({ ...confirmed, status: "cancelled" }),
    );
    mockUseTodayResponse.mockReturnValue(
      hookValue({ response: confirmed, cancel }),
    );
    render(<TodayResponseScreen providerId="p1" />);
    fireEvent.press(screen.getByText("Cancel order"));
    await waitFor(() =>
      expect(cancel.mutateAsync).toHaveBeenCalledWith("resp-9"),
    );
  });
});
