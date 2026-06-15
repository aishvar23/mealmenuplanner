// Menu-completeness validator — shared, pure, platform-agnostic so the menu
// builder (web MP-B-030 / mobile MP-C-030) and the publish RPC (MP-A-121) gate a
// menu day on the SAME structural rules (contract 03 § 5). No I/O, no
// `server-only`, no `next/*` — the Expo app imports it via `@mmp/shared/provider`,
// the web app via `@/packages/shared/provider`.
//
// SCOPE — structural subset only. § 5 also requires that each default/alternative
// references an **active** catalog item **owned by the same provider** and that no
// item is cross-provider. Those need the owner-private catalog (DB context) and are
// enforced server-side in the MP-A-121 publish RPC against `provider_catalog_items`
// — they are intentionally NOT checked here. This pure function covers exactly the
// rules verifiable on a `MenuDayDto` (the authoring preview the builder holds and
// the persisted tree the publish RPC reads share this shape).
//
// ADR-7 INDEPENDENCE — ADR-7 (#30) decides the *edit-after-response* policy
// (block vs revision vs cancel-recreate). This validator only answers "is this menu
// structurally publishable?", which is orthogonal: it never inspects responses.

import type { ValidationIssue } from "../types";
import type {
  CustomizationGroupDto,
  MenuComponentDto,
  MenuDayDto,
} from "./dtos";

/** Empty-or-whitespace guard for a denormalized id/name string. */
function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/**
 * Structural-completeness rules for one customization group, pushed onto `issues`.
 * `quantity_increment` groups must declare a finite cap at the group and option
 * level (§ 5); a *required* group must admit at least one selection and be
 * internally consistent.
 */
function checkCustomizationGroup(
  group: CustomizationGroupDto,
  path: string,
  issues: ValidationIssue[],
): void {
  const extras = { customizationGroupId: group.customizationGroupId };

  if (group.customizationType === "quantity_increment") {
    if (group.maximumSelections === null) {
      issues.push({
        field: `${path}.maximumSelections`,
        rule: "unbounded_increment",
        message:
          "A quantity-increment customization must declare a finite maximum.",
        ...extras,
      });
    }
    group.options.forEach((option, oi) => {
      if (option.maximumQuantity === null) {
        issues.push({
          field: `${path}.options[${oi}].maximumQuantity`,
          rule: "unbounded_increment",
          message:
            "Every quantity-increment option must declare a finite maximum quantity.",
          optionId: option.optionId,
          ...extras,
        });
      }
    });
  }

  if (group.isRequired) {
    if (group.minimumSelections < 1) {
      issues.push({
        field: `${path}.minimumSelections`,
        rule: "invalid_required_group",
        message:
          "A required customization must ask for at least one selection.",
        ...extras,
      });
    }
    if (group.options.length === 0) {
      issues.push({
        field: `${path}.options`,
        rule: "invalid_required_group",
        message: "A required customization must offer at least one option.",
        ...extras,
      });
    }
  }

  if (
    group.maximumSelections !== null &&
    group.minimumSelections > group.maximumSelections
  ) {
    issues.push({
      field: `${path}.maximumSelections`,
      rule: "invalid_selection_bounds",
      message: "Maximum selections cannot be smaller than the minimum.",
      minimumSelections: group.minimumSelections,
      maximumSelections: group.maximumSelections,
      ...extras,
    });
  }
}

/** Structural-completeness rules for one menu component, pushed onto `issues`. */
function checkComponent(
  component: MenuComponentDto,
  index: number,
  issues: ValidationIssue[],
): void {
  const path = `components[${index}]`;
  const extras = {
    menuComponentId: component.menuComponentId,
    componentGroup: component.componentGroup,
  };

  // Required component must resolve to a concrete default dish (§ 5). The name is
  // denormalized off the catalog at authoring time (ADO #39), so a blank name means
  // the slot was never filled.
  if (component.isRequired) {
    if (isBlank(component.defaultCatalogItemId)) {
      issues.push({
        field: `${path}.defaultCatalogItemId`,
        rule: "missing_default_item",
        message: "A required component must have a default item.",
        ...extras,
      });
    }
    if (isBlank(component.defaultItemName)) {
      issues.push({
        field: `${path}.defaultItemName`,
        rule: "missing_default_item",
        message: "A required component's default item must have a name.",
        ...extras,
      });
    }
  }

  if (component.defaultQuantity <= 0) {
    issues.push({
      field: `${path}.defaultQuantity`,
      rule: "non_positive_quantity",
      message: "The default quantity must be greater than zero.",
      defaultQuantity: component.defaultQuantity,
      ...extras,
    });
  }

  if (isBlank(component.canonicalUnit)) {
    issues.push({
      field: `${path}.canonicalUnit`,
      rule: "missing_unit",
      message: "A component must declare a unit.",
      ...extras,
    });
  }

  component.alternatives.forEach((alt, ai) => {
    if (alt.quantity <= 0) {
      issues.push({
        field: `${path}.alternatives[${ai}].quantity`,
        rule: "non_positive_quantity",
        message: "An alternative's quantity must be greater than zero.",
        alternativeId: alt.alternativeId,
        ...extras,
      });
    }
    // Every alternative must declare a unit (§ 5) — a blank denormalized unit is an
    // unfilled slot, mirroring the component-level missing_unit check above.
    if (isBlank(alt.canonicalUnit)) {
      issues.push({
        field: `${path}.alternatives[${ai}].canonicalUnit`,
        rule: "missing_unit",
        message: "An alternative must declare a unit.",
        alternativeId: alt.alternativeId,
        ...extras,
      });
    }
    // Units must be consistent within a component (§ 5) so a swap never changes the
    // unit the aggregate roster sums in. A blank alt unit is still inconsistent with a
    // concrete component unit, so the check is NOT skipped for blank units — such an
    // alternative is reported on both axes (missing + inconsistent).
    if (
      !isBlank(component.canonicalUnit) &&
      alt.canonicalUnit !== component.canonicalUnit
    ) {
      issues.push({
        field: `${path}.alternatives[${ai}].canonicalUnit`,
        rule: "inconsistent_unit",
        message: "An alternative must use the same unit as its component.",
        alternativeId: alt.alternativeId,
        componentUnit: component.canonicalUnit,
        alternativeUnit: alt.canonicalUnit,
        ...extras,
      });
    }
  });

  component.customizationGroups.forEach((group, gi) => {
    checkCustomizationGroup(
      group,
      `${path}.customizationGroups[${gi}]`,
      issues,
    );
  });
}

/**
 * Validate that a menu day is **structurally publishable** (contract 03 § 5),
 * returning one {@link ValidationIssue} per failed rule (empty array ⇒ publishable
 * on the structural axis). Pure: pass `now` so the cutoff-in-the-future check stays
 * deterministic and testable (mirrors the `now: Date` convention in
 * `response-form.ts`).
 *
 * Rules: the menu has at least one component; every *required* component resolves
 * to a named default item; quantities are positive; units are consistent within a
 * component; `quantity_increment` customizations declare a finite cap; required
 * customizations are well-formed; and `cutoffAt` is still in the future.
 *
 * NOT checked here (DB context, enforced in the MP-A-121 publish RPC): catalog
 * item active/ownership and cross-provider references. Required-GROUP *coverage*
 * (does the menu include a component for each provider-configured required group?)
 * also needs the provider config and is enforced server-side; per-component
 * `isRequired` is the slice checkable on the DTO.
 */
export function validateMenuCompleteness(
  menuDay: MenuDayDto,
  now: Date,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (menuDay.components.length === 0) {
    issues.push({
      field: "components",
      rule: "menu_empty",
      message: "A publishable menu must have at least one component.",
    });
  }

  menuDay.components.forEach((component, index) => {
    checkComponent(component, index, issues);
  });

  const cutoff = new Date(menuDay.cutoffAt);
  if (Number.isNaN(cutoff.getTime())) {
    issues.push({
      field: "cutoffAt",
      rule: "cutoff_invalid",
      message: "The cutoff time is not a valid timestamp.",
    });
  } else if (cutoff.getTime() <= now.getTime()) {
    issues.push({
      field: "cutoffAt",
      rule: "cutoff_in_past",
      message: "The cutoff time must be in the future.",
      cutoffAt: menuDay.cutoffAt,
    });
  }

  return issues;
}

/** Convenience: a menu day is structurally publishable iff it has no issues. */
export function isMenuPublishable(menuDay: MenuDayDto, now: Date): boolean {
  return validateMenuCompleteness(menuDay, now).length === 0;
}
