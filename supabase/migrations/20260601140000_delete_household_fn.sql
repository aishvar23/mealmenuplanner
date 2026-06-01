-- delete_household() — owner-only household deletion.
--
-- An owner can permanently delete a household they own; the power resides with
-- the owner alone (BETA — households management). Deleting the `households` row
-- cascades to every household-scoped child (preferences, members, drafts,
-- invites, meal plans + items, grocery lists, activity, notifications, dish
-- preferences) via their `on delete cascade` FKs, and clears the `users`
-- active/preferred pointers via `on delete set null` — so this is a single row
-- delete. Done as one SECURITY DEFINER function (same pattern as
-- transfer_ownership / create_household): supabase-js issues one statement per
-- call, and `households` has no DELETE RLS policy, so the function runs as the
-- table owner after re-verifying the caller is THIS household's active owner.
--
-- Authorization: re-checks the caller is an active `owner` (42501 → Forbidden),
-- independent of the service-layer guard, so SECURITY DEFINER can't be abused to
-- delete a household the caller doesn't own.
--
-- Hardening (mirrors the other helpers): search_path = '' with fully-qualified
-- names; auth.uid() schema-qualified; now() resolves from pg_catalog. EXECUTE
-- revoked from public/anon, granted to authenticated.

create or replace function public.delete_household(h uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- The caller must be the active owner of this household.
  if not exists (
    select 1
    from public.household_members
    where household_id = h
      and user_id = v_user_id
      and status = 'active'
      and role = 'owner'
  ) then
    raise exception 'only the household owner may delete the household'
      using errcode = '42501'; -- insufficient_privilege → 403
  end if;

  delete from public.households where id = h;
end;
$$;

revoke execute on function public.delete_household(uuid) from public, anon;
grant  execute on function public.delete_household(uuid) to authenticated;
