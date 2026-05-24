// `admin` service barrel (design/02 § Service modules; docs/06, Phase 3).
// Dish/ingredient/prep/pairing content management for the operator console,
// all gated by `requireAdmin()` and run on the service-role client.
export * from "./dto";
export * from "./quality-checklist";
export * from "./validate-dish";
export * from "./validate-ingredient";
export * from "./validate-dish-ingredient";
export * from "./validate-prep-task";
export * from "./validate-pairing";
export * from "./dishes";
export * from "./ingredients";
export * from "./dish-ingredients";
export * from "./prep-tasks";
export * from "./pairings";
