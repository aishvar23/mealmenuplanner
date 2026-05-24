-- P7-1/P7-3 · replace_grocery_list(meal_plan_id, items) — grocery list write.
--
-- The grocery list is a DERIVED PROJECTION of a meal plan's items (design/08
-- § 9/§ 10): "regenerated whenever the plan changes, so they never drift." This
-- function is the single, idempotent write that materializes that projection.
--
-- Why SECURITY DEFINER (not the per-request RLS client):
--   1. Grocery regeneration is triggered as a SIDE EFFECT of a permitted plan
--      change (today/week generate, replace, eating-out — all gated by a
--      can_change_* flag) AND by the explicit regenerate endpoint (gated by
--      can_manage_grocery_list at the service layer). The actor of a meal change
--      may not hold can_manage_grocery_list (the flags are independently
--      overridable, design/03 § 4), yet the list must still stay in sync. The
--      gli_write / gl_write RLS policies (P0-12) require can_manage_grocery_list,
--      so a per-request write would fail for that actor. Bypassing RLS here keeps
--      the projection consistent; the function re-checks ACTIVE MEMBERSHIP itself
--      so it can never write across the tenancy boundary.
--   2. The aggregated lines are computed in TS (lib/services/grocery/aggregate.ts,
--      unit-tested) and passed in as jsonb, so this function is a thin, auditable
--      write — no business logic in SQL.
--
-- Idempotent (design/08 § 10): one grocery_lists row per plan (unique meal_plan_id)
-- is upserted, its existing grocery_list_items are deleted, and the freshly
-- computed lines are inserted. Running twice with the same plan yields the same
-- list. The full delete/re-insert resets `checked` to false — the documented MVP
-- trade-off (design/08 § 10 "Checked-state trade-off"); carrying checked forward
-- is a V2 refinement the snapshot columns already make possible.
--
-- Hardening (mirrors P1-5/P1-8/P2-6): search_path = '' with fully-qualified names;
-- auth.uid() is schema-qualified inside is_active_member; EXECUTE revoked from
-- public/anon, granted to authenticated. The 0029 self-scoped SECURITY DEFINER
-- advisor lint applies by design.

create or replace function public.replace_grocery_list(
  p_meal_plan_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_list_id uuid;
begin
  -- Resolve the plan's household. A missing plan is a clean 404 for the service.
  select household_id into v_household_id
  from public.meal_plans
  where id = p_meal_plan_id;

  if v_household_id is null then
    raise exception 'meal plan not found' using errcode = 'P0002';
  end if;

  -- Tenancy backstop: the caller must be an active member of the plan's
  -- household (real-time expiry included via is_active_member). This is what
  -- makes the RLS bypass safe — no cross-household writes even if invoked directly.
  if not public.is_active_member(v_household_id) then
    raise exception 'not an active member of this household'
      using errcode = '42501';
  end if;

  -- One list per plan (unique (meal_plan_id), doc 01) — never a second list.
  insert into public.grocery_lists (household_id, meal_plan_id, status)
  values (v_household_id, p_meal_plan_id, 'active')
  on conflict (meal_plan_id) do update set status = 'active'
  returning id into v_list_id;

  -- Rebuild the lines in place (delete + re-insert, design/08 § 10).
  delete from public.grocery_list_items where grocery_list_id = v_list_id;

  insert into public.grocery_list_items
    (grocery_list_id, ingredient_id, name, category, quantity, unit, checked)
  select
    v_list_id,
    nullif(item->>'ingredientId', '')::uuid,
    item->>'name',
    item->>'category',
    (item->>'quantity')::numeric,
    item->>'unit',
    false
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;

  return v_list_id;
end;
$$;

revoke execute on function public.replace_grocery_list(uuid, jsonb) from public, anon;
grant execute on function public.replace_grocery_list(uuid, jsonb) to authenticated;
