# Product Requirements Document

## Objective

Build a household-first meal planning app that reduces daily meal decision fatigue and helps families plan meals, prep tasks, and groceries.

## Primary user problem

Users frequently ask:

> What should we eat today?

The app should answer this question in a way that is practical for the household.

## Core MVP requirements

### Authentication

Users should be able to sign in using:

- Google OAuth
- Email/password or magic link

Mobile OTP can be added later.

### Household setup

Users should be able to create a household profile with:

- Household name
- Family size
- Adults count
- Kids count
- Location
- Diet type
- Cuisine preferences
- Meals to plan
- Cooking time available
- Variety preferences
- Allergy and restriction preferences
- Budget preference

### Save and resume onboarding

The app should automatically save profile setup progress.

Users should be able to:

- Leave onboarding midway.
- Resume from the last saved step.
- See completion percentage.
- Complete onboarding with minimum required fields.

### Meal recommendation

The app should recommend meals based on:

- Diet match
- Meal slot
- Cooking time
- Cuisine preference
- Variety rules
- Prep requirements
- Kids in household
- Recent meal history
- Rejected meals
- Eating-out days

### Weekly meal plan

Users should be able to:

- Generate a weekly plan.
- View breakfast, lunch, and dinner.
- Replace meals.
- Mark meals as eating out.
- Lock a meal so it does not get regenerated.
- Regenerate the plan.

### Grocery list

The app should generate a grocery list based on the weekly meal plan and family size.

The list should be grouped by:

- Vegetables
- Fruits
- Dairy
- Grains
- Lentils
- Spices
- Eggs/meat
- Pantry staples

### Prep reminders

The app should show advance-prep tasks such as:

- Soak beans overnight.
- Ferment batter.
- Marinate protein.
- Thaw frozen items.
- Chop vegetables.
- Prepare masala paste.

### Household members

Users should be able to:

- Invite a permanent member.
- Invite a temporary guest.
- Choose permissions.
- Accept or decline invitations.
- Remove a member.
- Exit a household.

### Notifications

Members should receive notifications when:

- A meal is changed.
- A weekly schedule is changed.
- A meal is marked as eating out.
- A member joins.
- A member leaves.
- A guest access period is expiring.

## MVP success criteria

The MVP succeeds if early users say:

- They spend less time deciding what to cook.
- Meal suggestions feel practical.
- Grocery list is useful.
- Prep reminders prevent missed preparation.
- Shared household view improves coordination.
