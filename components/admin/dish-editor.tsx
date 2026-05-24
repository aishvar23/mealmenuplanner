"use client";

import { useState } from "react";

import { DishForm } from "@/components/admin/dish-form";
import { DishIngredientsEditor } from "@/components/admin/dish-ingredients-editor";
import { PairingsEditor } from "@/components/admin/pairings-editor";
import { PrepTasksEditor } from "@/components/admin/prep-tasks-editor";
import { QualityChecklistPanel } from "@/components/admin/quality-checklist-panel";
import type {
  DishDetailDto,
  DishDto,
  IngredientDto,
} from "@/lib/services/admin/dto";

import { getDishDetail } from "./admin-api";

/**
 * Operator dish editor (P3-3/5/6/7/8) — orchestrates the dish-detail form, the
 * activation checklist, and the ingredient/prep-task/pairing sub-editors over
 * one `DishDetailDto` held in client state. Each sub-editor mutates via the API
 * and then calls `refresh()` to re-load the detail, so the quality checklist
 * (which depends on ingredients/metadata) always reflects the latest state.
 */
export function DishEditor({
  initialDetail,
  ingredientCatalog,
  dishCatalog,
}: {
  initialDetail: DishDetailDto;
  ingredientCatalog: IngredientDto[];
  dishCatalog: DishDto[];
}) {
  const [detail, setDetail] = useState<DishDetailDto>(initialDetail);

  async function refresh() {
    setDetail(await getDishDetail(detail.id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-4 font-heading text-lg font-semibold">Details</h2>
          <DishForm dish={detail} onSaved={refresh} />
        </section>

        <DishIngredientsEditor
          dishId={detail.id}
          ingredients={detail.ingredients}
          catalog={ingredientCatalog}
          onChanged={refresh}
        />

        <PrepTasksEditor
          dishId={detail.id}
          prepTasks={detail.prepTasks}
          onChanged={refresh}
        />

        <PairingsEditor
          dishId={detail.id}
          pairings={detail.pairings}
          dishCatalog={dishCatalog}
          onChanged={refresh}
        />
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <QualityChecklistPanel
          dishId={detail.id}
          status={detail.status}
          checklist={detail.qualityChecklist}
          onChanged={setDetail}
        />
      </aside>
    </div>
  );
}
