/**
 * The caller's email-notification preferences for one household, as the API
 * exposes them (P9). `categories` always carries every settable category
 * (`SETTABLE_EMAIL_CATEGORIES`); a category the user hasn't enabled — including
 * one with no stored row — reads as `false`. Email is opt-in: a fresh user gets
 * an all-`false` map.
 */
export interface NotificationEmailPreferencesDto {
  householdId: string;
  categories: Record<string, boolean>;
}
