// `recommendation` service barrel (design/05, P4). Server-only input loaders +
// the composing per-slot recommender; the pure scoring engine lives in
// `lib/recommendation`. The generate/Today endpoints (P5) build on `recommendForSlot`.
export * from "./validate";
export * from "./load-inputs";
export * from "./recommend";
