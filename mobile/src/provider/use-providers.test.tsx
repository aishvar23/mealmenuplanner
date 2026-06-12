import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { providerClient } from "./client";
import { useProviders } from "./use-providers";

// `useProviders` discovers providers through the `providerClient` seam. The seam
// now resolves to the live HTTP client (MP-C-010), so the hook test mocks the seam
// directly — it proves the hook wires query-key, fetch, and render regardless of
// which concrete client is plugged in, without a real network call. (The factory
// stays variable-free; the fixture return is set in beforeEach since jest hoists
// `jest.mock` above the imports.)
jest.mock("./client", () => ({
  providerClient: { listProviders: jest.fn() },
}));

const mockListProviders = providerClient.listProviders as jest.Mock;

beforeEach(() => {
  mockListProviders.mockResolvedValue(providerFixtures.multiProviderSummaries);
});

function wrapper({ children }: { children: ReactNode }) {
  // A no-retry client so the test fails fast rather than retrying on error;
  // `gcTime: Infinity` skips the cache-GC timer that would otherwise keep the
  // Jest worker alive past the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A minimal sample provider screen built on the shared discovery hook. */
function SampleProviderList() {
  const { data, isLoading } = useProviders();
  if (isLoading) return <Text>Loading…</Text>;
  return (
    <View>
      {data?.map((p) => (
        <Text key={p.providerId} accessibilityRole="text">
          {p.name}
        </Text>
      ))}
    </View>
  );
}

describe("useProviders (sample provider screen)", () => {
  it("renders the providers returned by the client seam", async () => {
    render(<SampleProviderList />, { wrapper });

    // Every provider name appears once the query resolves.
    for (const provider of providerFixtures.multiProviderSummaries) {
      await waitFor(() =>
        expect(screen.getByText(provider.name)).toBeOnTheScreen(),
      );
    }
  });
});
