// Re-export of the web app's recommendation engine (`lib/recommendation`).
//
// Per design/10 § 2 ("Risk control"): the engine is pure and deterministic (no
// `server-only`, no I/O), so it is safe to import on-device. We re-export it in
// place rather than physically moving it, so **no web imports change**. A
// physical move into this package is an optional later cleanup, not a blocker.
//
// The server-only loaders that translate DB rows into the engine's input types
// live in `lib/services/recommendation` and are NOT re-exported here — the app
// reaches that logic only over HTTP.
export * from "../../../lib/recommendation";
