import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { ProviderUpdateInput } from "@/packages/shared/provider";

/**
 * Provider onboarding/settings input validation (MP-A-101, contract 03 § 8/§ 11).
 *
 * Pure — no I/O, no `server-only`, no Supabase — so it is trivially unit-testable
 * and reusable by both the create path (`createProviderDraft`) and the partial
 * settings update (`updateProvider`). The DB CHECK/NOT-NULL constraints remain the
 * authoritative backstop; this turns bad input into a clean `ValidationError` (400)
 * with field-scoped issues instead of a Postgres error mapped to a 500.
 */

/** Org name: trimmed, non-empty, bounded. Matches the `provider_org_name_not_blank` check. */
const NAME_MAX = 120;

/** A pragmatic email shape — the same "has an @ with text either side" bar the rest of the app uses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `HH:MM` or `HH:MM:SS` 24-hour local time, matching the `time` column. */
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * True for a valid IANA timezone id (e.g. `Asia/Kolkata`). Uses the runtime's own
 * tz database via `Intl.DateTimeFormat`, which throws `RangeError` for an unknown
 * zone — no bundled dataset to drift out of date. `UTC` is valid.
 */
export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || tz.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validate + normalize the provider name; throws `ValidationError` when blank/too long. */
export function validateProviderName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ValidationError("Provider name is required.", [
      { field: "name", rule: "required" },
    ]);
  }
  const trimmed = name.trim();
  if (trimmed.length > NAME_MAX) {
    throw new ValidationError(
      `Provider name must be at most ${NAME_MAX} characters.`,
      [{ field: "name", rule: "maxLength", max: NAME_MAX }],
    );
  }
  return trimmed;
}

/** The org columns a client may PATCH, normalized for the DB write (snake_case). */
export interface ProviderUpdatePatch {
  name?: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string;
  default_cutoff_local_time?: string | null;
  summary_email_recipients?: string[];
}

/** A nullable free-text field: trims, maps blank → null, bounds length. */
function optionalText(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  max = 200,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    issues.push({ field, rule: "type" });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    issues.push({ field, rule: "maxLength", max });
    return undefined;
  }
  return trimmed;
}

/**
 * Validate + normalize a partial provider settings update into the DB column
 * shape. Only the keys present on `input` are returned, so a PATCH touches just
 * those columns. Throws `ValidationError` aggregating every field issue.
 */
export function validateProviderUpdate(
  input: Partial<Record<keyof ProviderUpdateInput, unknown>>,
): ProviderUpdatePatch {
  const issues: ValidationIssue[] = [];
  const patch: ProviderUpdatePatch = {};

  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
      issues.push({ field: "name", rule: "required" });
    } else if (input.name.trim().length > NAME_MAX) {
      issues.push({ field: "name", rule: "maxLength", max: NAME_MAX });
    } else {
      patch.name = input.name.trim();
    }
  }

  const email = optionalText(input.email, "email", issues);
  if (email !== undefined) {
    if (email !== null && !EMAIL_RE.test(email)) {
      issues.push({ field: "email", rule: "email" });
    } else {
      patch.email = email;
    }
  }

  const phone = optionalText(input.phone, "phone", issues, 40);
  if (phone !== undefined) patch.phone = phone;
  const city = optionalText(input.city, "city", issues);
  if (city !== undefined) patch.city = city;
  const state = optionalText(input.state, "state", issues);
  if (state !== undefined) patch.state = state;
  const country = optionalText(input.country, "country", issues);
  if (country !== undefined) patch.country = country;

  if (input.timezone !== undefined) {
    if (
      typeof input.timezone !== "string" ||
      !isValidTimeZone(input.timezone)
    ) {
      issues.push({ field: "timezone", rule: "timezone" });
    } else {
      patch.timezone = input.timezone;
    }
  }

  if (input.defaultCutoffLocalTime !== undefined) {
    const cutoff = input.defaultCutoffLocalTime;
    if (cutoff === null) {
      patch.default_cutoff_local_time = null;
    } else if (typeof cutoff !== "string" || !LOCAL_TIME_RE.test(cutoff)) {
      issues.push({ field: "defaultCutoffLocalTime", rule: "time" });
    } else {
      patch.default_cutoff_local_time = cutoff;
    }
  }

  if (input.summaryEmailRecipients !== undefined) {
    const recipients = input.summaryEmailRecipients;
    if (!Array.isArray(recipients)) {
      issues.push({ field: "summaryEmailRecipients", rule: "array" });
    } else {
      const cleaned: string[] = [];
      let ok = true;
      for (const raw of recipients) {
        if (typeof raw !== "string" || !EMAIL_RE.test(raw.trim())) {
          issues.push({ field: "summaryEmailRecipients", rule: "email" });
          ok = false;
          break;
        }
        cleaned.push(raw.trim());
      }
      // De-dupe while preserving order; recipients is a set, not a list.
      if (ok) patch.summary_email_recipients = [...new Set(cleaned)];
    }
  }

  if (issues.length > 0) {
    throw new ValidationError("Some provider settings are invalid.", issues);
  }
  return patch;
}
