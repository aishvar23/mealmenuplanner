import { describe, expect, it } from "vitest";

import { boundedCollection } from "@/lib/http";

describe("boundedCollection", () => {
  it("wraps the data with a closed page (no cursor, no more)", () => {
    const data = [{ id: "a" }, { id: "b" }];
    expect(boundedCollection(data)).toEqual({
      data,
      page: { nextCursor: null, hasMore: false },
    });
  });

  it("handles an empty set", () => {
    expect(boundedCollection([])).toEqual({
      data: [],
      page: { nextCursor: null, hasMore: false },
    });
  });

  it("preserves the array reference and order", () => {
    const data = [3, 1, 2];
    const collection = boundedCollection(data);
    expect(collection.data).toBe(data);
    expect(collection.data).toEqual([3, 1, 2]);
  });
});
