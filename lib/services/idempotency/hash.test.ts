import { describe, expect, it } from "vitest";

import { canonicalize, normalizeIdempotencyKey, requestHash } from "./hash";

describe("canonicalize", () => {
  it("sorts object keys so key order does not change the output", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("sorts nested object keys recursively", () => {
    const a = { outer: { y: 1, x: 2 }, list: [{ q: 1, p: 2 }] };
    const b = { list: [{ p: 2, q: 1 }], outer: { x: 2, y: 1 } };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("preserves array order (order is semantic)", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("drops undefined object fields (JSON semantics)", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});

describe("requestHash", () => {
  it("is stable for the same endpoint + logically-equal request", () => {
    expect(
      requestHash("today", { date: "2026-06-02", mealSlot: "dinner" }),
    ).toBe(requestHash("today", { mealSlot: "dinner", date: "2026-06-02" }));
  });

  it("differs when the request body differs", () => {
    expect(requestHash("today", { mealSlot: "dinner" })).not.toBe(
      requestHash("today", { mealSlot: "lunch" }),
    );
  });

  it("differs when the endpoint differs (same key on another endpoint is reuse)", () => {
    expect(requestHash("today", { x: 1 })).not.toBe(
      requestHash("week", { x: 1 }),
    );
  });
});

describe("normalizeIdempotencyKey", () => {
  it("returns null for missing / blank values", () => {
    expect(normalizeIdempotencyKey(null)).toBeNull();
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
    expect(normalizeIdempotencyKey("")).toBeNull();
    expect(normalizeIdempotencyKey("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeIdempotencyKey("  abc-123  ")).toBe("abc-123");
  });

  it("rejects an over-long key as absent", () => {
    expect(normalizeIdempotencyKey("x".repeat(256))).toBeNull();
    expect(normalizeIdempotencyKey("x".repeat(255))).toBe("x".repeat(255));
  });
});
