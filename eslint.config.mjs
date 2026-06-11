import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off ESLint rules that conflict with Prettier formatting.
  // Keep this last so it overrides the rules above.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The mobile (Expo / React Native) workspace has its own toolchain and lints
    // via `expo lint`; the Next.js ruleset here does not apply to it.
    "mobile/**",
    // Playwright's generated artifacts (HTML report bundle, per-run traces, and
    // captured auth state). They're git-ignored; ignore them for lint too so the
    // local gate stays clean after an e2e run.
    "playwright-report/**",
    "test-results/**",
    "e2e/.auth/**",
  ]),
]);

export default eslintConfig;
