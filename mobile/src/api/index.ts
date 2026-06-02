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

// Endpoint wrappers, grouped by domain.
export { listHouseholds, getHousehold } from "./households";
export * as mealPlanApi from "./meal-plan";
export * as groceryApi from "./grocery";
export * as onboardingApi from "./onboarding";
export type { OnboardingDraft, SaveDraftInput } from "./onboarding";

// Wire-format types (mirror the backend DTOs — see ./types).
export type * from "./types";
