// Menu-builder model — shared, pure, platform-agnostic so the web (MP-B-030) and
// mobile (MP-C-030) menu builders drive off ONE working model and gate "can I
// publish?" with the SAME structural rules the publish RPC enforces (contract 03
// § 5). No I/O, no `server-only`, no `next/*` — the Expo app imports it via
// `@mmp/shared/provider`, the web app via `@/packages/shared/provider`.
//
// The builder holds a `MenuBuilderState`: a date, a cutoff (ISO), an optional note,
// and a list of component drafts. Each draft is created by PICKING a default catalog
// item (so a draft always carries a default + its group); the owner then toggles
// "required" and picks alternatives (other active items in the same group). The
// server denormalizes every display field off the OWNER-PRIVATE catalog at authoring
// time (ADO #39), so this model only ever sends catalog item IDS + structure.
//
// SCOPE — this slice authors components + alternatives + cutoff + note. Customization
// groups (extras + price labels) are NOT authored here yet (the remainder of #22); a
// draft carries an empty `customizationGroups` on create. `previewMenuDayFromBuilder`
// reuses the #84 `validateMenuCompleteness` validator so the live "publishable" badge
// the builder shows matches exactly what the publish gate will decide.

import type { ValidationIssue } from "../types";
import type {
  CatalogItemDto,
  CreateMenuComponentInput,
  CreateMenuCustomizationGroupInput,
  CreateMenuDayInput,
  MenuComponentDto,
  MenuDayDto,
} from "./dtos";
import type { ProviderComponentGroup } from "./enums";
import { validateMenuCompleteness } from "./menu-completeness";

/**
 * One component slot the owner is building. Always carries a `defaultCatalogItemId`
 * (a draft is created by picking a dish) + its `componentGroup` (the group of that
 * dish, so the model never needs a catalog lookup to know the slot's group).
 * `customizationGroups` is reserved for the later customization-authoring slice — it
 * is `[]` on a freshly created draft.
 */
export interface MenuComponentDraft {
  /** A stable local key for list rendering — caller-supplied (UI generates it). */
  key: string;
  componentGroup: ProviderComponentGroup;
  defaultCatalogItemId: string;
  isRequired: boolean;
  alternativeCatalogItemIds: string[];
  customizationGroups: CreateMenuCustomizationGroupInput[];
}

/** The whole builder form's working model. */
export interface MenuBuilderState {
  /** `YYYY-MM-DD` (immutable identity of the day). */
  menuDate: string;
  /** ISO-8601 timestamp; the UI converts a local datetime input via {@link localDateTimeToIso}. */
  cutoffAt: string;
  note: string;
  components: MenuComponentDraft[];
}

/** An empty builder for a given date + cutoff (no components yet). */
export function emptyMenuBuilderState(
  menuDate: string,
  cutoffAt: string,
): MenuBuilderState {
  return { menuDate, cutoffAt, note: "", components: [] };
}

/**
 * A fresh component draft from a catalog item — defaults to `required`, no
 * alternatives, no customizations. The slot's group is the item's group, so the
 * eligible alternatives are exactly the other active items in that group.
 */
export function makeComponentDraft(
  item: CatalogItemDto,
  key: string,
): MenuComponentDraft {
  return {
    key,
    componentGroup: item.componentGroup,
    defaultCatalogItemId: item.catalogItemId,
    isRequired: true,
    alternativeCatalogItemIds: [],
    customizationGroups: [],
  };
}

// ──────────────────── Component transitions (pure reducers) ────────────────────
// The web (MP-B-030) and mobile (MP-C-030) builders share NO UI code, but the
// state transitions over `MenuBuilderState` are identical model logic — so they
// live here, pure, and both forms call them inside their `setState(prev => …)`
// updater. Deriving the new key from `prev` (not a render-closure counter) makes a
// rapid double-add mint distinct keys regardless of render timing (review #2/#3).

/**
 * The next unique component key for `components` — `c<n>` where `n` is one past the
 * largest existing `c<digits>` suffix (0 when there are none). Pure in its argument,
 * so calling it inside a functional `setState` updater guarantees uniqueness even
 * across two adds that batch before a render flush, and never collides with a key
 * left behind by an earlier remove.
 */
export function nextComponentKey(
  components: readonly MenuComponentDraft[],
): string {
  let max = 0;
  for (const component of components) {
    const match = /^c(\d+)$/.exec(component.key);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return `c${max + 1}`;
}

/**
 * Append a fresh component draft built from the first catalog item, with a key unique
 * within the current components. Returns the state unchanged when the catalog is empty
 * (nothing to default the slot to).
 */
export function addComponentDraft(
  state: MenuBuilderState,
  catalog: readonly CatalogItemDto[],
): MenuBuilderState {
  const first = catalog[0];
  if (!first) return state;
  return {
    ...state,
    components: [
      ...state.components,
      makeComponentDraft(first, nextComponentKey(state.components)),
    ],
  };
}

/** Drop the component with `key` (no-op if it isn't present). */
export function removeComponentDraft(
  state: MenuBuilderState,
  key: string,
): MenuBuilderState {
  return {
    ...state,
    components: state.components.filter((component) => component.key !== key),
  };
}

/** Shallow-merge `patch` into the component with `key` (no-op if it isn't present). */
export function patchComponentDraft(
  state: MenuBuilderState,
  key: string,
  patch: Partial<MenuComponentDraft>,
): MenuBuilderState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.key === key ? { ...component, ...patch } : component,
    ),
  };
}

/**
 * Re-point a component's default dish to `catalogItemId`. Re-derives the slot's group
 * from the new item and clears the swaps (they no longer belong to the new group).
 * Returns the state unchanged if the id isn't an item in `catalog`.
 */
export function changeComponentDefault(
  state: MenuBuilderState,
  key: string,
  catalogItemId: string,
  catalog: readonly CatalogItemDto[],
): MenuBuilderState {
  const item = catalog.find((c) => c.catalogItemId === catalogItemId);
  if (!item) return state;
  return patchComponentDraft(state, key, {
    defaultCatalogItemId: item.catalogItemId,
    componentGroup: item.componentGroup,
    alternativeCatalogItemIds: [],
  });
}

/** Toggle `altId` in a component's alternative set (add if absent, remove if present). */
export function toggleComponentAlternative(
  state: MenuBuilderState,
  key: string,
  altId: string,
): MenuBuilderState {
  return {
    ...state,
    components: state.components.map((component) => {
      if (component.key !== key) return component;
      const has = component.alternativeCatalogItemIds.includes(altId);
      return {
        ...component,
        alternativeCatalogItemIds: has
          ? component.alternativeCatalogItemIds.filter((id) => id !== altId)
          : [...component.alternativeCatalogItemIds, altId],
      };
    }),
  };
}

/** Index a catalog list by id for O(1) denormalization lookups. */
export function catalogById(
  catalog: readonly CatalogItemDto[],
): Map<string, CatalogItemDto> {
  return new Map(catalog.map((item) => [item.catalogItemId, item]));
}

/**
 * The catalog items a draft may offer as a SWAP: active items in the same component
 * group as the default, excluding the default itself. The builder's alternative
 * picker renders exactly these, so a swap can never change the slot's group (and the
 * unit-consistency completeness rule is satisfiable).
 */
export function eligibleAlternatives(
  draft: MenuComponentDraft,
  catalog: readonly CatalogItemDto[],
): CatalogItemDto[] {
  return catalog.filter(
    (item) =>
      item.isActive &&
      item.componentGroup === draft.componentGroup &&
      item.catalogItemId !== draft.defaultCatalogItemId,
  );
}

/** Only the active catalog items (archived items are never offered on a new menu). */
export function activeCatalog(
  catalog: readonly CatalogItemDto[],
): CatalogItemDto[] {
  return catalog.filter((item) => item.isActive);
}

/** Map one component draft to the create-input component (catalog ids + structure). */
function draftToComponentInput(
  draft: MenuComponentDraft,
): CreateMenuComponentInput {
  return {
    componentGroup: draft.componentGroup,
    defaultCatalogItemId: draft.defaultCatalogItemId,
    isRequired: draft.isRequired,
    alternativeCatalogItemIds: [...draft.alternativeCatalogItemIds],
    customizationGroups: draft.customizationGroups,
  };
}

/**
 * The `CreateMenuDayInput` the builder POSTs to `/api/providers/{id}/menus`. Only
 * drafts that carry a default item are emitted (the UI gates Create so all do; this
 * is a defensive filter). Component + alternative order is preserved as the array
 * order — the server stores them in that order.
 */
export function menuBuilderStateToCreateInput(
  state: MenuBuilderState,
): CreateMenuDayInput {
  return {
    menuDate: state.menuDate,
    cutoffAt: state.cutoffAt,
    note: state.note.trim().length > 0 ? state.note.trim() : null,
    components: state.components
      .filter((draft) => draft.defaultCatalogItemId.length > 0)
      .map(draftToComponentInput),
  };
}

/**
 * Build a `MenuDayDto` PREVIEW from the builder state + the catalog, denormalizing
 * the display fields (name / quantity / unit / spice-salt) off the catalog exactly
 * as the `create_provider_menu_day` RPC does server-side. Feeding this to
 * {@link validateMenuCompleteness} makes the builder's live "publishable" verdict
 * match the publish gate. A draft whose default is no longer in the catalog (e.g. it
 * was archived) denormalizes to a blank name + zero quantity, so the completeness
 * check flags it — mirroring the server's catalog gate.
 */
export function previewMenuDayFromBuilder(
  state: MenuBuilderState,
  catalog: readonly CatalogItemDto[],
): MenuDayDto {
  const byId = catalogById(catalog);

  const components: MenuComponentDto[] = state.components.map(
    (draft, index) => {
      const item = byId.get(draft.defaultCatalogItemId);
      return {
        menuComponentId: draft.key,
        componentGroup: draft.componentGroup,
        defaultCatalogItemId: draft.defaultCatalogItemId,
        defaultItemName: item?.name ?? "",
        defaultQuantity: item?.defaultQuantity ?? 0,
        canonicalUnit: item?.canonicalUnit ?? "",
        isRequired: draft.isRequired,
        sortOrder: index,
        supportsSpiceLevel: item?.supportsSpiceLevel ?? false,
        supportsSaltLevel: item?.supportsSaltLevel ?? false,
        alternatives: draft.alternativeCatalogItemIds.map((altId, ai) => {
          const alt = byId.get(altId);
          return {
            alternativeId: `${draft.key}:alt:${ai}`,
            catalogItemId: altId,
            itemName: alt?.name ?? "",
            quantity: alt?.defaultQuantity ?? 0,
            canonicalUnit: alt?.canonicalUnit ?? "",
          };
        }),
        // Customizations aren't authored in this slice; preview them as-sent so the
        // validator's customization rules still apply once the authoring slice lands.
        customizationGroups: draft.customizationGroups.map((group, gi) => ({
          customizationGroupId: `${draft.key}:grp:${gi}`,
          name: group.name,
          customizationType: group.customizationType,
          includedInPrice: group.includedInPrice ?? true,
          isRequired: group.isRequired ?? false,
          minimumSelections: group.minimumSelections ?? 0,
          maximumSelections:
            group.maximumSelections === undefined
              ? null
              : group.maximumSelections,
          options: group.options.map((option, oi) => ({
            optionId: `${draft.key}:grp:${gi}:opt:${oi}`,
            code: option.code,
            label: option.label,
            quantityDelta: option.quantityDelta ?? null,
            externalPriceLabel: option.externalPriceLabel ?? null,
            minimumQuantity: option.minimumQuantity ?? null,
            maximumQuantity: option.maximumQuantity ?? null,
          })),
        })),
      };
    },
  );

  return {
    menuDayId: "preview",
    providerId: "preview",
    weeklyMenuId: "preview",
    menuDate: state.menuDate,
    cutoffAt: state.cutoffAt,
    status: "draft",
    note: state.note.trim().length > 0 ? state.note.trim() : null,
    publishedAt: null,
    lockedAt: null,
    revision: 1,
    supersedesMenuDayId: null,
    supersededAt: null,
    components,
  };
}

/**
 * The structural-completeness issues for the current builder state, as the publish
 * gate will see them (cutoff in the future, ≥1 component, named defaults, consistent
 * units, well-formed customizations). `now` is injected so the cutoff check is
 * deterministic/testable, mirroring {@link validateMenuCompleteness}.
 */
export function menuBuilderIssues(
  state: MenuBuilderState,
  catalog: readonly CatalogItemDto[],
  now: Date,
): ValidationIssue[] {
  return validateMenuCompleteness(
    previewMenuDayFromBuilder(state, catalog),
    now,
  );
}

/** True iff the current builder state would PUBLISH cleanly (no completeness issues). */
export function isMenuBuilderPublishable(
  state: MenuBuilderState,
  catalog: readonly CatalogItemDto[],
  now: Date,
): boolean {
  return menuBuilderIssues(state, catalog, now).length === 0;
}

/**
 * True iff the builder state can be SAVED as a draft. Looser than publishable: a draft
 * may have a cutoff already in the past (you can fix it before publishing), so this
 * only requires a well-formed date + cutoff and at least one component that carries a
 * default item. (The create RPC re-validates the catalog refs as the backstop.)
 */
export function isMenuBuilderCreatable(state: MenuBuilderState): boolean {
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(state.menuDate);
  const cutoffOk =
    state.cutoffAt.length > 0 && !Number.isNaN(Date.parse(state.cutoffAt));
  const components = state.components.filter(
    (draft) => draft.defaultCatalogItemId.length > 0,
  );
  return dateOk && cutoffOk && components.length > 0;
}

/**
 * The distinct human-readable messages for a set of completeness issues, in first-seen
 * order — what the builder shows the owner as "why this can't publish yet". Deduped so
 * the same rule across several components reads once.
 */
export function summarizeMenuIssues(
  issues: readonly ValidationIssue[],
): string[] {
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const issue of issues) {
    const message =
      typeof issue.message === "string" && issue.message.length > 0
        ? issue.message
        : issue.rule;
    if (!seen.has(message)) {
      seen.add(message);
      messages.push(message);
    }
  }
  return messages;
}

// ─────────────────────────── Date / cutoff helpers ───────────────────────────

/** `YYYY-MM-DD` for `now` in `timeZone` (en-CA renders ISO date order). Falls back
 * to the UTC date if the timezone is somehow unformattable. Mirrors the server's
 * `getTodayMenu` "today" computation so the builder defaults to the same day. */
export function providerTodayDate(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A sensible default cutoff: `hoursAhead` from `now`, as an ISO timestamp. */
export function defaultCutoffIso(now: Date, hoursAhead = 8): string {
  return new Date(now.getTime() + hoursAhead * 3_600_000).toISOString();
}

/**
 * Convert a local datetime-input value (`YYYY-MM-DDTHH:mm`, the wall-clock the owner
 * typed) to an ISO-8601 UTC timestamp. Returns `""` for an empty/invalid value so the
 * completeness check reports `cutoff_invalid` rather than throwing.
 */
export function localDateTimeToIso(local: string): string {
  if (local.trim().length === 0) return "";
  const ms = Date.parse(local);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString();
}

/**
 * Format an ISO timestamp back to a local datetime-input value (`YYYY-MM-DDTHH:mm`)
 * for prefilling the field. Returns `""` for an invalid ISO.
 */
export function isoToLocalDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
