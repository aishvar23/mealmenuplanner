import { describe, expect, it } from "vitest";

import { renderEventEmail } from "./event-email";

const BASE = {
  toEmail: "member@example.com",
  title: "Dinner changed",
  message: "Riya changed tonight's dinner to Rajma Chawal.",
  appBaseUrl: "https://app.example.com",
};

describe("renderEventEmail", () => {
  it("uses the title as the subject and includes the message + notifications link", () => {
    const { subject, html, text } = renderEventEmail(BASE);
    expect(subject).toBe("Dinner changed");
    expect(text).toContain("Riya changed tonight's dinner to Rajma Chawal.");
    expect(text).toContain("https://app.example.com/notifications");
    expect(html).toContain("https://app.example.com/notifications");
  });

  it("strips a trailing slash from the base URL", () => {
    const { text } = renderEventEmail({
      ...BASE,
      appBaseUrl: "https://app.example.com/",
    });
    expect(text).toContain("https://app.example.com/notifications");
    expect(text).not.toContain("com//notifications");
  });

  it("falls back to a relative path when the base URL is empty", () => {
    const { html } = renderEventEmail({ ...BASE, appBaseUrl: "" });
    expect(html).toContain('href="/notifications"');
  });

  it("escapes HTML in the title and message", () => {
    const { html } = renderEventEmail({
      ...BASE,
      title: "<b>x</b>",
      message: "rajma & dal <here>",
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("rajma &amp; dal &lt;here&gt;");
  });
});
