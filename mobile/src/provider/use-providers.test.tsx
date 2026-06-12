import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { providerFixtures } from "@mmp/shared/provider";

import { useProviders } from "./use-providers";

// The MP-C-000 harness smoke test: a sample provider screen, fed only by the
// fixture-backed mock client through `useProviders`, renders the provider list
// before any `/api/*` route exists. Green proves the whole Track-C foundation
// works end-to-end — jest-expo transform, RNTL render, react-query, the shared
// `ProviderApiClient` seam, and the `@mmp/shared/provider` fixtures.

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
  it("renders the fixture providers from the mock client", async () => {
    render(<SampleProviderList />, { wrapper });

    // Every fixture provider name appears once the query resolves.
    for (const provider of providerFixtures.multiProviderSummaries) {
      await waitFor(() =>
        expect(screen.getByText(provider.name)).toBeOnTheScreen(),
      );
    }
  });
});
