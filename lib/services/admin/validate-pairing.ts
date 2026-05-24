/**
 * Pairing create validation + inbound translation. Pure. Rules track
 * `dish_pairings` (design/01): `paired_dish_id` required, `pairing_type` enum,
 * and `no_self_pair` (paired ≠ primary). The `unique(primary, paired, type)` and
 * `no_self_pair` constraints stay the DB backstop (ConflictError / ValidationError).
 *
 * Pairings are immutable links (create + delete only, no partial update), so
 * there is just an insert builder. `primary_dish_id` comes from the path.
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { JsonObject } from "@/lib/http";

import { isEnumValue, isUuidValue } from "./field-validators";

const PAIRING_TYPES = Constants.public.Enums.pairing_type;

type PairingInsert = Database["public"]["Tables"]["dish_pairings"]["Insert"];

/**
 * Validate + translate an **add pairing** body. `pairedDishId` and `pairingType`
 * are required; `primaryDishId` (from the path) is passed in to reject a
 * self-pair up front (the `no_self_pair` CHECK is the DB backstop).
 */
export function buildPairingInsert(
  body: JsonObject,
  primaryDishId: string,
): Omit<PairingInsert, "primary_dish_id"> {
  const issues: ValidationIssue[] = [];

  let pairedDishId: string | undefined;
  if (!Object.hasOwn(body, "pairedDishId") || !isUuidValue(body.pairedDishId)) {
    issues.push({ field: "pairedDishId", rule: "required" });
  } else {
    pairedDishId = body.pairedDishId;
    if (pairedDishId === primaryDishId) {
      issues.push({ field: "pairedDishId", rule: "noSelfPair" });
    }
  }

  let pairingType: (typeof PAIRING_TYPES)[number] | undefined;
  if (isEnumValue(body.pairingType, PAIRING_TYPES)) {
    pairingType = body.pairingType;
  } else {
    issues.push({
      field: "pairingType",
      rule: "enum",
      allowed: PAIRING_TYPES,
    });
  }

  if (issues.length > 0) {
    throw new ValidationError(
      "One or more pairing fields are invalid.",
      issues,
    );
  }

  return {
    paired_dish_id: pairedDishId as string,
    pairing_type: pairingType as (typeof PAIRING_TYPES)[number],
  };
}
