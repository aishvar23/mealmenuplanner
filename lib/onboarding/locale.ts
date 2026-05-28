/**
 * Onboarding location helpers (BUG-020) — a small, dependency-free lookup that
 * seeds the household-basics step's country `<select>` and city text from the
 * browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Pure and
 * runtime-agnostic so it is trivially unit-testable and shared by the step.
 *
 * Deliberately NOT a full ISO 3166 / IANA dataset — a curated set of common
 * countries and timezones keeps the bundle small. Anything unmapped falls back
 * gracefully (the city is still derived from the timezone id; the country is left
 * blank for the user to pick), so an unknown zone never crashes the step.
 */

/** One option in the country `<select>` — `code` is the persisted ISO value. */
export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. `"IN"` — what the draft stores. */
  code: string;
  name: string;
}

/** The resolved seed for the location fields, derived from a timezone. */
export interface ResolvedLocation {
  /** ISO country code; `""` when the timezone's country is unknown. */
  countryCode: string;
  /** Display country name; `""` when unknown. */
  countryName: string;
  /** City derived from the timezone id (e.g. `Asia/Kolkata` → `Kolkata`). */
  city: string;
}

/** Curated country list for the picker, sorted by display name. */
export const COUNTRIES: readonly Country[] = [
  { code: "AU", name: "Australia" },
  { code: "BD", name: "Bangladesh" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "EG", name: "Egypt" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "HK", name: "Hong Kong" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

const COUNTRY_NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** Whether `code` is one of the picker's known countries. */
export function isKnownCountryCode(code: string | undefined | null): boolean {
  return typeof code === "string" && COUNTRY_NAME_BY_CODE.has(code);
}

/**
 * IANA timezone → ISO country code (curated). The timezone id doesn't carry the
 * country, so this maps the common zones; the city is derived separately from the
 * id itself, so an unmapped zone still yields a city.
 */
const TIMEZONE_COUNTRY: Readonly<Record<string, string>> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "Asia/Kathmandu": "NP",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Jakarta": "ID",
  "Asia/Bangkok": "TH",
  "Asia/Manila": "PH",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Istanbul": "TR",
  "Europe/Istanbul": "TR",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Stockholm": "SE",
  "Europe/Zurich": "CH",
  "Europe/Moscow": "RU",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
};

/**
 * The city portion of an IANA timezone id: the last `/`-segment with underscores
 * turned into spaces (`America/New_York` → `New York`). Empty for a blank input.
 */
export function cityFromTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone) return "";
  const last = timeZone.split("/").pop() ?? "";
  return last.replace(/_/g, " ").trim();
}

/**
 * Resolve a browser timezone into a country/city seed for the step. Returns
 * `null` only for a blank/cityless timezone; otherwise the city is always
 * present and the country is filled when the zone is mapped (else left blank for
 * the user to choose — the graceful fallback).
 */
export function resolveLocationFromTimeZone(
  timeZone: string | undefined | null,
): ResolvedLocation | null {
  const city = cityFromTimeZone(timeZone);
  const countryCode = timeZone ? (TIMEZONE_COUNTRY[timeZone] ?? "") : "";
  if (!city && !countryCode) return null;
  return {
    countryCode,
    countryName: COUNTRY_NAME_BY_CODE.get(countryCode) ?? "",
    city,
  };
}
