import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  DomainError,
  ERROR_CODES,
  errorResponse,
  ForbiddenError,
  InternalError,
  isDomainError,
  NotFoundError,
  RateLimitedError,
  toErrorEnvelope,
  UnauthenticatedError,
  ValidationError,
  withErrorBoundary,
} from "@/lib/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("domain errors", () => {
  it("each error carries the right code + http status and is a DomainError", () => {
    const cases: [DomainError, string, number][] = [
      [new ValidationError("bad"), ERROR_CODES.VALIDATION_ERROR, 400],
      [new UnauthenticatedError(), ERROR_CODES.UNAUTHENTICATED, 401],
      [new ForbiddenError(), ERROR_CODES.FORBIDDEN, 403],
      [new NotFoundError(), ERROR_CODES.NOT_FOUND, 404],
      [new ConflictError("dup"), ERROR_CODES.CONFLICT, 409],
      [new RateLimitedError(), ERROR_CODES.RATE_LIMITED, 429],
      [new InternalError(), ERROR_CODES.INTERNAL, 500],
    ];
    for (const [err, code, status] of cases) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
      expect(isDomainError(err)).toBe(true);
      expect(err.code).toBe(code);
      expect(err.httpStatus).toBe(status);
    }
  });

  it("keeps `cause` for server-side logging but never serializes it", () => {
    const cause = new Error("db connection refused");
    const err = new NotFoundError("missing", { cause });
    expect((err as { cause?: unknown }).cause).toBe(cause);
    expect(toErrorEnvelope(err).body.error).not.toHaveProperty("cause");
  });

  it("isDomainError is false for non-domain values", () => {
    expect(isDomainError(new Error("x"))).toBe(false);
    expect(isDomainError("nope")).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});

describe("toErrorEnvelope", () => {
  it("maps a ValidationError with field issues", () => {
    const issues = [{ field: "familySize", rule: "range", min: 1, max: 50 }];
    const { status, body, headers } = toErrorEnvelope(
      new ValidationError("familySize must be 1-50.", issues),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error.message).toBe("familySize must be 1-50.");
    expect(body.error.details).toEqual(issues);
    expect(headers).toEqual({});
  });

  it("omits `details` when the error has none", () => {
    const { body } = toErrorEnvelope(new ForbiddenError());
    expect(body.error).not.toHaveProperty("details");
  });

  it("maps CONFLICT details (violated-invariant reason)", () => {
    const { body } = toErrorEnvelope(
      new ConflictError("already accepted", { reason: "accepted" }),
    );
    expect(body.error.details).toEqual({ reason: "accepted" });
  });

  it("sets Retry-After for a RateLimitedError", () => {
    const { status, headers } = toErrorEnvelope(
      new RateLimitedError("slow down", 30),
    );
    expect(status).toBe(429);
    expect(headers["Retry-After"]).toBe("30");
  });

  it("maps an unknown error to a generic INTERNAL 500, logs it, and leaks nothing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = new Error("SELECT * FROM secret_table failed");
    const { status, body } = toErrorEnvelope(internal);
    expect(status).toBe(500);
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL);
    expect(body.error.message).toBe("An unexpected error occurred.");
    expect(JSON.stringify(body)).not.toContain("secret_table");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("errorResponse", () => {
  it("returns a JSON Response with the mapped status + body", async () => {
    const res = errorResponse(new NotFoundError("nope"));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "nope" },
    });
  });

  it("propagates the Retry-After header", () => {
    const res = errorResponse(new RateLimitedError("wait", 12));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
  });
});

describe("withErrorBoundary", () => {
  it("passes a successful response through untouched", async () => {
    const handler = withErrorBoundary(
      async () => new Response("ok", { status: 200 }),
    );
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("catches a thrown DomainError and maps it", async () => {
    const handler = withErrorBoundary(async () => {
      throw new ForbiddenError();
    });
    const res = await handler();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("catches an unexpected throw as INTERNAL 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorBoundary(async () => {
      throw new Error("boom");
    });
    const res = await handler();
    expect(res.status).toBe(500);
  });
});
