"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  DishIngredientDto,
  IngredientDto,
} from "@/lib/services/admin/dto";

import {
  AdminApiError,
  addDishIngredient,
  removeDishIngredient,
} from "./admin-api";

/**
 * Dish-ingredient editor (docs/06, P3-5): quantity per serving, unit,
 * required/optional. Picks from the ingredient catalog; after each change it
 * asks the parent to refresh so the quality checklist stays accurate.
 */
export function DishIngredientsEditor({
  dishId,
  ingredients,
  catalog,
  onChanged,
}: {
  dishId: string;
  ingredients: DishIngredientDto[];
  catalog: IngredientDto[];
  onChanged: () => Promise<void> | void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedIds = new Set(ingredients.map((row) => row.ingredientId));
  const available = catalog.filter((row) => !usedIds.has(row.id));

  function pick(id: string) {
    setIngredientId(id);
    const match = catalog.find((row) => row.id === id);
    if (match && unit === "") setUnit(match.defaultUnit);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!ingredientId || !quantity || !unit.trim()) {
      setError("Pick an ingredient and enter a quantity and unit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addDishIngredient(dishId, {
        ingredientId,
        quantityPerServing: Number(quantity),
        unit: unit.trim(),
        isRequired: required,
        isOptional: !required,
      });
      setIngredientId("");
      setQuantity("");
      setUnit("");
      setRequired(true);
      await onChanged();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(linkId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeDishIngredient(dishId, linkId);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to remove.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-semibold">Ingredients</h2>

      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ingredients yet.</p>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {ingredients.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 border-b pb-1.5"
            >
              <span>
                <span className="font-medium">
                  {row.ingredientName ?? "Unknown"}
                </span>{" "}
                <span className="text-muted-foreground">
                  — {row.quantityPerServing} {row.unit} / serving
                  {row.isOptional ? " · optional" : ""}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => remove(row.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="add-ingredient">Ingredient</Label>
          <Select
            id="add-ingredient"
            value={ingredientId}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">Select…</option>
            {available.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="add-qty">Qty / serving</Label>
            <Input
              id="add-qty"
              type="number"
              min={0}
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="add-unit">Unit</Label>
            <Input
              id="add-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="g, cup…"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />
          Required ingredient
        </label>
        <div className="flex items-end">
          <Button type="submit" size="lg" disabled={busy}>
            Add ingredient
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
