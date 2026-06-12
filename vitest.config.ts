import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mirror the tsconfig "@/*" path alias so tests import the same way as app code.
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    // Pure-function / Node tests (lib/errors now, recommendation engine later).
    // Component tests can opt into a DOM environment per-file when needed.
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // `e2e/` holds Playwright specs (also `*.spec.ts`); they import from
    // `@playwright/test` and must NOT be collected by Vitest. `mobile/` holds the
    // Expo app's Jest + RNTL tests (run via `npm run test:mobile`); they use the
    // `jest` global and the jest-expo preset and must NOT be collected here.
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "mobile/**"],
  },
});
