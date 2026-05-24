"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PAIRING_TYPE_OPTIONS, pairingTypeLabel } from "@/lib/admin/options";
import type { DishDto, PairingDto } from "@/lib/services/admin/dto";

import { AdminApiError, addPairing, removePairing } from "./admin-api";

/**
 * Pairing editor (docs/06, P3-7): directional pairings (this dish → paired dish)
 * of one type — main+side, rice, bread, condiment, beverage. Picks from the dish
 * catalog (self excluded).
 */
export function PairingsEditor({
  dishId,
  pairings,
  dishCatalog,
  onChanged,
}: {
  dishId: string;
  pairings: PairingDto[];
  dishCatalog: DishDto[];
  onChanged: () => Promise<void> | void;
}) {
  const [pairedDishId, setPairedDishId] = useState("");
  const [pairingType, setPairingType] = useState<string>(
    PAIRING_TYPE_OPTIONS[0]?.value ?? "main_side",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = dishCatalog.filter((dish) => dish.id !== dishId);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!pairedDishId) {
      setError("Pick a dish to pair with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addPairing(dishId, { pairedDishId, pairingType });
      setPairedDishId("");
      await onChanged();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(pairingId: string) {
    setBusy(true);
    setError(null);
    try {
      await removePairing(dishId, pairingId);
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
      <h2 className="font-heading text-lg font-semibold">Pairings</h2>

      {pairings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pairings.</p>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {pairings.map((pairing) => (
            <li
              key={pairing.id}
              className="flex items-center justify-between gap-2 border-b pb-1.5"
            >
              <span>
                <span className="font-medium">
                  {pairing.pairedDishName ?? "Unknown dish"}
                </span>{" "}
                <span className="text-muted-foreground">
                  — {pairingTypeLabel(pairing.pairingType)}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => remove(pairing.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="pair-dish">Pairs with</Label>
          <Select
            id="pair-dish"
            value={pairedDishId}
            onChange={(event) => setPairedDishId(event.target.value)}
          >
            <option value="">Select a dish…</option>
            {candidates.map((dish) => (
              <option key={dish.id} value={dish.id}>
                {dish.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pair-type">Pairing type</Label>
          <Select
            id="pair-type"
            value={pairingType}
            onChange={(event) => setPairingType(event.target.value)}
          >
            {PAIRING_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Button type="submit" size="lg" disabled={busy}>
            Add pairing
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
