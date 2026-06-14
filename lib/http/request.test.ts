import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { readJsonObject, readOptionalJsonObject } from "@/lib/http";

/** Build a Request with the given raw body + JSON content type. */
function jsonRequest(rawBody: string): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("readJsonObject", () => {
  it("returns the parsed object for a valid JSON body", async () => {
    const body = await readJsonObject(jsonRequest('{"name":"Suhane"}'));
    expect(body).toEqual({ name: "Suhane" });
  });

  it("throws ValidationError for malformed JSON", async () => {
    await expect(
      readJsonObject(jsonRequest("{not json")),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for an empty body", async () => {
    await expect(readJsonObject(jsonRequest(""))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws ValidationError for a JSON array", async () => {
    await expect(readJsonObject(jsonRequest("[1,2,3]"))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws ValidationError for a JSON scalar or null", async () => {
    for (const raw of ['"hello"', "42", "null"]) {
      await expect(readJsonObject(jsonRequest(raw))).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
  });
});

describe("readOptionalJsonObject", () => {
  it("returns the parsed object when a valid JSON body is present", async () => {
    const body = await readOptionalJsonObject(
      jsonRequest('{"providerResponse":"yes"}'),
    );
    expect(body).toEqual({ providerResponse: "yes" });
  });

  it("returns {} for an absent / empty body (optional)", async () => {
    expect(await readOptionalJsonObject(jsonRequest(""))).toEqual({});
    expect(await readOptionalJsonObject(jsonRequest("   "))).toEqual({});
  });

  it("still throws ValidationError for present-but-malformed JSON", async () => {
    await expect(
      readOptionalJsonObject(jsonRequest("{not json")),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("still throws ValidationError for a non-object body", async () => {
    await expect(
      readOptionalJsonObject(jsonRequest("[1,2,3]")),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
