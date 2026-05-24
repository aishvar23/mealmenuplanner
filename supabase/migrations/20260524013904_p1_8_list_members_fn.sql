-- P1-8 · list_household_members() — safe member-list projection.
--
-- The member list (GET /api/households/{householdId}/members, design/04 § 4.4)
-- must show each member's display name. But `users` is RLS self-only (P0-12): a
-- broad co-member SELECT would over-expose email/phone (design/03 § 9, least
-- exposure), so the P0-12 migration deferred "co-member display-name visibility
-- ... via a safe projection when the members API is built (P1-8)". This function
-- IS that safe projection: SECURITY DEFINER, it reads `users` past its self-only
-- policy but returns ONLY display_name joined to the membership row — never
-- email or phone.
--
-- The household boundary is still enforced: rows are returned only when the
-- caller is an active member of the household (is_active_member), so the
-- function cannot enumerate another household's members even if called directly
-- via the data API. The `household` service (P1-8) also gates on
-- getActiveMembership before calling this — the two checks are defense in depth
-- (service guard = typed 404; this = the RLS-equivalent backstop).
--
-- Rows are the real-time active roster: status = 'active' AND not past
-- expires_at, mirroring is_active_member's per-row condition, so an expired
-- guest drops out immediately without waiting for the expire_guests job
-- (design/03 § 8). Ordered by joined_at so the owner (joined at creation) leads.
--
-- Hardening (mirrors P0-11/P1-5): search_path = '' with fully-qualified names;
-- now() resolves from pg_catalog; auth.uid() is schema-qualified inside
-- is_active_member. EXECUTE revoked from public/anon, granted to authenticated.
-- Like the other self-scoped SECURITY DEFINER helpers, the advisor's 0029 lint
-- applies by design (exposure is self-scoped to the caller's own households).

create or replace function public.list_household_members(p_household_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  display_name text,
  role public.member_role,
  membership_type public.membership_type,
  status public.member_status,
  expires_at timestamptz,
  joined_at timestamptz,
  can_view_plan boolean,
  can_suggest_meals boolean,
  can_change_today_menu boolean,
  can_change_weekly_schedule boolean,
  can_manage_grocery_list boolean,
  can_invite_members boolean,
  can_remove_members boolean,
  can_edit_household_preferences boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    hm.id,
    hm.user_id,
    u.display_name,
    hm.role,
    hm.membership_type,
    hm.status,
    hm.expires_at,
    hm.joined_at,
    hm.can_view_plan,
    hm.can_suggest_meals,
    hm.can_change_today_menu,
    hm.can_change_weekly_schedule,
    hm.can_manage_grocery_list,
    hm.can_invite_members,
    hm.can_remove_members,
    hm.can_edit_household_preferences
  from public.household_members hm
  join public.users u on u.id = hm.user_id
  where hm.household_id = p_household_id
    and public.is_active_member(p_household_id)
    and hm.status = 'active'
    and (hm.expires_at is null or hm.expires_at > now())
  order by hm.joined_at asc nulls last, hm.created_at asc;
$$;

revoke execute on function public.list_household_members(uuid) from public, anon;
grant execute on function public.list_household_members(uuid) to authenticated;
