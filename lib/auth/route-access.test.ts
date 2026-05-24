import { describe, expect, it } from "vitest";

import {
  buildSignInUrl,
  DEFAULT_POST_AUTH_PATH,
  isAdminPath,
  isAuthPath,
  isProtectedPath,
  isSafeRelativePath,
  PROTECTED_PREFIXES,
  resolvePostAuthRedirect,
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

describe("isAdminPath", () => {
  it("matches the console root and nested paths", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/dishes")).toBe(true);
    expect(isAdminPath("/admin/ingredients")).toBe(true);
  });

  it("respects the `/` boundary and ignores app routes", () => {
    expect(isAdminPath("/administrate")).toBe(false);
    expect(isAdminPath("/today")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
  });
});

describe("isSafeRelativePath", () => {
  it("accepts same-origin absolute paths", () => {
    for (const path of ["/today", "/plan", "/household/members?tab=invites"]) {
      expect(isSafeRelativePath(path)).toBe(true);
    }
  });

  it("rejects open-redirect targets", () => {
    for (const path of [
      "//evil.com",
      "https://evil.com",
      "http://evil.com/path",
      "plan",
      "",
    ]) {
      expect(isSafeRelativePath(path)).toBe(false);
    }
  });
});

describe("resolvePostAuthRedirect", () => {
  it("returns a safe requested path unchanged", () => {
    expect(resolvePostAuthRedirect("/plan")).toBe("/plan");
    expect(resolvePostAuthRedirect("/household/members?tab=invites")).toBe(
      "/household/members?tab=invites",
    );
  });

  it("falls back to the default for missing or unsafe targets", () => {
    for (const next of [
      null,
      undefined,
      "",
      "//evil.com",
      "https://evil.com",
    ]) {
      expect(resolvePostAuthRedirect(next)).toBe(DEFAULT_POST_AUTH_PATH);
    }
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
