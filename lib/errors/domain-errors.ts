/**
 * Typed domain errors.
 *
 * Services throw these; a single boundary (./boundary.ts) maps them to the HTTP
 * error envelope + status code. This is the one place error semantics live, so
 * route handlers and server actions never hand-roll status codes. See
 * design/04 § 2 (standard error model) and design/02 § Cross-cutting concerns.
 *
 * `message` is human-readable and SAFE to surface in the UI — never put stack
 * traces, SQL, or internal IDs in it. `details` is optional, code-specific
 * structured context (also client-safe).
 */

/** Stable, machine-readable error codes. Clients branch on these, not messages. */
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** One field-level issue for VALIDATION_ERROR; `rule` names the failed check. */
export interface ValidationIssue {
  field: string;
  rule: string;
  message?: string;
  /** Rule-specific extras, e.g. `min`/`max` for a range check. */
  [key: string]: unknown;
}

/** Details for CONFLICT — names the violated invariant (e.g. `reason`). */
export interface ConflictDetails {
  reason?: string;
  [key: string]: unknown;
}

interface ErrorCause {
  /** The originating error, kept server-side for logging (never serialized). */
  cause?: unknown;
}

/**
 * Base class for all expected, intentional domain failures. `instanceof
 * DomainError` at the boundary distinguishes these from unexpected errors
 * (which become a generic INTERNAL 500).
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;
  /** Optional, code-specific structured detail (client-safe). */
  readonly details?: unknown;

  protected constructor(
    message: string,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    // Keep `instanceof` correct even if this is ever down-leveled past ES2015.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — malformed body, bad enum value, or a failed validation check. */
export class ValidationError extends DomainError {
  readonly code = ERROR_CODES.VALIDATION_ERROR;
  readonly httpStatus = 400;
  declare readonly details?: ValidationIssue[];

  constructor(
    message: string,
    issues?: ValidationIssue[],
    options?: ErrorCause,
  ) {
    super(message, { details: issues, cause: options?.cause });
  }
}

/** 401 — no, expired, or invalid session. */
export class UnauthenticatedError extends DomainError {
  readonly code = ERROR_CODES.UNAUTHENTICATED;
  readonly httpStatus = 401;

  constructor(message = "Authentication required.", options?: ErrorCause) {
    super(message, { cause: options?.cause });
  }
}

/** 403 — authenticated, but lacks the required `can_*` flag / active membership. */
export class ForbiddenError extends DomainError {
  readonly code = ERROR_CODES.FORBIDDEN;
  readonly httpStatus = 403;

  constructor(
    message = "You don't have permission to perform this action.",
    options?: ErrorCause,
  ) {
    super(message, { cause: options?.cause });
  }
}

/**
 * 404 — resource absent OR hidden by RLS. We do not distinguish the two, to
 * avoid leaking cross-household existence (design/04 § 2).
 */
export class NotFoundError extends DomainError {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly httpStatus = 404;

  constructor(message = "Resource not found.", options?: ErrorCause) {
    super(message, { cause: options?.cause });
  }
}

/** 409 — a violated invariant (duplicate membership, draft exists, etc.). */
export class ConflictError extends DomainError {
  readonly code = ERROR_CODES.CONFLICT;
  readonly httpStatus = 409;
  declare readonly details?: ConflictDetails;

  constructor(
    message: string,
    details?: ConflictDetails,
    options?: ErrorCause,
  ) {
    super(message, { details, cause: options?.cause });
  }
}

/** 429 — too many requests. Carries the `Retry-After` value (seconds). */
export class RateLimitedError extends DomainError {
  readonly code = ERROR_CODES.RATE_LIMITED;
  readonly httpStatus = 429;
  readonly retryAfterSeconds?: number;

  constructor(
    message = "Too many requests. Please try again later.",
    retryAfterSeconds?: number,
    options?: ErrorCause,
  ) {
    super(message, { cause: options?.cause });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 500 — unexpected / unhandled. The boundary also maps any non-DomainError to
 * this with a generic message; full context is logged server-side only.
 */
export class InternalError extends DomainError {
  readonly code = ERROR_CODES.INTERNAL;
  readonly httpStatus = 500;

  constructor(message = "An unexpected error occurred.", options?: ErrorCause) {
    super(message, { cause: options?.cause });
  }
}

/** Type guard: an intentional domain failure vs. an unexpected error. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
