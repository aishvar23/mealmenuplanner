import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api";

/**
 * Shared TanStack Query client (design/10 § 4): caching, background refetch, and
 * a read cache for graceful offline viewing.
 *
 * Retry policy mirrors the API contract — never retry a request the server has
 * authoritatively rejected (`4xx` domain errors); only transient failures
 * (network / `5xx`) are worth retrying.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
