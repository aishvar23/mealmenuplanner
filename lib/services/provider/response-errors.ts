import { mapPgError, type RpcError } from "@/lib/db/rpc-error";
import { ConflictError, ValidationError } from "@/lib/errors";
import { PROVIDER_ERROR_REASONS } from "@/packages/shared/provider";

/**
 * Map the menu-derivation / customization-validation `PR*` SQLSTATEs that
 * `save_provider_response` and `provider_override_response` raise identically
 * (they share the §11.6 server-derivation), plus the transient-concurrency
 * aborts and the generic 500 tail. Callers handle their OWN lifecycle codes
 * (membership / lock / version / owner / reason) before delegating here for
 * this common derivation tail — so the §11.6 vocabulary lives in one place
 * instead of being copy-pasted across `mapSaveError` / `mapOverrideError`.
 *
 * `noun` tailors the duplicate/invalid wording ("response" vs "override");
 * `fallback` is the 500 message kept distinct per caller. Always throws.
 */
export function mapProviderDerivationError(
  error: RpcError,
  opts: { noun: string; fallback: string },
): never {
  switch (error.code) {
    case "PRALT":
      throw new ValidationError(
        "That selection isn't available on this menu.",
        [
          {
            field: "items",
            rule: PROVIDER_ERROR_REASONS.invalid_menu_alternative,
          },
        ],
      );
    case "PRCUS":
      throw new ValidationError("That customization isn't available.", [
        { field: "items", rule: PROVIDER_ERROR_REASONS.invalid_customization },
      ]);
    case "PRLIM":
      throw new ValidationError("That's more than this menu allows.", [
        {
          field: "items",
          rule: PROVIDER_ERROR_REASONS.customization_limit_exceeded,
        },
      ]);
    case "23505":
      // A duplicate component / option in the payload (unique constraint).
      throw new ValidationError(
        `Your ${opts.noun} has a duplicate selection.`,
        [{ field: "items", rule: "duplicate" }],
      );
    case "22P02":
      // A malformed enum / uuid that slipped past validation.
      throw new ValidationError(`Some ${opts.noun} details are invalid.`, [
        { field: "items", rule: "invalid" },
      ]);
    case "40P01": // deadlock_detected
    case "40001": // serialization_failure
      // A transient concurrency abort (the RPCs lock day→response in one order to
      // avoid the AB/BA deadlock, but map it defensively): a clean retryable 409,
      // never an opaque 500. The client can simply re-issue the request.
      throw new ConflictError(
        "A concurrent change interrupted your request. Please retry.",
        undefined,
        { cause: error },
      );
    default:
      // 28000 → 401, anything else → 500 (with the original kept as `cause`).
      mapPgError(error, opts.fallback);
  }
}
