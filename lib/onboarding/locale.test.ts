import { describe, expect, it } from "vitest";

import {
  cityFromTimeZone,
  COUNTRIES,
  isKnownCountryCode,
  resolveLocationFromTimeZone,
} from "./locale";

describe("cityFromTimeZone", () => {
  it("takes the last segment and unslugs underscores", () => {
    expect(cityFromTimeZone("Asia/Kolkata")).toBe("Kolkata");
    expect(cityFromTimeZone("America/New_York")).toBe("New York");
    expect(cityFromTimeZone("America/Argentina/Buenos_Aires")).toBe(
      "Buenos Aires",
    );
  });

  it("returns empty for a blank input", () => {
    expect(cityFromTimeZone(undefined)).toBe("");
    expect(cityFromTimeZone("")).toBe("");
  });
});

describe("resolveLocationFromTimeZone (ONB-013)", () => {
  it("resolves a representative timezone to its country + city", () => {
    expect(resolveLocationFromTimeZone("Asia/Kolkata")).toEqual({
      countryCode: "IN",
      countryName: "India",
      city: "Kolkata",
    });
    expect(resolveLocationFromTimeZone("America/Los_Angeles")).toEqual({
      countryCode: "US",
      countryName: "United States",
      city: "Los Angeles",
    });
  });

  it("falls back gracefully for an unmapped zone — city only, no country", () => {
    expect(resolveLocationFromTimeZone("Mars/Olympus_Mons")).toEqual({
      countryCode: "",
      countryName: "",
      city: "Olympus Mons",
    });
  });

  it("returns null for a blank/cityless timezone (no crash)", () => {
    expect(resolveLocationFromTimeZone(undefined)).toBeNull();
    expect(resolveLocationFromTimeZone("")).toBeNull();
  });
});

describe("country list", () => {
  it("recognizes a known ISO code and rejects an unknown one", () => {
    expect(isKnownCountryCode("IN")).toBe(true);
    expect(isKnownCountryCode("ZZ")).toBe(false);
    expect(isKnownCountryCode(undefined)).toBe(false);
  });

  it("every timezone-resolved country code is offered in the picker", () => {
    for (const tz of ["Asia/Kolkata", "Europe/London", "Australia/Sydney"]) {
      const code = resolveLocationFromTimeZone(tz)?.countryCode ?? "";
      expect(COUNTRIES.some((c) => c.code === code)).toBe(true);
    }
  });
});
