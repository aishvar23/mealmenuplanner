import { Share } from "react-native";

import { shareProviderCsv } from "./share";

/**
 * `shareProviderCsv` (MP-C-051) — hands a rendered CSV to the native share sheet. The
 * mobile twin of the web print page: web prints, mobile shares. Verified against a
 * spied React Native `Share` so the unit runs in Node without a device.
 */
describe("shareProviderCsv", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shares the CSV content as the message with the title/subject", async () => {
    const spy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction });

    const done = await shareProviderCsv(
      "a,b,c\r\n",
      "Aggregate roster — 2026-06-11",
    );

    expect(done).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      { message: "a,b,c\r\n", title: "Aggregate roster — 2026-06-11" },
      { subject: "Aggregate roster — 2026-06-11" },
    );
  });

  it("returns false when the user dismisses the sheet", async () => {
    jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.dismissedAction });

    expect(await shareProviderCsv("x", "t")).toBe(false);
  });

  it("propagates a platform error to the caller", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("share failed"));

    await expect(shareProviderCsv("x", "t")).rejects.toThrow("share failed");
  });
});
