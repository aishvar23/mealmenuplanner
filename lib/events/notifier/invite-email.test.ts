import { describe, expect, it } from "vitest";

import { renderInviteEmail } from "./invite-email";

const BASE = {
  toEmail: "guest@test.local",
  inviteLink: "https://app.test/invite/secret-token",
  householdName: "Suhane Household",
  inviterName: "Aishvarya",
  expiresAt: "2026-05-26T18:30:00Z",
};

describe("renderInviteEmail", () => {
  it("builds subject + html + text with the invite link", () => {
    const { subject, html, text } = renderInviteEmail(BASE);
    expect(subject).toBe(
      "You're invited to Suhane Household on Home Meal Planner",
    );
    expect(text).toContain("https://app.test/invite/secret-token");
    expect(html).toContain('href="https://app.test/invite/secret-token"');
    expect(text).toContain("expires on May 26");
    expect(html).toContain("May 26");
  });

  it("omits the expiry line when there is no expiry", () => {
    const { text, html } = renderInviteEmail({ ...BASE, expiresAt: null });
    expect(text).not.toContain("expires on");
    expect(html).not.toContain("expires on");
  });

  it("HTML-escapes names to prevent injection (design/09 § 6)", () => {
    const { html } = renderInviteEmail({
      ...BASE,
      householdName: '<script>alert("x")</script>',
      inviterName: "A & B",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<script>");
  });
});
