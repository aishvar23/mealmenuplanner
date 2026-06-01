// `household` service barrel (design/02 § Service modules). Household creation
// ships in P1-5; the household read in P1-6; the preferences update in P1-7; the
// member list in P1-8, all on the shared DTO mappers.
export * from "./create-household";
export * from "./get-household";
export * from "./update-preferences";
export * from "./validate-preferences";
export * from "./food-preferences";
export * from "./dish-preferences";
export * from "./list-members";
export * from "./current-household";
// Household switcher (BETA): set active / preferred household.
export * from "./switch";
// Owner-only household deletion (BETA).
export * from "./delete-household";
// Member management (P6-5/6/7/8): update role/permissions (+ ownership transfer),
// remove, leave. Pure request validation + shared member-row helpers alongside.
export * from "./validate-member";
export * from "./member-lookup";
export * from "./update-member";
export * from "./remove-member";
export * from "./leave-household";
export * from "./dto";
