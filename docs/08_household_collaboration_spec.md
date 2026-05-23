# Household Collaboration Specification

## Objective

Allow multiple household members to share the same meal plan, receive updates, and collaborate with controlled permissions.

## Core concepts

### Household

A shared space where meal plans, preferences, grocery lists, and prep tasks live.

### Member

A permanent user with access to the household.

### Guest

A temporary user with access for a specific date range.

### Owner

The household creator or transferred owner.

## Member types

### Permanent

Used for long-term members such as spouse, parent, roommate, or cook.

### Temporary guest

Used for someone staying for a limited period.

Fields:

- starts_at
- expires_at
- status

## Roles

### Owner

Can:

- Edit household preferences
- Invite members
- Remove members
- Change roles
- Change today's menu
- Change weekly schedule
- Manage grocery list
- Transfer ownership

### Admin

Can:

- Invite members if permission is enabled
- Change meal plans
- Manage grocery list
- Edit some household preferences

### Member

Can:

- View plans
- Suggest meals
- Change meals if permission is enabled
- Receive notifications

### Viewer

Can:

- View meal plan
- Receive notifications if enabled

## Permission flags

MVP permissions:

- can_view_plan
- can_suggest_meals
- can_change_today_menu
- can_change_weekly_schedule
- can_manage_grocery_list
- can_invite_members
- can_remove_members
- can_edit_household_preferences

## Invite flow

1. Inviter enters email or phone.
2. Inviter selects member type.
3. Inviter selects role and permissions.
4. App creates invite token.
5. Invitee opens invite link.
6. Invitee signs in.
7. Invitee accepts or declines.
8. Membership becomes active if accepted.

## Temporary guest flow

1. Inviter selects "Temporary guest".
2. Inviter selects duration.
3. App sets starts_at and expires_at.
4. Guest accepts.
5. Guest has access until expires_at.
6. Scheduled job marks guest expired after expiry.

## Shared view

All active members should see:

- Today’s meal
- Weekly plan
- Prep tasks
- Grocery list
- Activity feed
- Household members

Actions depend on permissions.

## Notifications

When a household member changes the menu or schedule:

1. App updates the data.
2. App writes activity event.
3. App creates notifications for all active members except actor.
4. Members see notification in-app.

## Conflict handling

MVP should use last-write-wins.

Every change should be visible in activity history.

## Remove member

Owner/admin can remove a member if they have permission.

Removed member:

- Loses access
- Keeps historical attribution in activity logs
- Does not receive future notifications

## Leave household

Any non-owner member can leave.

Owner must transfer ownership before leaving.

## Guest preference impact

V2 feature:

When inviting a guest, ask:

"Should this guest's food preferences affect meal planning?"

MVP can skip this or collect diet type only.
