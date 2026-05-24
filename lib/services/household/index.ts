// `household` service barrel (design/02 § Service modules). Household creation
// ships in P1-5; the household read in P1-6; the preferences update in P1-7; the
// member list in P1-8, all on the shared DTO mappers.
export * from "./create-household";
export * from "./get-household";
export * from "./update-preferences";
export * from "./validate-preferences";
export * from "./list-members";
export * from "./dto";
