/**
 * Generic input validators shared across services. Pure, no I/O, no `next/*` —
 * trivially unit-testable and runtime-agnostic.
 */

// Canonical 36-char UUID (any version). Path-param ids that don't match can't
// name a real row, so callers typically translate a miss into `NotFoundError`
// (existence-hiding, design/04 § 2) rather than letting an invalid-uuid Postgres
// error surface as a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical UUID string. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
