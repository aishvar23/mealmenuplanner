// `household` service barrel (design/02 § Service modules). Household creation
// ships in P1-5; the household read lands in P1-6; the member list (P1-8) and
// preferences update (P1-7) follow on the shared DTO mappers.
export * from "./create-household";
export * from "./get-household";
export * from "./dto";
