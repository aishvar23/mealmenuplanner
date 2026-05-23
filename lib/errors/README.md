# `lib/errors` — typed domain errors + response boundary

Services throw **typed domain errors**; a single boundary maps them to the one
HTTP error envelope. Status codes live here only — handlers never hand-roll them.
See design/04 § 2 and design/02 § Cross-cutting concerns.

## Envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "…",
    "details": [
      /* optional */
    ]
  }
}
```

`code` is stable and machine-readable (clients branch on it, never on `message`).
`message` is human-readable and safe for the UI. `details` is optional, code-specific.

## Errors → status

| Class                  | `code`             | HTTP | Notes                                        |
| ---------------------- | ------------------ | ---- | -------------------------------------------- |
| `ValidationError`      | `VALIDATION_ERROR` | 400  | `details`: `ValidationIssue[]`               |
| `UnauthenticatedError` | `UNAUTHENTICATED`  | 401  |                                              |
| `ForbiddenError`       | `FORBIDDEN`        | 403  | active-member / `can_*` failure              |
| `NotFoundError`        | `NOT_FOUND`        | 404  | absent **or** hidden by RLS (not disclosed)  |
| `ConflictError`        | `CONFLICT`         | 409  | `details`: `{ reason }` (violated invariant) |
| `RateLimitedError`     | `RATE_LIMITED`     | 429  | sets `Retry-After`                           |
| `InternalError`        | `INTERNAL`         | 500  | also the fallback for any non-domain error   |

## Usage

```ts
import { withErrorBoundary } from "@/lib/errors";

export const POST = withErrorBoundary(async (req) => {
  // resolve session → permission guard → service → Response
  // throwing any DomainError below is enough — the boundary serializes it.
});
```

A service throws, e.g. `throw new ForbiddenError()` or
`throw new ValidationError("familySize must be 1–50.", [{ field: "familySize", rule: "range", min: 1, max: 50 }])`.
Unexpected (non-`DomainError`) throws are logged server-side and returned as a
generic `INTERNAL` 500 — internals are never leaked. Use `toErrorEnvelope()`
directly from server actions that return a value instead of a `Response`.
