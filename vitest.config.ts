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
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
