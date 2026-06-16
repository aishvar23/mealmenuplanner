import { useMemo, useState } from "react";
import { Text, View } from "react-native";

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
  patchComponentDraft,
  patchCustomizationGroup,
  patchCustomizationOption,
  PROVIDER_CUSTOMIZATION_TYPE_OPTIONS,
  providerComponentGroupLabel,
  removeComponentDraft,
  removeCustomizationGroup,
  removeCustomizationOption,
  summarizeMenuIssues,
  type CatalogItemDto,
  type CreateMenuCustomizationGroupInput,
  type MenuBuilderState,
  type MenuComponentDraft,
  type ProviderCustomizationType,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";

/**
 * Structured menu-day builder (MP-C-030, the mobile twin of the web MenuBuilderForm,
 * UC-MENU-001/002/004/005). No free-form JSON: the owner sets a date + cutoff, then adds
 * component slots — each a default dish from the catalog plus same-group swaps and a
 * "required" flag. The live completeness panel reuses the SHARED `menuBuilderIssues`
 * (the #84 validator), so "publishable" matches what the publish gate decides.
 *
 * Two modes mirror the web form: `create` authors a new DRAFT (saveable incomplete), `edit`
 * STRUCTURALLY edits an existing day (ADR-7 = REVISION; the immutable date is read-only, and
 * an edit saves only when PUBLISHABLE so a live menu can't be left incomplete). Emits the
 * working `MenuBuilderState` — the screen maps it to the create/edit input + the right
 * mutation. Shares no UI code with web — same `/api/*` routes, same `@mmp/shared/provider`.
 */
export function MenuBuilderForm({
  catalog,
  mode,
  initialState,
  showRevisionWarning = false,
  requirePublishable = false,
  now,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  /** Catalog the builder can place. For an `edit` it also carries any archived item the
   *  day still references (flagged `isActive: false`) so a stored selection stays visible. */
  catalog: CatalogItemDto[];
  mode: "create" | "edit";
  initialState: MenuBuilderState;
  showRevisionWarning?: boolean;
  /** Require the day to be fully PUBLISHABLE before saving (editing a PUBLISHED day); a
   *  draft edit / create saves with the looser `creatable` gate, matching the server. */
  requirePublishable?: boolean;
  now: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (state: MenuBuilderState) => void;
  onCancel: () => void;
}) {
  const isEdit = mode === "edit";
  const [cutoffLocal, setCutoffLocal] = useState(() =>
    isoToLocalDateTime(initialState.cutoffAt),
  );
  const [state, setState] = useState<MenuBuilderState>(initialState);

  // The catalog the owner can ADD/PLACE is active only; the picker additionally surfaces an
  // already-selected archived item so it can be replaced/unchecked (review #1/#2).
  const active = useMemo(() => activeCatalog(catalog), [catalog]);
  const byId = useMemo(() => catalogById(catalog), [catalog]);
  const activeIds = useMemo(
    () => new Set(active.map((item) => item.catalogItemId)),
    [active],
  );

  // Compute the completeness issues ONCE; `publishable` is just "no issues" (review #10).
  const issues = menuBuilderIssues(state, active, new Date(now));
  const publishable = issues.length === 0;
  const creatable = isMenuBuilderCreatable(state);
  // An archived selection (default/alt) must be replaced before saving (review #1/#2).
  const unavailable = hasUnavailableSelection(state, active);
  // A malformed customization (the pmp_4 DB CHECKs) blocks even a DRAFT save.
  const custIssues = customizationInsertIssues(state);
  // Create / draft-edit can save an incomplete DRAFT; editing a PUBLISHED day must keep it
  // PUBLISHABLE. An archived selection or a malformed customization blocks the save either
  // way (review #3/#1/#2).
  const canSave =
    (requirePublishable ? publishable : creatable) &&
    !unavailable &&
    custIssues.length === 0;

  // All component transitions go through the shared pure reducers (see
  // menu-builder.ts) so web + mobile stay in lockstep and the new key is derived from
  // the prior state — a rapid double "Add" can never mint a duplicate key.
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

  // Customization-group transitions — bound per component key, all through the shared pure
  // reducers so web + mobile author the SAME structure with the same normalization.
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

  return (
    <View className="gap-4 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-base font-semibold text-gray-900">
        {isEdit ? `Edit menu · ${state.menuDate}` : "New menu day"}
      </Text>

      {error ? <ErrorBanner message={error} /> : null}

      {showRevisionWarning ? (
        <View className="gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm text-amber-800">
            {MENU_REVISION_WARNING}
          </Text>
        </View>
      ) : null}

      <TextField
        label="Menu date (YYYY-MM-DD)"
        value={state.menuDate}
        editable={!isEdit}
        autoCapitalize="none"
        onChangeText={(menuDate) => setState((prev) => ({ ...prev, menuDate }))}
      />
      <TextField
        label="Response cutoff (YYYY-MM-DDTHH:mm)"
        value={cutoffLocal}
        autoCapitalize="none"
        onChangeText={(value) => {
          setCutoffLocal(value);
          setState((prev) => ({
            ...prev,
            cutoffAt: localDateTimeToIso(value),
          }));
        }}
      />
      <TextField
        label="Note (optional)"
        value={state.note}
        maxLength={500}
        onChangeText={(note) => setState((prev) => ({ ...prev, note }))}
      />

      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-900">
            Components
          </Text>
          <Button label="Add" variant="secondary" onPress={addComponent} />
        </View>

        {state.components.length === 0 ? (
          <Text className="text-sm text-gray-500">
            Add at least one component (a dish slot) to build the menu.
          </Text>
        ) : (
          state.components.map((component) => {
            const alts = alternativeChoices(component, catalog);
            // An archived default (no longer active) stays VISIBLE as a flagged chip so the
            // owner sees what's stored and must replace it before saving (review #1/#2).
            const defaultArchived =
              component.defaultCatalogItemId.length > 0 &&
              !activeIds.has(component.defaultCatalogItemId);
            const defaultOptions = [
              ...active.map((item) => ({
                value: item.catalogItemId,
                label: `${item.name} · ${item.defaultQuantity} ${item.canonicalUnit}`,
              })),
              ...(defaultArchived
                ? [
                    {
                      value: component.defaultCatalogItemId,
                      label: `${byId.get(component.defaultCatalogItemId)?.name ?? "Unknown dish"} (unavailable)`,
                    },
                  ]
                : []),
            ];
            return (
              <View
                key={component.key}
                className="gap-3 rounded-lg border border-gray-200 p-3"
              >
                <Text className="text-xs font-medium text-gray-500">
                  Default dish ·{" "}
                  {providerComponentGroupLabel(component.componentGroup)}
                </Text>
                <SelectChips
                  mode="single"
                  options={defaultOptions}
                  selected={[component.defaultCatalogItemId]}
                  onChange={(next) => {
                    if (next[0]) changeDefault(component.key, next[0]);
                  }}
                />

                <SelectChips
                  mode="multi"
                  options={[{ value: "required", label: "Required" }]}
                  selected={component.isRequired ? ["required"] : []}
                  onChange={(next) =>
                    patchComponent(component.key, {
                      isRequired: next.includes("required"),
                    })
                  }
                />

                {alts.length > 0 ? (
                  <View className="gap-1.5">
                    <Text className="text-xs font-medium text-gray-500">
                      Alternatives members can swap to
                    </Text>
                    <SelectChips
                      mode="multi"
                      options={alts.map((alt) => ({
                        value: alt.catalogItemId,
                        label: alt.isActive
                          ? alt.name
                          : `${alt.name} (unavailable)`,
                      }))}
                      selected={component.alternativeCatalogItemIds}
                      onChange={(next) =>
                        patchComponent(component.key, {
                          alternativeCatalogItemIds: next,
                        })
                      }
                    />
                  </View>
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

                <Button
                  label="Remove component"
                  variant="danger"
                  onPress={() => removeComponent(component.key)}
                />
              </View>
            );
          })
        )}
      </View>

      {custIssues.length > 0 ? (
        <View className="gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3">
          <Text className="text-sm font-semibold text-red-700">
            Fix these customizations before saving
          </Text>
          {custIssues.map((message) => (
            <Text key={message} className="text-sm text-red-600">
              • {message}
            </Text>
          ))}
        </View>
      ) : null}

      {(creatable || unavailable) && !publishable ? (
        <View className="gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm font-semibold text-amber-800">
            Not publishable yet
          </Text>
          {summarizeMenuIssues(issues).map((message) => (
            <Text key={message} className="text-sm text-amber-700">
              • {message}
            </Text>
          ))}
          {unavailable ? (
            <Text className="text-xs text-amber-700">
              One or more selected dishes are no longer available — replace them
              before saving.
            </Text>
          ) : null}
          <Text className="text-xs text-amber-700">
            {requirePublishable
              ? "Fix these before saving — a published menu must stay complete."
              : "You can still save this as a draft and finish it later."}
          </Text>
        </View>
      ) : null}
      {creatable && publishable ? (
        <Text className="text-sm font-medium text-green-700">
          {isEdit ? "Ready to save" : "Ready to publish"}
        </Text>
      ) : null}

      <Button
        label={isEdit ? "Save changes" : "Save draft"}
        onPress={() => onSubmit(state)}
        disabled={!canSave}
        loading={submitting}
      />
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}

/** Render a nullable number as the string the TextField shows (`""` for null). */
function numStr(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Parse a numeric TextField back to a number, or `null` when blank/invalid (the wire shape). */
function numOrNull(value: string): number | null {
  if (value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Does this customization type take a min/max selection count (vs. fixed-one or free-text)? */
function showsSelectionBounds(type: ProviderCustomizationType): boolean {
  return type === "multi_select" || type === "quantity_increment";
}

/**
 * The per-component customization-group authoring UI (MP-C-030, the mobile twin of the web
 * CustomizationGroupsEditor). Each group is a named set of options of one
 * {@link ProviderCustomizationType}; the type drives which fields show. All edits go through
 * the shared pure reducers via the bound callbacks, so the normalization matches web exactly.
 * Groups/options are addressed by array index.
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
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-gray-500">
          Customizations (extras members can choose)
        </Text>
        <Button
          label="Add customization"
          variant="secondary"
          onPress={onAddGroup}
        />
      </View>

      {component.customizationGroups.map((group, gi) => {
        const showOptions = group.customizationType !== "text_note";
        const showQty = group.customizationType === "quantity_increment";
        return (
          <View
            key={gi}
            className="gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <TextField
              label={`Customization ${gi + 1} name`}
              placeholder="e.g. Sauce, Extra roti"
              value={group.name}
              maxLength={80}
              onChangeText={(name) => onPatchGroup(gi, { name })}
            />
            <Text className="text-xs font-medium text-gray-500">Type</Text>
            <SelectChips
              mode="single"
              options={PROVIDER_CUSTOMIZATION_TYPE_OPTIONS}
              selected={[group.customizationType]}
              onChange={(next) => {
                if (next[0]) onChangeType(gi, next[0]);
              }}
            />

            <SelectChips
              mode="multi"
              options={[
                { value: "included", label: "Included in price" },
                { value: "required", label: "Required" },
              ]}
              selected={[
                ...((group.includedInPrice ?? true) ? ["included"] : []),
                ...((group.isRequired ?? false) ? ["required"] : []),
              ]}
              onChange={(next) =>
                onPatchGroup(gi, {
                  includedInPrice: next.includes("included"),
                  isRequired: next.includes("required"),
                })
              }
            />

            {showsSelectionBounds(group.customizationType) ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Min selections"
                    keyboardType="numeric"
                    value={numStr(group.minimumSelections)}
                    onChangeText={(v) =>
                      onPatchGroup(gi, { minimumSelections: numOrNull(v) ?? 0 })
                    }
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label="Max selections"
                    keyboardType="numeric"
                    value={numStr(group.maximumSelections)}
                    onChangeText={(v) =>
                      onPatchGroup(gi, { maximumSelections: numOrNull(v) })
                    }
                  />
                </View>
              </View>
            ) : null}

            {showOptions ? (
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-medium text-gray-500">
                    Options
                  </Text>
                  <Button
                    label="Add option"
                    variant="secondary"
                    onPress={() => onAddOption(gi)}
                  />
                </View>
                {group.options.length === 0 ? (
                  <Text className="text-xs text-gray-500">
                    Add at least one option members can pick.
                  </Text>
                ) : (
                  group.options.map((option, oi) => (
                    <View
                      key={oi}
                      className="gap-2 rounded-lg border border-gray-200 bg-white p-2"
                    >
                      <TextField
                        label={`Option ${oi + 1} label`}
                        placeholder="Label (e.g. Mint chutney)"
                        value={option.label}
                        maxLength={80}
                        onChangeText={(label) =>
                          onPatchOption(gi, oi, { label })
                        }
                      />
                      <TextField
                        label="Price label (optional)"
                        value={option.externalPriceLabel ?? ""}
                        onChangeText={(v) =>
                          onPatchOption(gi, oi, {
                            externalPriceLabel: v.trim().length > 0 ? v : null,
                          })
                        }
                      />
                      {showQty ? (
                        <View className="flex-row gap-2">
                          <View className="flex-1">
                            <TextField
                              label="+Qty"
                              keyboardType="numeric"
                              value={numStr(option.quantityDelta)}
                              onChangeText={(v) =>
                                onPatchOption(gi, oi, {
                                  quantityDelta: numOrNull(v),
                                })
                              }
                            />
                          </View>
                          <View className="flex-1">
                            <TextField
                              label="Unit"
                              autoCapitalize="none"
                              value={option.canonicalUnit ?? ""}
                              onChangeText={(v) =>
                                onPatchOption(gi, oi, {
                                  canonicalUnit: v.trim().length > 0 ? v : null,
                                })
                              }
                            />
                          </View>
                          <View className="flex-1">
                            <TextField
                              label="Max qty"
                              keyboardType="numeric"
                              value={numStr(option.maximumQuantity)}
                              onChangeText={(v) =>
                                onPatchOption(gi, oi, {
                                  maximumQuantity: numOrNull(v),
                                })
                              }
                            />
                          </View>
                        </View>
                      ) : null}
                      <Button
                        label="Remove option"
                        variant="ghost"
                        onPress={() => onRemoveOption(gi, oi)}
                      />
                    </View>
                  ))
                )}
              </View>
            ) : (
              <Text className="text-xs text-gray-500">
                Members type a free-text note for this customization.
              </Text>
            )}

            <Button
              label="Remove customization"
              variant="ghost"
              onPress={() => onRemoveGroup(gi)}
            />
          </View>
        );
      })}
    </View>
  );
}
