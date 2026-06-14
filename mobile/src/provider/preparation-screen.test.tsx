import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { PreparationScreen } from "./preparation-screen";
import { useBatch, useBatchActions, useBatchList } from "./use-preparation";

// The screen is presentational over its data hooks; mock them so the test renders the
// list + roster without a network or a QueryClient. Mobile UI E2E is deferred
// (ADR-17/Q-8) — this is the unit/hook bar (MP-C-050).
jest.mock("./use-preparation", () => ({
  useBatchList: jest.fn(),
  useBatch: jest.fn(),
  useBatchActions: jest.fn(),
}));

const mockUseBatchList = jest.mocked(useBatchList);
const mockUseBatch = jest.mocked(useBatch);
const mockUseBatchActions = jest.mocked(useBatchActions);

function mutation(impl?: (arg: never) => Promise<unknown>) {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(impl ?? (() => Promise.resolve(undefined))),
    reset: jest.fn(),
    isPending: false,
    error: null,
  };
}

beforeEach(() => {
  mockUseBatchList.mockReset();
  mockUseBatch.mockReset();
  mockUseBatchActions.mockReset();
  mockUseBatchActions.mockReturnValue({
    resendEmail: mutation(),
    regenerate: mutation(),
  } as unknown as ReturnType<typeof useBatchActions>);
  mockUseBatch.mockReturnValue({
    data: providerFixtures.currentBatch,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useBatch>);
});

function listValue(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useBatchList> {
  return {
    data: providerFixtures.batchSummaries,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useBatchList>;
}

describe("PreparationScreen", () => {
  it("shows a spinner while the index is loading", () => {
    mockUseBatchList.mockReturnValue(
      listValue({ isLoading: true, data: undefined }),
    );
    render(<PreparationScreen providerId="p1" />);
    expect(screen.queryByText("Preparation")).toBeNull();
  });

  it("shows the empty state when there are no batches", () => {
    mockUseBatchList.mockReturnValue(listValue({ data: [] }));
    render(<PreparationScreen providerId="p1" />);
    expect(screen.getByText("No preparation batches yet")).toBeOnTheScreen();
  });

  it("lists the batches with their census summary", () => {
    mockUseBatchList.mockReturnValue(listValue());
    render(<PreparationScreen providerId="p1" />);
    const summary = providerFixtures.batchSummaries[0]!;
    expect(screen.getByText(summary.menuDate)).toBeOnTheScreen();
    expect(screen.getByText(/confirmed/)).toBeOnTheScreen();
  });

  it("opens a batch's roster when a row is pressed", () => {
    mockUseBatchList.mockReturnValue(listValue());
    render(<PreparationScreen providerId="p1" />);

    fireEvent.press(
      screen.getByText(providerFixtures.batchSummaries[0]!.menuDate),
    );

    expect(
      screen.getByText(
        `Preparation — ${providerFixtures.currentBatch.menuDate}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("Aggregate roster")).toBeOnTheScreen();
    expect(screen.getByText("Per-member breakdown")).toBeOnTheScreen();
  });

  it("resends the summary email from the detail view", async () => {
    const resendEmail = mutation(() =>
      Promise.resolve({ emailStatus: "sent", recipientCount: 2 }),
    );
    mockUseBatchActions.mockReturnValue({
      resendEmail,
      regenerate: mutation(),
    } as unknown as ReturnType<typeof useBatchActions>);
    mockUseBatchList.mockReturnValue(listValue());

    render(<PreparationScreen providerId="p1" />);
    fireEvent.press(
      screen.getByText(providerFixtures.batchSummaries[0]!.menuDate),
    );
    fireEvent.press(screen.getByText("Resend summary email"));

    await waitFor(() =>
      expect(resendEmail.mutateAsync).toHaveBeenCalledWith(
        providerFixtures.currentBatch.batchId,
      ),
    );
    expect(
      await screen.findByText(/Summary email sent to 2 recipients\./),
    ).toBeOnTheScreen();
  });

  it("regenerates the batch from the detail view", () => {
    const regenerate = mutation();
    mockUseBatchActions.mockReturnValue({
      resendEmail: mutation(),
      regenerate,
    } as unknown as ReturnType<typeof useBatchActions>);
    mockUseBatchList.mockReturnValue(listValue());

    render(<PreparationScreen providerId="p1" />);
    fireEvent.press(
      screen.getByText(providerFixtures.batchSummaries[0]!.menuDate),
    );
    fireEvent.press(screen.getByText("Regenerate"));

    expect(regenerate.mutate).toHaveBeenCalledWith(
      providerFixtures.currentBatch.batchId,
    );
  });
});
