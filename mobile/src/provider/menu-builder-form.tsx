import { useState } from "react";
import { Text, View } from "react-native";

import {
  addComponentDraft,
  changeComponentDefault,
  eligibleAlternatives,
  isMenuBuilderCreatable,
  isMenuBuilderPublishable,
  localDateTimeToIso,
  menuBuilderIssues,
  menuBuilderStateToCreateInput,
  patchComponentDraft,
  providerComponentGroupLabel,
  removeComponentDraft,
  summarizeMenuIssues,
  type CatalogItemDto,
  type CreateMenuDayInput,
  type MenuBuilderState,
  type MenuComponentDraft,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";

/**
 * Structured menu-day builder (MP-C-030, the mobile twin of the web MenuBuilderForm,
 * UC-MENU-001/002). No free-form JSON: the owner sets a date + cutoff, then adds
 * component slots — each a default dish from the catalog plus same-group swaps and a
 * "required" flag. The live completeness panel reuses the SHARED `menuBuilderIssues`
 * (the #84 validator), so "publishable" matches what the publish gate decides. Submit
 * authors a DRAFT; publishing is a separate action on the menu list. Shares no UI code
 * with web — same `/api/*` routes, same `@mmp/shared/provider` model.
 */
export function MenuBuilderForm({
  catalog,
  defaultMenuDate,
  defaultCutoffLocal,
  now,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  catalog: CatalogItemDto[];
  defaultMenuDate: string;
  defaultCutoffLocal: string;
  now: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateMenuDayInput) => void;
  onCancel: () => void;
}) {
  const [cutoffLocal, setCutoffLocal] = useState(defaultCutoffLocal);
  const [state, setState] = useState<MenuBuilderState>({
    menuDate: defaultMenuDate,
    cutoffAt: localDateTimeToIso(defaultCutoffLocal),
    note: "",
    components: [],
  });

  const issues = menuBuilderIssues(state, catalog, new Date(now));
  const creatable = isMenuBuilderCreatable(state);
  const publishable = isMenuBuilderPublishable(state, catalog, new Date(now));

  // All component transitions go through the shared pure reducers (see
  // menu-builder.ts) so web + mobile stay in lockstep and the new key is derived from
  // the prior state — a rapid double "Add" can never mint a duplicate key.
  function patchComponent(key: string, next: Partial<MenuComponentDraft>) {
    setState((prev) => patchComponentDraft(prev, key, next));
  }

  function addComponent() {
    setState((prev) => addComponentDraft(prev, catalog));
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
        New menu day
      </Text>

      {error ? <ErrorBanner message={error} /> : null}

      <TextField
        label="Menu date (YYYY-MM-DD)"
        value={state.menuDate}
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
            const alts = eligibleAlternatives(component, catalog);
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
                  options={catalog.map((item) => ({
                    value: item.catalogItemId,
                    label: `${item.name} · ${item.defaultQuantity} ${item.canonicalUnit}`,
                  }))}
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
                        label: alt.name,
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

      {creatable && !publishable ? (
        <View className="gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm font-semibold text-amber-800">
            Not publishable yet
          </Text>
          {summarizeMenuIssues(issues).map((message) => (
            <Text key={message} className="text-sm text-amber-700">
              • {message}
            </Text>
          ))}
          <Text className="text-xs text-amber-700">
            You can still save this as a draft and finish it later.
          </Text>
        </View>
      ) : null}
      {creatable && publishable ? (
        <Text className="text-sm font-medium text-green-700">
          Ready to publish
        </Text>
      ) : null}

      <Button
        label="Save draft"
        onPress={() => onSubmit(menuBuilderStateToCreateInput(state))}
        disabled={!creatable}
        loading={submitting}
      />
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}
