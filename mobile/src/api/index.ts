// Typed API client for the Next.js `/api/*` backend (design/10 § 4).
export { apiRequest, getCollection, type RequestOptions } from "./client";
export {
  ApiError,
  isApiError,
  toApiError,
  CLIENT_ERROR_CODES,
  type ClientErrorCode,
} from "./errors";
export { newIdempotencyKey } from "./idempotency";
