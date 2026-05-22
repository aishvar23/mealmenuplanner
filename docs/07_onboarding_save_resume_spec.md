# Save and Resume Onboarding Specification

## Objective
Allow users to complete a lengthy household preference setup without losing progress.

## Problem
Preference setup can take more than one minute. Users may drop off if they are forced to complete everything in one sitting.

## Requirements

### Autosave
The app should autosave progress after each step.

Optional enhancement:

- Autosave field changes with debounce.

### Resume
When a user returns with an incomplete draft, show:

"Continue setting up your household profile?"

Include:

- Completion percentage
- Last saved time
- Resume button
- Start over option

### Minimum setup
Users should be allowed to finish onboarding with minimum required fields.

Minimum required:

- Household name
- Family size
- Diet type
- Meals to plan
- Cooking time
- Cuisine preference

Optional:

- Allergies
- Health preferences
- Pantry
- Budget
- Kids' preferences
- Guest preferences

### Draft status
Draft status values:

- in_progress
- completed
- abandoned

### Draft storage
Use a JSONB draft object for flexibility.

Example structure:

```json
{
  "householdBasics": {
    "name": "Suhane Household",
    "familySize": 4
  },
  "foodPreference": {
    "dietType": "vegetarian",
    "preferredCuisines": ["North Indian"]
  },
  "mealSchedule": {
    "mealsToPlan": ["dinner"],
    "weekdayCookingTimeMinutes": 45
  }
}
```

## UX requirements

### Step navigation
Users should be able to move forward and backward between steps.

### Save state
Show save state:

- Saving...
- Saved just now
- Last saved 2 minutes ago
- Save failed. Retry.

### Error handling
If save fails:

- Keep data in local state.
- Retry save.
- Warn user before leaving if latest changes are not saved.

### Abandoned drafts
If a draft has not been updated for a long period, mark it abandoned.

Suggested threshold:

- 30 days

## Completion behavior
When onboarding completes:

1. Validate required fields.
2. Create household if not already created.
3. Create household preferences.
4. Create household owner membership.
5. Mark draft completed.
6. Redirect user to Today screen.