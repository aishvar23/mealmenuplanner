// Route shim for the cross-type workspace switcher (MP-C-012). The screen lives
// in `@/provider/workspace-switcher` so it sits under `src/` where the Jest
// harness collects tests (testMatch is `src/**`); this file is the expo-router
// entry, reached from the More tab and a provider shell's header.
export { WorkspaceSwitcher as default } from "@/provider/workspace-switcher";
