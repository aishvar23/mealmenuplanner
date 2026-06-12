-- PMP-8 (MP-A-101) · Provider onboarding RPCs.
--
-- The atomic create + complete path for the provider owner onboarding wizard
-- (UC-PROVIDER-001/002, contract 03 § 8). Two SECURITY DEFINER functions own the
-- two writes a client must never do directly:
--
--   • create_provider_draft(name) — pmp_7b dropped porg_insert, so the org row
--     can ONLY be minted through a DEFINER RPC (a direct client insert would
--     create an org with a client-chosen status and, fatally, no membership →
--     invisible to porg_select). This creates the org in status='draft' AND the
--     active owner membership in ONE transaction (supabase-js issues one HTTP
--     statement per call, so a single function is the only way to get a real
--     transaction past the chicken-and-egg RLS bootstrap — the caller is not a
--     member yet, so pmem_insert under their own JWT would reject the owner row).
--     The draft org IS the provider-specific onboarding draft store (ADR-6
--     Option 2): it coexists with household_profile_drafts by construction and
--     needs no separate table. Resumable — a second call by the same owner with a
--     draft already open returns it instead of minting a duplicate.
--
--   • complete_provider_onboarding(provider_id) — flips a draft org to 'active'.
--     The pmp_7b provider_orgs_guard trigger silently preserves `status` on any
--     'authenticated'/'anon' write, so a client PATCH can never self-activate;
--     only this DEFINER RPC (running as the function owner, exempt from the
--     guard) may. Idempotent: an already-active org returns without rewriting.
--
-- Hardening mirrors complete_onboarding (p2_6) and the provider RLS helpers
-- (pmp_7): search_path pinned to '' with fully-qualified names, auth.uid()
-- schema-qualified, now() from pg_catalog; EXECUTE revoked from public/anon and
-- granted only to `authenticated` (anon has no session → auth.uid() is null → the
-- function raises). Both operate only on the caller's own org, so the advisor's
-- self-scoped DEFINER lint applies by design.
--
-- Timezone note: provider_organizations.timezone is NOT NULL, but the frozen
-- create contract (ProviderCreateInput) carries only `name`. The draft is seeded
-- with 'UTC' as a placeholder; the wizard immediately PATCHes the owner's real
-- IANA zone (porg_update), and the service layer validates it as a real zone
-- before completion. 'UTC' is itself a valid zone, so a provider that genuinely
-- runs in UTC still completes.
--
-- Rollback: drop both functions (the draft orgs they created stay; delete via the
-- provider delete path if needed).

-- ════════════════════════ create_provider_draft ════════════════════════════
-- Returns the (new or resumed) draft provider id. The caller becomes the active
-- owner immediately so they can PATCH settings (porg_update → is_provider_owner)
-- and resume across devices (the draft surfaces through porg_select).
create or replace function public.create_provider_draft(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := auth.uid();
  v_name        text := btrim(coalesce(p_name, ''));
  v_provider_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  if length(v_name) = 0 then
    raise exception 'provider name is required'
      using errcode = '23514'; -- check_violation → ValidationError
  end if;

  -- Resume: a caller who already has an open draft gets it back rather than a
  -- second orphan org (idempotent against a double-submit; the wizard also
  -- resumes server-side before reaching here).
  select o.id into v_provider_id
  from public.provider_organizations o
  where o.owner_user_id = v_user_id
    and o.status = 'draft'
  order by o.created_at asc
  limit 1;

  if v_provider_id is not null then
    return v_provider_id;
  end if;

  insert into public.provider_organizations (owner_user_id, name, timezone, status)
  values (v_user_id, v_name, 'UTC', 'draft')
  returning id into v_provider_id;

  -- Owner: active immediately, self-approved (no inviter). Mirrors the household
  -- owner bootstrap in complete_onboarding.
  insert into public.provider_memberships (
    provider_id, user_id, role, status,
    joined_at, approved_at, approved_by_user_id
  )
  values (
    v_provider_id, v_user_id, 'owner', 'active',
    pg_catalog.now(), pg_catalog.now(), v_user_id
  );

  return v_provider_id;
end;
$$;

revoke execute on function public.create_provider_draft(text) from public, anon;
grant  execute on function public.create_provider_draft(text) to authenticated;

-- ═══════════════════ complete_provider_onboarding ══════════════════════════
-- Promote the caller's own draft org to 'active'. Owner-scoped via the immutable
-- owner_user_id (server-set at create, frozen by the guard trigger). Idempotent.
create or replace function public.complete_provider_onboarding(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  text;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  -- Lock the org so concurrent completes serialize (idempotency). Scope to the
  -- caller's own org: a non-owner finds no row → NotFound, never a leak.
  select o.status into v_status
  from public.provider_organizations o
  where o.id = p_provider_id
    and o.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'provider not found'
      using errcode = 'P0002'; -- no_data_found → NotFoundError (404)
  end if;

  -- Idempotent replay: an already-active org is left untouched.
  if v_status = 'active' then
    return;
  end if;

  if v_status <> 'draft' then
    raise exception 'provider is not an in-progress draft'
      using errcode = '23514'; -- check_violation
  end if;

  update public.provider_organizations
  set status = 'active'
  where id = p_provider_id;
end;
$$;

revoke execute on function public.complete_provider_onboarding(uuid) from public, anon;
grant  execute on function public.complete_provider_onboarding(uuid) to authenticated;
