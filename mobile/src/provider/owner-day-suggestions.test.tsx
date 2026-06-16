import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { OwnerDaySuggestions } from "./owner-day-suggestions";
import { useSuggestions } from "./use-suggestions";

// Presentational over the data hook; mock it so the test renders the triage list
// without a network or a QueryClient (mobile UI E2E is deferred — ADR-17/Q-8).
jest.mock("./use-suggestions", () => ({ useSuggestions: jest.fn() }));

const mockUseSuggestions = jest.mocked(useSuggestions);

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
  overrides: Partial<Record<string, unknown>> = {},
): ReturnType<typeof useSuggestions> {
  return {
    list: {
      data: providerFixtures.suggestionList,
      isLoading: false,
      error: null,
    },
    create: mutation(),
    accept: mutation(),
    reject: mutation(),
    ...overrides,
  } as unknown as ReturnType<typeof useSuggestions>;
}

describe("OwnerDaySuggestions", () => {
  it("is collapsed by default (no suggestions shown until expanded)", () => {
    mockUseSuggestions.mockReturnValue(hookValue());
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    expect(screen.queryByText(/low-oil sabzi/)).toBeNull();
  });

  it("lists the day's suggestions once expanded", () => {
    mockUseSuggestions.mockReturnValue(hookValue());
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    fireEvent.press(screen.getByLabelText("Member suggestions"));
    // Pending one (with its resolve controls) + the already-accepted one both show.
    expect(screen.getByText(/low-oil sabzi/)).toBeOnTheScreen();
    expect(screen.getByText("Accept as option")).toBeOnTheScreen();
    expect(screen.getByText("Accepted as an option")).toBeOnTheScreen();
  });

  it("accepts a pending suggestion, forwarding the typed note", async () => {
    const accept = mutation();
    mockUseSuggestions.mockReturnValue(hookValue({ accept }));
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    fireEvent.press(screen.getByLabelText("Member suggestions"));

    fireEvent.changeText(
      screen.getByPlaceholderText(/Optional note/),
      "  Adding it next week  ",
    );
    fireEvent.press(screen.getByText("Accept as option"));
    await waitFor(() =>
      expect(accept.mutateAsync).toHaveBeenCalledWith({
        suggestionId: "suggestion-second",
        providerResponse: "Adding it next week",
      }),
    );
  });

  it("rejects a pending suggestion with no note (note omitted)", async () => {
    const reject = mutation();
    mockUseSuggestions.mockReturnValue(hookValue({ reject }));
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    fireEvent.press(screen.getByLabelText("Member suggestions"));

    fireEvent.press(screen.getByText("Reject"));
    await waitFor(() =>
      expect(reject.mutateAsync).toHaveBeenCalledWith({
        suggestionId: "suggestion-second",
        providerResponse: undefined,
      }),
    );
  });

  it("shows a resolved suggestion's note read-only (no resolve controls)", () => {
    mockUseSuggestions.mockReturnValue(
      hookValue({
        list: {
          data: [providerFixtures.acceptedSuggestion],
          isLoading: false,
          error: null,
        },
      }),
    );
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    fireEvent.press(screen.getByLabelText("Member suggestions"));
    expect(
      screen.getByText("Great idea — adding it next week."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Accept as option")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });

  it("shows an empty state when the day has no suggestions", () => {
    mockUseSuggestions.mockReturnValue(
      hookValue({ list: { data: [], isLoading: false, error: null } }),
    );
    render(<OwnerDaySuggestions menuDayId="day-1" />);
    fireEvent.press(screen.getByLabelText("Member suggestions"));
    expect(
      screen.getByText(/No suggestions for this day yet/),
    ).toBeOnTheScreen();
  });
});
