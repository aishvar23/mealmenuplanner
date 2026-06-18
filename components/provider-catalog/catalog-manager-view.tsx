"use client";

import { Pencil, Plus, Soup } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  catalogFormFromItem,
  catalogFormIssues,
  catalogFormToCreateRequest,
  catalogFormToUpdateRequest,
  emptyCatalogForm,
  groupCatalogByComponent,
  providerComponentGroupLabel,
  PROVIDER_COMPONENT_GROUP_OPTIONS,
  type CatalogFormState,
  type CatalogItemDto,
} from "@/packages/shared/provider";

import { createCatalogItem, updateCatalogItem } from "./catalog-client";

/**
 * Owner Catalog manager (ADO #88, spec §13.2). The self-service library every menu
 * component draws from: list the owner's dishes grouped by component group, add a new
 * dish, edit an existing one, and archive / restore it (`isActive` toggle — items are
 * never hard deleted, ADR-4). A client component (interactive form + optimistic list)
 * over the existing catalog backend (MP-A-110); the server + DB CHECKs stay the
 * authoritative validation backstop, the shared `catalogForm*` helpers gate the form.
 */

type FormMode = { kind: "add" } | { kind: "edit"; item: CatalogItemDto } | null;

export function CatalogManagerView({
  providerId,
  initialCatalog,
}: {
  providerId: string;
  initialCatalog: CatalogItemDto[];
}) {
  const [catalog, setCatalog] = useState<CatalogItemDto[]>(initialCatalog);
  const [mode, setMode] = useState<FormMode>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = catalog.filter((item) => item.isActive);
  const archived = catalog.filter((item) => !item.isActive);
  const groups = groupCatalogByComponent(active);

  // Apply an authoritative item from a write into the list (insert or replace by id).
  function applyItem(item: CatalogItemDto) {
    setCatalog((list) => {
      const idx = list.findIndex((i) => i.catalogItemId === item.catalogItemId);
      if (idx === -1) return [...list, item];
      const next = [...list];
      next[idx] = item;
      return next;
    });
  }

  async function onArchiveToggle(item: CatalogItemDto) {
    if (archivingId) return;
    setArchivingId(item.catalogItemId);
    setError(null);
    try {
      const updated = await updateCatalogItem(providerId, item.catalogItemId, {
        isActive: !item.isActive,
      });
      applyItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Your dish library. Add dishes here, then place them on a day&apos;s
            menu.
          </p>
        </header>
        {mode === null ? (
          <Button type="button" onClick={() => setMode({ kind: "add" })}>
            <Plus /> Add dish
          </Button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {mode !== null ? (
        <CatalogForm
          key={mode.kind === "edit" ? mode.item.catalogItemId : "add"}
          mode={mode}
          onCancel={() => setMode(null)}
          onSubmit={async (state) => {
            setError(null);
            try {
              const saved =
                mode.kind === "edit"
                  ? await updateCatalogItem(
                      providerId,
                      mode.item.catalogItemId,
                      catalogFormToUpdateRequest(state),
                    )
                  : await createCatalogItem(
                      providerId,
                      catalogFormToCreateRequest(state),
                    );
              applyItem(saved);
              setMode(null);
              return true;
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Couldn't save the dish.",
              );
              return false;
            }
          }}
        />
      ) : null}

      {active.length === 0 && mode === null ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={Soup}
              title="No dishes yet"
              description="Add your first dish to start building menus."
            />
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => (
        <section key={group.group} className="space-y-3">
          <h2 className="text-lg font-medium">{group.label}</h2>
          <ul className="divide-y rounded-lg border">
            {group.items.map((item) => (
              <CatalogItemRow
                key={item.catalogItemId}
                item={item}
                disabled={mode !== null}
                archiving={archivingId !== null}
                busy={archivingId === item.catalogItemId}
                onEdit={() => setMode({ kind: "edit", item })}
                onArchive={() => onArchiveToggle(item)}
              />
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-muted-foreground">
            Archived
          </h2>
          <ul className="divide-y rounded-lg border">
            {archived.map((item) => (
              <li
                key={item.catalogItemId}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-muted-foreground">
                    {item.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {providerComponentGroupLabel(item.componentGroup)} ·{" "}
                    {item.defaultQuantity} {item.canonicalUnit}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={mode !== null || archivingId !== null}
                  onClick={() => onArchiveToggle(item)}
                >
                  {archivingId === item.catalogItemId
                    ? "Restoring…"
                    : "Restore"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CatalogItemRow({
  item,
  disabled,
  archiving,
  busy,
  onEdit,
  onArchive,
}: {
  item: CatalogItemDto;
  disabled: boolean;
  /** Some archive/restore call is in flight (any row) — block all toggles. */
  archiving: boolean;
  /** This specific row is the one being archived (for the inline label). */
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{item.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {item.defaultQuantity} {item.canonicalUnit}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {item.supportsSpiceLevel ? (
            <Badge variant="neutral">Spice level</Badge>
          ) : null}
          {item.supportsSaltLevel ? (
            <Badge variant="neutral">Salt level</Badge>
          ) : null}
          {item.allergyWarning ? (
            <Badge variant="marigold">Allergy note</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEdit}
          disabled={disabled}
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onArchive}
          disabled={disabled || archiving}
          aria-label={`Archive ${item.name}`}
        >
          {busy ? "Archiving…" : "Archive"}
        </Button>
      </div>
    </li>
  );
}

function CatalogForm({
  mode,
  onSubmit,
  onCancel,
}: {
  mode: { kind: "add" } | { kind: "edit"; item: CatalogItemDto };
  onSubmit: (state: CatalogFormState) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [state, setState] = useState<CatalogFormState>(() =>
    mode.kind === "edit" ? catalogFormFromItem(mode.item) : emptyCatalogForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const issues = catalogFormIssues(state);
  const valid = Object.keys(issues).length === 0;

  function set<K extends keyof CatalogFormState>(
    key: K,
    value: CatalogFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!valid) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    await onSubmit(state);
    setSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode.kind === "edit" ? "Edit dish" : "Add a dish"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="catalog-name">Name</Label>
            <Input
              id="catalog-name"
              value={state.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Rajma"
              autoComplete="off"
            />
            {showErrors && issues.name ? (
              <p className="text-xs text-destructive">{issues.name}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-group">Component group</Label>
              <Select
                id="catalog-group"
                value={state.componentGroup}
                onChange={(e) =>
                  set(
                    "componentGroup",
                    e.target.value as CatalogFormState["componentGroup"],
                  )
                }
              >
                {PROVIDER_COMPONENT_GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalog-unit">Unit</Label>
              <Input
                id="catalog-unit"
                value={state.canonicalUnit}
                onChange={(e) => set("canonicalUnit", e.target.value)}
                placeholder="e.g. oz, piece"
                autoComplete="off"
              />
              {showErrors && issues.canonicalUnit ? (
                <p className="text-xs text-destructive">
                  {issues.canonicalUnit}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catalog-qty">Default quantity</Label>
            <Input
              id="catalog-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={state.defaultQuantity}
              onChange={(e) => set("defaultQuantity", e.target.value)}
              placeholder="e.g. 16"
            />
            {showErrors && issues.defaultQuantity ? (
              <p className="text-xs text-destructive">
                {issues.defaultQuantity}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catalog-image">Image URL (optional)</Label>
            <Input
              id="catalog-image"
              type="url"
              value={state.imageUrl}
              onChange={(e) => set("imageUrl", e.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
            {showErrors && issues.imageUrl ? (
              <p className="text-xs text-destructive">{issues.imageUrl}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catalog-allergy">Allergy warning (optional)</Label>
            <Input
              id="catalog-allergy"
              value={state.allergyWarning}
              onChange={(e) => set("allergyWarning", e.target.value)}
              placeholder="e.g. Contains peanuts"
              autoComplete="off"
            />
            {showErrors && issues.allergyWarning ? (
              <p className="text-xs text-destructive">
                {issues.allergyWarning}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.supportsSpiceLevel}
                onChange={(e) => set("supportsSpiceLevel", e.target.checked)}
              />
              Members can choose a spice level
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.supportsSaltLevel}
                onChange={(e) => set("supportsSaltLevel", e.target.checked)}
              />
              Members can choose a salt level
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode.kind === "edit"
                  ? "Save changes"
                  : "Add dish"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
