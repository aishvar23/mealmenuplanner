-- P10-3 · Combination/dish popularity + user-proposal RPCs.
--
-- The popularity counters live on admin-write-only content tables (P10-1/P10-2),
-- so an authenticated user cannot bump them directly under RLS. These SECURITY
-- DEFINER helpers expose the narrow, safe writes the service layer needs:
--   • increment_combination_popularity / increment_dish_popularity — +1 on an
--     ACTIVE row only (a non-sensitive ranking signal; self-scoped to nothing —
--     any member may register a selection).
--   • propose_meal_combination — submit a household's self-built combo into the
--     catalog as `proposed` for admin review (P10-5), bypassing the admin-write
--     RLS exactly as accept_invite bootstraps a membership. It only ever writes a
--     combo attributed to auth.uid() and validates the caller is an active member
--     of the named household and that every dish is active.
--
-- Hardening (mirrors P0-11/P2-6/P6): search_path = '' with fully-qualified names;
-- auth.uid() schema-qualified; EXECUTE revoked from public/anon, granted to
-- authenticated.

-- ── increment_combination_popularity(combination_id) ───────────────────────────
create or replace function public.increment_combination_popularity(
  p_combination_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.meal_combinations
  set popularity_count = popularity_count + 1
  where id = p_combination_id and status = 'active';
$$;

revoke execute on function public.increment_combination_popularity(uuid)
  from public, anon;
grant execute on function public.increment_combination_popularity(uuid)
  to authenticated;

-- ── increment_dish_popularity(dish_id) ─────────────────────────────────────────
create or replace function public.increment_dish_popularity(p_dish_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dishes
  set popularity_count = popularity_count + 1
  where id = p_dish_id and status = 'active';
$$;

revoke execute on function public.increment_dish_popularity(uuid)
  from public, anon;
grant execute on function public.increment_dish_popularity(uuid)
  to authenticated;

-- ── propose_meal_combination(...) — household self-built combo → proposed ───────
create or replace function public.propose_meal_combination(
  p_household_id uuid,
  p_name         text,
  p_diet_type    public.diet_type,
  p_dish_ids     uuid[],
  p_cuisine      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := auth.uid();
  v_combination_id uuid;
  v_active_count   int;
  v_distinct_count int;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.is_active_member(p_household_id) then
    raise exception 'not an active member of this household'
      using errcode = '42501'; -- → 403
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'combination name is required' using errcode = '23514';
  end if;

  if p_dish_ids is null or array_length(p_dish_ids, 1) < 2 then
    raise exception 'a combination needs at least two dishes'
      using errcode = '23514';
  end if;

  -- Every dish must exist and be active (distinct count must match).
  select count(*) into v_active_count
  from public.dishes
  where id = any (p_dish_ids) and status = 'active';

  select count(*) into v_distinct_count
  from (select distinct unnest(p_dish_ids)) d;

  if v_active_count <> v_distinct_count then
    raise exception 'every dish must be an active catalog dish'
      using errcode = '23514';
  end if;

  -- De-dupe: a household proposing the same-named combo again just gets the
  -- existing submission back (keeps the admin queue clean; idempotent retries).
  select id into v_combination_id
  from public.meal_combinations
  where proposed_by_household_id = p_household_id
    and lower(btrim(name)) = lower(btrim(p_name))
    and source = 'user_proposed'
  limit 1;

  if v_combination_id is not null then
    return v_combination_id;
  end if;

  insert into public.meal_combinations (
    name, cuisine, diet_type, status, source,
    proposed_by_user_id, proposed_by_household_id
  )
  values (
    btrim(p_name), p_cuisine, p_diet_type, 'proposed', 'user_proposed',
    v_user_id, p_household_id
  )
  returning id into v_combination_id;

  insert into public.meal_combination_items (combination_id, dish_id, sort_order)
  select v_combination_id, dish_id, ord - 1
  from unnest(p_dish_ids) with ordinality as t(dish_id, ord);

  return v_combination_id;
end;
$$;

revoke execute on function
  public.propose_meal_combination(uuid, text, public.diet_type, uuid[], text)
  from public, anon;
grant execute on function
  public.propose_meal_combination(uuid, text, public.diet_type, uuid[], text)
  to authenticated;
