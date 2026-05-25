// Recommendation engine barrel (design/05) — the pure, deterministic, rule-based
// scoring pipeline (P4). No `server-only`, no I/O: the server-only loaders in
// `lib/services/recommendation` translate DB rows into these types and invoke
// `recommendSlot`.
export * from "./config";
export * from "./types";
export * from "./text-match";
export * from "./mealtimes";
export * from "./diet";
export * from "./allergens";
export * from "./prep";
export * from "./hard-filters";
export * from "./scoring";
export * from "./explanation";
export * from "./packaging";
export * from "./engine";
