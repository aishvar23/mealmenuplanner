// `onboarding` service barrel (design/02 § Service modules). The draft read +
// autosave ship in P2-2; the completion transaction (P2-6) builds on the shared
// draft DTO mapper and the strict completion validator.
export * from "./dto";
export * from "./validate-draft";
export * from "./validate-completion";
export * from "./get-draft";
export * from "./save-draft";
export * from "./complete-draft";
export * from "./list-dish-catalog";
