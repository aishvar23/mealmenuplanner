import { describe, expect, it } from "vitest";

import {
  buildSignInUrl,
  isAuthPath,
  isProtectedPath,
  PROTECTED_PREFIXES,
} from "@/lib/auth/route-access";

describe("isProtectedPath", () => {
  it("matches each protected prefix exactly", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(isProtectedPath(prefix)).toBe(true);
    }
  });

  it("matches nested paths under a protected prefix", () => {
    expect(isProtectedPath("/household/members")).toBe(true);
    expect(isProtectedPath("/onboarding/step-2")).toBe(true);
    expect(isProtectedPath("/admin/dishes")).toBe(true);
  });

  it("does not match public routes", () => {
    for (const pathname of ["/", "/sign-in", "/auth/callback"]) {
      expect(isProtectedPath(pathname)).toBe(false);
    }
  });

  it("respects the `/` boundary (prefix is not a substring match)", () => {
    // `/plans` and `/householders` share a prefix with protected routes but are
    // distinct paths — they must not be gated.
    expect(isProtectedPath("/plans")).toBe(false);
    expect(isProtectedPath("/householders")).toBe(false);
  });
});

describe("isAuthPath", () => {
  it("is true only for the sign-in screen", () => {
    expect(isAuthPath("/sign-in")).toBe(true);
    expect(isAuthPath("/sign-in/extra")).toBe(false);
    expect(isAuthPath("/")).toBe(false);
  });
});

describe("buildSignInUrl", () => {
  const origin = "https://app.example.com";

  it("points at /sign-in on the same origin", () => {
    const url = buildSignInUrl(origin, "/plan");
    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe("/sign-in");
  });

  it("threads a same-origin absolute path through ?next=", () => {
    expect(buildSignInUrl(origin, "/plan").searchParams.get("next")).toBe(
      "/plan",
    );
    expect(
      buildSignInUrl(origin, "/household/members?tab=invites").searchParams.get(
        "next",
      ),
    ).toBe("/household/members?tab=invites");
  });

  it("drops open-redirect targets instead of threading them", () => {
    for (const malicious of [
      "//evil.com",
      "https://evil.com",
      "http://evil.com/path",
    ]) {
      expect(buildSignInUrl(origin, malicious).searchParams.has("next")).toBe(
        false,
      );
    }
  });
});
