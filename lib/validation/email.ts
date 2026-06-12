/**
 * The app's pragmatic email-shape bar — a single `@` with a non-empty local part
 * and a dotted domain. Deliberately lenient (no RFC 5322 parsing): it catches
 * obvious typos without rejecting valid-but-unusual addresses. Shared so every
 * caller (invites, provider summary recipients, …) validates email the same way
 * and the rule lives in exactly one place. Pure — no I/O, no `server-only`.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `value` matches the app's pragmatic email shape ({@link EMAIL_RE}). */
export function isEmailShape(value: string): boolean {
  return EMAIL_RE.test(value);
}
