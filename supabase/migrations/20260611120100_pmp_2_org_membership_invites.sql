-- PMP-2 (MP-A-010) · Provider tenancy tables: organizations, memberships,
-- invites, subscriptions — plus their indexes, partial-unique invariants, and
-- intrinsic checks.
--
-- Source of truth: design/meal-provider/01_design_spec.md § 8.1–8.4 (table
-- shapes) reconciled to repo conventions in
-- design/planning/meal-provider/04_database_and_rls_plan.md § 2.1–2.4.
--
-- ADR-2: providers are a SEPARATE tenancy type — never add provider fields to
-- household tables. `provider_organizations.id` is the provider tenant root;
-- every provider table scopes by `provider_id` (directly or via a parent).
--
-- Conventions (p0_5/p0_6/p0_10): gen_random_uuid() PKs; timestamptz + the shared
-- set_updated_at() BEFORE UPDATE trigger on mutable tables; inline PK/FK/CHECK +
-- inline unique constraints; standalone + partial-unique indexes alongside the
-- table (this is one feature migration, not the P0 big-bang split). The project's
-- ensure_rls event trigger auto-enables RLS on each new table — policies are
-- added in the companion pmp_7 migration in this same set.
--
-- Status columns kept `text` per design/01 § 8 (service-validated, not enums):
-- organizations.status, invites.status, subscriptions.status. Membership
-- role/status use the pmp_1 enums.

-- ── provider_organizations ─────────────────────────────────────────────────────
-- UC-PROVIDER-001. The provider tenant root. `owner_user_id` anchors ownership at
-- creation (before the owner membership row exists); the onboarding RPC
-- (MP-A-101) creates the active owner membership atomically. `status`/lifecycle
-- transitions are server-derived — never trusted from the client.
create table provider_organizations (
  id                        uuid primary key default gen_random_uuid(),
  owner_user_id             uuid not null references users (id),
  name                      text not null,
  email                     text,
  phone                     text,
  city                      text,
  state                     text,
  country                   text,
  timezone                  text not null, -- IANA tz; validated in the service layer
  status                    text not null,
  default_cutoff_local_time time,
  summary_email_recipients  text[] not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint provider_org_name_not_blank check (length(btrim(name)) > 0)
);

create trigger trg_set_updated_at before update on provider_organizations
  for each row execute function set_updated_at();

create index ix_provider_orgs_owner on provider_organizations (owner_user_id);

-- ── provider_memberships ───────────────────────────────────────────────────────
-- UC-MEMBER-*, UC-WORKSPACE-*. Parallel to household_members but a distinct
-- lifecycle: accept-invite lands in `awaiting_approval`, not `active` (ADR-5).
-- role/status/approved_by/approved_at are server-controlled.
create table provider_memberships (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references provider_organizations (id) on delete cascade,
  user_id             uuid not null references users (id) on delete cascade,
  role                provider_membership_role not null,
  status              provider_membership_status not null,
  invited_by_user_id  uuid references users (id) on delete set null,
  approved_by_user_id uuid references users (id) on delete set null,
  approved_at         timestamptz,
  joined_at           timestamptz,
  removed_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_set_updated_at before update on provider_memberships
  for each row execute function set_updated_at();

create index ix_provider_memberships_provider on provider_memberships (provider_id, status);
create index ix_provider_memberships_user on provider_memberships (user_id, status);

-- One live membership per (provider, user). Mirrors uq_one_live_membership; the
-- live set includes awaiting_approval since a pending customer still holds a slot.
create unique index uq_one_live_provider_membership
  on provider_memberships (provider_id, user_id)
  where status in ('invited', 'awaiting_approval', 'active');

-- ── provider_invites ───────────────────────────────────────────────────────────
-- UC-MEMBER-001/002 (ADR-5). Opaque sha256 token_hash at rest, reusing the
-- household invite security pattern. accept_provider_invite (MP-A-102) moves the
-- membership to awaiting_approval. token_hash is server-generated and immutable.
create table provider_invites (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references provider_organizations (id) on delete cascade,
  invited_by_user_id  uuid not null references users (id),
  invited_email       text,
  invited_phone       text,
  token_hash          text not null unique, -- sha256 hex at rest; see design/03 § 7
  status              text not null,
  expires_at          timestamptz not null,
  accepted_by_user_id uuid references users (id) on delete set null,
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint provider_invite_has_target
    check (invited_email is not null or invited_phone is not null)
);

create trigger trg_set_updated_at before update on provider_invites
  for each row execute function set_updated_at();

-- Pending-invite expiry sweep (mirrors ix_invites_pending_expiry); the unique
-- (token_hash) above already powers hashed-token lookup.
create index ix_provider_invites_pending_expiry
  on provider_invites (expires_at) where status = 'pending';

-- ── provider_subscriptions ─────────────────────────────────────────────────────
-- UC-SUBSCRIPTION-*, BR-002. Records auto-accept ELIGIBILITY/CONSENT only — no
-- price, no payment. Consent timestamp is set server-side when auto-accept is
-- enabled; the check makes "enabled without consent" unrepresentable.
create table provider_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  provider_id              uuid not null references provider_organizations (id) on delete cascade,
  customer_user_id         uuid not null references users (id) on delete cascade,
  status                   text not null,
  auto_accept_enabled      boolean not null default false,
  auto_accept_consented_at timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint provider_subscription_consent_required
    check (auto_accept_enabled = false or auto_accept_consented_at is not null),
  unique (provider_id, customer_user_id)
);

create trigger trg_set_updated_at before update on provider_subscriptions
  for each row execute function set_updated_at();
