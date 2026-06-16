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
// SCOPE — this model authors components + alternatives + cutoff + note AND the
// per-component CUSTOMIZATION GROUPS (extras + price labels: a sauce single-select, an
// "extra roti" quantity add-on, a yes/no, a free-text note). `previewMenuDayFromBuilder`
// reuses the #84 `validateMenuCompleteness` validator so the live "publishable" badge the
// builder shows matches exactly what the publish gate will decide; `customizationInsertIssues`
// additionally mirrors the pmp_4 DB CHECKs so a malformed group is caught BEFORE the write
// (the server CHECK → `menu_incomplete` is the authoritative backstop).

import type { ValidationIssue } from "../types";
import type {
  CatalogItemDto,
  CreateMenuComponentInput,
  CreateMenuCustomizationGroupInput,
  CreateMenuDayInput,
  CustomizationGroupDto,
  EditMenuDayInput,
  MenuComponentDto,
  MenuDayDto,
} from "./dtos";
import type {
  ProviderComponentGroup,
  ProviderCustomizationType,
} from "./enums";
import { validateMenuCompleteness } from "./menu-completeness";

/**
 * The consequence banner shown when EDITING a published day — a single source of truth so
 * the web (MP-B-030) and mobile (MP-C-030) builders show identical copy (review #9).
 */
export const MENU_REVISION_WARNING =
  "Editing a published menu may create a new revision. Members who have already responded will be asked to re-confirm before the cutoff.";

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

// ─────────────── Customization-group authoring (pure reducers) ───────────────
// A component can offer customization groups — a sauce single-select, an "extra
// roti" quantity add-on, a yes/no toggle, a free-text note. Groups/options have no
// stable id on the wire (the server mints them), so they are addressed by their
// ARRAY INDEX within a component; the web/mobile forms key list rows by index too.
// Every cross-field bound the DB enforces (pmp_4 CHECKs) is normalized here on type
// change and surfaced by {@link customizationInsertIssues} so the builder never POSTs
// a group the writer would reject.

/**
 * Coerce a customization group's selection bounds to the invariants its type requires
 * (the pmp_4 CHECKs): `single_select`/`boolean` allow exactly one selection (max 1);
 * `quantity_increment` must declare a finite cap (default 1 when unset); `text_note` is
 * a free-text answer with no selection count AND no options; a *required* choice-count
 * group needs a minimum of at least one. Keeps `min ≤ max` and truncates the selection
 * counts to whole numbers (they are INTEGER columns server-side). Pure — used by the
 * factory and on every type change so the form's state is always insertable on the
 * structural axis.
 */
export function normalizeCustomizationGroup(
  group: CreateMenuCustomizationGroupInput,
): CreateMenuCustomizationGroupInput {
  const type = group.customizationType;
  let min = group.minimumSelections ?? 0;
  let max = group.maximumSelections ?? null;

  if (type === "single_select" || type === "boolean") {
    max = 1;
  } else if (type === "quantity_increment") {
    if (max === null) max = 1;
  } else if (type === "text_note") {
    min = 0;
    max = null;
  }

  if (
    (group.isRequired ?? false) &&
    type !== "boolean" &&
    type !== "text_note"
  ) {
    if (min < 1) min = 1;
  }
  // Selection counts are INTEGER columns server-side (pmp_4); truncate so a fractional
  // value typed into the form can never reach the writer's `::int` cast (review #3).
  min = Math.trunc(min);
  if (max !== null) max = Math.trunc(max);
  if (min < 0) min = 0;
  if (max !== null && min > max) min = max;

  // A free-text note carries NO options server-side; clear them at this single
  // type-change chokepoint so an orphaned, un-editable option (the options editor is
  // not rendered for text_note) can never block the save with an unfixable issue
  // (review #1 — the dead-end).
  const options = type === "text_note" ? [] : group.options;

  return {
    ...group,
    minimumSelections: min,
    maximumSelections: max,
    options,
  };
}

/**
 * A fresh customization group of `type` — empty name, no options, sensible defaults
 * (included in price, not required), with the selection bounds {@link normalizeCustomizationGroup}
 * forces for that type. The owner fills the name + adds options.
 */
export function makeCustomizationGroup(
  type: ProviderCustomizationType = "single_select",
): CreateMenuCustomizationGroupInput {
  return normalizeCustomizationGroup({
    name: "",
    customizationType: type,
    includedInPrice: true,
    isRequired: false,
    minimumSelections: 0,
    maximumSelections: null,
    options: [],
  });
}

/** The next unique option code for a group — `opt_<n>`, skipping any already in use. */
export function nextOptionCode(options: readonly { code: string }[]): string {
  const used = new Set(options.map((option) => option.code));
  let n = options.length + 1;
  let code = `opt_${n}`;
  while (used.has(code)) {
    n += 1;
    code = `opt_${n}`;
  }
  return code;
}

/** A fresh option for a group — an auto-derived unique `code` and an empty label the owner fills. */
export function makeCustomizationOption(
  options: readonly { code: string }[],
): CreateMenuCustomizationGroupInput["options"][number] {
  return {
    code: nextOptionCode(options),
    label: "",
    quantityDelta: null,
    canonicalUnit: null,
    externalPriceLabel: null,
    minimumQuantity: null,
    maximumQuantity: null,
  };
}

/** Apply `fn` to the group at `groupIndex` of the component keyed `componentKey` (no-op if absent). */
function mapCustomizationGroup(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
  fn: (
    group: CreateMenuCustomizationGroupInput,
  ) => CreateMenuCustomizationGroupInput,
): MenuBuilderState {
  return {
    ...state,
    components: state.components.map((component) => {
      if (component.key !== componentKey) return component;
      return {
        ...component,
        customizationGroups: component.customizationGroups.map(
          (group, index) => (index === groupIndex ? fn(group) : group),
        ),
      };
    }),
  };
}

/** Append a fresh customization group (of `type`) to a component (no-op if the component is absent). */
export function addCustomizationGroup(
  state: MenuBuilderState,
  componentKey: string,
  type: ProviderCustomizationType = "single_select",
): MenuBuilderState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.key === componentKey
        ? {
            ...component,
            customizationGroups: [
              ...component.customizationGroups,
              makeCustomizationGroup(type),
            ],
          }
        : component,
    ),
  };
}

/** Drop the customization group at `groupIndex` of a component. */
export function removeCustomizationGroup(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
): MenuBuilderState {
  return {
    ...state,
    components: state.components.map((component) =>
      component.key === componentKey
        ? {
            ...component,
            customizationGroups: component.customizationGroups.filter(
              (_group, index) => index !== groupIndex,
            ),
          }
        : component,
    ),
  };
}

/**
 * Shallow-merge `patch` into a customization group, then re-normalize its selection
 * bounds — so toggling `isRequired` on a choice group bumps its minimum, etc. (The
 * caller must NOT change `customizationType` through here; use {@link changeCustomizationType}.)
 */
export function patchCustomizationGroup(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
  patch: Partial<Omit<CreateMenuCustomizationGroupInput, "customizationType">>,
): MenuBuilderState {
  return mapCustomizationGroup(state, componentKey, groupIndex, (group) =>
    normalizeCustomizationGroup({ ...group, ...patch }),
  );
}

/** Switch a customization group's type and re-normalize its bounds for the new type. */
export function changeCustomizationType(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
  type: ProviderCustomizationType,
): MenuBuilderState {
  return mapCustomizationGroup(state, componentKey, groupIndex, (group) =>
    normalizeCustomizationGroup({ ...group, customizationType: type }),
  );
}

/** Append a fresh option (auto-coded, blank label) to a customization group. */
export function addCustomizationOption(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
): MenuBuilderState {
  return mapCustomizationGroup(state, componentKey, groupIndex, (group) => ({
    ...group,
    options: [...group.options, makeCustomizationOption(group.options)],
  }));
}

/** Drop the option at `optionIndex` of a customization group. */
export function removeCustomizationOption(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
  optionIndex: number,
): MenuBuilderState {
  return mapCustomizationGroup(state, componentKey, groupIndex, (group) => ({
    ...group,
    options: group.options.filter((_option, index) => index !== optionIndex),
  }));
}

/** Shallow-merge `patch` into the option at `optionIndex` of a customization group. */
export function patchCustomizationOption(
  state: MenuBuilderState,
  componentKey: string,
  groupIndex: number,
  optionIndex: number,
  patch: Partial<CreateMenuCustomizationGroupInput["options"][number]>,
): MenuBuilderState {
  return mapCustomizationGroup(state, componentKey, groupIndex, (group) => ({
    ...group,
    options: group.options.map((option, index) =>
      index === optionIndex ? { ...option, ...patch } : option,
    ),
  }));
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
 * The customization-option fields carried verbatim between a menu-option DTO and the
 * writer input — every field except the generated `optionId`, with `undefined` coerced to
 * `null`. ONE source of truth so {@link customizationGroupToInput} (DTO → input) and
 * {@link previewMenuDayFromBuilder} (input → DTO) agree field-for-field: a new option
 * field is added here once instead of in two parallel literal maps (review #7).
 */
function customizationOptionFields(option: {
  code: string;
  label: string;
  quantityDelta?: number | null;
  canonicalUnit?: string | null;
  externalPriceLabel?: string | null;
  minimumQuantity?: number | null;
  maximumQuantity?: number | null;
}): {
  code: string;
  label: string;
  quantityDelta: number | null;
  canonicalUnit: string | null;
  externalPriceLabel: string | null;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
} {
  return {
    code: option.code,
    label: option.label,
    quantityDelta: option.quantityDelta ?? null,
    canonicalUnit: option.canonicalUnit ?? null,
    externalPriceLabel: option.externalPriceLabel ?? null,
    minimumQuantity: option.minimumQuantity ?? null,
    maximumQuantity: option.maximumQuantity ?? null,
  };
}

/**
 * Map a `CustomizationGroupDto` (read off an existing menu) back to the
 * `CreateMenuCustomizationGroupInput` the writer accepts, so a STRUCTURAL edit carries it
 * forward unchanged. The edit RPC rebuilds the WHOLE component tree from the payload, so a
 * group (or any of its fields) omitted here would be DELETED — this round-trips every field
 * the DTO exposes, including the option `canonicalUnit` added for exactly this.
 */
function customizationGroupToInput(
  group: CustomizationGroupDto,
): CreateMenuCustomizationGroupInput {
  return {
    name: group.name,
    customizationType: group.customizationType,
    includedInPrice: group.includedInPrice,
    isRequired: group.isRequired,
    minimumSelections: group.minimumSelections,
    maximumSelections: group.maximumSelections,
    options: group.options.map(customizationOptionFields),
  };
}

/**
 * Load an existing `MenuDayDto` into a fresh `MenuBuilderState` so the EDIT builder opens on
 * the day's CURRENT structure — the reverse of {@link previewMenuDayFromBuilder}. Each
 * component becomes a draft keyed by its `menuComponentId`; alternatives map to their catalog
 * ids and customization groups carry forward verbatim (the edit RPC rebuilds the whole tree,
 * so anything not loaded here is dropped on save). Components are taken in `sortOrder` so the
 * rebuilt order matches what the owner already sees.
 */
export function menuBuilderStateFromMenuDay(day: MenuDayDto): MenuBuilderState {
  const components = [...day.components]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<MenuComponentDraft>((component) => ({
      key: component.menuComponentId,
      componentGroup: component.componentGroup,
      defaultCatalogItemId: component.defaultCatalogItemId,
      isRequired: component.isRequired,
      alternativeCatalogItemIds: component.alternatives.map(
        (alt) => alt.catalogItemId,
      ),
      customizationGroups: component.customizationGroups.map(
        customizationGroupToInput,
      ),
    }));
  return {
    menuDate: day.menuDate,
    cutoffAt: day.cutoffAt,
    note: day.note ?? "",
    components,
  };
}

/**
 * The `EditMenuDayInput` a STRUCTURAL edit PUTs to `/api/provider-menu-days/{id}`. Identical
 * to {@link menuBuilderStateToCreateInput} minus the immutable `menuDate` (the day's date
 * cannot change) — the full desired component tree + cutoff (+ note) REPLACE the current
 * structure. Derived from the create input so the empty-default filter + note normalization
 * live in ONE place; the edit path just drops `menuDate` (review #6).
 */
export function menuBuilderStateToEditInput(
  state: MenuBuilderState,
): EditMenuDayInput {
  const createInput = menuBuilderStateToCreateInput(state);
  return {
    cutoffAt: createInput.cutoffAt,
    note: createInput.note,
    components: createInput.components,
  };
}

/**
 * The catalog the EDIT builder should OFFER for an existing day: the active catalog PLUS any
 * item the day already references (a default or an alternative) that is no longer in the
 * active catalog — i.e. archived AFTER the day was authored. Each such item is reconstructed
 * from the day's DENORMALIZED fields and flagged `isActive: false`, so a stored-but-archived
 * selection stays VISIBLE and removable in the picker instead of silently vanishing (and the
 * builder never holds an id the UI can't show). Items still active are kept from the live
 * catalog; only genuinely-missing ones are synthesized (review #1/#2).
 */
export function editCatalog(
  active: readonly CatalogItemDto[],
  day: MenuDayDto,
): CatalogItemDto[] {
  const byId = catalogById(active);
  const augmented = [...active];
  const seen = new Set(active.map((item) => item.catalogItemId));
  const addArchived = (item: CatalogItemDto): void => {
    if (seen.has(item.catalogItemId)) return;
    seen.add(item.catalogItemId);
    augmented.push(item);
  };
  for (const component of day.components) {
    if (!byId.has(component.defaultCatalogItemId)) {
      addArchived({
        catalogItemId: component.defaultCatalogItemId,
        name: component.defaultItemName,
        componentGroup: component.componentGroup,
        canonicalUnit: component.canonicalUnit,
        defaultQuantity: component.defaultQuantity,
        imageUrl: null,
        isActive: false,
        supportsSpiceLevel: component.supportsSpiceLevel,
        supportsSaltLevel: component.supportsSaltLevel,
        allergyWarning: null,
        sourceDishId: null,
      });
    }
    for (const alt of component.alternatives) {
      if (!byId.has(alt.catalogItemId)) {
        addArchived({
          catalogItemId: alt.catalogItemId,
          name: alt.itemName,
          componentGroup: component.componentGroup,
          canonicalUnit: alt.canonicalUnit,
          defaultQuantity: alt.quantity,
          imageUrl: null,
          isActive: false,
          supportsSpiceLevel: false,
          supportsSaltLevel: false,
          allergyWarning: null,
          sourceDishId: null,
        });
      }
    }
  }
  return augmented;
}

/**
 * The alternatives to OFFER for a draft in the builder: active, same-group catalog items
 * other than the default, PLUS any currently-selected alternative that is no longer active
 * (archived after authoring) so the owner can still see and UNCHECK it. For a fresh draft
 * (no archived selections) this equals {@link eligibleAlternatives} (review #1/#2).
 */
export function alternativeChoices(
  draft: MenuComponentDraft,
  catalog: readonly CatalogItemDto[],
): CatalogItemDto[] {
  const selected = new Set(draft.alternativeCatalogItemIds);
  return catalog.filter(
    (item) =>
      item.componentGroup === draft.componentGroup &&
      item.catalogItemId !== draft.defaultCatalogItemId &&
      (item.isActive || selected.has(item.catalogItemId)),
  );
}

/**
 * True iff the builder state selects (as a default or an alternative) a catalog item NOT in
 * the active catalog — i.e. an item archived after the day was authored. Such a selection
 * must be replaced before the day can be saved (the edit RPC rejects an inactive ref), so
 * the save gate consults this in addition to completeness (review #1/#2).
 */
export function hasUnavailableSelection(
  state: MenuBuilderState,
  active: readonly CatalogItemDto[],
): boolean {
  const activeIds = new Set(active.map((item) => item.catalogItemId));
  return state.components.some(
    (component) =>
      (component.defaultCatalogItemId.length > 0 &&
        !activeIds.has(component.defaultCatalogItemId)) ||
      component.alternativeCatalogItemIds.some((id) => !activeIds.has(id)),
  );
}

/**
 * Whether a menu day can be opened in the EDIT builder — mirrors the `edit_provider_menu_day`
 * RPC gate (pmp_20): a `draft` or `published` day that is not locked, not superseded, and —
 * once published — whose cutoff is still in the FUTURE (a closed window can't be reopened;
 * a draft's past cutoff is fine because the owner fixes it in the builder). `nowMs` makes the
 * cutoff check deterministic. A locked / archived / cancelled / superseded day, or a published
 * day past its cutoff, returns false (the owner sees no Edit affordance).
 */
export function isMenuDayEditable(day: MenuDayDto, nowMs: number): boolean {
  if (day.supersededAt !== null || day.lockedAt !== null) return false;
  if (day.status !== "draft" && day.status !== "published") return false;
  if (day.status === "published") {
    const cutoffMs = Date.parse(day.cutoffAt);
    if (Number.isNaN(cutoffMs) || cutoffMs <= nowMs) return false;
  }
  return true;
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
            ...customizationOptionFields(option),
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

/** A short human label for a customization type, for the insert-issue messages. */
function customizationTypeWord(type: ProviderCustomizationType): string {
  switch (type) {
    case "single_select":
      return "single-select";
    case "boolean":
      return "yes/no";
    case "multi_select":
      return "multi-select";
    case "quantity_increment":
      return "quantity add-on";
    case "text_note":
      return "free-text";
  }
}

/**
 * The customization problems that would make the WRITE fail — a mirror of the pmp_4 DB
 * CHECKs the authoring/edit RPCs rely on (the server maps a violation to
 * `menu_incomplete`, so this is for actionable UX, not safety). Unlike
 * {@link menuBuilderIssues} (publish-completeness), these block even a DRAFT save because
 * the insert fails regardless. It mirrors the pmp_4 CHECKs ONE-FOR-ONE — no stricter:
 * a group must be named (`name_not_blank`); a `single_select`/`boolean` allows exactly
 * one selection (`single_choice_max`); a `quantity_increment` needs a finite GROUP
 * maximum (`increment_bounded`); a *required* choice group needs a minimum ≥ 1
 * (`required_has_min`); selection (`max_order`) and per-option quantity (`qty_order`)
 * maxima can't be below their minima; and every option needs a unique code
 * (`unique(group, code)`) + a non-blank code/label (`code_not_blank`/`label_not_blank`).
 * Rules that are publish-completeness only and NOT DB CHECKs — a required group having
 * ≥ 1 option, and a quantity add-on's per-option maximum — live in
 * {@link validateMenuCompleteness}, not here, so a valid-but-incomplete DRAFT still saves.
 * Returns deduped, human-readable messages in first-seen order (empty ⇒ insertable).
 */
export function customizationInsertIssues(state: MenuBuilderState): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  const add = (message: string): void => {
    if (!seen.has(message)) {
      seen.add(message);
      messages.push(message);
    }
  };

  state.components.forEach((component, ci) => {
    component.customizationGroups.forEach((group, gi) => {
      const where = `Customization ${gi + 1} on component ${ci + 1}`;
      const type = group.customizationType;
      const min = group.minimumSelections ?? 0;
      const max = group.maximumSelections ?? null;

      if ((group.name ?? "").trim().length === 0) {
        add(`${where} needs a name.`);
      }
      if (min < 0) {
        add(`${where}: minimum selections can't be negative.`);
      }
      if (max !== null && max < min) {
        add(`${where}: maximum selections can't be smaller than the minimum.`);
      }
      if (type === "quantity_increment" && max === null) {
        add(`${where}: a ${customizationTypeWord(type)} needs a maximum.`);
      }
      if ((type === "single_select" || type === "boolean") && max !== 1) {
        add(
          `${where}: a ${customizationTypeWord(type)} customization allows exactly one selection.`,
        );
      }
      // required_has_min: a required choice group needs min ≥ 1 (boolean/text_note
      // are exempt at the DB). NB: "required ⇒ has an option" is a publish rule, NOT a
      // DB CHECK, so it is deliberately NOT enforced here (review #2).
      if (
        (group.isRequired ?? false) &&
        type !== "boolean" &&
        type !== "text_note" &&
        min < 1
      ) {
        add(
          `${where}: a required customization must ask for at least one selection.`,
        );
      }

      const codes = new Set<string>();
      group.options.forEach((option, oi) => {
        const optWhere = `${where}, option ${oi + 1}`;
        if ((option.label ?? "").trim().length === 0) {
          add(`${optWhere} needs a label.`);
        }
        const code = (option.code ?? "").trim();
        if (code.length === 0) {
          add(`${optWhere} needs a code.`);
        } else if (codes.has(code)) {
          add(`${where}: option codes must be unique ("${code}" is repeated).`);
        } else {
          codes.add(code);
        }
        // qty_order: a per-option max can't be below its min. The per-option maximum
        // being PRESENT at all for a quantity add-on is a publish rule, not a DB CHECK,
        // so it is intentionally NOT enforced here (review #2).
        const omin = option.minimumQuantity ?? null;
        const omax = option.maximumQuantity ?? null;
        if (omin !== null && omax !== null && omax < omin) {
          add(
            `${optWhere}: maximum quantity can't be smaller than the minimum.`,
          );
        }
      });
    });
  });

  return messages;
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
 * A fresh-create default cutoff, MINUTE-TRUNCATED to the precision of the `datetime-local`
 * input the builder shows — so the seeded `cutoffAt` round-trips to exactly the value the
 * owner sees, never silently storing the sub-minute remainder of "now". Round-trips through
 * the SAME local⇄ISO helpers the cutoff field uses on every keystroke (review #5).
 */
export function defaultCutoffLocalIso(now: Date, hoursAhead = 8): string {
  return localDateTimeToIso(
    isoToLocalDateTime(defaultCutoffIso(now, hoursAhead)),
  );
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
