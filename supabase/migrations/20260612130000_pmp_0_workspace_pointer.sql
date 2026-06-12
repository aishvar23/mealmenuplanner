-- PMP-0 (MP-A-015) · Generalized active-workspace pointer for ADR-1 routing.
--
-- A user can simultaneously belong to a household, own a provider, and be a
-- customer of other providers (design/planning/meal-provider/02 ADR-1). Post-login
-- routing and the workspace switcher need a persisted "which workspace am I
-- viewing" pointer that follows the user across devices. The household-typed
-- users.active_household_id physically can't store a provider id, so ADR-1's
-- chosen (safe-default) persistence is this generalized one-row-per-user table,
-- written only through a membership-verifying SECURITY DEFINER RPC.
--
-- Source of truth: 04_database_and_rls_plan.md § 2.21 + § 5 (set_active_workspace).
-- Pattern mirrors set_active_household (p9_beta_feedback) and the provider RLS
-- helpers (pmp_7): SECURITY DEFINER, search_path pinned to '' with fully-qualified
-- names, REVOKE from public/anon + GRANT to authenticated. Reads go through RLS
-- (own row only); writes are RPC-only (no direct insert/update/delete policy), so
-- a client can never point itself at a workspace it does not belong to.
--
-- Rollback: drop the RPC + table; routing falls back to client-side selection.

-- ════════════════════════════════ table ════════════════════════════════════

create table user_active_workspace (
  user_id        uuid primary key references users (id) on delete cascade,
  workspace_type text not null,
  workspace_id   uuid not null,
  updated_at     timestamptz not null default now(),
  constraint user_active_workspace_type_check
    check (workspace_type in ('household', 'provider_owner', 'provider_customer'))
);

comment on table user_active_workspace is
  'ADR-1 active-workspace pointer (one row per user). Written only via set_active_workspace; read by the workspace resolver. workspace_id references households(id) when household, else provider_organizations(id).';

-- RLS is auto-enabled by the ensure_rls event trigger; the explicit enable states
-- intent and is idempotent. Own-row SELECT only — writes are RPC-only.
alter table user_active_workspace enable row level security;

create policy uaw_select on user_active_workspace
  for select using (user_id = (select auth.uid()));

-- ════════════════════════════════ RPC ══════════════════════════════════════

-- Set the caller's active workspace after verifying live membership of the right
-- type, mirroring set_active_household. Raises 42501 (insufficient_privilege) when
-- the caller is not a member, so a stale/forged id is rejected, never stored.
create or replace function set_active_workspace(
  p_workspace_type text,
  p_workspace_id   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ok      boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_workspace_type = 'household' then
    v_ok := public.is_active_member(p_workspace_id);
  elsif p_workspace_type = 'provider_owner' then
    v_ok := public.is_provider_owner(p_workspace_id);
  elsif p_workspace_type = 'provider_customer' then
    -- A customer may select a workspace while still invited/awaiting approval
    -- (the awaiting-approval screen is a valid destination), so any live
    -- membership qualifies — not just active.
    v_ok := public.has_live_provider_membership(p_workspace_id);
  else
    raise exception 'unknown workspace type: %', p_workspace_type
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  if not v_ok then
    raise exception 'not a member of this workspace'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  insert into public.user_active_workspace (
    user_id, workspace_type, workspace_id, updated_at
  )
  values (v_user_id, p_workspace_type, p_workspace_id, now())
  on conflict (user_id) do update
    set workspace_type = excluded.workspace_type,
        workspace_id   = excluded.workspace_id,
        updated_at     = now();
end;
$$;

revoke execute on function public.set_active_workspace(text, uuid) from public, anon;
grant  execute on function public.set_active_workspace(text, uuid) to authenticated;
