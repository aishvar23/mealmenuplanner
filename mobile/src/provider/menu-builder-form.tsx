import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import {
  activeCatalog,
  addComponentDraft,
  alternativeChoices,
  catalogById,
  changeComponentDefault,
  hasUnavailableSelection,
  isMenuBuilderCreatable,
  isoToLocalDateTime,
  localDateTimeToIso,
  MENU_REVISION_WARNING,
  menuBuilderIssues,
  patchComponentDraft,
  providerComponentGroupLabel,
  removeComponentDraft,
  summarizeMenuIssues,
  type CatalogItemDto,
  type MenuBuilderState,
  type MenuComponentDraft,
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
  // Create / draft-edit can save an incomplete DRAFT; editing a PUBLISHED day must keep it
  // PUBLISHABLE. An archived selection blocks the save either way (review #3/#1/#2).
  const canSave =
    (requirePublishable ? publishable : creatable) && !unavailable;

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
