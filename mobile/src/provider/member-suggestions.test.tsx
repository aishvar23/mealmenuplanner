import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { MemberSuggestions } from "./member-suggestions";
import { useSuggestions } from "./use-suggestions";

// Presentational over the data hook; mock it so the test renders the form + list
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

describe("MemberSuggestions", () => {
  it("renders the member's own suggestions with their status", () => {
    mockUseSuggestions.mockReturnValue(hookValue());
    render(<MemberSuggestions menuDayId="day-1" />);
    // The accepted fixture's owner note + its "Accepted as an option" status show.
    expect(screen.getByText(/low-oil sabzi/)).toBeOnTheScreen();
    expect(screen.getByText("Accepted as an option")).toBeOnTheScreen();
  });

  it("disables send until there is text, then creates with the trimmed text", async () => {
    const create = mutation(() =>
      Promise.resolve(providerFixtures.pendingSuggestion),
    );
    mockUseSuggestions.mockReturnValue(hookValue({ create }));
    render(<MemberSuggestions menuDayId="day-1" />);

    // Empty → pressing does nothing (canSend false).
    fireEvent.press(screen.getByText("Send suggestion"));
    expect(create.mutateAsync).not.toHaveBeenCalled();

    fireEvent.changeText(
      screen.getByPlaceholderText(/millet roti/),
      "  More rice please  ",
    );
    fireEvent.press(screen.getByText("Send suggestion"));
    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith("More rice please"),
    );
    // A success message lands after the send resolves.
    await waitFor(() =>
      expect(screen.getByText(/Suggestion sent/)).toBeOnTheScreen(),
    );
  });

  it("surfaces a create error from the mutation", () => {
    mockUseSuggestions.mockReturnValue(
      hookValue({
        create: { ...mutation(), error: new Error("Too many suggestions") },
      }),
    );
    render(<MemberSuggestions menuDayId="day-1" />);
    expect(screen.getByText("Too many suggestions")).toBeOnTheScreen();
  });

  it("shows an empty state when the member has no suggestions", () => {
    mockUseSuggestions.mockReturnValue(
      hookValue({ list: { data: [], isLoading: false, error: null } }),
    );
    render(<MemberSuggestions menuDayId="day-1" />);
    expect(screen.getByText(/haven’t sent any suggestions/)).toBeOnTheScreen();
  });
});
