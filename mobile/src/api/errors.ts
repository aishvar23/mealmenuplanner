import { ERROR_CODES, type ErrorCode } from "@mmp/shared/types";

/**
 * Client-side error codes: the backend's uniform `error.code` set (design/04
 * § 2, mirrored from `lib/errors`) plus two transport-only codes the server
 * never sends.
 */
export const CLIENT_ERROR_CODES = {
  ...ERROR_CODES,
  /** `fetch` threw — offline, DNS, TLS, timeout. */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** Non-2xx without a parseable error envelope. */
  UNKNOWN: "UNKNOWN",
} as const;

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "UNKNOWN";

/**
 * A typed API failure. `code` is the stable discriminator the UI branches on;
 * `message` is safe to surface to the user (the backend guarantees this).
 */
export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ClientErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const STATUS_FALLBACK: Record<number, ClientErrorCode> = {
  400: CLIENT_ERROR_CODES.VALIDATION_ERROR,
  401: CLIENT_ERROR_CODES.UNAUTHENTICATED,
  403: CLIENT_ERROR_CODES.FORBIDDEN,
  404: CLIENT_ERROR_CODES.NOT_FOUND,
  409: CLIENT_ERROR_CODES.CONFLICT,
  429: CLIENT_ERROR_CODES.RATE_LIMITED,
};

/** Map a non-2xx `Response` to a typed `ApiError`, reading the error envelope. */
export async function toApiError(response: Response): Promise<ApiError> {
  let code: ClientErrorCode =
    STATUS_FALLBACK[response.status] ?? CLIENT_ERROR_CODES.UNKNOWN;
  let message = `Request failed (${response.status}).`;
  let details: unknown;

  try {
    const body = (await response.json()) as {
      error?: { code?: ClientErrorCode; message?: string; details?: unknown };
    };
    if (body?.error) {
      if (body.error.code) code = body.error.code;
      if (body.error.message) message = body.error.message;
      details = body.error.details;
    }
  } catch {
    // Non-JSON body — keep the status-derived fallback.
  }

  return new ApiError(code, message, response.status, details);
}
