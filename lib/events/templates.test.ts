import { describe, expect, it } from "vitest";

import { renderNotification } from "./templates";
import { EVENT_TYPES, type EventType, type EventVars } from "./types";

const FULL_VARS: EventVars = {
  actorName: "Aishvarya",
  slot: "dinner",
  slotLabel: "tonight's dinner",
  fromDish: "Rajma Rice",
  toDish: "Paneer Bhurji",
  dish: "Chole Rice",
  memberName: "Rahul",
  householdName: "Suhane Household",
  guestUntil: "May 26",
  newRole: "admin",
  prepTaskName: "Soak chickpeas",
  dueTime: "9 PM",
};

describe("renderNotification", () => {
  it("renders the verbatim spec example for meal_changed (design/09 § 6)", () => {
    const { title, message } = renderNotification("meal_changed", FULL_VARS);
    expect(title).toBe("Dinner changed");
    expect(message).toBe(
      "Aishvarya changed tonight's dinner from Rajma Rice to Paneer Bhurji.",
    );
  });

  it("renders the verbatim spec example for meal_marked_eating_out", () => {
    const { title, message } = renderNotification("meal_marked_eating_out", {
      actorName: "Riya",
      slotLabel: "Saturday dinner",
    });
    expect(title).toBe("Meal marked as eating out");
    expect(message).toBe("Riya marked Saturday dinner as eating out.");
  });

  it("renders the verbatim spec example for invite_accepted (guest)", () => {
    const { title, message } = renderNotification("invite_accepted", {
      memberName: "Rahul",
      householdName: "Suhane Household",
      guestUntil: "May 26",
    });
    expect(title).toBe("New household member");
    expect(message).toBe(
      "Rahul joined Suhane Household as a guest until May 26.",
    );
  });

  it("drops the guest clause for a permanent member", () => {
    const { message } = renderNotification("invite_accepted", {
      memberName: "Rahul",
      householdName: "Suhane Household",
      guestUntil: null,
    });
    expect(message).toBe("Rahul joined Suhane Household.");
  });

  it("renders the verbatim spec example for prep_task_due", () => {
    const { title, message } = renderNotification("prep_task_due", {
      prepTaskName: "Soak chickpeas",
      dueTime: "9 PM",
      dish: "Chole Rice",
    });
    expect(title).toBe("Prep needed");
    expect(message).toBe("Soak chickpeas by 9 PM for Chole Rice.");
  });

  it("titles slot-specific lock/unlock events with the capitalized slot", () => {
    expect(renderNotification("meal_locked", FULL_VARS).title).toBe(
      "Dinner locked",
    );
    expect(renderNotification("meal_unlocked", FULL_VARS).title).toBe(
      "Dinner unlocked",
    );
  });

  it("names the new role in role_changed", () => {
    expect(renderNotification("role_changed", FULL_VARS).message).toBe(
      "Aishvarya changed Rahul's role to admin.",
    );
  });

  it("has a template for every declared event type (no empty notifications)", () => {
    for (const eventType of EVENT_TYPES) {
      const { title, message } = renderNotification(eventType, FULL_VARS);
      expect(title.length).toBeGreaterThan(0);
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown event type (fails fast — design/09 § 6)", () => {
    expect(() =>
      renderNotification("not_a_real_event" as EventType, FULL_VARS),
    ).toThrow(/no notification template/i);
  });
});
