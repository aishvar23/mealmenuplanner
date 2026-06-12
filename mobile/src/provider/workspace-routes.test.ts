import type { ProviderSummaryDto } from "@mmp/shared/provider";

import { providerWorkspaceRoute } from "./workspace-routes";

const summary = (
  over: Partial<ProviderSummaryDto> = {},
): ProviderSummaryDto => ({
  providerId: "prov-a",
  name: "Anna's Kitchen",
  role: "customer",
  membershipStatus: "active",
  timezone: "Asia/Kolkata",
  ...over,
});

describe("providerWorkspaceRoute", () => {
  it("routes an owner to the owner shell dashboard", () => {
    expect(providerWorkspaceRoute(summary({ role: "owner" }))).toBe(
      "/(provider-owner)/prov-a/dashboard",
    );
  });

  it("routes an approved customer to the member shell today", () => {
    expect(
      providerWorkspaceRoute(
        summary({ role: "customer", membershipStatus: "active" }),
      ),
    ).toBe("/(provider-member)/prov-a/today");
  });

  it("routes an awaiting customer to the holding screen", () => {
    expect(
      providerWorkspaceRoute(
        summary({ role: "customer", membershipStatus: "awaiting_approval" }),
      ),
    ).toBe("/(provider-member)/prov-a/awaiting-approval");
  });
});
