"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activeCatalog,
  addComponentDraft,
  addCustomizationGroup,
  addCustomizationOption,
  alternativeChoices,
  catalogById,
  changeComponentDefault,
  changeCustomizationType,
  customizationInsertIssues,
  hasUnavailableSelection,
  isMenuBuilderCreatable,
  isoToLocalDateTime,
  localDateTimeToIso,
  MENU_REVISION_WARNING,
  menuBuilderIssues,
  menuBuilderStateToCreateInput,
  menuBuilderStateToEditInput,
  patchComponentDraft,
  patchCustomizationGroup,
  patchCustomizationOption,
  PROVIDER_COMPONENT_GROUP_OPTIONS,
  PROVIDER_CUSTOMIZATION_TYPE_OPTIONS,
  providerComponentGroupLabel,
  removeComponentDraft,
  removeCustomizationGroup,
  removeCustomizationOption,
  summarizeMenuIssues,
  toggleComponentAlternative,
  type CatalogItemDto,
  type CreateMenuCustomizationGroupInput,
  type MenuBuilderState,
  type MenuComponentDraft,
  type ProviderCustomizationType,
} from "@/packages/shared/provider";

import { createMenuDay, reviseMenuDay } from "./menu-client";

/**
 * Structured menu-day builder (MP-B-030, UC-MENU-001/002/004/005). NO free-form JSON — the
 * owner picks a date + cutoff, then adds component slots, each a default dish from the
 * catalog plus optional same-group swaps and a "required" flag. The live completeness panel
 * reuses the SHARED `menuBuilderIssues` (the #84 validator), so what it says about
 * "publishable" is exactly what the publish gate will decide.
 *
 * Two modes:
 *   • `create` — authors a brand-new DRAFT (`createMenuDay`, POST). A draft may be saved
 *     incomplete (publishing is a separate step on the list once it's complete).
 *   • `edit`   — a STRUCTURAL edit of an existing day (`reviseMenuDay`, PUT; ADR-7 = REVISION).
 *     The date is immutable, so it shows read-only; editing a PUBLISHED day with member
 *     responses creates a new revision and asks them to re-confirm (the consequence banner).
 *     The edit RPC enforces a future cutoff + valid catalog refs, so an edit saves only when
 *     the menu is PUBLISHABLE — the owner can't leave a live menu incomplete.
 *
 * Customization-group authoring + the note-only PATCH are the remainder of #22.
 */

/** Catalog items grouped into the natural plate order for the default-dish picker. */
function groupedCatalog(
  catalog: CatalogItemDto[],
): { label: string; items: CatalogItemDto[] }[] {
  return PROVIDER_COMPONENT_GROUP_OPTIONS.map((group) => ({
    label: group.label,
    items: catalog.filter((item) => item.componentGroup === group.value),
  })).filter((g) => g.items.length > 0);
}

export function MenuBuilderForm({
  providerId,
  catalog,
  mode,
  menuDayId,
  initialState,
  showRevisionWarning = false,
  requirePublishable = false,
  now,
  onSaved,
  onCancel,
}: {
  providerId: string;
  /** Catalog the builder can place. For an `edit` it also carries any archived item the
   *  day still references (flagged `isActive: false`) so a stored selection stays visible. */
  catalog: CatalogItemDto[];
  /** `create` authors a new draft (POST); `edit` revises an existing day (PUT). */
  mode: "create" | "edit";
  /** The day being edited — required in `edit` mode (the PUT target). */
  menuDayId?: string;
  /** The builder's starting state — an empty day for `create`, the loaded day for `edit`. */
  initialState: MenuBuilderState;
  /** Show the revision/re-confirm consequence banner (editing a PUBLISHED day). */
  showRevisionWarning?: boolean;
  /** Require the day to be fully PUBLISHABLE before saving (editing a PUBLISHED day). A
   *  draft edit (or a create) saves with the looser `creatable` gate, matching the server. */
  requirePublishable?: boolean;
  /** Epoch ms "now" for the completeness/cutoff check (the page passes a fresh value). */
  now: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = mode === "edit";
  const [state, setState] = useState<MenuBuilderState>(initialState);
  const [cutoffLocal, setCutoffLocal] = useState(() =>
    isoToLocalDateTime(initialState.cutoffAt),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The catalog the owner can ADD/PLACE is active only; the picker additionally surfaces an
  // already-selected archived item so it can be replaced/unchecked (review #1/#2).
  const active = useMemo(() => activeCatalog(catalog), [catalog]);
  const byId = useMemo(() => catalogById(catalog), [catalog]);
  const activeIds = useMemo(
    () => new Set(active.map((item) => item.catalogItemId)),
    [active],
  );
  const groups = groupedCatalog(active);

  // Compute the completeness issues ONCE; `publishable` is just "no issues" (review #10).
  const issues = menuBuilderIssues(state, active, new Date(now));
  const publishable = issues.length === 0;
  const creatable = isMenuBuilderCreatable(state);
  // A selection (default/alt) that's been archived must be replaced before saving — the
  // edit RPC rejects an inactive ref (review #1/#2).
  const unavailable = hasUnavailableSelection(state, active);
  // A malformed customization (the pmp_4 DB CHECKs) blocks even a DRAFT save — the write
  // would fail regardless of publishability.
  const custIssues = customizationInsertIssues(state);
  // Create / draft-edit can save an incomplete DRAFT (publish later); editing a PUBLISHED
  // day must keep it PUBLISHABLE. Either way an archived selection or a malformed
  // customization blocks the save, and an edit with no target id never falls through to a
  // create (review #3/#4).
  const canSave =
    (requirePublishable ? publishable : creatable) &&
    !unavailable &&
    custIssues.length === 0 &&
    !(isEdit && !menuDayId);

  function patch(next: Partial<MenuBuilderState>) {
    setState((prev) => ({ ...prev, ...next }));
  }

  // All component transitions go through the shared pure reducers (see
  // menu-builder.ts) so web + mobile stay in lockstep and key generation is render-
  // timing-safe.
  function patchComponent(key: string, next: Partial<MenuComponentDraft>) {
    setState((prev) => patchComponentDraft(prev, key, next));
  }

  function addComponent() {
    setState((prev) => addComponentDraft(prev, active));
  }

  function removeComponent(key: string) {
    setState((prev) => removeComponentDraft(prev, key));
  }

  function changeDefault(key: string, catalogItemId: string) {
    setState((prev) =>
      changeComponentDefault(prev, key, catalogItemId, catalog),
    );
  }

  function toggleAlternative(key: string, altId: string) {
    setState((prev) => toggleComponentAlternative(prev, key, altId));
  }

  // Customization-group transitions — bound to a component key, all through the shared
  // pure reducers so web + mobile author the SAME structure with the same normalization.
  function addGroup(key: string) {
    setState((prev) => addCustomizationGroup(prev, key));
  }
  function removeGroup(key: string, gi: number) {
    setState((prev) => removeCustomizationGroup(prev, key, gi));
  }
  function patchGroup(
    key: string,
    gi: number,
    patch: Partial<
      Omit<CreateMenuCustomizationGroupInput, "customizationType">
    >,
  ) {
    setState((prev) => patchCustomizationGroup(prev, key, gi, patch));
  }
  function changeType(
    key: string,
    gi: number,
    type: ProviderCustomizationType,
  ) {
    setState((prev) => changeCustomizationType(prev, key, gi, type));
  }
  function addOption(key: string, gi: number) {
    setState((prev) => addCustomizationOption(prev, key, gi));
  }
  function removeOption(key: string, gi: number, oi: number) {
    setState((prev) => removeCustomizationOption(prev, key, gi, oi));
  }
  function patchOption(
    key: string,
    gi: number,
    oi: number,
    patch: Partial<CreateMenuCustomizationGroupInput["options"][number]>,
  ) {
    setState((prev) => patchCustomizationOption(prev, key, gi, oi, patch));
  }

  async function submit() {
    // An edit MUST target an existing day — never silently fall through to a create, which
    // would try to author a duplicate day for the (immutable) date (review #4).
    if (isEdit && !menuDayId) {
      setError("Couldn't save the menu — the day to edit is missing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit && menuDayId) {
        await reviseMenuDay(menuDayId, menuBuilderStateToEditInput(state));
      } else {
        await createMenuDay(providerId, menuBuilderStateToCreateInput(state));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the menu.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? `Edit menu — ${state.menuDate}` : "New menu day"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {showRevisionWarning ? (
          <p
            className="rounded-md border border-saffron/40 bg-saffron/10 px-3 py-2 text-sm text-muted-foreground"
            data-testid="menu-revision-warning"
          >
            {MENU_REVISION_WARNING}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="menu-date">Menu date</Label>
            <Input
              id="menu-date"
              type="date"
              value={state.menuDate}
              disabled={isEdit}
              onChange={(e) => patch({ menuDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="menu-cutoff">Response cutoff</Label>
            <Input
              id="menu-cutoff"
              type="datetime-local"
              value={cutoffLocal}
              onChange={(e) => {
                setCutoffLocal(e.target.value);
                patch({ cutoffAt: localDateTimeToIso(e.target.value) });
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="menu-note">Note (optional)</Label>
          <Textarea
            id="menu-note"
            value={state.note}
            maxLength={500}
            placeholder="A note shown to members for this day's menu."
            onChange={(e) => patch({ note: e.target.value })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Components</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addComponent}
            >
              <Plus /> Add component
            </Button>
          </div>

          {state.components.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add at least one component (a dish slot) to build the menu.
            </p>
          ) : (
            state.components.map((component, index) => {
              const alts = alternativeChoices(component, catalog);
              // An archived default (no longer active) is kept VISIBLE as a flagged option so
              // the owner sees what's stored and must replace it before saving (review #1/#2).
              const defaultArchived =
                component.defaultCatalogItemId.length > 0 &&
                !activeIds.has(component.defaultCatalogItemId);
              return (
                <div
                  key={component.key}
                  className="space-y-3 rounded-lg border border-border p-4"
                  data-testid="menu-component"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor={`default-${component.key}`}>
                        Default dish (
                        {providerComponentGroupLabel(component.componentGroup)})
                      </Label>
                      <select
                        id={`default-${component.key}`}
                        aria-label={`Default dish for component ${index + 1}`}
                        value={component.defaultCatalogItemId}
                        onChange={(e) =>
                          changeDefault(component.key, e.target.value)
                        }
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                      >
                        {defaultArchived ? (
                          <option value={component.defaultCatalogItemId}>
                            {byId.get(component.defaultCatalogItemId)?.name ??
                              "Unknown dish"}{" "}
                            (unavailable)
                          </option>
                        ) : null}
                        {groups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((item) => (
                              <option
                                key={item.catalogItemId}
                                value={item.catalogItemId}
                              >
                                {item.name} · {item.defaultQuantity}{" "}
                                {item.canonicalUnit}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove component ${index + 1}`}
                      onClick={() => removeComponent(component.key)}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={component.isRequired}
                      onChange={(e) =>
                        patchComponent(component.key, {
                          isRequired: e.target.checked,
                        })
                      }
                    />
                    Required (every member gets this slot)
                  </label>

                  {alts.length > 0 ? (
                    <fieldset className="space-y-1.5">
                      <legend className="text-xs font-medium text-muted-foreground">
                        Alternatives members can swap to
                      </legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {alts.map((alt) => (
                          <label
                            key={alt.catalogItemId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={component.alternativeCatalogItemIds.includes(
                                alt.catalogItemId,
                              )}
                              onChange={() =>
                                toggleAlternative(
                                  component.key,
                                  alt.catalogItemId,
                                )
                              }
                            />
                            {alt.name}
                            {alt.isActive ? "" : " (unavailable)"}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <CustomizationGroupsEditor
                    component={component}
                    onAddGroup={() => addGroup(component.key)}
                    onRemoveGroup={(gi) => removeGroup(component.key, gi)}
                    onPatchGroup={(gi, patch) =>
                      patchGroup(component.key, gi, patch)
                    }
                    onChangeType={(gi, type) =>
                      changeType(component.key, gi, type)
                    }
                    onAddOption={(gi) => addOption(component.key, gi)}
                    onRemoveOption={(gi, oi) =>
                      removeOption(component.key, gi, oi)
                    }
                    onPatchOption={(gi, oi, patch) =>
                      patchOption(component.key, gi, oi, patch)
                    }
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Malformed customizations block even a draft save (the write would fail). */}
        {custIssues.length > 0 ? (
          <div
            className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-3"
            data-testid="menu-customization-issues"
          >
            <p className="text-sm font-medium text-destructive">
              Fix these customizations before saving
            </p>
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              {custIssues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Live completeness — what the publish gate will see. */}
        {(creatable || unavailable) && !publishable ? (
          <div
            className="space-y-1.5 rounded-md border border-saffron/40 bg-saffron/10 p-3"
            data-testid="menu-completeness"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="marigold">Not publishable yet</Badge>
            </p>
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              {summarizeMenuIssues(issues).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {unavailable ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="menu-unavailable-selection"
              >
                One or more selected dishes are no longer available — replace
                them before saving.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {requirePublishable
                ? "Fix these before saving — a published menu must stay complete."
                : "You can still save this as a draft and finish it later."}
            </p>
          </div>
        ) : null}
        {creatable && publishable ? (
          <p className="text-sm">
            <Badge variant="emerald">
              {isEdit ? "Ready to save" : "Ready to publish"}
            </Badge>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={submit} disabled={!canSave || busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Parse a numeric text field to a number, or `null` when blank/invalid (the wire shape). */
function numOrNull(value: string): number | null {
  if (value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** A customization type that takes a min/max selection count (vs. fixed-one or free-text). */
function showsSelectionBounds(type: ProviderCustomizationType): boolean {
  return type === "multi_select" || type === "quantity_increment";
}

/**
 * The per-component customization-group authoring UI (MP-B-030). Each group is a named
 * set of options of one {@link ProviderCustomizationType}; the type drives which fields
 * show (selection bounds for multi/quantity, per-option quantity fields for a quantity
 * add-on, no options for a free-text note). All edits go through the shared pure reducers
 * via the bound callbacks, so the normalization (single-choice ⇒ max 1, etc.) is identical
 * to mobile. Groups/options are addressed by array index.
 */
function CustomizationGroupsEditor({
  component,
  onAddGroup,
  onRemoveGroup,
  onPatchGroup,
  onChangeType,
  onAddOption,
  onRemoveOption,
  onPatchOption,
}: {
  component: MenuComponentDraft;
  onAddGroup: () => void;
  onRemoveGroup: (groupIndex: number) => void;
  onPatchGroup: (
    groupIndex: number,
    patch: Partial<
      Omit<CreateMenuCustomizationGroupInput, "customizationType">
    >,
  ) => void;
  onChangeType: (groupIndex: number, type: ProviderCustomizationType) => void;
  onAddOption: (groupIndex: number) => void;
  onRemoveOption: (groupIndex: number, optionIndex: number) => void;
  onPatchOption: (
    groupIndex: number,
    optionIndex: number,
    patch: Partial<CreateMenuCustomizationGroupInput["options"][number]>,
  ) => void;
}) {
  const groups = component.customizationGroups;
  return (
    <fieldset className="space-y-3" data-testid="customizations">
      <div className="flex items-center justify-between">
        <legend className="text-xs font-medium text-muted-foreground">
          Customizations (extras members can choose)
        </legend>
        <Button type="button" variant="outline" size="sm" onClick={onAddGroup}>
          <Plus /> Add customization
        </Button>
      </div>

      {groups.map((group, gi) => {
        const showOptions = group.customizationType !== "text_note";
        const showQty = group.customizationType === "quantity_increment";
        return (
          <div
            key={gi}
            className="space-y-2.5 rounded-md border border-border/70 bg-muted/30 p-3"
            data-testid="customization-group"
          >
            <div className="flex items-start gap-2">
              <Input
                aria-label="Customization name"
                placeholder="e.g. Sauce, Extra roti"
                value={group.name}
                maxLength={80}
                onChange={(e) => onPatchGroup(gi, { name: e.target.value })}
              />
              <select
                aria-label="Customization type"
                value={group.customizationType}
                onChange={(e) =>
                  onChangeType(gi, e.target.value as ProviderCustomizationType)
                }
                className="h-10 rounded-lg border border-border bg-card px-2 text-sm"
              >
                {PROVIDER_CUSTOMIZATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove customization ${gi + 1}`}
                onClick={() => onRemoveGroup(gi)}
              >
                <Trash2 />
              </Button>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={group.includedInPrice ?? true}
                  onChange={(e) =>
                    onPatchGroup(gi, { includedInPrice: e.target.checked })
                  }
                />
                Included in price
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={group.isRequired ?? false}
                  onChange={(e) =>
                    onPatchGroup(gi, { isRequired: e.target.checked })
                  }
                />
                Required
              </label>
            </div>

            {showsSelectionBounds(group.customizationType) ? (
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Min selections</Label>
                  <Input
                    aria-label="Minimum selections"
                    type="number"
                    min={0}
                    className="w-28"
                    value={group.minimumSelections ?? 0}
                    onChange={(e) =>
                      onPatchGroup(gi, {
                        minimumSelections: numOrNull(e.target.value) ?? 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max selections</Label>
                  <Input
                    aria-label="Maximum selections"
                    type="number"
                    min={0}
                    className="w-28"
                    placeholder={
                      group.customizationType === "multi_select"
                        ? "no limit"
                        : ""
                    }
                    value={group.maximumSelections ?? ""}
                    onChange={(e) =>
                      onPatchGroup(gi, {
                        maximumSelections: numOrNull(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            {showOptions ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Options
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAddOption(gi)}
                  >
                    <Plus /> Add option
                  </Button>
                </div>
                {group.options.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add at least one option members can pick.
                  </p>
                ) : (
                  group.options.map((option, oi) => (
                    <div
                      key={oi}
                      className="flex flex-wrap items-end gap-2 rounded border border-border/60 bg-card p-2"
                      data-testid="customization-option"
                    >
                      <Input
                        aria-label={`Option ${oi + 1} label`}
                        placeholder="Label (e.g. Mint chutney)"
                        className="min-w-40 flex-1"
                        value={option.label}
                        maxLength={80}
                        onChange={(e) =>
                          onPatchOption(gi, oi, { label: e.target.value })
                        }
                      />
                      <Input
                        aria-label={`Option ${oi + 1} price label`}
                        placeholder="Price (e.g. +$2)"
                        className="w-28"
                        value={option.externalPriceLabel ?? ""}
                        onChange={(e) =>
                          onPatchOption(gi, oi, {
                            externalPriceLabel:
                              e.target.value.trim().length > 0
                                ? e.target.value
                                : null,
                          })
                        }
                      />
                      {showQty ? (
                        <>
                          <Input
                            aria-label={`Option ${oi + 1} quantity delta`}
                            type="number"
                            placeholder="+qty"
                            className="w-24"
                            value={option.quantityDelta ?? ""}
                            onChange={(e) =>
                              onPatchOption(gi, oi, {
                                quantityDelta: numOrNull(e.target.value),
                              })
                            }
                          />
                          <Input
                            aria-label={`Option ${oi + 1} unit`}
                            placeholder="unit"
                            className="w-24"
                            value={option.canonicalUnit ?? ""}
                            onChange={(e) =>
                              onPatchOption(gi, oi, {
                                canonicalUnit:
                                  e.target.value.trim().length > 0
                                    ? e.target.value
                                    : null,
                              })
                            }
                          />
                          <Input
                            aria-label={`Option ${oi + 1} max quantity`}
                            type="number"
                            placeholder="max"
                            className="w-24"
                            value={option.maximumQuantity ?? ""}
                            onChange={(e) =>
                              onPatchOption(gi, oi, {
                                maximumQuantity: numOrNull(e.target.value),
                              })
                            }
                          />
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove option ${oi + 1}`}
                        onClick={() => onRemoveOption(gi, oi)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Members type a free-text note for this customization.
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
