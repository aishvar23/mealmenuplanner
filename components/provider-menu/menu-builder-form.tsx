"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  eligibleAlternatives,
  isMenuBuilderCreatable,
  isMenuBuilderPublishable,
  localDateTimeToIso,
  makeComponentDraft,
  menuBuilderIssues,
  menuBuilderStateToCreateInput,
  PROVIDER_COMPONENT_GROUP_OPTIONS,
  providerComponentGroupLabel,
  summarizeMenuIssues,
  type CatalogItemDto,
  type MenuBuilderState,
  type MenuComponentDraft,
} from "@/packages/shared/provider";

import { createMenuDay } from "./menu-client";

/**
 * Structured menu-day builder (MP-B-030, UC-MENU-001/002). NO free-form JSON — the
 * owner picks a date + cutoff, then adds component slots, each a default dish from the
 * catalog plus optional same-group swaps and a "required" flag. The live completeness
 * panel reuses the SHARED `menuBuilderIssues` (the #84 validator), so what it says
 * about "publishable" is exactly what the publish gate will decide. Submitting authors
 * a DRAFT (`createMenuDay`); publishing is a separate step on the menu list once the
 * day is complete. Customization groups + price labels are the remainder of #22.
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
  defaultMenuDate,
  defaultCutoffLocal,
  now,
  onCreated,
  onCancel,
}: {
  providerId: string;
  /** Active catalog items the builder can place (the page filters to active). */
  catalog: CatalogItemDto[];
  defaultMenuDate: string;
  /** A `YYYY-MM-DDTHH:mm` local value to prefill the cutoff input. */
  defaultCutoffLocal: string;
  /** Epoch ms "now" for the completeness/cutoff check (the page passes a fresh value). */
  now: number;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const keySeq = useRef(0);
  const newKey = () => `c${(keySeq.current += 1)}`;

  const [state, setState] = useState<MenuBuilderState>({
    menuDate: defaultMenuDate,
    cutoffAt: localDateTimeToIso(defaultCutoffLocal),
    note: "",
    components: [],
  });
  const [cutoffLocal, setCutoffLocal] = useState(defaultCutoffLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = groupedCatalog(catalog);

  const issues = menuBuilderIssues(state, catalog, new Date(now));
  const creatable = isMenuBuilderCreatable(state);
  const publishable = isMenuBuilderPublishable(state, catalog, new Date(now));

  function patch(next: Partial<MenuBuilderState>) {
    setState((prev) => ({ ...prev, ...next }));
  }

  function patchComponent(key: string, next: Partial<MenuComponentDraft>) {
    setState((prev) => ({
      ...prev,
      components: prev.components.map((c) =>
        c.key === key ? { ...c, ...next } : c,
      ),
    }));
  }

  function addComponent() {
    const first = catalog[0];
    if (!first) return;
    setState((prev) => ({
      ...prev,
      components: [...prev.components, makeComponentDraft(first, newKey())],
    }));
  }

  function removeComponent(key: string) {
    setState((prev) => ({
      ...prev,
      components: prev.components.filter((c) => c.key !== key),
    }));
  }

  function changeDefault(key: string, catalogItemId: string) {
    const item = catalog.find((c) => c.catalogItemId === catalogItemId);
    if (!item) return;
    // Re-deriving the group drops swaps that no longer belong to the new group.
    patchComponent(key, {
      defaultCatalogItemId: item.catalogItemId,
      componentGroup: item.componentGroup,
      alternativeCatalogItemIds: [],
    });
  }

  function toggleAlternative(key: string, altId: string) {
    setState((prev) => ({
      ...prev,
      components: prev.components.map((c) => {
        if (c.key !== key) return c;
        const has = c.alternativeCatalogItemIds.includes(altId);
        return {
          ...c,
          alternativeCatalogItemIds: has
            ? c.alternativeCatalogItemIds.filter((id) => id !== altId)
            : [...c.alternativeCatalogItemIds, altId],
        };
      }),
    }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createMenuDay(providerId, menuBuilderStateToCreateInput(state));
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the menu.",
      );
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New menu day</CardTitle>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="menu-date">Menu date</Label>
            <Input
              id="menu-date"
              type="date"
              value={state.menuDate}
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
              const alts = eligibleAlternatives(component, catalog);
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
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Live completeness — what the publish gate will see. */}
        {creatable && !publishable ? (
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
            <p className="text-xs text-muted-foreground">
              You can still save this as a draft and finish it later.
            </p>
          </div>
        ) : null}
        {creatable && publishable ? (
          <p className="text-sm">
            <Badge variant="emerald">Ready to publish</Badge>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={submit} disabled={!creatable || busy}>
            {busy ? "Saving…" : "Save draft"}
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
