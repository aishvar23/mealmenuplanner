/**
 * The single error → response boundary.
 *
 * Every route handler / server action funnels thrown errors through here so the
 * wire format is defined exactly once (design/04 § 2). A `DomainError` maps to
 * its own code/status/details; anything else becomes a generic INTERNAL 500 with
 * the real cause logged server-side only (never leaked to the client).
 */

import {
  DomainError,
  ERROR_CODES,
  RateLimitedError,
  type ErrorCode,
} from "./domain-errors";

/** The one response shape for every non-2xx result. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Framework-agnostic mapping result: status + body + any extra headers. */
export interface MappedError {
  status: number;
  body: ErrorEnvelope;
  headers: Record<string, string>;
}

/**
 * Map any thrown value to `{ status, body, headers }`. Pure and framework-free,
 * so it's reusable by route handlers (→ Response) and server actions (→ result).
 */
export function toErrorEnvelope(error: unknown): MappedError {
  if (error instanceof DomainError) {
    const envelope: ErrorEnvelope["error"] = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      envelope.details = error.details;
    }

    const headers: Record<string, string> = {};
    if (
      error instanceof RateLimitedError &&
      error.retryAfterSeconds !== undefined
    ) {
      headers["Retry-After"] = String(error.retryAfterSeconds);
    }

    return { status: error.httpStatus, body: { error: envelope }, headers };
  }

  // Unexpected: log the full cause server-side, return a generic envelope.
  console.error("[error-boundary] Unhandled error:", error);
  return {
    status: 500,
    body: {
      error: {
        code: ERROR_CODES.INTERNAL,
        message: "An unexpected error occurred.",
      },
    },
    headers: {},
  };
}

/** Serialize an error to a JSON `Response` for a Next.js route handler. */
export function errorResponse(error: unknown): Response {
  const { status, body, headers } = toErrorEnvelope(error);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Wrap an async route handler so any thrown error becomes the standard envelope.
 * Keeps handlers thin: resolve session → guard → service → return; throwing a
 * typed `DomainError` anywhere inside is enough.
 *
 *   export const POST = withErrorBoundary(async (req) => { ... });
 */
export function withErrorBoundary<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
