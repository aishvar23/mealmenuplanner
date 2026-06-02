// Re-export of the web app's pure input validators (`lib/validation`).
//
// These are runtime-agnostic (no I/O, no `next/*`, no `server-only`) — e.g.
// `isUuid` — so the mobile client can validate identifiers before issuing a
// request, sharing exactly one implementation with the backend.
export * from "../../../lib/validation";
