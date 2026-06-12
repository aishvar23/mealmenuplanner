// Jest setup, run after the test framework is installed (MP-C-000).
//
// `@testing-library/react-native` auto-extends `expect` with its native matchers
// (toBeOnTheScreen, toHaveTextContent, …) on import, so no manual
// `extend-expect` is needed. This file is the seam for any future global test
// configuration (fake timers for cutoff-countdown tests, native-module mocks);
// it is intentionally minimal for the harness baseline.

import "@testing-library/react-native";
