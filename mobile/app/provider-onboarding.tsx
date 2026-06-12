// Route shim for the provider owner onboarding wizard (MP-C-020). The screen lives
// in `@/provider/provider-onboarding-screen` so it sits under `src/` where the Jest
// harness collects tests; this file is just the expo-router entry.
export { default } from "@/provider/provider-onboarding-screen";
