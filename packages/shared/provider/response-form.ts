// Provider member-response form helpers — shared, pure, platform-agnostic so the
// web response UI (`TodayResponseView`) and the mobile screen
// (`TodayResponseScreen`/`useTodayResponse`) build one selection model from the
// menu + the caller's current response, derive the `SaveProviderResponseRequest`
// from it, and decide lock state the SAME way (web↔mobile parity is a hard rule).
// No I/O, no `server-only`, no `next/*` — the Expo app imports it via
// `@mmp/shared/provider`, the web app via `@/packages/shared/provider`.
//
// The server is authoritative: it DERIVES quantity/unit and re-validates every
// selection (MP-A-130, § 11.6). These helpers shape the request only — they never
// gate on price/limits the server owns, so the form can't drift from the contract.

import type {
  MemberResponseDto,
  MenuComponentDto,
  MenuDayDto,
  SaveProviderResponseRequest,
} from "./dtos";
import type {
  ProviderResponseStatus,
  ProviderSaltLevel,
  ProviderSpiceLevel,
} from "./enums";

/** One selected customization option on a component (flat — its group is in the menu). */
export interface CustomizationSelection {
  optionId: string;
  /** The chosen count for a `quantity_increment` option; null for plain selects. */
  quantity: number | null;
}

/** The caller's working selection for one menu component. */
export interface ComponentSelection {
  selectedCatalogItemId: string;
  quantity: number;
  canonicalUnit: string;
  spiceLevel: ProviderSpiceLevel | null;
  saltLevel: ProviderSaltLevel | null;
  customizations: CustomizationSelection[];
}

/** The whole working form, keyed by `menuComponentId`. */
export type ResponseFormState = Record<string, ComponentSelection>;

/** A selectable item for a component: the default plus each active alternative. */
export interface ComponentChoice {
  catalogItemId: string;
  quantity: number;
  canonicalUnit: string;
  isDefault: boolean;
}

/** The default item + alternatives a member may pick for a component (default first). */
export function componentChoices(
  component: MenuComponentDto,
): ComponentChoice[] {
  return [
    {
      catalogItemId: component.defaultCatalogItemId,
      quantity: component.defaultQuantity,
      canonicalUnit: component.canonicalUnit,
      isDefault: true,
    },
    ...component.alternatives.map((alt) => ({
      catalogItemId: alt.catalogItemId,
      quantity: alt.quantity,
      canonicalUnit: alt.canonicalUnit,
      isDefault: false,
    })),
  ];
}

/** The choice for a given catalog item on a component, or the default as fallback. */
function choiceFor(
  component: MenuComponentDto,
  catalogItemId: string,
): ComponentChoice {
  return (
    componentChoices(component).find(
      (c) => c.catalogItemId === catalogItemId,
    ) ?? {
      catalogItemId: component.defaultCatalogItemId,
      quantity: component.defaultQuantity,
      canonicalUnit: component.canonicalUnit,
      isDefault: true,
    }
  );
}

/**
 * Build the initial working form from the menu and the caller's current response.
 * A component the response already answers prefills from that item; an unanswered
 * component starts on its default package with no spice/salt/customizations — the
 * "default package" a member confirms with one tap (UC-RESPONSE-001).
 */
export function initialFormState(
  menu: MenuDayDto,
  response: MemberResponseDto,
): ResponseFormState {
  const byComponent = new Map(
    response.items.map((item) => [item.menuComponentId, item]),
  );
  const state: ResponseFormState = {};
  for (const component of menu.components) {
    const item = byComponent.get(component.menuComponentId);
    if (item) {
      state[component.menuComponentId] = {
        selectedCatalogItemId: item.selectedCatalogItemId,
        quantity: item.quantity,
        canonicalUnit: item.canonicalUnit,
        spiceLevel: item.spiceLevel,
        saltLevel: item.saltLevel,
        customizations: item.customizations.map((c) => ({
          optionId: c.customizationOptionId,
          quantity: c.quantity,
        })),
      };
    } else {
      state[component.menuComponentId] = {
        selectedCatalogItemId: component.defaultCatalogItemId,
        quantity: component.defaultQuantity,
        canonicalUnit: component.canonicalUnit,
        spiceLevel: null,
        saltLevel: null,
        customizations: [],
      };
    }
  }
  return state;
}

/** Replace one component's selection immutably. */
function withComponent(
  state: ResponseFormState,
  componentId: string,
  next: ComponentSelection,
): ResponseFormState {
  return { ...state, [componentId]: next };
}

/**
 * Pick the default item or an alternative for a component. Quantity/unit follow the
 * chosen item; spice/salt/customizations are preserved (the server re-derives the
 * authoritative quantity, so this is purely the optimistic display value).
 */
export function selectChoice(
  state: ResponseFormState,
  component: MenuComponentDto,
  catalogItemId: string,
): ResponseFormState {
  const current = state[component.menuComponentId];
  if (!current) return state;
  const choice = choiceFor(component, catalogItemId);
  return withComponent(state, component.menuComponentId, {
    ...current,
    selectedCatalogItemId: choice.catalogItemId,
    quantity: choice.quantity,
    canonicalUnit: choice.canonicalUnit,
  });
}

/** Set (or clear, with null) the spice level on a component. */
export function setSpiceLevel(
  state: ResponseFormState,
  componentId: string,
  spiceLevel: ProviderSpiceLevel | null,
): ResponseFormState {
  const current = state[componentId];
  if (!current) return state;
  return withComponent(state, componentId, { ...current, spiceLevel });
}

/** Set (or clear, with null) the salt level on a component. */
export function setSaltLevel(
  state: ResponseFormState,
  componentId: string,
  saltLevel: ProviderSaltLevel | null,
): ResponseFormState {
  const current = state[componentId];
  if (!current) return state;
  return withComponent(state, componentId, { ...current, saltLevel });
}

/** Whether an option is currently selected on a component. */
export function isOptionSelected(
  state: ResponseFormState,
  componentId: string,
  optionId: string,
): boolean {
  return (state[componentId]?.customizations ?? []).some(
    (c) => c.optionId === optionId,
  );
}

/** The chosen count for a `quantity_increment` option (0 when not selected). */
export function optionQuantity(
  state: ResponseFormState,
  componentId: string,
  optionId: string,
): number {
  const found = (state[componentId]?.customizations ?? []).find(
    (c) => c.optionId === optionId,
  );
  return found?.quantity ?? 0;
}

/**
 * Single-select / boolean: pick exactly one option in a group (toggling the same
 * option off). `groupOptionIds` is every option id in that group, so picking one
 * clears any sibling.
 */
export function selectSingle(
  state: ResponseFormState,
  componentId: string,
  groupOptionIds: string[],
  optionId: string,
): ResponseFormState {
  const current = state[componentId];
  if (!current) return state;
  const wasSelected = current.customizations.some(
    (c) => c.optionId === optionId,
  );
  const withoutGroup = current.customizations.filter(
    (c) => !groupOptionIds.includes(c.optionId),
  );
  const next = wasSelected
    ? withoutGroup
    : [...withoutGroup, { optionId, quantity: null }];
  return withComponent(state, componentId, {
    ...current,
    customizations: next,
  });
}

/**
 * Multi-select: toggle an option, capping the group's selected count at `max`
 * (null = unbounded). A toggle that would exceed the cap is ignored.
 */
export function toggleMulti(
  state: ResponseFormState,
  componentId: string,
  groupOptionIds: string[],
  optionId: string,
  max: number | null,
): ResponseFormState {
  const current = state[componentId];
  if (!current) return state;
  const selected = current.customizations.some((c) => c.optionId === optionId);
  if (selected) {
    return withComponent(state, componentId, {
      ...current,
      customizations: current.customizations.filter(
        (c) => c.optionId !== optionId,
      ),
    });
  }
  const groupCount = current.customizations.filter((c) =>
    groupOptionIds.includes(c.optionId),
  ).length;
  if (max !== null && groupCount >= max) return state; // cap reached — no-op
  return withComponent(state, componentId, {
    ...current,
    customizations: [...current.customizations, { optionId, quantity: null }],
  });
}

/**
 * Quantity-increment: set an option's count (0 removes it). The caller clamps to
 * the option's min/max for display; the server re-validates the bound.
 */
export function setIncrement(
  state: ResponseFormState,
  componentId: string,
  optionId: string,
  quantity: number,
): ResponseFormState {
  const current = state[componentId];
  if (!current) return state;
  const without = current.customizations.filter((c) => c.optionId !== optionId);
  const next = quantity > 0 ? [...without, { optionId, quantity }] : without;
  return withComponent(state, componentId, {
    ...current,
    customizations: next,
  });
}

/**
 * Derive the `PUT my-response` body from the working form, in menu-component order
 * (stable). The server ignores client quantity/unit and re-derives them, so the
 * shape round-trips without the client ever owning an authoritative number.
 */
export function toSaveRequest(
  menu: MenuDayDto,
  state: ResponseFormState,
  expectedVersion: number | null,
  memberNote: string | null,
): SaveProviderResponseRequest {
  return {
    expectedVersion,
    memberNote:
      memberNote && memberNote.trim().length > 0 ? memberNote.trim() : null,
    items: menu.components.map((component) => {
      const sel: ComponentSelection = state[component.menuComponentId] ?? {
        selectedCatalogItemId: component.defaultCatalogItemId,
        quantity: component.defaultQuantity,
        canonicalUnit: component.canonicalUnit,
        spiceLevel: null,
        saltLevel: null,
        customizations: [],
      };
      return {
        menuComponentId: component.menuComponentId,
        selectedCatalogItemId: sel.selectedCatalogItemId,
        quantity: sel.quantity,
        canonicalUnit: sel.canonicalUnit,
        spiceLevel: sel.spiceLevel,
        saltLevel: sel.saltLevel,
        customizations: sel.customizations.map((c) => ({
          customizationOptionId: c.optionId,
          quantity: c.quantity,
        })),
      };
    }),
  };
}

/** Response statuses that are terminally locked from the member's side. */
const LOCKED_RESPONSE_STATUSES: ReadonlySet<ProviderResponseStatus> = new Set([
  "locked",
  "auto_accepted",
  "provider_overridden",
]);

/** Menu statuses that close a day to member responses. */
const CLOSED_MENU_STATUSES: ReadonlySet<MenuDayDto["status"]> = new Set([
  "locked",
  "archived",
  "cancelled",
]);

/**
 * Whether the response is locked (read-only) — server-authoritative and
 * deterministic (no clock), so it is safe to compute identically on the server
 * (SSR) and the client without a hydration mismatch. The cutoff *time* passing is
 * handled separately (`isCutoffPassed`) by a client-side countdown, since the
 * sweep that flips the status to `locked` may lag the cutoff by a few minutes.
 */
export function isResponseLocked(
  menu: MenuDayDto,
  response: MemberResponseDto,
): boolean {
  return (
    CLOSED_MENU_STATUSES.has(menu.status) ||
    menu.lockedAt !== null ||
    response.lockedAt !== null ||
    LOCKED_RESPONSE_STATUSES.has(response.status)
  );
}

/** Whether the menu's response cutoff has passed as of `now`. */
export function isCutoffPassed(menu: MenuDayDto, now: Date): boolean {
  return new Date(menu.cutoffAt).getTime() <= now.getTime();
}

/** Milliseconds until cutoff (never negative). */
export function cutoffRemainingMs(menu: MenuDayDto, now: Date): number {
  return Math.max(0, new Date(menu.cutoffAt).getTime() - now.getTime());
}

/** Human-readable countdown like `2d 3h`, `3h 12m`, `12m 30s`, or `Closed`. */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Closed";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
