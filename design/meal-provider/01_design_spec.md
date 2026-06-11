# Meal Provider Workspace — Production Design Specification for Claude Code

## Document purpose

This document is an implementation design for adding a Meal Provider workspace to the existing `aishvar23/mealmenuplanner` application.

It is written for a two-developer team using Claude Code.

The design is intentionally split into independent workstreams so both developers can build in parallel with minimal coordination. Shared contracts are defined first. Each workstream owns separate files and database objects wherever practical.

This document does not assume that prior product discussions reflect the repository. The repository is the source of truth.

Where the repository state could not be verified from the available code or design files, this document contains an explicit:

> **CLAUDE CODE VERIFY**

instruction instead of inventing an implementation detail.

---

# 1. Verified current repository state

The following facts were verified from the repository.

## 1.1 Framework and tooling

Verified from `package.json`:

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase Auth and PostgreSQL
- Tailwind CSS
- shadcn
- Vitest
- Playwright
- npm workspaces
- Native mobile workspace under `mobile`
- Shared package workspace under `packages/*`

Existing scripts include:

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run db:reset`
- `npm run db:types`

## 1.2 Existing architectural conventions

Verified from `design/02_system_architecture.md` and code:

- UI uses App Router pages and components.
- Business rules belong in service modules.
- Route handlers and server actions are thin boundaries.
- User-initiated database access uses a per-request, RLS-scoped Supabase client.
- Service-role access is restricted to background jobs and privileged tooling.
- Typed domain errors are expected.
- PostgreSQL RLS is the tenancy backstop.
- Database schema changes are migration-driven.
- API DTOs use camelCase.
- Database rows use snake_case.
- Translation happens at the HTTP/server-action boundary.
- Activity events and notification fan-out are part of state-changing workflows.
- Mobile clients call the same `/api/*` routes using bearer tokens.

## 1.3 Existing tenancy model

Verified from `design/01_database_design.md`:

- Current primary tenancy boundary is `household_id`.
- Users may belong to multiple households.
- Household membership includes roles, statuses, and denormalized permission flags.
- Soft state is preferred over hard deletion.
- UUID primary keys are used.
- `timestamptz` is used for timestamps.
- Native Postgres enums are used for fixed sets.
- `users` currently contains active/preferred household references.

## 1.4 Existing authenticated shell

Verified from `app/(app)/layout.tsx`:

- The current authenticated shell assumes an active household.
- `resolveCurrentHousehold()` is called before rendering.
- A user without an active household is redirected to `/onboarding`.
- The shell renders household navigation.
- The shell currently cannot host a provider-only customer who has no household.

This is a blocking architectural fact. Meal Provider support cannot be implemented correctly by merely adding pages under the current `(app)` route group.

## 1.5 Existing navigation

Verified from `components/app-nav.tsx`:

Current navigation is household-specific:

- Today
- Week
- Grocery
- Preferences
- Members

The Meal Provider owner and Meal Provider member require separate navigation.

## 1.6 Existing authentication transport

Verified from `lib/db/server.ts`:

- Web requests use Supabase cookies.
- Native clients may use `Authorization: Bearer`.
- The implementation prevents cookie/header split identity.
- New APIs must use the existing `createServerSupabaseClient()` path.
- Do not introduce a second authentication mechanism.

## 1.7 Existing API conventions

Verified from `design/04_api_design.md`:

- Stable route-handler URLs are preferred for mobile compatibility.
- Route handlers authenticate, authorize, delegate, and serialize.
- Standard error envelopes exist.
- Generation endpoints use idempotency keys.
- Cross-tenant resources should not leak existence.
- Cursor pagination is the project convention.

---

# 2. Product boundary

The Meal Provider functionality is:

> Menu publication, member response collection, cutoff enforcement, preparation aggregation, email summary, CSV export, and print output for a small home-meal provider.

It is not:

- Delivery management
- Pickup management
- Payment processing
- Marketplace discovery
- Inventory management
- Customer chat
- Provider capacity management
- Route planning
- Refund processing

The implementation must not introduce fields, screens, or workflows for those excluded domains.

---

# 3. Non-negotiable product rules

1. No member response means no order.
2. Auto-accept is allowed only for an explicit subscription membership with recorded consent.
3. Spice and salt changes are included substitutions.
4. Provider defines which additional customizations have external price labels.
5. Members can cancel before cutoff.
6. Members cannot modify or cancel after cutoff.
7. Provider can override after cutoff.
8. Provider override requires a reason and creates an audit record.
9. Customer calls after cutoff are outside the app.
10. New provider members require provider approval.
11. A customer may belong to multiple providers.
12. One menu applies to all provider members in MVP.
13. Allergy information is a warning only.
14. CSV and print are required at launch.
15. Payment is not collected or tracked in MVP.
16. Pickup and delivery are not modeled.
17. The provider publishes a menu date and cutoff timestamp only.
18. Provider members receive minimal onboarding and land on Today's Menu.
19. Provider members are not household members.
20. Unlimited extras are forbidden.

---

# 4. Architecture decision

## 4.1 Introduce workspace tenancy

The current app assumes household tenancy.

The new product requires two tenancy types:

- Household workspace
- Provider workspace

Do not add provider fields to `households`.
Do not store provider customers in `household_members`.

Create provider-specific tables and services.

## 4.2 Preserve one user identity

Use the existing Supabase user identity.

A user can simultaneously be:

- Household owner/member
- Provider owner
- Customer of Provider A
- Customer of Provider B

Do not create duplicate auth users for roles.

## 4.3 Route-group separation

The current `(app)` layout must remain household-specific unless deliberately refactored.

Recommended route structure:

```text
app/
  (marketing)/
  (auth)/
  onboarding/                    # existing household onboarding

  (household-app)/
    layout.tsx                   # extracted current household shell
    today/
    plan/
    grocery/
    preferences/
    household/
    notifications/

  (provider-owner-app)/
    provider/
      layout.tsx
      dashboard/
      menu/
      menu/[menuDayId]/
      members/
      preparation/
      settings/

  (provider-member-app)/
    providers/
      [providerId]/
        layout.tsx
        today/
        week/
        responses/
        account/

  api/
    providers/
    provider-invites/
    provider-menu-days/
    provider-responses/
    provider-preparation-batches/
```

### CLAUDE CODE VERIFY

Before moving the current `(app)` route group:

1. Enumerate all pages currently under `app/(app)`.
2. Identify all imports or tests that hardcode route-group paths.
3. Confirm that moving the route group does not change public URLs.
4. If moving the group creates unnecessary churn, keep `(app)` as the household shell and add the provider route groups alongside it.
5. Do not rename public household URLs unless a migration/redirect plan is added.

---

# 5. Independent developer workstreams

The implementation is divided into two tracks.

## Track A — Provider domain, database, APIs, aggregation, exports

Owner: Developer A

Primary responsibility:

- Provider database model
- Migrations
- RLS
- Provider domain services
- Provider APIs
- Cutoff logic
- Aggregation
- CSV generation
- Print data model
- Email summary backend
- Unit and integration tests

Track A must not depend on unfinished provider UI.

## Track B — Workspace routing, onboarding, owner UI, member UI

Owner: Developer B

Primary responsibility:

- Workspace resolution
- Provider owner shell
- Provider member shell
- Provider onboarding UI
- Member invite/approval UI
- Menu authoring UI
- Today's Menu UI
- Member response UI
- Lock-state UX
- Provider preparation UI
- Print page rendering
- Playwright E2E tests

Track B must initially use typed fake adapters or mock route handlers matching the contracts in this document.

## Shared convergence points

The developers should integrate only at these checkpoints:

### Integration checkpoint 1: Types and API contracts

Merge first:

- Provider enums
- Provider DTOs
- API route names
- Error codes
- Wire schemas/validators

No UI or database dependency is required at this checkpoint.

### Integration checkpoint 2: Read-only flows

Merge:

- Workspace resolver
- Provider list
- Provider menu read APIs
- Provider shells
- Today's Menu read-only page

### Integration checkpoint 3: Mutation flows

Merge:

- Invitation
- Approval
- Menu publication
- Member response
- Cancellation
- Cutoff enforcement

### Integration checkpoint 4: Batch and exports

Merge:

- Preparation batch
- Provider preparation page
- CSV
- Print
- Email summary

---

# 6. File ownership boundaries

These boundaries reduce merge conflicts.

## Developer A owns

```text
supabase/migrations/*provider*.sql
supabase/functions/provider-*/
lib/services/provider/
lib/repositories/provider/
lib/provider-domain/
lib/events/provider-*
lib/validators/provider-*
app/api/providers/
app/api/provider-invites/
app/api/provider-menu-days/
app/api/provider-responses/
app/api/provider-preparation-batches/
packages/shared/src/provider/
```

### CLAUDE CODE VERIFY

The exact shared-package path must be verified from `packages/*`.
Use the existing package naming and export conventions.
Do not create a second shared package if `@mmp/shared` already exists and is appropriate.

## Developer B owns

```text
app/(provider-owner-app)/
app/(provider-member-app)/
components/provider/
components/workspace/
components/provider-member/
components/provider-owner/
e2e/provider-*.spec.ts
```

## Shared files requiring serialized edits

Only one developer should modify each shared file at a time:

```text
components/auth/account-menu.tsx
proxy.ts
lib/auth/*
lib/db/database.types.ts
app layout files
package.json
packages/shared package exports
design/04_api_design.md
```

Use small dedicated integration commits for these files.

---

# 7. Shared contract package

Both tracks must begin by creating or extending shared provider contracts.

## 7.1 Required enums

Use TypeScript string unions or generated database types according to existing repository conventions.

```ts
export type ProviderMembershipRole = "owner" | "customer";

export type ProviderMembershipStatus =
  | "invited"
  | "awaiting_approval"
  | "active"
  | "rejected"
  | "removed";

export type ProviderMenuStatus =
  | "draft"
  | "published"
  | "locked"
  | "archived"
  | "cancelled";

export type ProviderResponseStatus =
  | "no_response"
  | "draft"
  | "confirmed"
  | "cancelled"
  | "auto_accepted"
  | "locked"
  | "provider_overridden";

export type ProviderSuggestionStatus =
  | "pending"
  | "accepted_as_option"
  | "rejected"
  | "deferred";

export type ProviderComponentGroup =
  | "main"
  | "dal_or_legume"
  | "sabzi"
  | "bread"
  | "rice"
  | "side"
  | "add_on";

export type ProviderSpiceLevel = "non_spicy" | "mild" | "regular" | "spicy";

export type ProviderSaltLevel = "low_salt" | "regular_salt" | "high_salt";

export type ProviderCustomizationType =
  | "single_select"
  | "multi_select"
  | "quantity_increment"
  | "boolean"
  | "text_note";
```

### CLAUDE CODE VERIFY

Check existing DB enum and TypeScript naming conventions.
If the repository prefers inferred types from generated Supabase definitions, define request DTO unions separately but do not duplicate database types unnecessarily.

## 7.2 Stable error codes

Add provider-specific codes to the existing standard error system:

```text
PROVIDER_MEMBERSHIP_REQUIRED
PROVIDER_APPROVAL_REQUIRED
PROVIDER_OWNER_REQUIRED
MENU_NOT_PUBLISHED
MENU_ALREADY_LOCKED
MENU_INCOMPLETE
CUTOFF_PASSED
CUTOFF_INVALID
RESPONSE_ALREADY_LOCKED
INVALID_MENU_ALTERNATIVE
INVALID_CUSTOMIZATION
CUSTOMIZATION_LIMIT_EXCEEDED
AUTO_ACCEPT_NOT_ALLOWED
AUTO_ACCEPT_CONSENT_REQUIRED
BATCH_NOT_AVAILABLE
BATCH_STALE
```

Map these into the repository's existing typed-error mechanism.

Do not create a second error envelope.

---

# 8. Database design

All table names below are proposed additions.

Claude Code must compare them against all existing migrations before implementation.

## 8.1 `provider_organizations`

```sql
create table provider_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  name text not null,
  email text,
  phone text,
  city text,
  state text,
  country text,
  timezone text not null,
  status text not null,
  default_cutoff_local_time time,
  summary_email_recipients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Required constraints:

- Non-empty trimmed name
- Valid IANA time zone enforced in service if DB cannot enforce
- Owner must have active owner membership after onboarding completes

## 8.2 `provider_memberships`

```sql
create table provider_memberships (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role provider_membership_role not null,
  status provider_membership_status not null,
  invited_by_user_id uuid references users(id) on delete set null,
  approved_by_user_id uuid references users(id) on delete set null,
  approved_at timestamptz,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

- `(provider_id, status)`
- `(user_id, status)`
- partial unique index for one live membership per provider/user

Live statuses:

- invited
- awaiting_approval
- active

## 8.3 `provider_invites`

Use opaque hashed tokens, following existing household invite security patterns.

```sql
create table provider_invites (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  invited_by_user_id uuid not null references users(id),
  invited_email text,
  invited_phone text,
  token_hash text not null unique,
  status text not null,
  expires_at timestamptz not null,
  accepted_by_user_id uuid references users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### CLAUDE CODE VERIFY

Inspect existing household invite implementation.
Reuse its token creation, hashing, preview RPC, expiry behavior, and email abstraction if production-safe.
Do not copy and diverge without justification.

## 8.4 `provider_subscriptions`

This table records eligibility for auto-accept only.

It does not store price or payment.

```sql
create table provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  customer_user_id uuid not null references users(id) on delete cascade,
  status text not null,
  auto_accept_enabled boolean not null default false,
  auto_accept_consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Constraint:

- `auto_accept_enabled = false` or `auto_accept_consented_at is not null`

## 8.5 `provider_catalog_items`

Do not overload household `dishes` until compatibility is verified.

```sql
create table provider_catalog_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  source_dish_id uuid references dishes(id) on delete set null,
  name text not null,
  component_group provider_component_group not null,
  canonical_unit text not null,
  default_quantity numeric not null check (default_quantity > 0),
  image_url text,
  is_active boolean not null default true,
  supports_spice_level boolean not null default false,
  supports_salt_level boolean not null default false,
  allergy_warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Rationale:

- Provider items may reuse an existing dish.
- Provider-specific names, units, portions, and availability differ from household dish metadata.
- `source_dish_id` permits reuse without coupling the provider domain to household planning assumptions.

## 8.6 `provider_weekly_menus`

```sql
create table provider_weekly_menus (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  status provider_menu_status not null default 'draft',
  published_at timestamptz,
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end_date >= week_start_date)
);
```

Unique active week policy must be decided from code requirements.

### CLAUDE CODE VERIFY

Determine whether overlapping weekly menus should be forbidden.
Do not add a unique index until actual UI and publishing behavior are confirmed.

## 8.7 `provider_menu_days`

```sql
create table provider_menu_days (
  id uuid primary key default gen_random_uuid(),
  weekly_menu_id uuid not null references provider_weekly_menus(id) on delete cascade,
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  menu_date date not null,
  cutoff_at timestamptz not null,
  status provider_menu_status not null default 'draft',
  note text,
  published_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Constraint:

- unique provider/menu date for non-archived state, if consistent with existing product behavior

## 8.8 `provider_menu_components`

```sql
create table provider_menu_components (
  id uuid primary key default gen_random_uuid(),
  menu_day_id uuid not null references provider_menu_days(id) on delete cascade,
  component_group provider_component_group not null,
  default_catalog_item_id uuid not null references provider_catalog_items(id),
  default_quantity numeric not null check (default_quantity > 0),
  canonical_unit text not null,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 8.9 `provider_menu_alternatives`

```sql
create table provider_menu_alternatives (
  id uuid primary key default gen_random_uuid(),
  menu_component_id uuid not null references provider_menu_components(id) on delete cascade,
  catalog_item_id uuid not null references provider_catalog_items(id),
  quantity numeric not null check (quantity > 0),
  canonical_unit text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_component_id, catalog_item_id)
);
```

## 8.10 `provider_customization_groups`

```sql
create table provider_customization_groups (
  id uuid primary key default gen_random_uuid(),
  menu_component_id uuid not null references provider_menu_components(id) on delete cascade,
  name text not null,
  customization_type provider_customization_type not null,
  included_in_price boolean not null default true,
  is_required boolean not null default false,
  minimum_selections integer not null default 0,
  maximum_selections integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 8.11 `provider_customization_options`

```sql
create table provider_customization_options (
  id uuid primary key default gen_random_uuid(),
  customization_group_id uuid not null references provider_customization_groups(id) on delete cascade,
  code text not null,
  label text not null,
  quantity_delta numeric,
  canonical_unit text,
  external_price_label text,
  minimum_quantity numeric,
  maximum_quantity numeric,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customization_group_id, code)
);
```

Validation rules:

- Spice and salt groups are included in price.
- Quantity extras have finite maximums.
- `external_price_label` is informational only.
- No payment state is created.

## 8.12 `provider_member_responses`

```sql
create table provider_member_responses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  menu_day_id uuid not null references provider_menu_days(id) on delete cascade,
  member_user_id uuid not null references users(id) on delete cascade,
  status provider_response_status not null default 'draft',
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  locked_at timestamptz,
  auto_accepted boolean not null default false,
  provider_overridden boolean not null default false,
  provider_override_reason text,
  member_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_day_id, member_user_id)
);
```

Use optimistic concurrency:

- Client sends expected version.
- Mutation updates where `version = expectedVersion`.
- Increment version on success.
- Return conflict on stale write.

## 8.13 `provider_member_response_items`

```sql
create table provider_member_response_items (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references provider_member_responses(id) on delete cascade,
  menu_component_id uuid not null references provider_menu_components(id),
  selected_catalog_item_id uuid not null references provider_catalog_items(id),
  quantity numeric not null check (quantity > 0),
  canonical_unit text not null,
  spice_level provider_spice_level,
  salt_level provider_salt_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (response_id, menu_component_id)
);
```

## 8.14 `provider_member_response_customizations`

```sql
create table provider_member_response_customizations (
  id uuid primary key default gen_random_uuid(),
  response_item_id uuid not null references provider_member_response_items(id) on delete cascade,
  customization_option_id uuid not null references provider_customization_options(id),
  quantity numeric,
  created_at timestamptz not null default now(),
  unique (response_item_id, customization_option_id)
);
```

## 8.15 `provider_meal_suggestions`

```sql
create table provider_meal_suggestions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  menu_day_id uuid not null references provider_menu_days(id) on delete cascade,
  member_user_id uuid not null references users(id) on delete cascade,
  suggestion_text text not null,
  status provider_suggestion_status not null default 'pending',
  provider_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 8.16 `provider_preparation_batches`

```sql
create table provider_preparation_batches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_organizations(id) on delete cascade,
  menu_day_id uuid not null references provider_menu_days(id) on delete cascade,
  revision integer not null,
  generated_at timestamptz not null default now(),
  status text not null,
  total_confirmed integer not null default 0,
  total_auto_accepted integer not null default 0,
  total_cancelled integer not null default 0,
  total_no_response integer not null default 0,
  source_response_watermark timestamptz,
  email_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_day_id, revision)
);
```

## 8.17 `provider_preparation_batch_lines`

```sql
create table provider_preparation_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references provider_preparation_batches(id) on delete cascade,
  catalog_item_id uuid not null references provider_catalog_items(id),
  spice_level provider_spice_level,
  salt_level provider_salt_level,
  included_quantity numeric not null default 0,
  extra_quantity numeric not null default 0,
  total_quantity numeric not null,
  canonical_unit text not null,
  created_at timestamptz not null default now()
);
```

## 8.18 Provider activity events

### CLAUDE CODE VERIFY

Inspect `household_activity_events` and notification implementation.

Preferred options, in order:

1. Generalize existing event infrastructure with a workspace discriminator.
2. Create `provider_activity_events` using the same event-envelope pattern.
3. Do not force provider events into a table requiring `household_id`.

The selected approach must preserve:

- actor
- provider tenant
- event type
- entity type/id
- old/new values
- created timestamp

---

# 9. Row-level security

RLS is mandatory for every provider table.

## 9.1 Required helper functions

Create security-definer helper functions only if consistent with current migration conventions.

Conceptual helpers:

```sql
is_active_provider_member(provider_id uuid)
is_provider_owner(provider_id uuid)
can_view_provider_menu(provider_id uuid)
can_manage_provider(provider_id uuid)
```

## 9.2 Owner permissions

Provider owner can:

- Read/write provider profile
- Manage catalog
- Create/edit/publish menus
- Invite members
- Approve/reject members
- View all responses
- Override locked responses
- Generate/view batches
- Export CSV
- View print page
- Send/resend summary

## 9.3 Customer permissions

Active approved customer can:

- Read published provider menus
- Read own response
- Create/update/cancel own response before cutoff
- Read own suggestions
- Create own suggestion

Customer cannot:

- Read other customer responses
- Read aggregate batch
- Read provider member list
- Edit menu
- Approve members
- Override cutoff

## 9.4 Cutoff enforcement

RLS alone is insufficient for complex timestamp mutation rules.

Enforce cutoff in:

1. Service layer
2. Transaction/RPC or DB function that checks `cutoff_at > now()`
3. RLS tenant isolation

Do not implement cutoff only in UI.

---

# 10. Service design

Use the existing `lib/services` convention.

## 10.1 `providerWorkspaceService`

Responsibilities:

- List provider workspaces for current user
- Resolve active provider workspace
- Set active workspace if workspace persistence is implemented
- Return owner/customer role and membership status

### CLAUDE CODE VERIFY

The current `users` row has household-specific active/preferred fields.
Do not reuse `active_household_id` for providers.

Choose one verified implementation:

- Add generic `user_workspace_preferences`
- Add `active_provider_id` and a workspace-type selector
- Keep active workspace client-side initially

The choice must be documented and tested before implementation.

## 10.2 `providerOnboardingService`

Responsibilities:

- Create provider organization
- Create owner membership
- Save provider settings
- Complete onboarding atomically

Requirements:

- Use transaction/RPC if organization and owner membership must be created together.
- On partial failure, no orphan provider should remain active.

## 10.3 `providerMembershipService`

Responsibilities:

- Create invite
- Preview invite
- Accept invite
- Move accepted invite to awaiting approval
- Approve/reject member
- Remove member
- List customers

## 10.4 `providerCatalogService`

Responsibilities:

- Create/update/archive catalog item
- Validate canonical unit
- Validate provider ownership
- Link optional source dish
- Return active catalog grouped by component type

## 10.5 `providerMenuService`

Responsibilities:

- Create weekly menu
- Add menu days
- Add components
- Add alternatives
- Add customization groups/options
- Validate complete menu package
- Publish menu
- Read today's published menu
- Lock menu day

A published menu should be immutable except through an explicit revision workflow.

### Recommended rule

Before cutoff:

- Provider may edit published menu.
- Existing member drafts/confirmed responses that become invalid must be detected.
- Do not silently rewrite member responses.

### CLAUDE CODE VERIFY

The existing app's edit/revalidation patterns must be inspected.
If no safe invalidation workflow exists, lock structural edits after the first member confirms and require provider to cancel/recreate menu.

Do not guess.

## 10.6 `providerResponseService`

Responsibilities:

- Create draft
- Validate selected alternatives
- Validate customizations
- Confirm response
- Update response before cutoff
- Cancel response before cutoff
- Auto-accept eligible subscription at cutoff
- Provider override after cutoff
- Maintain optimistic version
- Emit events

All writes should be transactional.

## 10.7 `providerCutoffService`

Responsibilities:

- Find menu days reaching cutoff
- Lock eligible responses
- Calculate no-response count
- Auto-accept eligible subscriptions
- Mark menu day locked
- Generate preparation batch
- Queue summary email

Must be idempotent.

Suggested idempotency boundary:

- Unique batch revision for initial lock
- Advisory lock or transactional menu-day state transition
- Re-running initial cutoff does not create duplicate orders or totals

## 10.8 `providerAggregationService`

Pure domain function plus persistence adapter.

Input:

- Locked responses
- Response items
- Customizations
- Menu components
- Catalog items

Output:

```ts
type PreparationLine = {
  catalogItemId: string;
  itemName: string;
  componentGroup: ProviderComponentGroup;
  spiceLevel: ProviderSpiceLevel | null;
  saltLevel: ProviderSaltLevel | null;
  includedQuantity: number;
  extraQuantity: number;
  totalQuantity: number;
  canonicalUnit: string;
};
```

Aggregation key:

```text
catalogItemId
+ canonicalUnit
+ spiceLevel
+ saltLevel
+ relevant production variant
```

Never aggregate incompatible units.

## 10.9 `providerExportService`

Responsibilities:

- Produce aggregate CSV
- Produce individual CSV
- Produce print-view DTO

CSV output must:

- use UTF-8
- have deterministic ordering
- escape commas/quotes/newlines
- avoid formula injection

Formula-injection defense:

Prefix cells beginning with:

```text
=
+
-
@
```

with a safe apostrophe or use an established CSV serializer with spreadsheet-injection mitigation.

## 10.10 `providerSummaryEmailService`

Responsibilities:

- Build email DTO from a persisted batch revision
- Send using existing email abstraction
- Record queued/sent/failed state
- Support explicit resend
- Never recompute batch inside email rendering

---

# 11. API design

Follow existing API conventions and error envelope.

## 11.1 Workspace discovery

```http
GET /api/providers
```

Returns providers where caller is owner or active/awaiting customer.

## 11.2 Provider organization

```http
POST /api/providers
GET /api/providers/{providerId}
PATCH /api/providers/{providerId}
POST /api/providers/{providerId}/complete-onboarding
```

## 11.3 Invites and approval

```http
POST /api/providers/{providerId}/invites
GET /api/provider-invites/{token}
POST /api/provider-invites/{token}/accept
POST /api/providers/{providerId}/members/{memberId}/approve
POST /api/providers/{providerId}/members/{memberId}/reject
POST /api/providers/{providerId}/members/{memberId}/remove
GET /api/providers/{providerId}/members
```

## 11.4 Catalog

```http
GET /api/providers/{providerId}/catalog
POST /api/providers/{providerId}/catalog
PATCH /api/providers/{providerId}/catalog/{catalogItemId}
```

## 11.5 Menus

```http
GET /api/providers/{providerId}/menus
POST /api/providers/{providerId}/menus
GET /api/provider-menu-days/{menuDayId}
PATCH /api/provider-menu-days/{menuDayId}
POST /api/provider-menu-days/{menuDayId}/publish
GET /api/providers/{providerId}/today-menu
GET /api/providers/{providerId}/weekly-menu
```

## 11.6 Member response

```http
GET /api/provider-menu-days/{menuDayId}/my-response
PUT /api/provider-menu-days/{menuDayId}/my-response
POST /api/provider-responses/{responseId}/confirm
POST /api/provider-responses/{responseId}/cancel
POST /api/provider-responses/{responseId}/provider-override
```

`PUT my-response` request:

```ts
type SaveProviderResponseRequest = {
  expectedVersion: number | null;
  items: Array<{
    menuComponentId: string;
    selectedCatalogItemId: string;
    quantity: number;
    canonicalUnit: string;
    spiceLevel: ProviderSpiceLevel | null;
    saltLevel: ProviderSaltLevel | null;
    customizations: Array<{
      customizationOptionId: string;
      quantity: number | null;
    }>;
  }>;
  memberNote: string | null;
};
```

Server must derive authoritative quantities and units from menu configuration where possible.
Do not trust client-provided price, item name, unit, limits, or eligibility.

## 11.7 Suggestion

```http
POST /api/provider-menu-days/{menuDayId}/suggestions
POST /api/provider-suggestions/{suggestionId}/accept-as-option
POST /api/provider-suggestions/{suggestionId}/reject
```

## 11.8 Preparation batch

```http
GET /api/provider-menu-days/{menuDayId}/preparation-batch
POST /api/provider-menu-days/{menuDayId}/lock
POST /api/provider-preparation-batches/{batchId}/regenerate
POST /api/provider-preparation-batches/{batchId}/resend-email
GET /api/provider-preparation-batches/{batchId}/aggregate.csv
GET /api/provider-preparation-batches/{batchId}/individual.csv
GET /provider/preparation/{batchId}/print
```

The manual lock endpoint is owner-only and intended for testing/emergency use.
Production cutoff should be job-driven.

---

# 12. Workspace routing design

## 12.1 Problem in current code

The current authenticated layout redirects every authenticated user without a household to household onboarding.

This would break provider customers and provider owners.

## 12.2 Required resolver

Introduce a workspace resolution model.

Conceptual type:

```ts
type WorkspaceRef =
  | {
      type: "household";
      id: string;
      role: "owner" | "admin" | "member" | "viewer";
    }
  | {
      type: "provider_owner";
      id: string;
      role: "owner";
    }
  | {
      type: "provider_customer";
      id: string;
      role: "customer";
      status: ProviderMembershipStatus;
    };
```

## 12.3 Entry routing

After authentication:

1. If an explicit return URL exists and access is valid, use it.
2. Otherwise resolve available workspaces.
3. If exactly one workspace exists, route to its default page.
4. If multiple workspaces exist, use stored active workspace if valid.
5. Otherwise show workspace chooser.
6. If no workspace exists, show:
   - Create household
   - Create meal provider
   - Join with invite

## 12.4 Default destinations

- Household → `/today`
- Provider owner → `/provider/dashboard`
- Provider customer active → `/providers/{providerId}/today`
- Provider customer awaiting approval → `/providers/{providerId}/awaiting-approval`

---

# 13. Provider owner UI

## 13.1 Navigation

- Dashboard
- Today's Responses
- Weekly Menu
- Members
- Preparation
- Settings

No grocery or household preference navigation.

## 13.2 Dashboard

Cards:

- Today's menu state
- Cutoff time
- Time remaining
- Confirmed responses
- No responses
- Cancelled responses
- Auto-accepted responses
- Batch state
- Email status

## 13.3 Menu builder

The menu builder must support:

- Date
- Cutoff date/time
- Required component groups
- Default item
- Default quantity/unit
- Alternatives
- Spice support
- Salt support
- Extra options
- Maximum extra quantities
- Optional external price labels
- Publish validation

Do not build a free-form JSON editor.

## 13.4 Member approval

Provider sees:

- Name
- Email/phone if available
- Invite state
- Approval state
- Approve
- Reject
- Remove

## 13.5 Preparation page

Sections:

1. Batch metadata
2. Aggregate preparation table
3. Individual response table
4. CSV actions
5. Print action
6. Email status
7. Resend email
8. Revision history
9. Provider override warning if batch is stale

---

# 14. Provider customer UI

## 14.1 Minimal onboarding

After invite acceptance:

- Name
- Phone
- Allergy-warning acknowledgment
- Optional default spice
- Optional subscription auto-accept consent if eligible

Then:

- awaiting approval page, or
- Today's Menu

## 14.2 Today's Menu

Show:

- Provider name
- Menu date
- Cutoff timestamp and time zone
- Countdown
- Default meal package
- Alternatives
- Spice controls
- Salt controls
- Extra controls
- External price labels
- Note
- Accept/confirm
- Cancel before cutoff

## 14.3 Locked state

After cutoff:

- All inputs read-only
- Locked badge
- Selected meal visible
- No mutation controls
- Message directs member to contact provider outside app

## 14.4 Multiple providers

Add workspace/provider switcher.

A customer must never see Provider A data in Provider B workspace.

---

# 15. Background job design

## 15.1 Cutoff processor

Recommended cadence:

- every 5 minutes

Process menu days where:

```text
status = published
cutoff_at <= now()
locked_at is null
```

Transaction:

1. Lock menu-day row.
2. Confirm it remains eligible.
3. Create auto-accepted responses for eligible subscriptions.
4. Lock confirmed/auto-accepted responses.
5. Count no-response/cancelled.
6. Generate revision 1 batch.
7. Mark menu day locked.
8. Commit.
9. Send email after commit.
10. Record email result.

## 15.2 Provider override regeneration

After override:

- Mark current batch stale.
- Do not delete it.
- Provider explicitly regenerates.
- Create revision N+1.
- Keep earlier revision immutable.
- Explicit resend references selected revision.

## 15.3 CLAUDE CODE VERIFY

Inspect how current scheduled jobs are deployed:

- Supabase Edge Functions
- pg_cron
- Vercel cron
- another mechanism

Use the existing production mechanism.
Do not introduce a second scheduler without a documented reason.

---

# 16. Email design

Reuse the existing transactional email abstraction.

### CLAUDE CODE VERIFY

Inspect current invite email implementation and environment variables.

The email must be generated from persisted batch data.

Subject:

```text
Preparation summary — {menuDate} — {providerName}
```

Required contents:

- Revision
- Generated timestamp
- Confirmed count
- Auto-accepted count
- Cancelled count
- No-response count
- Aggregate table
- Individual table
- CSV links
- Print link
- In-app batch link

Email failures must not roll back batch creation.

---

# 17. Print design

Implement a dedicated server-rendered print page.

Requirements:

- Owner-only authorization
- Batch revision in URL or resolved explicitly
- Server-rendered data
- `@media print` styles
- Letter and A4 support
- Table headers repeated
- Page breaks between aggregate and individuals when appropriate
- No interactive controls in print output
- Generation timestamp
- Revision number

---

# 18. Testing strategy

## 18.1 Developer A tests

### Unit

- Menu completeness validator
- Cutoff validator
- Customization validator
- Extra maximum validator
- Auto-accept eligibility
- Aggregation key
- Aggregation totals
- CSV escaping
- CSV formula-injection defense
- Batch revision logic

### Integration against local Supabase

- Provider RLS owner access
- Provider RLS customer access
- Cross-provider denial
- Invite acceptance and approval
- Pre-cutoff response mutation
- Post-cutoff denial
- Auto-accept transaction
- Idempotent cutoff processing
- Provider override
- Batch regeneration
- Customer cannot read batch

## 18.2 Developer B tests

### Component

- Workspace chooser
- Provider navigation
- Menu builder validation
- Member response form
- Countdown
- Locked state
- Approval list
- Preparation tables
- Print layout smoke test

### Playwright

- Provider onboarding
- Invite customer
- Customer accepts
- Provider approves
- Customer lands on Today
- Customer confirms meal
- Customer updates before cutoff
- Customer cancels before cutoff
- Customer cannot edit after cutoff
- Provider sees aggregate
- CSV downloads
- Print page opens
- Multi-provider isolation

## 18.3 Contract tests

Both developers must use the same contract fixtures.

Create fixtures for:

- Published menu
- Draft response
- Confirmed response
- Locked response
- Preparation batch
- Awaiting approval membership

The UI track may mock the API only through these fixtures.

---

# 19. Production requirements

## 19.1 Security

- RLS on all provider tables
- Server-side cutoff enforcement
- Opaque invite tokens
- No cross-provider leakage
- No service-role client in user request paths
- Owner-only exports
- Sanitize notes in HTML/email/print
- CSV injection protection
- Rate-limit invite and suggestion endpoints

## 19.2 Reliability

- Idempotent cutoff job
- Immutable batch revisions
- Optimistic concurrency for member responses
- Email retry without batch duplication
- Structured logs with providerId/menuDayId/batchId
- No silently swallowed domain errors

## 19.3 Performance

Required indexes:

- provider membership by user/status
- menu day by provider/date/status
- menu day by cutoff/status
- responses by menu day/status
- batch by menu day/revision
- invite token hash

Avoid N+1 reads when building batch or provider dashboard.

## 19.4 Observability

Log events:

- provider_created
- provider_member_invited
- provider_member_approved
- provider_menu_published
- provider_response_confirmed
- provider_response_cancelled
- provider_cutoff_processed
- provider_batch_generated
- provider_override_applied
- provider_email_sent
- provider_email_failed

Do not log:

- invite tokens
- auth tokens
- full allergy notes
- full member notes unless explicitly necessary and redacted

---

# 20. Migration and rollout strategy

## Phase 0 — Contract foundation

- Add shared types
- Add API design document
- Add feature flag
- Add no user-facing routes

## Phase 1 — Database and read paths

- Add provider migrations
- Add RLS
- Add provider workspace listing
- Add menu read endpoints
- Add provider/customer shells behind feature flag

## Phase 2 — Provider authoring

- Provider onboarding
- Catalog
- Menu builder
- Publication

## Phase 3 — Membership and responses

- Invite
- Approval
- Member onboarding
- Response form
- Cancellation
- Cutoff enforcement

## Phase 4 — Aggregation and exports

- Batch generation
- Preparation UI
- CSV
- Print
- Email

## Phase 5 — Hardening

- RLS integration suite
- E2E suite
- Load test aggregation
- Failure injection for email/job retries
- Feature-flagged beta

---

# 21. Branch and PR strategy

## Developer A branch series

```text
feature/provider-contracts
feature/provider-schema-rls
feature/provider-services-api
feature/provider-cutoff-aggregation
feature/provider-exports-email
```

## Developer B branch series

```text
feature/provider-workspace-shells
feature/provider-owner-onboarding-ui
feature/provider-menu-builder-ui
feature/provider-member-response-ui
feature/provider-preparation-ui-e2e
```

Each PR must:

- Stay below a reviewable size where possible.
- Include tests.
- Update design docs.
- Avoid unrelated formatting.
- Avoid generated DB type changes until migration PR is stable.
- Rebase after shared-contract changes.

---

# 22. Claude Code instructions

Every Claude Code task must begin with:

1. Read `CLAUDE.md` if present.
2. Read relevant `design/*.md`.
3. Inspect the actual implementation files before editing.
4. Run `git status`.
5. Identify owned files and shared files.
6. Do not modify files owned by the other track unless explicitly required.
7. Search for existing utilities before creating new ones.
8. Preserve existing API error and auth conventions.
9. Add tests before declaring completion.
10. Run:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- relevant Playwright tests

11. Report unresolved code ambiguity with:

- exact file
- exact symbol
- observed behavior
- why a decision cannot be made safely

Claude Code must not:

- Invent a table that already exists under a different name.
- Add a second auth abstraction.
- Add a second email abstraction.
- Bypass RLS for user requests.
- Put domain logic in React components.
- Trust client quantities or limits.
- Infer payment state.
- Model provider customers as household members.
- make structural menu edits after responses exist without an invalidation rule.
- silently accept no-response members.
- silently resend email after provider override.

---

# 23. Mandatory repository verification checklist

Before implementation, Claude Code must produce a short verification report covering:

## Authentication

- Current sign-in routes
- Current auth callback
- Current session helper
- Current middleware/proxy behavior
- Existing role or workspace concepts

## Database

- Latest migration number
- Existing enums
- Existing invite token strategy
- Existing event/notification tables
- Existing RLS helper functions
- Existing timestamp trigger

## Services

- Existing service folder structure
- Existing repository abstraction, if any
- Existing transaction/RPC pattern
- Existing typed error classes
- Existing email notifier

## UI

- Actual route tree
- Current authenticated layouts
- Account menu behavior
- Current household switcher
- Existing reusable form controls
- Existing image component
- Existing countdown/date-time utilities

## Jobs

- Existing job scheduler
- Existing Edge Function structure
- Existing retry conventions
- Existing service-role client usage

## Tests

- Test database setup
- Seed strategy
- Authentication test helpers
- Playwright fixtures
- Existing RLS integration tests
- Existing download tests

Anything not verified must remain marked:

> **CLAUDE CODE VERIFY — implementation blocked until inspected**

---

# 24. Definition of done

The Meal Provider feature is production-ready only when:

1. Provider owner can complete onboarding.
2. Provider can create a complete menu and publish it.
3. Provider can invite a customer.
4. Customer acceptance requires provider approval.
5. Customer onboarding is minimal.
6. Customer lands on Today's Menu.
7. Customer can confirm, modify, or cancel before cutoff.
8. No response produces no order.
9. Eligible subscription auto-accept requires consent.
10. Member mutation is rejected after cutoff by backend.
11. Provider override is audited.
12. Initial cutoff processing is idempotent.
13. Aggregate totals reconcile exactly with individual responses.
14. Spice and salt variants remain separate.
15. Extras respect provider maximums.
16. CSV aggregate and individual exports are correct and safe.
17. Print output is usable.
18. Email reflects a persisted batch revision.
19. Email failure does not lose batch data.
20. Customer cannot read another customer's response.
21. Customer cannot read provider preparation totals.
22. Provider A data is isolated from Provider B.
23. Existing household workflows remain green.
24. Existing mobile API authentication remains green.
25. Full lint, typecheck, unit, integration, and E2E suites pass.
