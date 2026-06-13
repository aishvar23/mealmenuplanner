import { describe, expect, it } from "vitest";

import { InternalError, UnauthenticatedError } from "@/lib/errors";

import { mapPgError } from "./rpc-error";

describe("mapPgError", () => {
  it("maps 28000 (no session) to a 401 UnauthenticatedError", () => {
    expect(() => mapPgError({ code: "28000" }, "fallback")).toThrow(
      UnauthenticatedError,
    );
  });

  it("maps any other code to a 500 InternalError carrying the fallback message", () => {
    try {
      mapPgError({ code: "XX000", message: "boom" }, "Something failed.");
      expect.unreachable("mapPgError must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InternalError);
      expect((error as InternalError).message).toBe("Something failed.");
      // The original PG error is preserved as the cause for server-side logging.
      expect((error as { cause?: unknown }).cause).toEqual({
        code: "XX000",
        message: "boom",
      });
    }
  });

  it("maps an error with no code to a 500 InternalError", () => {
    expect(() => mapPgError({}, "fallback")).toThrow(InternalError);
  });
});
