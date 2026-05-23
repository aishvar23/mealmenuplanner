-- P0-11 · RLS helper functions.
--
-- The two security-definer helpers that the P0-12 RLS policies (and the
-- service-layer guards) share, so the access rules are expressed once.
-- Source of truth: design/01_database_design.md § RLS, design/03 § 3.
--
--   • is_active_member(h)        — current user is an active, non-expired member
--   • has_permission(h, perm)    — current user is an active member of h whose
--                                  named can_* column is true
--
-- Both include the real-time `expires_at > now()` test, which is what makes
-- guest expiry enforced on every access, not just by the hourly job (design/03
-- § 8). They are SECURITY DEFINER so RLS policies that call them don't recurse
-- (the function runs as the table owner and reads household_members directly).
--
-- Hardening over the doc: search_path is pinned to '' with fully-qualified
-- object names (Supabase best practice for SECURITY DEFINER; the doc wrote
-- `search_path = public`). auth.uid() stays schema-qualified; now()/bool_or/
-- coalesce resolve from pg_catalog, which is always implicitly searched. Enum
-- literals coerce by column type, so no schema qualification is needed for them.

-- Is the current user an active (non-expired) member of this household?
create or replace function is_active_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = h
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- Does the current user hold a named can_* permission in this household?
-- `perm` is quoted as an identifier (%I) so it cannot be used for SQL injection;
-- a non-existent / non-boolean column simply errors rather than leaking data.
create or replace function has_permission(h uuid, perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ok boolean;
begin
  execute format(
    'select coalesce(bool_or(%I), false) from public.household_members
       where household_id = $1 and user_id = $2 and status = ''active''
         and (expires_at is null or expires_at > now())',
    perm
  )
  into ok
  using h, auth.uid();
  return ok;
end;
$$;
