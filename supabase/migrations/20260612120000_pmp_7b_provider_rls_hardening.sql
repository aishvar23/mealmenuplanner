-- PMP-7b (MP-A-010) · Provider tenancy RLS hardening.
--
-- Forward-fix for the code-review findings on pmp_2 / pmp_7 (PR #32). The
-- original policies leaned on the comment "lifecycle transitions run via
-- service-role RPCs; these policies are the in-band backstop" — but an RLS
-- WITH CHECK validates the *resulting row*, it cannot restrict *which columns*
-- are written. With the provider tables exposed to the `authenticated` role via
-- PostgREST, the permissive write policies let a client set server-controlled
-- columns directly. This migration closes that gap by aligning the policies with
-- the design's actual write model:
--
--   • All lifecycle writes (onboarding, accept/approve/reject/remove, consent)
--     go through the SECURITY DEFINER RPCs in pmp_8 (plan §5), which run as the
--     function owner and bypass RLS. So the client-facing INSERT/UPDATE policies
--     on the lifecycle tables are unnecessary attack surface — dropped here.
--   • Where a row legitimately stays client-editable (org settings, a customer's
--     own consent), a BEFORE trigger enforces the plan §9 "client must never
--     control" column list. The triggers are SECURITY INVOKER, so they see the
--     real `current_user`: 'authenticated'/'anon' for a direct client write
--     (restricted), the function owner inside a SECURITY DEFINER RPC (exempt),
--     and 'service_role' for the service layer (exempt). `auth.role()` is NOT
--     used for this — it reads the JWT claim, which persists across the DEFINER
--     boundary and would wrongly restrict the RPCs.
--
-- Source of truth: design/planning/meal-provider/04_database_and_rls_plan.md
-- §4 (access matrix) + §9 (field-control summary). Forward-fix preferred over
-- editing the applied pmp_7 per supabase/README.md and plan §8.

-- ════════════════════════ #6 · org creation is RPC-only ════════════════════════
-- complete_provider_onboarding (pmp_8) atomically creates the org + active owner
-- membership. A direct client insert bypassed it, allowing an org with a
-- client-chosen `status` and no membership (orphaned + invisible to porg_select).
drop policy if exists porg_insert on provider_organizations;

-- ═══════════════ #1 / #4 · membership writes are RPC-only ═══════════════════════
-- accept_provider_invite / approve / reject / remove_provider_member (pmp_8) own
-- every membership transition. The client UPDATE policy let a customer PATCH their
-- own row to role='owner', status='active' (self-promotion + self-approval); the
-- client INSERT policy let an owner mint arbitrary membership rows. Reads stay.
drop policy if exists pmem_update on provider_memberships;
drop policy if exists pmem_insert on provider_memberships;

-- ════════════ #5 · pre-acceptance invitees must not read provider identity ══════
-- has_live_provider_membership counted status='invited' as live, so a merely-
-- invited user (membership created pre-acceptance) could read the org row,
-- including summary_email_recipients (internal staff emails). Plan §4 grants
-- identity reads to *awaiting_approval* and *active* members only. Replace the
-- helper with one scoped to those two states (an active owner is covered, since
-- the owner membership is role='owner' status='active').
drop policy if exists porg_select on provider_organizations;
drop function if exists public.has_live_provider_membership(uuid);

create or replace function can_view_provider_identity(p uuid)
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
      and m.status in ('awaiting_approval', 'active')
  );
$$;

revoke execute on function public.can_view_provider_identity(uuid) from public, anon;
grant execute on function public.can_view_provider_identity(uuid) to authenticated, service_role;

create policy porg_select on provider_organizations
  for select using (can_view_provider_identity(id));

-- ═══════════ #3 · org `status` + `owner_user_id` are server-controlled ══════════
-- porg_update stays so an owner can edit org settings (name, contact, cutoff,
-- summary_email_recipients), but plan §9 marks status (lifecycle) and
-- owner_user_id (ownership) as client-never. This trigger silently preserves them
-- on direct client updates; the lifecycle RPCs (running as the function owner)
-- pass through unaffected. Silent-preserve (not raise) so a PostgREST full-row
-- PATCH that re-sends the unchanged values still succeeds.
create or replace function provider_orgs_guard_server_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := old.status;
    new.owner_user_id := old.owner_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_orgs_guard on provider_organizations;
create trigger trg_provider_orgs_guard
  before update on provider_organizations
  for each row execute function provider_orgs_guard_server_columns();

-- ════════════════ #2 · subscription consent is customer-driven + server-set ═════
-- Two problems: (a) psub_update let the *owner* write a customer's consent row,
-- so an owner could manufacture auto-accept consent for their own orders;
-- (b) neither policy stopped a client from supplying/back-dating
-- auto_accept_consented_at directly. Fix: only the customer may write their own
-- consent row (owner keeps read via psub_select), and a trigger server-derives
-- the consent timestamp from auto_accept_enabled and freezes provider-side status.
drop policy if exists psub_update on provider_subscriptions;
create policy psub_update on provider_subscriptions
  for update using (customer_user_id = (select auth.uid()))
  with check (customer_user_id = (select auth.uid()));

create or replace function provider_subs_guard_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.auto_accept_enabled then
        new.auto_accept_consented_at := pg_catalog.now();
      else
        new.auto_accept_consented_at := null;
      end if;
    elsif tg_op = 'UPDATE' then
      if new.auto_accept_enabled then
        -- keep an existing genuine consent instant; stamp now() on first enable
        new.auto_accept_consented_at :=
          coalesce(old.auto_accept_consented_at, pg_catalog.now());
      else
        new.auto_accept_consented_at := null;
      end if;
      -- provider-side status transitions are server-controlled (plan §9 / §2.4)
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_subs_guard on provider_subscriptions;
create trigger trg_provider_subs_guard
  before insert or update on provider_subscriptions
  for each row execute function provider_subs_guard_consent();

-- ════════════════ #7 · pending-invite expiry index needs a stable value ═════════
-- ix_provider_invites_pending_expiry filters WHERE status = 'pending', but
-- provider_invites.status is service-validated text with no default (unlike
-- household_invites' invite_status enum DEFAULT 'pending'). Default it to
-- 'pending' so the cron expiry sweep's partial index reliably covers new invites
-- even if a caller omits the column.
alter table provider_invites alter column status set default 'pending';
