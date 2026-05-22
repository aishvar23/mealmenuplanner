# Security, Privacy, and Permissions Specification

## Objective
Protect household data, enforce permissions, and avoid inappropriate access.

## Core security principles

1. A user can only access households where they are an active member.
2. Temporary guests can only access households before their expiry date.
3. Write actions require explicit permissions.
4. Invite tokens must be secure and expire.
5. Removed or expired users must lose access immediately.
6. Sensitive preferences should not be exposed unnecessarily.

## Access control

Before reading household data, verify:

- User is authenticated.
- User has household_members record.
- Membership status is active.
- For temporary guests, expires_at is in the future.

Before writing household data, verify relevant permission.

Examples:

### Change today's menu
Requires:

- status = active
- can_change_today_menu = true

### Change weekly schedule
Requires:

- status = active
- can_change_weekly_schedule = true

### Invite members
Requires:

- status = active
- can_invite_members = true

### Remove members
Requires:

- status = active
- can_remove_members = true

## Invite token security
Invite tokens should:

- Be random and unguessable.
- Expire after configured time.
- Be single-use after acceptance.
- Not expose sensitive household data before authentication.

## Temporary guest expiry
A scheduled job should mark guests expired.

Access checks should also verify expiry in real time.

Do not rely only on scheduled expiry.

## Privacy considerations
The app may collect sensitive dietary information.

Examples:

- Allergies
- Health preference tags
- Religious/cultural food preferences
- Family composition
- Children in household

Guidelines:

- Avoid asking for race.
- Ask for cuisine/cultural preference instead.
- Avoid making medical claims.
- Use "dietary preferences" instead of "medical treatment".
- Allow users to delete or edit preferences.

## Medical disclaimer
For health-related meal tags, include disclaimer:

"This app provides meal planning assistance and is not medical advice. Please consult a qualified healthcare professional for medical dietary guidance."

## Audit logging
Important household changes should write activity events.

Examples:

- Meal changed
- Member removed
- Permissions changed
- Household preferences changed

## Row-level security
If using Supabase, implement row-level security policies for:

- households
- household_members
- meal_plans
- meal_plan_items
- grocery_lists
- notifications

## MVP security checklist

- Auth required for app access
- Household membership checks
- Permission checks on write APIs
- Invite token expiry
- Guest expiry enforcement
- Removed members blocked
- Activity log for important actions