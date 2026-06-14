-- pmp_13 — tighten provider_meal_suggestions INSERT to a non-draft (readable) day.
--
-- Defense-in-depth for MP-A-131. The original pms_insert (pmp_5) re-derived
-- provider_id from the day and required active membership, but did NOT gate the
-- day's status. The suggestion service blocks draft days by reading the day through
-- RLS first (a member can't SELECT a draft via can_read_provider_menu_day), but RLS
-- alone — the path a direct PostgREST INSERT takes — still permitted an active member
-- who learned a draft menu_day_id to file a suggestion against an owner-private draft.
--
-- Add `can_read_provider_menu_day(menu_day_id)` to the WITH CHECK so the same
-- published/locked rule that gates the READ also gates the INSERT: a member may only
-- suggest on a day they can see. The helper is SECURITY DEFINER (single-sources the
-- publish-state rule), so this mirrors the read posture exactly and closes the gap at
-- the authoritative layer, not just in the service.

drop policy if exists pms_insert on provider_meal_suggestions;
create policy pms_insert on provider_meal_suggestions
  for insert with check (
    member_user_id = (select auth.uid())
    and provider_id = provider_of_menu_day(menu_day_id)
    and is_active_provider_member(provider_of_menu_day(menu_day_id))
    -- The day must be readable to the caller (published/locked for a member), so a
    -- direct PostgREST insert can't target an owner-private draft.
    and can_read_provider_menu_day(menu_day_id)
  );
