/**
 * Small, reusable field predicates for the admin content validators. Pure and
 * I/O-free (no `server-only`, no Supabase) so every validator and its tests can
 * use them. Mirrors the inline helpers proven in `household/validate-preferences`,
 * factored out because five content validators share them.
 */

import { isUuid } from "@/lib/validation";

export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function isEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return (
    typeof value === "string" && (allowed as readonly string[]).includes(value)
  );
}

export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

/** A reasonable upper bound for free-text content fields (defense in depth). */
export const MAX_TEXT_LENGTH = 2000;

export function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}
