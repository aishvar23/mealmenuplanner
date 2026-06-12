// Route shim for the meal-provider workspace entry (MP-C-010). The screen lives
// in `@/provider/providers-screen` so it sits under `src/` where the Jest harness
// collects tests (testMatch is `src/**`); this file is just the expo-router entry.
export { default } from "@/provider/providers-screen";
