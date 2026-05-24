import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";

describe("notification cursor", () => {
  it("round-trips a (createdAt, id) cursor", () => {
    const cursor = {
      createdAt: "2026-05-24T13:05:00.123Z",
      id: "11111111-1111-1111-1111-111111111111",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("produces an opaque (non-plaintext) token", () => {
    const token = encodeCursor({
      createdAt: "2026-05-24T00:00:00Z",
      id: "abc",
    });
    expect(token).not.toContain("2026");
    expect(token).not.toContain("|");
  });

  it("returns null for a malformed token", () => {
    expect(decodeCursor("not-a-cursor!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    // base64url of a string with no separator decodes but has no '|'.
    expect(
      decodeCursor(Buffer.from("noseparator").toString("base64url")),
    ).toBeNull();
  });
});
