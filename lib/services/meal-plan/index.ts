// `mealPlan` service barrel (design/08, P5). Plan generation, the per-item
// actions (accept/reject/suggest-another/replace/eating-out/lock/cooked), and the
// read projections for the Today / Plan / History screens. The pure request
// validators and DTO mappers live alongside; the scoring engine is `lib/recommendation`.
export { requireHouseholdPermission } from "./access";
export * from "./validate";
export * from "./dto";
export * from "./generate";
export * from "./items";
export * from "./packaging";
export * from "./reads";
export * from "./suggest";
