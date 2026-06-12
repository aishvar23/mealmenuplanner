-- PMP-7 (MP-A-010) · RLS helper functions + policies for the provider tenancy
-- tables (organizations, memberships, invites, subscriptions).
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md
-- § 3–4. The menu/catalog/response/batch policies (and the menu-dependent
-- can_view_provider_menu helper) land in their own pmp_* files with those tables.
--
-- Pattern mirrors p0_11/p0_12: SECURITY DEFINER helpers (so policies that call
-- them do NOT recurse into the same table's RLS — the function runs as the table
-- owner and reads provider_memberships directly), search_path pinned to '' with
-- fully-qualified names, REVOKE from public/anon + GRANT to authenticated +
-- service_role. Direct auth.uid() in policies is wrapped as (select auth.uid())
-- so it evaluates once per query (auth_rls_initplan advisor). RLS is already ON
-- via the ensure_rls event trigger; the explicit enable below is idempotent and
-- states intent. We do NOT force RLS, so the service-role client still bypasses
-- it for the SECURITY DEFINER onboarding/invite/approval RPCs (MP-A-101/102).

-- ════════════════════════════ helper functions ════════════════════════════

-- Active (status='active') membership of the current user in provider p.
create or replace function is_active_provider_member(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_memberships m
    where m.provider_id = p
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Current user is the ACTIVE owner of provider p (role='owner', status='active').
-- Used as the owner-only write gate across provider tables.
create or replace function is_provider_owner(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_memberships m
    where m.provider_id = p
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'active'
  );
$$;

-- Current user has ANY live membership (invited / awaiting_approval / active) in
-- provider p. Powers "awaiting-approval customer may read provider identity + own
-- membership" (plan § 4 / UC-VIEW-002) without leaking menu/response access.
create or replace function has_live_provider_membership(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_memberships m
    where m.provider_id = p
      and m.user_id = auth.uid()
      and m.status in ('invited', 'awaiting_approval', 'active')
  );
$$;

-- Lock the SECURITY DEFINER surface (advisor lints 0028/0029): not callable by
-- anon (no session → auth.uid() null → always false); kept for authenticated (so
-- policies can invoke them) + service_role. Self-scoped, so the residual 0029 is
-- benign (a user can only probe their OWN membership).
revoke execute on function public.is_active_provider_member(uuid) from public, anon;
grant execute on function public.is_active_provider_member(uuid) to authenticated, service_role;

revoke execute on function public.is_provider_owner(uuid) from public, anon;
grant execute on function public.is_provider_owner(uuid) to authenticated, service_role;

revoke execute on function public.has_live_provider_membership(uuid) from public, anon;
grant execute on function public.has_live_provider_membership(uuid) to authenticated, service_role;

-- ════════════════════════════ policies ════════════════════════════

-- provider_organizations — any live member reads provider identity (awaiting
-- customers included); owner-bootstrap insert mirrors households_insert; owner
-- updates. Org lifecycle/delete go through service-role RPCs.
alter table provider_organizations enable row level security;
create policy porg_select on provider_organizations
  for select using (has_live_provider_membership(id));
create policy porg_insert on provider_organizations
  for insert with check (owner_user_id = (select auth.uid()));
create policy porg_update on provider_organizations
  for update using (is_provider_owner(id)) with check (is_provider_owner(id));

-- provider_memberships — owner reads/manages all members; a customer reads only
-- their OWN membership row and may update it (e.g. leave). Lifecycle transitions
-- (approve/reject/remove, accept-invite) run via service-role RPCs as the
-- authoritative path; these policies are the in-band backstop.
alter table provider_memberships enable row level security;
create policy pmem_select on provider_memberships
  for select using (
        user_id = (select auth.uid())
     or is_provider_owner(provider_id)
  );
create policy pmem_insert on provider_memberships
  for insert with check (is_provider_owner(provider_id));
create policy pmem_update on provider_memberships
  for update using (
        is_provider_owner(provider_id)
     or user_id = (select auth.uid())
  )
  with check (
        is_provider_owner(provider_id)
     or user_id = (select auth.uid())
  );

-- provider_invites — owner-only management. Unauthenticated token preview and
-- invitee accept run via SECURITY DEFINER RPCs (MP-A-102), not these policies.
alter table provider_invites enable row level security;
create policy pinv_select on provider_invites
  for select using (is_provider_owner(provider_id));
create policy pinv_insert on provider_invites
  for insert with check (is_provider_owner(provider_id));
create policy pinv_update on provider_invites
  for update using (is_provider_owner(provider_id)) with check (is_provider_owner(provider_id));

-- provider_subscriptions — customer reads/writes own consent row (must be an
-- active member to create); owner reads all. Server sets the consent timestamp.
alter table provider_subscriptions enable row level security;
create policy psub_select on provider_subscriptions
  for select using (
        customer_user_id = (select auth.uid())
     or is_provider_owner(provider_id)
  );
create policy psub_insert on provider_subscriptions
  for insert with check (
    customer_user_id = (select auth.uid())
    and is_active_provider_member(provider_id)
  );
create policy psub_update on provider_subscriptions
  for update using (
        customer_user_id = (select auth.uid())
     or is_provider_owner(provider_id)
  )
  with check (
        customer_user_id = (select auth.uid())
     or is_provider_owner(provider_id)
  );
