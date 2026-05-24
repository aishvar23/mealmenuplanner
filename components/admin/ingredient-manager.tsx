"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { INGREDIENT_CATEGORIES } from "@/lib/admin/options";
import type { IngredientDto } from "@/lib/services/admin/dto";

import {
  AdminApiError,
  createIngredient,
  deleteIngredient,
  updateIngredient,
} from "./admin-api";

const EMPTY = {
  name: "",
  category: INGREDIENT_CATEGORIES[0] ?? "pantry",
  defaultUnit: "",
  commonNames: "",
  allergenType: "",
};

/**
 * Ingredient catalog manager (docs/06, P3-4): name, category, default unit,
 * common names, allergen type. Create / edit / delete (an in-use ingredient
 * can't be deleted — the API returns a 409 the form surfaces). Local list state
 * is seeded from the server and updated from each API response.
 */
export function IngredientManager({ initial }: { initial: IngredientDto[] }) {
  const [items, setItems] = useState<IngredientDto[]>(initial);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
    setError(null);
  }

  function edit(item: IngredientDto) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      defaultUnit: item.defaultUnit,
      commonNames: item.commonNames.join(", "),
      allergenType: item.allergenType ?? "",
    });
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.defaultUnit.trim()) {
      setError("Name and default unit are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      defaultUnit: form.defaultUnit.trim(),
      commonNames: form.commonNames
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      allergenType: form.allergenType.trim() || null,
    };
    try {
      if (editingId) {
        const updated = await updateIngredient(editingId, payload);
        setItems((prev) =>
          prev
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        const created = await createIngredient(payload);
        setItems((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      reset();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteIngredient(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) reset();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to delete.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Allergen</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No ingredients yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{item.name}</span>
                    {item.commonNames.length > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {item.commonNames.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.category}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.defaultUnit}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.allergenType ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => edit(item)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(item.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4">
          <h2 className="font-heading text-lg font-semibold">
            {editingId ? "Edit ingredient" : "New ingredient"}
          </h2>
          <div className="grid gap-1">
            <Label htmlFor="ing-name">Name</Label>
            <Input
              id="ing-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ing-category">Category</Label>
            <Select
              id="ing-category"
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
            >
              {INGREDIENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ing-unit">Default unit</Label>
            <Input
              id="ing-unit"
              value={form.defaultUnit}
              onChange={(event) => set("defaultUnit", event.target.value)}
              placeholder="g, ml, piece…"
              required
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ing-common">Common names</Label>
            <Input
              id="ing-common"
              value={form.commonNames}
              onChange={(event) => set("commonNames", event.target.value)}
              placeholder="Comma-separated, e.g. Palak, Saag"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ing-allergen">Allergen type</Label>
            <Input
              id="ing-allergen"
              value={form.allergenType}
              onChange={(event) => set("allergenType", event.target.value)}
              placeholder="e.g. dairy, nuts (optional)"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={busy}>
              {editingId ? "Save" : "Add ingredient"}
            </Button>
            {editingId ? (
              <Button type="button" size="lg" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </aside>
    </div>
  );
}
