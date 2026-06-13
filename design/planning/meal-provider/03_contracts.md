# 03 — Integration Contracts (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

The shared contracts both developers build against. **Developer B builds UI
against fixtures derived from these contracts before Developer A's APIs exist;
Developer A builds services/route tests against the same shapes.** Fixtures must
not diverge from these contracts.

Each contract is tagged:
**[CONFIRMED]** from existing code · **[EXTENSION]** of an existing convention ·
**[PROPOSED]** awaiting approval.

> No new error envelope. No new auth model. DTOs are camelCase; DB rows are
> snake_case; translation happens at the service/HTTP boundary (repo convention).

---

## 1. Enums / string unions — [PROPOSED] (follow native-enum convention [CONFIRMED])

DB: native Postgres enums (matches `00`§B3). TS: generated types after migration;
request-DTO unions below are authored in `@mmp/shared/provider`.

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

> NOTE: `ProviderSpiceLevel`/`ProviderSaltLevel` are **new** enums — do NOT reuse
> the household `spice_level` enum (`mild/medium/spicy`), a different value set
> (`01`§G-09).

## 2. Workspace reference model — [PROPOSED] (resolver pattern [EXTENSION] of `resolveCurrentHousehold`)

```ts
export type WorkspaceRef =
  | {
      type: "household";
      id: string;
      role: "owner" | "admin" | "member" | "viewer";
      defaultPath: string;
    }
  | { type: "provider_owner"; id: string; role: "owner"; defaultPath: string }
  | {
      type: "provider_customer";
      id: string;
      role: "customer";
      status: ProviderMembershipStatus;
      defaultPath: string;
    };

export interface WorkspaceDiscovery {
  workspaces: WorkspaceRef[];
  activeWorkspace: { type: WorkspaceRef["type"]; id: string } | null;
}
```

Default destinations (spec §12.4): household → `/today`; provider owner →
`/provider/dashboard`; customer active → `/providers/{id}/today`; customer
awaiting → `/providers/{id}/awaiting-approval`.

## 3. Error codes — [CONFIRMED] reuse of the closed `ERROR_CODES` set

**Resolved.** `lib/errors/domain-errors.ts` defines a **closed set of exactly 7
codes** (`VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500). `ErrorCode`
is derived from that object and is **re-exported to mobile via
`@mmp/shared/types`**, so clients branch on these 7 values. We therefore **do NOT
add new top-level codes** (that would change a shared union — Risk R-12). Provider
semantics ride as a `details.reason` discriminator on the existing code — exactly
how `ConflictError` already carries `idempotency_key_reused` / `stale_version`.

Mapping (provider semantic → existing code · HTTP · `details.reason`):

| Provider semantic                      | Code (existing)        | HTTP    | `details.reason`                                                            |
| -------------------------------------- | ---------------------- | ------- | --------------------------------------------------------------------------- |
| Membership required                    | `FORBIDDEN`            | 403     | `provider_membership_required`                                              |
| Approval required                      | `FORBIDDEN`            | 403     | `provider_approval_required`                                                |
| Owner required                         | `FORBIDDEN`            | 403     | `provider_owner_required`                                                   |
| Auto-accept not allowed                | `FORBIDDEN`            | 403     | `auto_accept_not_allowed`                                                   |
| Auto-accept consent required           | `FORBIDDEN`            | 403     | `auto_accept_consent_required`                                              |
| **Menu incomplete**                    | **`VALIDATION_ERROR`** | **400** | **`menu_incomplete`** (+ `ValidationIssue[]` of missing/invalid components) |
| Cutoff invalid (publish)               | `VALIDATION_ERROR`     | 400     | `cutoff_invalid`                                                            |
| Invalid menu alternative               | `VALIDATION_ERROR`     | 400     | `invalid_menu_alternative`                                                  |
| Invalid customization                  | `VALIDATION_ERROR`     | 400     | `invalid_customization`                                                     |
| Customization limit exceeded           | `VALIDATION_ERROR`     | 400     | `customization_limit_exceeded`                                              |
| Menu not published                     | `CONFLICT`             | 409     | `menu_not_published`                                                        |
| Menu already locked                    | `CONFLICT`             | 409     | `menu_already_locked`                                                       |
| Cutoff passed                          | `CONFLICT`             | 409     | `cutoff_passed`                                                             |
| Response already locked                | `CONFLICT`             | 409     | `response_already_locked`                                                   |
| Response cancelled (confirm blocked)   | `CONFLICT`             | 409     | `response_cancelled` (revive via save first)                                |
| Stale version (optimistic concurrency) | `CONFLICT`             | 409     | `stale_version` (+ `currentVersion`)                                        |
| Batch stale                            | `CONFLICT`             | 409     | `batch_stale`                                                               |
| Batch not available                    | `NOT_FOUND`            | 404     | `batch_not_available`                                                       |

> **`MENU_INCOMPLETE` ambiguity resolved:** it is a **`VALIDATION_ERROR` (HTTP 400)** with `details.reason = "menu_incomplete"` and a `ValidationIssue[]`
> listing the missing required component groups / inactive items / unit conflicts.
> It is **not** a 422 and **not** a new top-level code (the repo has no 422 and no
> mechanism for arbitrary codes). This matches the hand-rolled `ValidationError` +
> `ValidationIssue[]` pattern and keeps the mobile `ErrorCode` union unchanged.

Envelope (unchanged, [CONFIRMED]) — note `details.reason`:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Changes are closed for this menu.",
    "details": { "reason": "cutoff_passed" }
  }
}
```

## 4. Core DTOs — [PROPOSED]

```ts
export interface ProviderSummaryDto {
  // GET /api/providers item
  providerId: string;
  name: string;
  role: ProviderMembershipRole;
  membershipStatus: ProviderMembershipStatus;
  timezone: string;
}
export interface ProviderDto {
  providerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string;
  status: string;
  defaultCutoffLocalTime: string | null;
  summaryEmailRecipients: string[];
}
export interface CatalogItemDto {
  catalogItemId: string;
  name: string;
  componentGroup: ProviderComponentGroup;
  canonicalUnit: string;
  defaultQuantity: number;
  imageUrl: string | null;
  isActive: boolean;
  supportsSpiceLevel: boolean;
  supportsSaltLevel: boolean;
  allergyWarning: string | null;
  sourceDishId: string | null;
}
export interface MenuComponentDto {
  menuComponentId: string;
  componentGroup: ProviderComponentGroup;
  defaultCatalogItemId: string;
  defaultQuantity: number;
  canonicalUnit: string;
  isRequired: boolean;
  sortOrder: number;
  alternatives: Array<{
    alternativeId: string;
    catalogItemId: string;
    quantity: number;
    canonicalUnit: string;
  }>;
  customizationGroups: CustomizationGroupDto[];
  supportsSpiceLevel: boolean;
  supportsSaltLevel: boolean;
}
export interface CustomizationGroupDto {
  customizationGroupId: string;
  name: string;
  customizationType: ProviderCustomizationType;
  includedInPrice: boolean;
  isRequired: boolean;
  minimumSelections: number;
  maximumSelections: number | null;
  options: Array<{
    optionId: string;
    code: string;
    label: string;
    quantityDelta: number | null;
    externalPriceLabel: string | null;
    minimumQuantity: number | null;
    maximumQuantity: number | null;
  }>;
}
export interface MenuDayDto {
  menuDayId: string;
  providerId: string;
  weeklyMenuId: string;
  menuDate: string;
  cutoffAt: string;
  status: ProviderMenuStatus;
  note: string | null;
  publishedAt: string | null;
  lockedAt: string | null;
  components: MenuComponentDto[];
}
export interface MemberResponseDto {
  responseId: string | null;
  menuDayId: string;
  status: ProviderResponseStatus;
  version: number;
  memberNote: string | null;
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
  lockedAt: string | null;
}
export interface MemberDto {
  memberId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: ProviderMembershipRole;
  status: ProviderMembershipStatus;
  approvedAt: string | null;
  joinedAt: string | null;
}
```

## 5. Menu-completeness contract — [PROPOSED]

A menu day is **publishable** iff: every provider-configured **required**
component group has a default catalog item; each default + alternative references
an **active** catalog item owned by the same provider; units are consistent
within a component; every `quantity_increment` customization has a finite
`maximumQuantity`/`maximumSelections`; `cutoffAt > now()`; no cross-provider item.
Validator: pure `validateMenuCompleteness(menuDay): ValidationIssue[]`
([EXTENSION] of the hand-rolled `ValidationIssue[]` pattern — no Zod).
Required-group set is **provider-configured**, not globally fixed (UC-MENU-002).

## 6. Optimistic-concurrency contract — [PROPOSED] (`ConflictError` [CONFIRMED])

`PUT my-response` carries `expectedVersion: number | null`. Server updates
`WHERE version = expectedVersion`, increments on success, returns
`409 { error: { code: "CONFLICT", details: { reason: "stale_version", currentVersion } } }`
on mismatch. Client reloads latest and replays (UC-RESPONSE-007).

## 7. Cutoff & lock semantics — [PROPOSED]

- Member mutations allowed iff menu day `status='published'` AND `cutoff_at > now()`
  AND response not `locked` (server-enforced in RPC; UI mirrors).
- At/after cutoff the menu day transitions to `locked` (job); responses become
  `locked`/`auto_accepted`; member writes return `CUTOFF_PASSED`/`RESPONSE_ALREADY_LOCKED`.
- Provider override permitted only after lock; requires reason; emits event;
  marks batch `stale`.

## 8. API routes — [PROPOSED] (shapes follow existing route-handler convention [CONFIRMED])

```
# Workspace / provider discovery
GET    /api/providers                                   → ProviderSummaryDto[]
POST   /api/providers                                   → ProviderDto (create org, draft)
GET    /api/providers/{providerId}                      → ProviderDto
PATCH  /api/providers/{providerId}                      → ProviderDto
POST   /api/providers/{providerId}/complete-onboarding  → ProviderDto

# Invites & approval
POST   /api/providers/{providerId}/invites
GET    /api/provider-invites/{token}                    → invite preview (limited)
POST   /api/provider-invites/{token}/accept             → membership awaiting_approval
POST   /api/providers/{providerId}/members/{memberId}/approve
POST   /api/providers/{providerId}/members/{memberId}/reject
POST   /api/providers/{providerId}/members/{memberId}/remove
GET    /api/providers/{providerId}/members              → MemberDto[] (cursor)

# Catalog
GET    /api/providers/{providerId}/catalog              → CatalogItemDto[]
POST   /api/providers/{providerId}/catalog
PATCH  /api/providers/{providerId}/catalog/{catalogItemId}

# Menus
GET    /api/providers/{providerId}/menus                → weekly menu list (cursor)
POST   /api/providers/{providerId}/menus
GET    /api/provider-menu-days/{menuDayId}              → MenuDayDto
PATCH  /api/provider-menu-days/{menuDayId}
POST   /api/provider-menu-days/{menuDayId}/publish
GET    /api/providers/{providerId}/today-menu           → MenuDayDto | null
GET    /api/providers/{providerId}/weekly-menu          → MenuDayDto[]

# Member response
GET    /api/provider-menu-days/{menuDayId}/my-response  → MemberResponseDto
PUT    /api/provider-menu-days/{menuDayId}/my-response   (SaveProviderResponseRequest)
POST   /api/provider-responses/{responseId}/confirm
POST   /api/provider-responses/{responseId}/cancel
POST   /api/provider-responses/{responseId}/provider-override

# Suggestions
POST   /api/provider-menu-days/{menuDayId}/suggestions
POST   /api/provider-suggestions/{suggestionId}/accept-as-option
POST   /api/provider-suggestions/{suggestionId}/reject

# Preparation / batch / exports
GET    /api/provider-menu-days/{menuDayId}/preparation-batch          → BatchDto
POST   /api/provider-menu-days/{menuDayId}/lock        (owner-only; testing/emergency)
POST   /api/provider-preparation-batches/{batchId}/regenerate
POST   /api/provider-preparation-batches/{batchId}/resend-email
GET    /api/provider-preparation-batches/{batchId}/aggregate.csv
GET    /api/provider-preparation-batches/{batchId}/individual.csv
GET    /provider/preparation/{batchId}/print           (server-rendered page, owner-only)
```

### Request example — `PUT my-response` — [PROPOSED]

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

Server **derives** authoritative quantity/unit/limits/eligibility from menu config;
client-sent price/name/unit/limit values are ignored (§11.6).

### Response example — `GET today-menu` — [PROPOSED]

```json
{
  "menuDayId": "...",
  "providerId": "...",
  "menuDate": "2026-06-11",
  "cutoffAt": "2026-06-11T03:30:00Z",
  "status": "published",
  "note": null,
  "components": [
    {
      "menuComponentId": "...",
      "componentGroup": "dal_or_legume",
      "defaultCatalogItemId": "...",
      "defaultQuantity": 16,
      "canonicalUnit": "oz",
      "isRequired": true,
      "supportsSpiceLevel": true,
      "supportsSaltLevel": true,
      "alternatives": [],
      "customizationGroups": []
    }
  ]
}
```

## 9. Event names & payloads — [PROPOSED] (envelope [EXTENSION] of `emit_household_event`)

Events written to `provider_activity_events` (+ optional notification fan-out):
`provider_created`, `provider_member_invited`, `provider_member_approved`,
`provider_member_rejected`, `provider_member_removed`, `provider_menu_published`,
`provider_response_confirmed`, `provider_response_cancelled`,
`provider_cutoff_processed`, `provider_batch_generated`,
`provider_override_applied`, `provider_email_sent`, `provider_email_failed`.

Payload shape (mirrors household envelope): `{ providerId, actorUserId|null,
eventType, entityType, entityId|null, oldValue|null, newValue|null, createdAt }`.
**Never log** invite/auth tokens or full allergy/member notes (§19.4).

## 10. Batch DTOs — [PROPOSED]

```ts
export interface PreparationLine {
  catalogItemId: string;
  itemName: string;
  componentGroup: ProviderComponentGroup;
  spiceLevel: ProviderSpiceLevel | null;
  saltLevel: ProviderSaltLevel | null;
  includedQuantity: number;
  extraQuantity: number;
  totalQuantity: number;
  canonicalUnit: string;
}
export interface BatchDto {
  batchId: string;
  menuDayId: string;
  revision: number;
  status: "current" | "stale";
  generatedAt: string;
  totals: {
    confirmed: number;
    autoAccepted: number;
    cancelled: number;
    noResponse: number;
  };
  aggregateLines: PreparationLine[];
  individualLines: Array<{
    memberUserId: string;
    displayName: string | null;
    lines: PreparationLine[];
  }>;
  emailStatus: "queued" | "sent" | "failed" | null;
}
```

Aggregation key = `catalogItemId + canonicalUnit + spiceLevel + saltLevel`
(+ production variant). Never aggregate incompatible units. Included vs extra
reported separately (UC-BATCH-002).

## 11. CSV column contracts — [PROPOSED]

**Aggregate CSV** (stable order): `component_group, item_name, spice_level,
salt_level, included_quantity, extra_quantity, total_quantity, canonical_unit`.
**Individual CSV**: `member_name, component_group, item_name, spice_level,
salt_level, quantity, canonical_unit, is_extra`.
UTF-8; deterministic sort (componentGroup, itemName, spice, salt); RFC-4180
escaping; formula-injection prefix for cells starting `= + - @`.

## 12. Print-view DTO — [PROPOSED]

```ts
export interface PrintViewDto {
  providerName: string;
  menuDate: string;
  cutoffAt: string;
  revision: number;
  generatedAt: string;
  totals: BatchDto["totals"];
  aggregateLines: PreparationLine[];
  individuals: BatchDto["individualLines"];
}
```

## 13. Email-summary DTO — [PROPOSED]

```ts
export interface ProviderSummaryEmailParams {
  toEmail: string;
  providerName: string;
  menuDate: string;
  revision: number;
  generatedAt: string;
  totals: BatchDto["totals"];
  aggregateLines: PreparationLine[];
  individuals: BatchDto["individualLines"];
  csvAggregateUrl: string;
  csvIndividualUrl: string;
  printUrl: string;
  batchUrl: string;
}
```

Subject: `Preparation summary — {menuDate} — {providerName}`. Built from a
persisted batch revision (never recomputed in render — ADR-12).

## 14. Fixtures (shared, contract-bound) — [PROPOSED]

A single fixtures module (consumed by B's mock client and A's route tests) provides:
provider owner, awaiting-approval customer, approved customer, published menu day,
draft response, confirmed response, cancelled response, locked response,
auto-accepted response, batch revision (current), stale batch, multi-provider
membership set. Fixtures import the DTO types above so they cannot silently drift.

## 15. Contract status summary

- [CONFIRMED] reused: error envelope, `ConflictError`, route-handler shape, cursor
  pagination, idempotency wrapper, email transport, hashed-invite pattern.
- [EXTENSION]: provider `details.reason` discriminators on the existing 7
  `ERROR_CODES` (no enum change), workspace resolver, event envelope,
  `@mmp/shared/provider` subpath, `ValidationIssue[]` validators.
- [PROPOSED] (await approval): all provider enums/DTOs/routes/batch/CSV/print/email
  shapes above + the `SaveProviderResponseRequest`.
