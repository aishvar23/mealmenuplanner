-- P4-1 · list_household_food_preferences() — safe member food-prefs projection.
--
-- The recommendation engine (design/05 § 3.2, § 4) must consider EVERY active
-- member's allergies and diet to guarantee allergy-safe suggestions — regardless
-- of who triggers the generate. But user_food_preferences is RLS-restricted
-- (P0-12 ufp_select): a member can read a co-member's row only if they hold
-- can_edit_household_preferences. So under the per-request RLS client a plain
-- member would see only their OWN prefs and miss co-members' allergies — a
-- safety hole.
--
-- This function is the safe projection (same pattern as P1-8 list_household_members):
-- SECURITY DEFINER, it reads user_food_preferences past ufp_select but returns
-- only the fields the engine needs (diet, allergies, dislikes, liked dishes) and
-- ONLY when the caller is an active member of the household (is_active_member),
-- so it cannot read another household's preferences even if invoked directly.
-- Within a household, member dietary restrictions are necessarily shared for
-- collaborative meal planning, so exposing them to active co-members is by design
-- (design/03 § 9 least exposure is satisfied: no email/phone/user identity beyond
-- the user_id the caller is already entitled to via the members API).
--
-- Rows are the real-time active roster: status = 'active' AND not past expires_at
-- (mirrors is_active_member), so an expired temporary_guest's restrictions drop
-- out immediately — consistent with §3.2's "excludes expired temporary_guest".
--
-- Hardening (mirrors P0-11/P1-5/P1-8): search_path = '' with fully-qualified
-- names; auth.uid() is schema-qualified inside is_active_member; now() resolves
-- from pg_catalog. EXECUTE revoked from public/anon, granted to authenticated.
-- The advisor's 0029 self-scoped SECURITY DEFINER lint applies by design.

create or replace function public.list_household_food_preferences(p_household_id uuid)
returns table (
  user_id uuid,
  diet_type public.diet_type,
  allergies text[],
  disliked_ingredients text[],
  liked_dishes text[],
  disliked_dishes text[],
  spice_preference public.spice_level,
  health_preference_tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ufp.user_id,
    ufp.diet_type,
    ufp.allergies,
    ufp.disliked_ingredients,
    ufp.liked_dishes,
    ufp.disliked_dishes,
    ufp.spice_preference,
    ufp.health_preference_tags
  from public.user_food_preferences ufp
  join public.household_members hm
    on hm.user_id = ufp.user_id
   and hm.household_id = ufp.household_id
  where ufp.household_id = p_household_id
    and public.is_active_member(p_household_id)
    and hm.status = 'active'
    and (hm.expires_at is null or hm.expires_at > now());
$$;

revoke execute on function public.list_household_food_preferences(uuid) from public, anon;
grant execute on function public.list_household_food_preferences(uuid) to authenticated;
