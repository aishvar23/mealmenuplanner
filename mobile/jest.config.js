// Jest harness for the Expo mobile app (MP-C-000, the Track-C analogue of the
// web Vitest/Playwright backbone — ADR-17 §3/§4). `jest-expo` provides the React
// Native transform, module mappers, and test environment for Expo SDK 56;
// `@testing-library/react-native` drives render/hook tests.
//
// `transformIgnorePatterns` mirrors jest-expo's own default (prefix matches like
// `expo` so `expo-modules-core` et al. transform) and adds `@mmp` (our shared
// provider contracts/fixtures, resolved under `node_modules/@mmp` as a workspace
// symlink) and `nativewind`, so our cross-package TS is transformed by Babel
// rather than skipped as node_modules and failing on TS/ESM syntax. Keep the
// other two preset entries (reanimated plugin / babel-preset) verbatim.
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|@mmp))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  // Test files live colocated next to the code under src/ (mirroring the web
  // app's `*.test.ts` convention).
  testMatch: ["<rootDir>/src/**/*.{test,spec}.{ts,tsx}"],
};
