import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { providerClient } from "./client";
import { useMenuManager } from "./use-menu-manager";

// The hook reads the week + catalog and writes create/publish through the
// `providerClient` seam; mock the seam so the test proves the wiring (which client
// methods are called) without a real network call.
jest.mock("./client", () => ({
  providerClient: {
    getWeeklyMenu: jest.fn(),
    listCatalog: jest.fn(),
    createMenuDay: jest.fn(),
    publishMenuDay: jest.fn(),
    reviseMenuDay: jest.fn(),
  },
}));

const mockGetWeeklyMenu = providerClient.getWeeklyMenu as jest.Mock;
const mockListCatalog = providerClient.listCatalog as jest.Mock;
const mockCreateMenuDay = providerClient.createMenuDay as jest.Mock;
const mockPublishMenuDay = providerClient.publishMenuDay as jest.Mock;
const mockReviseMenuDay = providerClient.reviseMenuDay as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWeeklyMenu.mockResolvedValue([providerFixtures.publishedMenuDay]);
  mockListCatalog.mockResolvedValue(providerFixtures.catalogItems);
  mockCreateMenuDay.mockResolvedValue(providerFixtures.publishedMenuDay);
  mockPublishMenuDay.mockResolvedValue(providerFixtures.publishedMenuDay);
  mockReviseMenuDay.mockResolvedValue(providerFixtures.publishedMenuDay);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let hook: ReturnType<typeof useMenuManager> | null = null;
function Sample({ providerId }: { providerId: string }) {
  const m = useMenuManager(providerId);
  hook = m;
  if (m.weeklyMenu.isLoading || m.catalog.isLoading)
    return <Text>Loading…</Text>;
  return (
    <View>
      <Text>days:{m.weeklyMenu.data?.length ?? 0}</Text>
      <Text>catalog:{m.catalog.data?.length ?? 0}</Text>
    </View>
  );
}

describe("useMenuManager", () => {
  beforeEach(() => {
    hook = null;
  });

  it("reads the week + catalog through the seam", async () => {
    render(<Sample providerId="prov-a" />, { wrapper });
    await waitFor(() => expect(screen.getByText("days:1")).toBeOnTheScreen());
    expect(screen.getByText(`catalog:${providerFixtures.catalogItems.length}`));
    expect(mockGetWeeklyMenu).toHaveBeenCalledWith("prov-a");
    expect(mockListCatalog).toHaveBeenCalledWith("prov-a");
  });

  it("authors a draft via createMenuDay and publishes via publishMenuDay", async () => {
    render(<Sample providerId="prov-a" />, { wrapper });
    await waitFor(() => expect(screen.getByText("days:1")).toBeOnTheScreen());

    const input = {
      menuDate: "2026-06-20",
      cutoffAt: "2026-06-20T12:00:00Z",
      note: null,
      components: [],
    };
    await act(async () => {
      await hook!.create.mutateAsync(input);
    });
    expect(mockCreateMenuDay).toHaveBeenCalledWith("prov-a", input);

    await act(async () => {
      await hook!.publish.mutateAsync("menu-day-1");
    });
    expect(mockPublishMenuDay).toHaveBeenCalledWith("menu-day-1");
  });

  it("structurally edits a day via reviseMenuDay", async () => {
    render(<Sample providerId="prov-a" />, { wrapper });
    await waitFor(() => expect(screen.getByText("days:1")).toBeOnTheScreen());

    const input = {
      cutoffAt: "2026-06-20T12:00:00Z",
      note: null,
      components: [],
    };
    await act(async () => {
      await hook!.revise.mutateAsync({ menuDayId: "menu-day-1", input });
    });
    expect(mockReviseMenuDay).toHaveBeenCalledWith("menu-day-1", input);
  });
});
