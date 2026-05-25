"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DIET_TYPE_OPTIONS,
  DIFFICULTY_OPTIONS,
  IMAGE_STATUS_OPTIONS,
  MEAL_SLOT_OPTIONS,
  SPICE_LEVEL_OPTIONS,
} from "@/lib/admin/options";
import type { DishDto } from "@/lib/services/admin/dto";

import { AdminApiError, createDish, updateDish } from "./admin-api";

/** The boolean descriptor flags, with labels (design/01 `dishes`). */
const FLAGS = [
  ["kidFriendly", "Kid-friendly"],
  ["lunchboxFriendly", "Lunchbox-friendly"],
  ["leftoverFriendly", "Leftover-friendly"],
  ["batchCookFriendly", "Batch-cook-friendly"],
  ["diabeticFriendly", "Diabetic-friendly"],
  ["lowSodium", "Low sodium"],
  ["highProtein", "High protein"],
  ["lowCarb", "Low carb"],
] as const;

type FlagKey = (typeof FLAGS)[number][0];

interface FormState {
  name: string;
  dietType: string;
  description: string;
  cuisine: string;
  region: string;
  mealSlots: string[];
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  difficulty: string;
  spiceLevel: string;
  imageUrl: string;
  imageAltText: string;
  imageStatus: string;
  imageVerified: boolean;
  flags: Record<FlagKey, boolean>;
}

function initialState(dish?: DishDto): FormState {
  return {
    name: dish?.name ?? "",
    dietType: dish?.dietType ?? "vegetarian",
    description: dish?.description ?? "",
    cuisine: dish?.cuisine ?? "",
    region: dish?.region ?? "",
    mealSlots: dish?.mealSlots ?? [],
    prepTimeMinutes: dish ? String(dish.prepTimeMinutes) : "0",
    cookTimeMinutes: dish ? String(dish.cookTimeMinutes) : "0",
    difficulty: dish?.difficulty ?? "easy",
    spiceLevel: dish?.spiceLevel ?? "medium",
    imageUrl: dish?.imageUrl ?? "",
    imageAltText: dish?.imageAltText ?? "",
    imageStatus: dish?.imageStatus ?? "placeholder",
    imageVerified: dish?.imageVerified ?? false,
    flags: {
      kidFriendly: dish?.kidFriendly ?? false,
      lunchboxFriendly: dish?.lunchboxFriendly ?? false,
      leftoverFriendly: dish?.leftoverFriendly ?? false,
      batchCookFriendly: dish?.batchCookFriendly ?? false,
      diabeticFriendly: dish?.diabeticFriendly ?? false,
      lowSodium: dish?.lowSodium ?? false,
      highProtein: dish?.highProtein ?? false,
      lowCarb: dish?.lowCarb ?? false,
    },
  };
}

/** Translate form state to the camelCase API payload. */
function toPayload(state: FormState): Record<string, unknown> {
  return {
    name: state.name.trim(),
    dietType: state.dietType,
    description: state.description.trim() || null,
    cuisine: state.cuisine.trim() || null,
    region: state.region.trim() || null,
    mealSlots: state.mealSlots,
    prepTimeMinutes: Number(state.prepTimeMinutes) || 0,
    cookTimeMinutes: Number(state.cookTimeMinutes) || 0,
    difficulty: state.difficulty,
    spiceLevel: state.spiceLevel,
    imageUrl: state.imageUrl.trim() || null,
    imageAltText: state.imageAltText.trim() || null,
    imageStatus: state.imageStatus,
    imageVerified: state.imageVerified,
    ...state.flags,
  };
}

/**
 * Add/edit dish form (docs/06, P3-3). In `create` mode it POSTs a new dish and
 * routes to its editor; in `edit` mode it PATCHes the existing dish and calls
 * `onSaved`. Status is not editable here — activation/archival is the editor's
 * dedicated checklist-gated action (P3-8).
 */
export function DishForm({
  dish,
  onSaved,
}: {
  dish?: DishDto;
  onSaved?: (dish: DishDto) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(dish);
  const [state, setState] = useState<FormState>(() => initialState(dish));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSlot(slot: string) {
    setState((prev) => ({
      ...prev,
      mealSlots: prev.mealSlots.includes(slot)
        ? prev.mealSlots.filter((value) => value !== slot)
        : [...prev.mealSlots, slot],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state.name.trim() === "") {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(state);
      if (dish) {
        const updated = await updateDish(dish.id, payload);
        onSaved?.(updated);
      } else {
        const created = await createDish(payload);
        router.push(`/admin/dishes/${created.id}`);
      }
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to save the dish.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-2 sm:max-w-md">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={state.name}
          onChange={(event) => set("name", event.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={state.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="A short description for operators."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cuisine">Cuisine</Label>
          <Input
            id="cuisine"
            value={state.cuisine}
            onChange={(event) => set("cuisine", event.target.value)}
            placeholder="e.g. North Indian"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="region">Region</Label>
          <Input
            id="region"
            value={state.region}
            onChange={(event) => set("region", event.target.value)}
            placeholder="e.g. Punjab"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dietType">Diet type</Label>
          <Select
            id="dietType"
            value={state.dietType}
            onChange={(event) => set("dietType", event.target.value)}
          >
            {DIET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="spiceLevel">Spice level</Label>
          <Select
            id="spiceLevel"
            value={state.spiceLevel}
            onChange={(event) => set("spiceLevel", event.target.value)}
          >
            {SPICE_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="prep">Prep time (min)</Label>
          <Input
            id="prep"
            type="number"
            min={0}
            value={state.prepTimeMinutes}
            onChange={(event) => set("prepTimeMinutes", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cook">Cook time (min)</Label>
          <Input
            id="cook"
            type="number"
            min={0}
            value={state.cookTimeMinutes}
            onChange={(event) => set("cookTimeMinutes", event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select
            id="difficulty"
            value={state.difficulty}
            onChange={(event) => set("difficulty", event.target.value)}
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Meal slots</legend>
        <div className="flex flex-wrap gap-3">
          {MEAL_SLOT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={state.mealSlots.includes(option.value)}
                onChange={() => toggleSlot(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Tags</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {FLAGS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.flags[key]}
                onChange={(event) =>
                  set("flags", { ...state.flags, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Image metadata</legend>
        <div className="grid gap-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            value={state.imageUrl}
            onChange={(event) => set("imageUrl", event.target.value)}
            placeholder="https://... or /images/dishes/name.jpg"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="imageAltText">Alt text</Label>
          <Input
            id="imageAltText"
            value={state.imageAltText}
            onChange={(event) => set("imageAltText", event.target.value)}
            placeholder="Describe the actual dish image"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="imageStatus">Image status</Label>
            <Select
              id="imageStatus"
              value={state.imageStatus}
              onChange={(event) => set("imageStatus", event.target.value)}
            >
              {IMAGE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={state.imageVerified}
              onChange={(event) => set("imageVerified", event.target.checked)}
            />
            Verified image
          </label>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create dish"}
        </Button>
      </div>
    </form>
  );
}
