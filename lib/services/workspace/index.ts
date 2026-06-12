// `workspace` service barrel (ADR-1). The workspace resolver (MP-A-100) enumerates
// every workspace the caller can enter — household + provider — for post-login
// routing (MP-B-010) and the switcher, plus the `GET /api/providers` summaries.
export * from "./resolve";
