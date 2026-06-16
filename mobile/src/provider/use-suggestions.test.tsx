import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { providerClient } from "./client";
import { useSuggestions } from "./use-suggestions";

// The hook reads/writes suggestions through the `providerClient` seam; mock the seam
// so the test proves the query + mutation wiring (list, create, accept, reject, and
// the `enabled` gate) without a real network call.
jest.mock("./client", () => ({
  providerClient: {
    listSuggestions: jest.fn(),
    createSuggestion: jest.fn(),
    acceptSuggestionAsOption: jest.fn(),
    rejectSuggestion: jest.fn(),
  },
}));

const mockList = providerClient.listSuggestions as jest.Mock;
const mockCreate = providerClient.createSuggestion as jest.Mock;
const mockAccept = providerClient.acceptSuggestionAsOption as jest.Mock;
const mockReject = providerClient.rejectSuggestion as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue(providerFixtures.suggestionList);
  mockCreate.mockResolvedValue(providerFixtures.pendingSuggestion);
  mockAccept.mockResolvedValue(providerFixtures.acceptedSuggestion);
  mockReject.mockResolvedValue(providerFixtures.rejectedSuggestion);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Sample({
  menuDayId,
  enabled,
  onReady,
}: {
  menuDayId: string;
  enabled?: boolean;
  onReady?: (api: ReturnType<typeof useSuggestions>) => void;
}) {
  const api = useSuggestions(menuDayId, enabled);
  onReady?.(api);
  return (
    <View>
      <Text>count:{api.list.data?.length ?? -1}</Text>
    </View>
  );
}

describe("useSuggestions", () => {
  it("loads the day's suggestions via the client seam", async () => {
    render(<Sample menuDayId="day-1" />, { wrapper });
    await waitFor(() =>
      expect(
        screen.getByText(`count:${providerFixtures.suggestionList.length}`),
      ).toBeOnTheScreen(),
    );
    expect(mockList).toHaveBeenCalledWith("day-1");
  });

  it("does not read when disabled (the owner's collapsed panel)", async () => {
    render(<Sample menuDayId="day-1" enabled={false} />, { wrapper });
    // -1 = the query never resolved (data is undefined) because it's gated off.
    await waitFor(() => expect(screen.getByText("count:-1")).toBeOnTheScreen());
    expect(mockList).not.toHaveBeenCalled();
  });

  it("creates a suggestion with the day id + trimmed text", async () => {
    let api: ReturnType<typeof useSuggestions> | undefined;
    render(
      <Sample
        menuDayId="day-1"
        onReady={(a) => {
          api = a;
        }}
      />,
      { wrapper },
    );
    await waitFor(() => expect(api).toBeDefined());
    await api!.create.mutateAsync("More rice please");
    expect(mockCreate).toHaveBeenCalledWith("day-1", {
      suggestionText: "More rice please",
    });
  });

  it("accepts/rejects a suggestion, forwarding the optional note (omitted when empty)", async () => {
    let api: ReturnType<typeof useSuggestions> | undefined;
    render(
      <Sample
        menuDayId="day-1"
        onReady={(a) => {
          api = a;
        }}
      />,
      { wrapper },
    );
    await waitFor(() => expect(api).toBeDefined());

    await api!.accept.mutateAsync({
      suggestionId: "s1",
      providerResponse: "Adding it",
    });
    expect(mockAccept).toHaveBeenCalledWith("s1", {
      providerResponse: "Adding it",
    });

    await api!.reject.mutateAsync({ suggestionId: "s2" });
    // No note → the body is omitted entirely (undefined), not sent as empty.
    expect(mockReject).toHaveBeenCalledWith("s2", undefined);
  });
});
