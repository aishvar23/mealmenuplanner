import { describe, expect, it } from "vitest";

import { generateInviteToken, hashInviteToken } from "./token";

describe("generateInviteToken", () => {
  it("is URL-safe (base64url) and high-entropy", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes → ~43 base64url chars.
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("produces a fresh value each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe("hashInviteToken", () => {
  it("is a deterministic 64-char lowercase hex digest", () => {
    const hash = hashInviteToken("some-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken("some-token")).toBe(hash);
  });

  it("matches the known sha256 vector for 'hello'", () => {
    expect(hashInviteToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("differs for different inputs", () => {
    expect(hashInviteToken("a")).not.toBe(hashInviteToken("b"));
  });
});
