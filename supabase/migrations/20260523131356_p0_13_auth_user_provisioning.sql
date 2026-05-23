-- P0-13 · auth.users → public.users profile provisioning.
--
-- Supabase owns auth.users (credentials/providers); the app owns public.users
-- (profile mirror). This after-insert trigger upserts the matching public.users
-- row so a profile always exists immediately after signup, for every provider.
-- Source of truth: design/03 § 1.
--
-- SECURITY DEFINER so it can write public.users regardless of the inserting
-- role (and it bypasses the users RLS, which has no insert policy). search_path
-- pinned to '' with fully-qualified names (public.users, ::public.auth_provider);
-- now()/coalesce and the jsonb ->>/? operators resolve from pg_catalog, always
-- searched. The `on conflict (id) do update` makes it idempotent (safe re-run /
-- backfill).
--
-- The provider mapping reads Supabase's GoTrue metadata: raw_app_meta_data
-- ('provider') and raw_user_meta_data (full_name/name, avatar_url).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, phone, display_name, avatar_url, auth_provider)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when new.raw_app_meta_data ->> 'provider' = 'google' then 'google'::public.auth_provider
      when (new.raw_user_meta_data ? 'magic_link') then 'magic_link'::public.auth_provider
      else 'email'::public.auth_provider
    end
  )
  on conflict (id) do update
    set email        = excluded.email,
        phone        = coalesce(excluded.phone, public.users.phone),
        display_name = coalesce(excluded.display_name, public.users.display_name),
        avatar_url   = coalesce(excluded.avatar_url, public.users.avatar_url),
        updated_at   = now();
  return new;
end;
$$;

-- Trigger function: invoked only by the trigger below (never called directly),
-- so lock down direct execution. Triggers fire regardless of EXECUTE grants, so
-- this does not affect provisioning. Keeps it off the SECURITY DEFINER advisor.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists trg_provision_user_profile on auth.users;
create trigger trg_provision_user_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
