// Shared wire-format types / DTO shapes for the `/api/*` contract.
//
// These are the framework-free pieces of the web app's HTTP boundary, re-exported
// so the mobile API client (`mobile/src/api/`) maps envelopes and error codes
// against exactly the same definitions the backend produces — no drift. All are
// pure (no `server-only`, no `next/*`).

// Success envelope for collection endpoints: `{ data, page }` (design/04 § 1).
export type { Collection, PageInfo } from "../../../lib/http/collection";

// Uniform error envelope `{ error: { code, message, details } }` and the stable,
// machine-readable error codes clients branch on (design/04 § 2).
export type { ErrorEnvelope } from "../../../lib/errors/boundary";
export {
  ERROR_CODES,
  type ErrorCode,
  type ValidationIssue,
  type ConflictDetails,
} from "../../../lib/errors/domain-errors";
