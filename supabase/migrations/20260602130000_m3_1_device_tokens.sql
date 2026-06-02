-- M3-1 · device_tokens — Expo push tokens per user/device (design/10 § 7).
--
-- The native app obtains an Expo push token after sign-in and upserts it here so
-- the push adapter (M3-2) can fan a household event out to a recipient's devices.
-- A token is unique to a device install, so `unique (token)`: re-registering the
-- same device just refreshes its row, and the same device signing in as a
-- DIFFERENT user reassigns the token to the new user (the last signed-in user
-- owns it) — otherwise a push could reach the wrong account on a shared device.
--
-- Email + in-app channels are unchanged; this is purely additive groundwork for
-- native push (the dispatch adapter and registration land in M3-2 / M3-3).

create table device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references users (id) on delete cascade,
  -- The Expo push token (ExponentPushToken[…]); unique per device install.
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

comment on table device_tokens is
  'Expo push tokens per user/device (design/10 § 7). One row per device token; the most-recent signed-in user owns it.';

-- Dispatch looks tokens up by recipient user, so index user_id.
create index ix_device_tokens_user_id on device_tokens (user_id);

create trigger trg_set_updated_at before update on device_tokens
  for each row execute function set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- Self-only: a user reads and manages ONLY their own device tokens. Mirrors the
-- nep_* / ufp_* style, including the (select auth.uid()) wrapping for the
-- init-plan caching perf pattern. Cross-user reassignment on a shared device is
-- handled by the SECURITY DEFINER register_device_token() below (a plain upsert
-- under RLS could not update another user's row).
alter table device_tokens enable row level security;
create policy device_tokens_select on device_tokens
  for select using (user_id = (select auth.uid()));
create policy device_tokens_insert on device_tokens
  for insert with check (user_id = (select auth.uid()));
create policy device_tokens_update on device_tokens
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy device_tokens_delete on device_tokens
  for delete using (user_id = (select auth.uid()));

-- register_device_token() — upsert the caller's Expo push token (design/10 § 7).
--
-- SECURITY DEFINER so it can reassign a token already owned by ANOTHER user on a
-- shared device (RLS update would block that). It always stamps user_id =
-- auth.uid(), so a caller can only ever claim a token FOR THEMSELVES — never seed
-- one for someone else. Hardened like the other RPCs: search_path = '' with
-- fully-qualified names; EXECUTE revoked from public/anon, granted to authenticated.
create or replace function public.register_device_token(
  p_token    text,
  p_platform text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'token is required' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;

  insert into public.device_tokens (user_id, token, platform)
  values (v_user, btrim(p_token), p_platform)
  on conflict (token) do update
    set user_id    = excluded.user_id,
        platform   = excluded.platform,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;
