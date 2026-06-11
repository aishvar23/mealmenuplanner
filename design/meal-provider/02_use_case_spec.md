# Meal Provider Workspace — Use Case Specification for Claude Code

## Document purpose

This document describes the business behavior Claude Code must implement for the Meal Provider workspace.

It complements:

- `meal_provider_claude_code_design_spec.md`
- the repository's existing architecture and database design documents
- the existing household application behavior

This document focuses on:

- who performs each action
- why the action exists
- what must happen
- what must not happen
- alternate and failure paths
- authorization boundaries
- state transitions
- acceptance outcomes

This document does not replace the technical design. The technical design defines architecture, data model, APIs, RLS, services, jobs, and implementation boundaries.

Where implementation details are not verified in the repository, this document uses:

> **CLAUDE CODE VERIFY**

Claude Code must inspect the repository before selecting an implementation.

---

# 1. Product context

The existing application helps households plan meals.

The Meal Provider workspace serves a different use case:

> A small home-meal provider publishes menus, collects structured meal responses from approved members, freezes changes at a provider-defined cutoff, and receives a reliable preparation summary.

The Meal Provider feature is not:

- a delivery app
- a pickup scheduling app
- a payment system
- a marketplace
- a restaurant POS
- an inventory system
- a customer support system

The app stops at:

- menu publication
- member response
- customization collection
- cutoff enforcement
- preparation aggregation
- CSV
- print
- email summary

---

# 2. Actors

## 2.1 Authenticated User

A Supabase-authenticated person.

An authenticated user may have zero or more workspaces:

- household workspace
- provider owner workspace
- provider customer workspace

## 2.2 Meal Provider Owner

A user who creates and operates a Meal Provider workspace.

The owner can:

- complete provider onboarding
- manage provider catalog
- create and publish menus
- define cutoffs
- invite members
- approve members
- view all responses
- override responses after cutoff
- view preparation batches
- export CSV
- print summaries
- resend summary email

## 2.3 Meal Provider Customer

A user who belongs to a provider and has been approved.

The customer can:

- view published menus
- view today's menu
- accept the default meal
- choose allowed alternatives
- choose allowed customizations
- cancel before cutoff
- update before cutoff
- view locked response after cutoff
- submit a non-binding meal suggestion

The customer cannot:

- view other members
- view other member responses
- view preparation totals
- edit provider menus
- change cutoffs
- approve members
- modify after cutoff

## 2.4 Awaiting-Approval Customer

A user who accepted a provider invite but has not yet been approved.

The user can:

- see that approval is pending
- view provider identity and limited invite details

The user cannot:

- view published menus
- submit meal responses
- view provider member data

## 2.5 Subscription Customer

An approved provider customer with an active subscription record.

A subscription customer may optionally enable auto-accept.

Auto-accept requires:

- active subscription
- provider support
- explicit member consent

## 2.6 Background Cutoff Processor

A trusted scheduled process.

It:

- finds menu days whose cutoff has passed
- locks eligible responses
- creates auto-accepted responses where allowed
- calculates no-response and cancellation counts
- generates the initial preparation batch
- triggers summary email

## 2.7 Email Provider

External transactional email service.

Email is not the source of truth.

The source of truth is the persisted preparation batch.

---

# 3. Global business rules

## BR-001: No response means no order

If a non-subscription member does not confirm a response before cutoff:

- no order is created
- no quantity is included
- the member counts as no response

## BR-002: Auto-accept is subscription-only

Auto-accept is valid only when:

- member has active subscription
- provider supports auto-accept
- member explicitly consented
- menu is published
- default meal is valid

## BR-003: Default meal only for auto-accept

Auto-accept never selects:

- alternatives
- extras
- free-text suggestions
- special custom quantities

It uses the published default package.

## BR-004: Provider approval is mandatory

Invite acceptance does not activate menu access.

Provider must approve the customer.

## BR-005: One menu for all members

MVP supports one menu per provider/date.

There are no plan-specific menus.

## BR-006: Member changes stop at cutoff

After cutoff, member changes are forbidden.

This is enforced server-side.

## BR-007: Provider override is allowed after cutoff

Provider may override an individual locked response.

Override requires:

- provider owner
- reason
- audit trail
- batch stale/regeneration behavior

## BR-008: Spice and salt changes are included

Allowed included options:

Spice:

- non-spicy
- mild
- regular
- spicy

Salt:

- low salt
- regular salt
- high salt

## BR-009: Paid extras are provider-defined

Provider may configure informational price labels for extras.

The app does not:

- collect payment
- track payment
- confirm payment

## BR-010: Extras must be bounded

Every quantity extra requires a finite maximum.

Unlimited quantity is invalid.

## BR-011: Allergy data is warning-only

The app must not promise allergen-free preparation.

## BR-012: Suggestions are non-binding

A suggestion does not alter:

- confirmed response
- preparation batch
- aggregation totals

## BR-013: Pickup and delivery are outside scope

The app does not model:

- pickup slot
- delivery slot
- driver
- route
- fulfillment location
- delivery status

## BR-014: Customer calls after cutoff are outside scope

The app does not accept or synchronize post-cutoff customer calls.

Provider handles them manually.

## BR-015: Preparation batch is source of truth

Email, CSV, and print derive from a persisted batch revision.

---

# 4. Workspace use cases

## UC-WORKSPACE-001: User signs in and resolves workspace

### Primary actor

Authenticated User

### Goal

Enter the correct product workspace after sign-in.

### Preconditions

- User has authenticated successfully.

### Trigger

User completes sign-in or opens an authenticated route.

### Main flow

1. System resolves all accessible workspaces.
2. System validates stored active workspace if one exists.
3. If exactly one workspace exists, system routes to its default destination.
4. If multiple workspaces exist, system routes to stored active workspace or workspace chooser.
5. If no workspace exists, system offers:
   - Create household
   - Create meal provider
   - Join provider by invite

### Default destinations

- Household → `/today`
- Provider owner → provider dashboard
- Approved provider customer → provider today's menu
- Awaiting approval customer → awaiting approval page

### Alternate flow A: Invalid stored workspace

1. Stored workspace no longer exists or membership is inactive.
2. System ignores stored workspace.
3. System resolves remaining valid workspaces.

### Failure flow

If workspace resolution fails:

- show recoverable error
- do not expose another tenant
- do not redirect blindly to household onboarding

### Postconditions

- User is in an authorized workspace.

### Acceptance criteria

- Provider-only user is not redirected to household onboarding.
- Customer of multiple providers can choose provider.
- Workspace access is revalidated server-side.

---

## UC-WORKSPACE-002: User switches workspace

### Primary actor

Authenticated User

### Goal

Move between household and provider workspaces.

### Preconditions

- User belongs to at least two workspaces.

### Main flow

1. User opens workspace switcher.
2. System lists authorized workspaces.
3. User selects one.
4. System validates membership.
5. System stores or applies active workspace.
6. System routes to selected workspace home.

### Failure flow

If membership changed since list loaded:

- reject switch
- refresh workspace list
- show access no longer available

### Acceptance criteria

- Provider A data never appears in Provider B workspace.
- Household navigation does not remain visible in provider workspace.
- Provider owner navigation does not appear for customer.

---

# 5. Provider onboarding use cases

## UC-PROVIDER-001: User creates Meal Provider workspace

### Primary actor

Authenticated User

### Goal

Create a provider organization.

### Preconditions

- User is authenticated.
- User is allowed to create a provider workspace.

### Trigger

User selects "Continue as Meal Provider" or "Create Meal Provider."

### Main flow

1. System opens provider onboarding.
2. User enters:
   - provider name
   - owner display name
   - email
   - phone
   - city
   - state
   - country
   - time zone
   - description
3. User configures:
   - default cutoff rule
   - summary email recipients
   - CSV enabled
   - print enabled
   - customer approval requirement
4. User creates or selects catalog items.
5. User reviews settings.
6. User completes onboarding.
7. System atomically creates:
   - provider organization
   - owner membership
   - provider settings
8. System routes to provider dashboard.

### Validation

- Provider name required.
- Time zone required.
- Email recipients valid if supplied.
- No unsupported payment configuration.
- No pickup/delivery fields.

### Failure flow

If atomic creation fails:

- no active orphan provider remains
- onboarding data remains recoverable if draft support exists

### CLAUDE CODE VERIFY

Inspect whether household onboarding draft infrastructure can be safely generalized or whether provider onboarding needs its own draft table/service.

Do not reuse household draft JSON without verifying schema compatibility.

---

## UC-PROVIDER-002: Provider resumes incomplete onboarding

### Primary actor

Meal Provider Owner candidate

### Preconditions

- Incomplete provider onboarding exists.

### Main flow

1. User signs in.
2. System detects incomplete provider onboarding.
3. System offers resume.
4. User resumes at last completed step.
5. Previously saved values are prefilled.

### Acceptance criteria

- Household onboarding draft is not overwritten.
- Provider onboarding and household onboarding can coexist safely.

---

# 6. Provider catalog use cases

## UC-CATALOG-001: Provider adds catalog item

### Primary actor

Meal Provider Owner

### Goal

Create an item that can be used in menus.

### Preconditions

- Provider onboarding complete.
- Owner is active.

### Main flow

1. Owner opens catalog.
2. Owner selects component group:
   - main
   - dal/legume
   - sabzi
   - bread
   - rice
   - side
   - add-on
3. Owner enters:
   - name
   - canonical unit
   - default quantity
   - image
   - spice support
   - salt support
   - allergy warning
4. Owner optionally links existing household dish.
5. Owner saves.

### Validation

- Quantity > 0.
- Canonical unit required.
- Name required.
- Provider tenant must match.
- Linked dish may be nullable.
- Household dish metadata must not override provider quantity rules silently.

### Alternate flow

Provider selects an existing dish from app catalog.

System copies or references only verified compatible fields.

### Acceptance criteria

- Provider-specific quantity/unit remains independent.
- Item cannot leak into another provider catalog.

---

## UC-CATALOG-002: Provider archives catalog item

### Primary actor

Meal Provider Owner

### Preconditions

- Item exists.

### Main flow

1. Owner archives item.
2. System marks item inactive.
3. Item is unavailable for new menus.

### Alternate flow

Item is referenced by published or historical menu.

System preserves historical references.

### Acceptance criteria

- Historical response and batch remain readable.
- Item is not hard deleted.

---

# 7. Member invitation and approval use cases

## UC-MEMBER-001: Provider invites customer

### Primary actor

Meal Provider Owner

### Goal

Invite a person to join provider workspace.

### Preconditions

- Provider active.
- Owner authenticated.

### Main flow

1. Owner opens Members.
2. Owner enters email or phone.
3. System validates input.
4. System creates opaque expiring invite.
5. System sends invite email if configured.
6. Invite appears as pending.

### Failure flow

Email failure:

- invite remains created
- owner sees delivery failure
- owner may copy/resend invite

### Security

- Raw invite token is not logged.
- Invite preview reveals limited data only.

---

## UC-MEMBER-002: Customer accepts invite

### Primary actor

Authenticated User

### Goal

Accept provider invitation.

### Preconditions

- Invite valid and not expired.
- User authenticated.

### Main flow

1. User opens invite.
2. System shows provider identity.
3. User accepts.
4. System creates or updates membership to `awaiting_approval`.
5. User lands on awaiting approval page.

### Important rule

Acceptance does not activate menu access.

### Alternate flow

Invite email differs from signed-in email.

### CLAUDE CODE VERIFY

Inspect household invite matching rules.

Do not invent whether mismatch is allowed.
Reuse verified security behavior or explicitly define new behavior.

---

## UC-MEMBER-003: Provider approves customer

### Primary actor

Meal Provider Owner

### Preconditions

- Membership status is awaiting approval.

### Main flow

1. Owner opens Members.
2. Owner selects pending customer.
3. Owner approves.
4. System sets membership active.
5. System records approver and timestamp.
6. Customer gains menu access.
7. Customer receives notification if implemented.

### Acceptance criteria

- Customer can access only after approval.
- Approval cannot be performed by another customer.

---

## UC-MEMBER-004: Provider rejects customer

### Primary actor

Meal Provider Owner

### Preconditions

- Membership awaiting approval.

### Main flow

1. Owner rejects membership.
2. Membership becomes rejected.
3. Customer loses pending access.

### Acceptance criteria

- Rejected user cannot read menu.
- Rejected membership history remains auditable.

---

## UC-MEMBER-005: Provider removes active customer

### Primary actor

Meal Provider Owner

### Preconditions

- Customer active.

### Main flow

1. Owner removes customer.
2. Membership becomes removed.
3. Customer loses provider access.

### Historical behavior

- Existing responses remain attributed.
- Existing batches remain unchanged.

---

# 8. Member onboarding use cases

## UC-MEMBER-ONBOARD-001: Approved member completes minimal onboarding

### Primary actor

Meal Provider Customer

### Goal

Provide only information required for provider interaction.

### Preconditions

- Customer approved.
- Minimal onboarding not complete.

### Main flow

1. Customer opens provider workspace.
2. System asks for:
   - display name
   - phone
   - optional default spice
   - allergy warning acknowledgment
   - terms acknowledgment
3. If subscription auto-accept is eligible, system optionally asks for consent.
4. Customer submits.
5. System routes to Today's Menu.

### Must not show

- household size
- cuisine preference
- meal variety
- grocery preference
- cooking time
- preferred dishes
- meal combinations
- family health planning

---

# 9. Subscription auto-accept use cases

## UC-SUBSCRIPTION-001: Customer enables auto-accept

### Primary actor

Subscription Customer

### Preconditions

- Active subscription exists.
- Provider supports auto-accept.

### Main flow

1. Customer opens account settings.
2. Customer reads explanation.
3. Customer enables auto-accept.
4. System records explicit consent timestamp.

### Acceptance criteria

- Non-subscription customer cannot enable it.
- Provider cannot silently enable it for customer.
- Consent can be revoked before future cutoff.

---

## UC-SUBSCRIPTION-002: System auto-accepts default meal at cutoff

### Primary actor

Background Cutoff Processor

### Preconditions

- Active subscription.
- Auto-accept enabled.
- Consent recorded.
- Member has no confirmed or cancelled response.
- Menu published.
- Cutoff reached.

### Main flow

1. System creates default response.
2. System marks it auto-accepted.
3. System locks response.
4. System includes default package in aggregation.

### Must not include

- optional extras
- alternatives
- free-text suggestions

---

## UC-SUBSCRIPTION-003: Customer opts out before cutoff

### Primary actor

Subscription Customer

### Main flow

1. Customer opens today's menu.
2. Customer chooses no order or cancels.
3. System records cancellation/opt-out.
4. Cutoff processor does not auto-accept.

---

# 10. Menu authoring use cases

## UC-MENU-001: Provider creates weekly menu

### Primary actor

Meal Provider Owner

### Goal

Create menu dates for a week.

### Main flow

1. Owner creates weekly menu date range.
2. Owner adds one or more menu days.
3. Each menu day has:
   - date
   - cutoff timestamp
   - complete meal package
   - alternatives
   - customizations
4. Weekly menu remains draft.

### Validation

- End date >= start date.
- Menu day inside range.
- Cutoff timestamp valid.
- Provider time zone used.

---

## UC-MENU-002: Provider creates complete meal package

### Primary actor

Meal Provider Owner

### Main flow

1. Owner adds required components.
2. Owner selects default catalog item for each.
3. Owner sets quantities.
4. Owner configures alternatives.
5. Owner configures spice/salt where supported.
6. Owner configures extras and limits.

### Completeness rule

A package is valid only when provider-configured required component groups are satisfied.

### CLAUDE CODE VERIFY

Do not assume required groups are globally fixed.

Inspect whether current meal-combination logic offers reusable completeness validation.

If not, introduce provider-specific required component configuration.

---

## UC-MENU-003: Provider publishes menu day

### Primary actor

Meal Provider Owner

### Preconditions

- Menu day draft.
- Complete package valid.
- Cutoff in future.

### Main flow

1. Owner clicks Publish.
2. System validates all components.
3. System validates alternatives belong to provider.
4. System validates extras have finite maximum.
5. System marks menu published.
6. Active approved customers can view it.

### Failure cases

- missing required component
- invalid cutoff
- inactive catalog item
- incompatible unit
- unlimited extra
- cross-provider item

---

## UC-MENU-004: Provider edits published menu before responses exist

### Primary actor

Meal Provider Owner

### Preconditions

- Menu published.
- No member response exists.

### Main flow

1. Owner edits menu.
2. System validates.
3. System saves revision or update.

### CLAUDE CODE VERIFY

Determine repository's versioning/revision convention.

Do not implement destructive edits without checking existing patterns.

---

## UC-MENU-005: Provider attempts structural edit after member response exists

### Primary actor

Meal Provider Owner

### Preconditions

- At least one draft or confirmed response exists.

### Required behavior

Claude Code must not silently invalidate member responses.

### Allowed implementation choices

Only after repository inspection:

1. Block structural edit.
2. Require explicit menu revision and invalidate affected responses.
3. Require cancel/recreate menu.

### CLAUDE CODE VERIFY

Implementation blocked until a safe policy is selected and documented.

---

# 11. Customer menu viewing use cases

## UC-VIEW-001: Approved customer views today's menu

### Primary actor

Meal Provider Customer

### Preconditions

- Membership active.
- Menu published for today.

### Main flow

1. Customer opens provider workspace.
2. System loads today's menu.
3. System shows:
   - provider name
   - menu date
   - cutoff timestamp
   - provider time zone
   - countdown
   - default package
   - alternatives
   - customizations
   - response state

### Failure flow

No published menu:

- show no menu available
- do not show draft menu

---

## UC-VIEW-002: Awaiting customer attempts to view menu

### Primary actor

Awaiting-Approval Customer

### Expected result

- access denied
- awaiting approval page shown
- no menu data leaked

---

# 12. Member response use cases

## UC-RESPONSE-001: Customer accepts default meal

### Primary actor

Meal Provider Customer

### Preconditions

- Active membership.
- Menu published.
- Cutoff not passed.

### Main flow

1. Customer opens menu.
2. Default components are selected.
3. Customer optionally selects spice and salt.
4. Customer confirms.
5. System validates server-side.
6. System stores confirmed response.
7. System increments response version.
8. Provider response count updates.

### Postconditions

- Response counts in future batch.
- Response remains editable until cutoff.

---

## UC-RESPONSE-002: Customer chooses allowed alternative

### Primary actor

Meal Provider Customer

### Main flow

1. Customer opens component alternatives.
2. Customer selects provider-published alternative.
3. Customer confirms.

### Validation

- Alternative belongs to menu component.
- Alternative active.
- Quantity and unit derived from menu.
- Customer cannot submit arbitrary catalog item.

---

## UC-RESPONSE-003: Customer selects spice and salt

### Primary actor

Meal Provider Customer

### Main flow

1. Customer selects spice.
2. Customer selects salt.
3. System saves structured values.

### Acceptance criteria

- No free text for spice/salt.
- Values appear separately in aggregation.
- Included substitution does not create payment state.

---

## UC-RESPONSE-004: Customer adds provider-defined extra

### Primary actor

Meal Provider Customer

### Preconditions

- Extra configured.
- Maximum configured.
- Cutoff not passed.

### Main flow

1. Customer selects extra.
2. Customer chooses quantity within limit.
3. UI displays external price label if configured.
4. Customer confirms.

### Validation

- Quantity <= provider maximum.
- Server derives quantity increment.
- No payment record created.

---

## UC-RESPONSE-005: Customer exceeds extra maximum

### Primary actor

Meal Provider Customer

### Main flow

1. Customer manipulates request beyond maximum.
2. Server rejects.

### Expected result

- response unchanged
- validation error returned
- no partial write

---

## UC-RESPONSE-006: Customer saves draft

### Primary actor

Meal Provider Customer

### Preconditions

- Cutoff not passed.

### Main flow

1. Customer configures response.
2. Customer saves without confirming.
3. Response status draft.

### Important rule

Draft does not count in aggregation.

At cutoff:

- draft becomes no response unless valid subscription auto-accept applies

---

## UC-RESPONSE-007: Customer updates confirmed response before cutoff

### Primary actor

Meal Provider Customer

### Main flow

1. Customer opens confirmed response.
2. Customer changes allowed selection.
3. Client sends expected version.
4. Server validates cutoff and version.
5. Server saves and increments version.

### Conflict flow

If expected version stale:

- server returns conflict
- client reloads latest state
- no overwrite

---

## UC-RESPONSE-008: Customer cancels before cutoff

### Primary actor

Meal Provider Customer

### Main flow

1. Customer selects Cancel order.
2. System asks confirmation.
3. Customer confirms.
4. Response becomes cancelled.

### Postconditions

- excluded from batch
- remains auditable
- subscription auto-accept does not recreate it

---

## UC-RESPONSE-009: Customer attempts change after cutoff

### Primary actor

Meal Provider Customer

### Expected result

- UI read-only
- backend rejects mutation
- response unchanged
- member instructed to contact provider outside app

---

## UC-RESPONSE-010: No response at cutoff

### Primary actor

Background Cutoff Processor

### Preconditions

- Customer active.
- No confirmed response.
- No valid auto-accept.

### Main flow

1. Processor counts customer as no response.
2. No response row is created unless design explicitly requires it.
3. No quantity added to batch.

### CLAUDE CODE VERIFY

Decide whether no-response is represented as:

- absence of response plus computed count, or
- explicit response state

Use the design that best matches existing repository patterns.
Do not create redundant rows without reason.

---

# 13. Suggestion use cases

## UC-SUGGEST-001: Customer submits meal suggestion

### Primary actor

Meal Provider Customer

### Preconditions

- Menu published.
- Cutoff not passed, if product restricts suggestions by cutoff.

### Main flow

1. Customer enters suggestion.
2. System validates length and content.
3. Suggestion stored pending.
4. Provider can review.

### Important result

Suggestion does not alter confirmed response.

---

## UC-SUGGEST-002: Provider rejects suggestion

### Primary actor

Meal Provider Owner

### Main flow

1. Owner opens suggestion.
2. Owner rejects.
3. Suggestion becomes rejected.
4. Optional response stored.

---

## UC-SUGGEST-003: Provider converts suggestion to option

### Primary actor

Meal Provider Owner

### Preconditions

- Suggested item exists or provider creates catalog item.
- Safe menu-edit policy allows adding it.

### Main flow

1. Owner approves suggestion as option.
2. Provider adds valid catalog item/alternative.
3. Suggestion becomes accepted_as_option.

### Important rule

Customer order does not change automatically.

Customer must explicitly select option before cutoff.

---

# 14. Cutoff processing use cases

## UC-CUTOFF-001: System processes cutoff

### Primary actor

Background Cutoff Processor

### Preconditions

- Menu published.
- Cutoff reached.
- Menu not locked.

### Main flow

1. Processor acquires transaction lock.
2. Processor rechecks state.
3. Processor identifies:
   - confirmed
   - cancelled
   - draft
   - no response
   - eligible auto-accept
4. Processor creates eligible auto-accepted responses.
5. Processor locks confirmed and auto-accepted responses.
6. Processor marks menu day locked.
7. Processor generates batch revision 1.
8. Transaction commits.
9. Email queued after commit.

### Acceptance criteria

- idempotent
- no duplicate responses
- no duplicate batch
- no double quantities

---

## UC-CUTOFF-002: Cutoff processor retries

### Primary actor

Background Cutoff Processor

### Preconditions

- Prior run partially or fully completed.

### Main flow

1. Processor runs again.
2. System detects locked menu/batch.
3. System returns existing result or safely completes missing post-commit side effect.

### Expected result

- no duplicate batch
- no duplicate auto-accept
- no duplicate quantities
- email behavior follows explicit retry policy

---

## UC-CUTOFF-003: Email fails after batch creation

### Primary actor

Email Provider

### Main flow

1. Batch successfully persisted.
2. Email send fails.
3. System records failed status.
4. Provider dashboard shows failure.
5. Provider may resend.

### Important rule

Batch remains valid and available.

---

# 15. Preparation batch use cases

## UC-BATCH-001: Provider views preparation batch

### Primary actor

Meal Provider Owner

### Preconditions

- Batch exists.

### Main flow

1. Owner opens Preparation.
2. System loads selected batch revision.
3. System displays:
   - menu date
   - cutoff
   - revision
   - generated time
   - confirmed count
   - auto-accepted count
   - cancelled count
   - no-response count
   - aggregate lines
   - individual breakdown

### Security

Customer cannot access.

---

## UC-BATCH-002: System aggregates variants

### Primary actor

Provider Aggregation Service

### Example input

Member 1:

- 16 oz Dal Tadka, regular spice, regular salt
- 16 oz Bhindi, spicy, regular salt
- 12 Rotis

Member 2:

- 16 oz Dal Tadka, regular spice, regular salt
- 16 oz Bhindi, non-spicy, regular salt
- 12 Rotis

### Expected output

- 32 oz Dal Tadka, regular spice, regular salt
- 16 oz Bhindi, spicy, regular salt
- 16 oz Bhindi, non-spicy, regular salt
- 24 Rotis

### Rules

- Different spice values remain separate.
- Different salt values remain separate.
- Different units remain separate.
- Included and extra quantity remain separately reportable.

---

## UC-BATCH-003: Provider exports aggregate CSV

### Primary actor

Meal Provider Owner

### Main flow

1. Owner clicks Aggregate CSV.
2. System authorizes owner.
3. System renders CSV from persisted batch.
4. Browser downloads file.

### Acceptance criteria

- stable columns
- UTF-8
- deterministic order
- formula injection protected
- values match selected revision

---

## UC-BATCH-004: Provider exports individual CSV

### Primary actor

Meal Provider Owner

### Main flow

1. Owner clicks Individual CSV.
2. System returns one row per item/variant/member.

### Acceptance criteria

- member data only visible to owner
- totals reconcile with aggregate

---

## UC-BATCH-005: Provider prints preparation summary

### Primary actor

Meal Provider Owner

### Main flow

1. Owner opens print view.
2. System server-renders revision.
3. Owner prints.

### Acceptance criteria

- aggregate first
- individual details next
- revision visible
- table headers repeat
- A4 and letter work
- no interactive UI printed

---

# 16. Provider override use cases

## UC-OVERRIDE-001: Provider overrides locked response

### Primary actor

Meal Provider Owner

### Preconditions

- Response locked.
- Cutoff passed.

### Main flow

1. Owner opens member response.
2. Owner selects Override.
3. Owner changes allowed fields.
4. Owner enters mandatory reason.
5. System preserves original state.
6. System writes override.
7. System records audit event.
8. Current batch becomes stale.

### Postconditions

- existing batch revision remains immutable
- preparation screen indicates stale batch

---

## UC-OVERRIDE-002: Provider regenerates batch after override

### Primary actor

Meal Provider Owner

### Preconditions

- Existing batch stale.
- Override exists.

### Main flow

1. Owner clicks Regenerate.
2. System creates new revision.
3. System recomputes totals.
4. Old revision remains available.
5. New revision becomes current.

### Important rule

Email is not automatically resent.

---

## UC-OVERRIDE-003: Provider resends email for selected revision

### Primary actor

Meal Provider Owner

### Main flow

1. Owner selects current revision.
2. Owner clicks Resend email.
3. System sends exact persisted revision.
4. Email status recorded.

---

# 17. Security use cases

## UC-SECURITY-001: Customer attempts to view another customer's response

### Expected result

- not found or forbidden according to existing error convention
- no data leaked

---

## UC-SECURITY-002: Customer attempts provider admin action

### Expected result

- backend rejects
- UI does not show action
- no state change

---

## UC-SECURITY-003: Provider A owner requests Provider B data

### Expected result

- request denied
- existence not leaked where current project convention prefers not found

---

## UC-SECURITY-004: Removed member opens old direct link

### Expected result

- access denied
- no cached private menu data rendered

---

## UC-SECURITY-005: Expired invite is accepted

### Expected result

- rejected
- no membership created

---

## UC-SECURITY-006: Customer submits cross-provider catalog item

### Expected result

- server rejects
- no partial response write

---

# 18. Notification use cases

## UC-NOTIFY-001: Provider publishes menu

### Recipients

Active approved customers.

### Result

Customer receives in-app notification if provider notifications are enabled.

### CLAUDE CODE VERIFY

Inspect current notification preference and event infrastructure.
Reuse existing fan-out behavior where compatible.

---

## UC-NOTIFY-002: Cutoff is approaching

### Recipients

Active customers without confirmed/cancelled response.

### Result

Optional reminder.

### Important rule

Do not notify removed/rejected customers.

---

## UC-NOTIFY-003: Provider approves customer

### Recipient

Approved customer.

### Result

Customer learns menu access is active.

---

## UC-NOTIFY-004: Summary email sent to provider

### Recipient

Configured provider summary recipients.

### Result

Email contains selected persisted batch revision.

---

# 19. Out-of-scope use cases

Claude Code must not implement these in MVP.

## OOS-001: Customer pays provider

Handled outside app.

## OOS-002: Provider tracks unpaid balance

Not stored.

## OOS-003: Customer selects pickup day

Outside app.

## OOS-004: Provider assigns delivery

Outside app.

## OOS-005: Provider reduces all orders due to capacity

No bulk capacity workflow.

Provider may manually override individual orders.

## OOS-006: Customer modifies order by phone after cutoff

Outside app.

## OOS-007: Marketplace search

Outside app.

## OOS-008: Provider ratings

Outside app.

---

# 20. State transition reference

## 20.1 Provider membership

```text
invited
  -> awaiting_approval
  -> active
  -> removed

awaiting_approval
  -> rejected

invited
  -> expired/cancelled
```

### CLAUDE CODE VERIFY

Exact invite terminal states must align with existing invite enums or provider-specific enums.

---

## 20.2 Menu day

```text
draft
  -> published
  -> locked
  -> archived

draft
  -> cancelled

published
  -> cancelled
```

No member responses may mutate after locked.

---

## 20.3 Member response

```text
(no row / no_response)
  -> draft
  -> confirmed
  -> cancelled

confirmed
  -> locked

(no response + eligible subscription)
  -> auto_accepted
  -> locked

locked
  -> provider_overridden
```

Member cannot transition locked state.

---

## 20.4 Suggestion

```text
pending
  -> accepted_as_option
  -> rejected
  -> deferred
```

---

## 20.5 Preparation batch

```text
generated revision 1
  -> stale
  -> generated revision 2
```

Historical revisions remain immutable.

---

# 21. Traceability matrix

| Use case group          | Design spec area               | Developer |
| ----------------------- | ------------------------------ | --------- |
| Workspace resolution    | Workspace routing design       | B         |
| Provider onboarding     | Provider onboarding service/UI | A + B     |
| Catalog                 | Provider catalog service/UI    | A + B     |
| Invite and approval     | Membership service/UI          | A + B     |
| Menu authoring          | Menu service/menu builder      | A + B     |
| Member response         | Response service/member UI     | A + B     |
| Cutoff                  | Cutoff service/job             | A         |
| Aggregation             | Aggregation service            | A         |
| CSV/email backend       | Export/email services          | A         |
| Print rendering         | Print page                     | B         |
| Provider preparation UI | Preparation page               | B         |
| RLS/security            | Database/RLS                   | A         |
| Playwright flows        | E2E                            | B         |
| Integration tests       | Supabase integration           | A         |

---

# 22. Independent development scenarios

## Developer A can work without Developer B by using

- API request fixtures
- service tests
- direct route tests
- local Supabase integration tests
- known DTO contracts
- batch fixtures

## Developer B can work without Developer A by using

- typed provider API client interface
- mock service worker or local route mocks
- static fixtures
- contract fixtures
- simulated time/cutoff states

## Required shared fixtures

Create shared fixtures for:

1. Provider owner
2. Awaiting approval customer
3. Approved customer
4. Published menu
5. Draft response
6. Confirmed response
7. Cancelled response
8. Locked response
9. Auto-accepted response
10. Batch revision
11. Stale batch
12. Multiple provider memberships

Do not let each developer invent different fixture shapes.

---

# 23. End-to-end business scenarios

## Scenario E2E-001: Provider publishes and customer confirms

1. User creates provider.
2. Provider creates catalog.
3. Provider creates complete menu.
4. Provider publishes.
5. Provider invites customer.
6. Customer accepts.
7. Provider approves.
8. Customer completes minimal onboarding.
9. Customer views today's menu.
10. Customer selects mild spice.
11. Customer confirms.
12. Provider sees confirmed count.

Expected:

- customer response valid
- no household onboarding
- no payment state
- no pickup state

---

## Scenario E2E-002: No response means no order

1. Approved customer sees menu.
2. Customer does nothing.
3. Cutoff passes.
4. Processor runs.

Expected:

- customer counted as no response
- no quantities added

---

## Scenario E2E-003: Subscription auto-accept

1. Approved customer has active subscription.
2. Customer consents to auto-accept.
3. Customer takes no action.
4. Cutoff passes.

Expected:

- default meal auto-accepted
- no extras
- no alternatives
- included in batch

---

## Scenario E2E-004: Customer cancels

1. Customer confirms.
2. Customer cancels before cutoff.
3. Cutoff passes.

Expected:

- cancelled
- excluded from batch
- auto-accept does not recreate

---

## Scenario E2E-005: Provider override

1. Customer order locks.
2. Provider manually changes order.
3. Provider enters reason.
4. Batch becomes stale.
5. Provider regenerates.
6. Revision increments.
7. Provider explicitly resends email.

Expected:

- history retained
- old batch immutable
- new batch correct

---

## Scenario E2E-006: Multi-provider customer

1. Customer joins Provider A.
2. Customer joins Provider B.
3. Both approve.
4. Customer switches workspaces.
5. Customer responds separately.

Expected:

- no cross-provider leakage
- correct menu and response per provider

---

# 24. Claude Code execution guidance

For every implementation task, Claude Code must identify:

1. Use case ID being implemented.
2. Actor.
3. Preconditions.
4. State transition.
5. Authorization rule.
6. Service method.
7. API or server action.
8. UI behavior.
9. Database mutation.
10. Event/notification.
11. Tests.
12. Out-of-scope boundaries.

Claude Code must not say a use case is complete unless:

- main flow works
- alternate flow works
- authorization is tested
- failure path is tested
- tenant isolation is tested
- cutoff behavior is tested where applicable

---

# 25. Definition of behavior completeness

The feature behavior is complete only when:

- every in-scope use case has implementation or explicit deferred status
- every state transition is validated
- every mutation has server-side authorization
- every cutoff mutation is server-side blocked
- every aggregation total reconciles
- every export uses persisted batch data
- every cross-provider access attempt fails
- every customer sees only minimal onboarding
- every provider customer lands on Today's Menu
- no household workflow regresses
