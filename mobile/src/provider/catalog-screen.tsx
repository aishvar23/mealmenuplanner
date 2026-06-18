import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  catalogFormFromItem,
  catalogFormIssues,
  catalogFormToCreateRequest,
  catalogFormToUpdateRequest,
  emptyCatalogForm,
  groupCatalogByComponent,
  isCatalogFormValid,
  providerComponentGroupLabel,
  PROVIDER_COMPONENT_GROUP_OPTIONS,
  type CatalogFormState,
  type CatalogItemDto,
  type ProviderComponentGroup,
} from "@mmp/shared/provider";

import { Button } from "@/components/Button";
import { ErrorBanner, ErrorState, LoadingState } from "@/components/Feedback";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";

import { useCatalog, useCatalogActions } from "./use-catalog";

/**
 * Owner Catalog screen (ADO #88, the mobile twin of the web Catalog page, spec §13.2).
 * The self-service dish library: list dishes grouped by component group, add a new
 * dish, edit an existing one, and archive / restore it (`isActive` toggle — items are
 * never hard deleted, ADR-4). Drives the SHARED `catalogForm*` model + the existing
 * catalog backend (MP-A-110) through the `ProviderApiClient` seam; shares no UI code
 * with web. The server + DB CHECKs stay the authoritative validation backstop.
 */

type FormMode = { kind: "add" } | { kind: "edit"; item: CatalogItemDto } | null;

const GROUP_OPTIONS = PROVIDER_COMPONENT_GROUP_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

const FLAG_OPTIONS = [
  { value: "spice" as const, label: "Spice level" },
  { value: "salt" as const, label: "Salt level" },
];

export function CatalogScreen({ providerId }: { providerId: string }) {
  const { data: catalog, isLoading, error, refetch } = useCatalog(providerId);
  const { create, update } = useCatalogActions(providerId);
  const [mode, setMode] = useState<FormMode>(null);

  const acting = create.isPending || update.isPending;
  const actionError = create.error ?? update.error;

  async function onArchiveToggle(item: CatalogItemDto) {
    await update
      .mutateAsync({
        catalogItemId: item.catalogItemId,
        patch: { isActive: !item.isActive },
      })
      .catch(() => {
        // Surfaced inline via the mutation error banner.
      });
  }

  async function onSubmit(state: CatalogFormState): Promise<void> {
    try {
      if (mode?.kind === "edit") {
        await update.mutateAsync({
          catalogItemId: mode.item.catalogItemId,
          patch: catalogFormToUpdateRequest(state),
        });
      } else {
        await create.mutateAsync(catalogFormToCreateRequest(state));
      }
      setMode(null);
    } catch {
      // Leave the form open; the error shows in the inline banner.
    }
  }

  if (isLoading) return <LoadingState />;
  if (error || !catalog) {
    return (
      <ErrorState
        message="Couldn't load the catalog."
        onRetry={() => refetch()}
      />
    );
  }

  const active = catalog.filter((item) => item.isActive);
  const archived = catalog.filter((item) => !item.isActive);
  const groups = groupCatalogByComponent(active);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">Catalog</Text>
          {mode === null ? (
            <Button label="Add dish" onPress={() => setMode({ kind: "add" })} />
          ) : null}
        </View>

        {actionError && mode === null ? (
          <ErrorBanner
            message={
              actionError instanceof Error
                ? actionError.message
                : "Something went wrong."
            }
          />
        ) : null}

        {mode !== null ? (
          <CatalogForm
            key={mode.kind === "edit" ? mode.item.catalogItemId : "add"}
            mode={mode}
            submitting={acting}
            error={actionError instanceof Error ? actionError.message : null}
            onSubmit={onSubmit}
            onCancel={() => setMode(null)}
          />
        ) : null}

        {active.length === 0 && mode === null ? (
          <View className="rounded-xl border border-gray-100 bg-white p-4">
            <Text className="text-center text-base text-gray-500">
              No dishes yet. Add your first dish to start building menus.
            </Text>
          </View>
        ) : null}

        {groups.map((group) => (
          <View key={group.group} className="gap-2">
            <Text className="text-lg font-semibold text-gray-900">
              {group.label}
            </Text>
            {group.items.map((item) => (
              <CatalogItemRow
                key={item.catalogItemId}
                item={item}
                disabled={mode !== null || acting}
                onEdit={() => setMode({ kind: "edit", item })}
                onArchive={() => void onArchiveToggle(item)}
              />
            ))}
          </View>
        ))}

        {archived.length > 0 ? (
          <View className="gap-2">
            <Text className="text-lg font-semibold text-gray-500">
              Archived
            </Text>
            {archived.map((item) => (
              <View
                key={item.catalogItemId}
                className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4"
              >
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-gray-500" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-sm text-gray-400" numberOfLines={1}>
                    {providerComponentGroupLabel(item.componentGroup)} ·{" "}
                    {item.defaultQuantity} {item.canonicalUnit}
                  </Text>
                </View>
                <Button
                  label="Restore"
                  variant="secondary"
                  disabled={mode !== null || acting}
                  onPress={() => void onArchiveToggle(item)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CatalogItemRow({
  item,
  disabled,
  onEdit,
  onArchive,
}: {
  item: CatalogItemDto;
  disabled: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-gray-900" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-sm text-gray-500" numberOfLines={1}>
            {item.defaultQuantity} {item.canonicalUnit}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            label="Edit"
            variant="secondary"
            onPress={onEdit}
            disabled={disabled}
          />
          <Button
            label="Archive"
            variant="secondary"
            onPress={onArchive}
            disabled={disabled}
          />
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {item.supportsSpiceLevel ? (
          <Text className="text-xs text-gray-500">Spice level</Text>
        ) : null}
        {item.supportsSaltLevel ? (
          <Text className="text-xs text-gray-500">Salt level</Text>
        ) : null}
        {item.allergyWarning ? (
          <Text className="text-xs text-amber-600">Allergy note</Text>
        ) : null}
      </View>
    </View>
  );
}

function CatalogForm({
  mode,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  mode: { kind: "add" } | { kind: "edit"; item: CatalogItemDto };
  submitting: boolean;
  error: string | null;
  onSubmit: (state: CatalogFormState) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<CatalogFormState>(() =>
    mode.kind === "edit" ? catalogFormFromItem(mode.item) : emptyCatalogForm(),
  );
  const [showErrors, setShowErrors] = useState(false);

  const issues = catalogFormIssues(state);
  const valid = isCatalogFormValid(state);

  function set<K extends keyof CatalogFormState>(
    key: K,
    value: CatalogFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const flagsSelected = [
    ...(state.supportsSpiceLevel ? (["spice"] as const) : []),
    ...(state.supportsSaltLevel ? (["salt"] as const) : []),
  ];

  function handleSubmit() {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    onSubmit(state);
  }

  return (
    <View className="gap-4 rounded-xl border border-gray-100 bg-white p-4">
      <Text className="text-lg font-semibold text-gray-900">
        {mode.kind === "edit" ? "Edit dish" : "Add a dish"}
      </Text>

      {error ? <ErrorBanner message={error} /> : null}

      <TextField
        label="Name"
        value={state.name}
        onChangeText={(v) => set("name", v)}
        placeholder="e.g. Rajma"
        error={showErrors ? issues.name : undefined}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-gray-700">
          Component group
        </Text>
        <SelectChips
          options={GROUP_OPTIONS}
          selected={[state.componentGroup]}
          mode="single"
          onChange={(next) => {
            const value = next[0] as ProviderComponentGroup | undefined;
            if (value) set("componentGroup", value);
          }}
        />
      </View>

      <TextField
        label="Unit"
        value={state.canonicalUnit}
        onChangeText={(v) => set("canonicalUnit", v)}
        placeholder="e.g. oz, piece"
        error={showErrors ? issues.canonicalUnit : undefined}
      />

      <TextField
        label="Default quantity"
        value={state.defaultQuantity}
        onChangeText={(v) => set("defaultQuantity", v)}
        keyboardType="decimal-pad"
        placeholder="e.g. 16"
        error={showErrors ? issues.defaultQuantity : undefined}
      />

      <TextField
        label="Image URL (optional)"
        value={state.imageUrl}
        onChangeText={(v) => set("imageUrl", v)}
        placeholder="https://…"
        autoCapitalize="none"
        keyboardType="url"
        error={showErrors ? issues.imageUrl : undefined}
      />

      <TextField
        label="Allergy warning (optional)"
        value={state.allergyWarning}
        onChangeText={(v) => set("allergyWarning", v)}
        placeholder="e.g. Contains peanuts"
        error={showErrors ? issues.allergyWarning : undefined}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-gray-700">
          Members can choose
        </Text>
        <SelectChips
          options={FLAG_OPTIONS}
          selected={flagsSelected}
          mode="multi"
          onChange={(next) => {
            set("supportsSpiceLevel", next.includes("spice"));
            set("supportsSaltLevel", next.includes("salt"));
          }}
        />
      </View>

      <View className="flex-row gap-2">
        <Button
          label={
            submitting
              ? "Saving…"
              : mode.kind === "edit"
                ? "Save changes"
                : "Add dish"
          }
          loading={submitting}
          onPress={handleSubmit}
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onCancel}
          disabled={submitting}
        />
      </View>
    </View>
  );
}
