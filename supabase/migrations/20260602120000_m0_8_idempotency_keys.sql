-- M0-8 · Server-side Idempotency-Key replay protection for the generation
-- endpoints (design/04 § 3, design/10 § 4).
--
-- The three generation endpoints are non-idempotent by nature (each call could
-- create a new meal_plans / grocery_lists row) and are the most likely to be
-- retried on a flaky mobile connection. They honor an `Idempotency-Key` request
-- header: the first call with a key executes and persists its response; a replay
-- with the same key + identical request returns the stored response without
-- re-running generation; the same key with a *different* request body is a
-- 409 (`idempotency_key_reused`). Keys live for a 24h window.
--
-- This complements — does not replace — the DB invariants (e.g.
-- uq_active_plan_per_start still prevents two active plans for one start date
-- even if idempotency is bypassed).
--
-- Keyed to (household_id, idempotency_key). `request_hash` is a hash of the
-- endpoint + canonical request body, so a replay can tell "same request" (→
-- replay) from "key reused for a different request" (→ conflict). The response
-- is stored verbatim (status + JSON body) so a replay is byte-for-byte identical.

create table idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households (id) on delete cascade,
  idempotency_key text not null,
  -- Actor who first used the key; recorded for audit, defaults to the JWT user.
  user_id         uuid not null default auth.uid() references users (id) on delete cascade,
  -- Endpoint discriminator (e.g. 'meal-plans/today/generate') folded into the
  -- request hash, so the same key on a different endpoint is a reuse conflict.
  endpoint        text not null,
  -- Hash of (endpoint + canonical request body); identical request ⇒ replay.
  request_hash    text not null,
  response_status int  not null check (response_status between 100 and 599),
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),
  -- 24h replay window; a lookup ignores rows past this, so an expired key
  -- re-executes rather than replaying stale output.
  expires_at      timestamptz not null default now() + interval '24 hours',
  unique (household_id, idempotency_key)
);

comment on table idempotency_keys is
  'Idempotency-Key replay store for the generation endpoints (design/04 § 3). One row per (household_id, idempotency_key); response stored verbatim for a 24h replay window.';

-- Supports the purge of stale keys (a future scheduled job) and keeps the active
-- working set small.
create index ix_idempotency_keys_expires_at on idempotency_keys (expires_at);

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- Member-scoped: a user can only see / write idempotency rows for households they
-- are an active member of. The specific can_change_* permission for each endpoint
-- is enforced in the service layer before a row is ever persisted; membership is
-- the RLS backstop (a removed member reading no rows simply re-executes).
alter table idempotency_keys enable row level security;
create policy idempotency_keys_select on idempotency_keys
  for select using (is_active_member(household_id));
create policy idempotency_keys_write on idempotency_keys
  for all using (is_active_member(household_id))
  with check (is_active_member(household_id));
