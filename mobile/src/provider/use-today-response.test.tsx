import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { providerClient } from "./client";
import { useTodayResponse } from "./use-today-response";

// The hook reads the menu + response through the `providerClient` seam; mock the
// seam so the test proves the query wiring (menu first, then the response gated on
// the resolved menu day) without a real network call.
jest.mock("./client", () => ({
  providerClient: {
    getTodayMenu: jest.fn(),
    getMyResponse: jest.fn(),
    saveMyResponse: jest.fn(),
    confirmResponse: jest.fn(),
    cancelResponse: jest.fn(),
  },
}));

const mockGetTodayMenu = providerClient.getTodayMenu as jest.Mock;
const mockGetMyResponse = providerClient.getMyResponse as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTodayMenu.mockResolvedValue(providerFixtures.publishedMenuDay);
  mockGetMyResponse.mockResolvedValue(providerFixtures.draftResponse);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Sample({ providerId }: { providerId: string }) {
  const { menu, response, isLoading } = useTodayResponse(providerId);
  if (isLoading) return <Text>Loading…</Text>;
  return (
    <View>
      <Text>menu:{menu?.menuDayId ?? "none"}</Text>
      <Text>status:{response?.status ?? "none"}</Text>
    </View>
  );
}

describe("useTodayResponse", () => {
  it("loads the today menu, then the caller's response gated on the menu day", async () => {
    render(<Sample providerId="prov-a" />, { wrapper });

    await waitFor(() =>
      expect(
        screen.getByText(`menu:${providerFixtures.publishedMenuDay.menuDayId}`),
      ).toBeOnTheScreen(),
    );
    await waitFor(() =>
      expect(screen.getByText("status:draft")).toBeOnTheScreen(),
    );
    expect(mockGetMyResponse).toHaveBeenCalledWith(
      providerFixtures.publishedMenuDay.menuDayId,
    );
  });

  it("does not fetch a response when no menu is published", async () => {
    mockGetTodayMenu.mockResolvedValue(null);
    render(<Sample providerId="prov-a" />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText("menu:none")).toBeOnTheScreen(),
    );
    expect(mockGetMyResponse).not.toHaveBeenCalled();
  });
});
