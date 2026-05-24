import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { buildPairingInsert } from "@/lib/services/admin/validate-pairing";

const PRIMARY = "11111111-1111-1111-1111-111111111111";
const PAIRED = "22222222-2222-2222-2222-222222222222";

describe("buildPairingInsert", () => {
  it("translates a valid body", () => {
    expect(
      buildPairingInsert(
        { pairedDishId: PAIRED, pairingType: "rice_pairing" },
        PRIMARY,
      ),
    ).toEqual({ paired_dish_id: PAIRED, pairing_type: "rice_pairing" });
  });

  it("requires pairedDishId and pairingType", () => {
    expect(() => buildPairingInsert({}, PRIMARY)).toThrow(ValidationError);
    expect(() => buildPairingInsert({ pairedDishId: PAIRED }, PRIMARY)).toThrow(
      ValidationError,
    );
  });

  it("rejects an unknown pairingType enum value", () => {
    expect(() =>
      buildPairingInsert(
        { pairedDishId: PAIRED, pairingType: "dessert_pairing" },
        PRIMARY,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects a self-pair up front", () => {
    expect(() =>
      buildPairingInsert(
        { pairedDishId: PRIMARY, pairingType: "main_side" },
        PRIMARY,
      ),
    ).toThrow(ValidationError);
  });
});
