-- P0-11 (hardening) · Lock down SECURITY DEFINER function exposure.
--
-- The advisor (lints 0028/0029) flags SECURITY DEFINER functions in `public` as
-- callable via PostgREST RPC by anon/authenticated. This restricts that surface.
-- Supabase grants execute to anon/authenticated/service_role explicitly AND via
-- PUBLIC, so we revoke from both PUBLIC and the named roles.
--
--   • is_active_member / has_permission — REVOKE from PUBLIC + anon; keep
--     authenticated + service_role. They MUST stay callable by `authenticated`
--     so the P0-12 RLS policies can invoke them; anon never needs them (no
--     session → auth.uid() is null → always false). Clears the anon (0028) lint;
--     the authenticated (0029) lint remains by design — exposure is self-scoped
--     (a user can only probe their OWN membership/permission) and benign.
--
--   • rls_auto_enable — a pre-existing event-trigger function that is never
--     called directly. REVOKE from PUBLIC + anon + authenticated. Event triggers
--     fire via the DDL system regardless of EXECUTE grants, so the auto-RLS
--     behavior is unaffected. Clears both 0028 + 0029 for it.

-- RLS helpers: callable only by authenticated + service_role.
revoke execute on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated, service_role;

revoke execute on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

-- Event-trigger function: not callable directly by any client role.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
