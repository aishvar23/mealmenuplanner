# API Specification

## Authentication

All APIs require an authenticated user unless explicitly stated.

## Household APIs

### Create household

POST /api/households

Request:

```json
{
  "name": "Suhane Household"
}
```

Response:

```json
{
  "householdId": "uuid"
}
```

### Get household

GET /api/households/{householdId}

Response:

```json
{
  "id": "uuid",
  "name": "Suhane Household",
  "preferences": {},
  "currentUserPermissions": {}
}
```

### Update household preferences

PATCH /api/households/{householdId}/preferences

Request:

```json
{
  "familySize": 4,
  "dietType": "vegetarian",
  "preferredCuisines": ["North Indian", "South Indian"],
  "varietyGapDays": 7
}
```

## Onboarding draft APIs

### Get current draft

GET /api/onboarding/draft

Response:

```json
{
  "status": "in_progress",
  "currentStep": "food_preferences",
  "completionPercentage": 45,
  "draftData": {}
}
```

### Save draft

PUT /api/onboarding/draft

Request:

```json
{
  "currentStep": "meal_schedule",
  "completionPercentage": 60,
  "draftData": {}
}
```

### Complete onboarding

POST /api/onboarding/complete

Request:

```json
{
  "draftId": "uuid"
}
```

Response:

```json
{
  "householdId": "uuid",
  "status": "completed"
}
```

## Invite APIs

### Create invite

POST /api/households/{householdId}/invites

Request:

```json
{
  "email": "guest@example.com",
  "phone": null,
  "membershipType": "temporary_guest",
  "role": "viewer",
  "expiresAt": "2026-05-26T00:00:00Z",
  "permissions": {
    "canViewPlan": true,
    "canSuggestMeals": true,
    "canChangeTodayMenu": false,
    "canChangeWeeklySchedule": false,
    "canInviteMembers": false
  }
}
```

Response:

```json
{
  "inviteId": "uuid",
  "inviteLink": "https://app.example.com/invite/token"
}
```

### Get invite

GET /api/invites/{token}

Response:

```json
{
  "householdName": "Suhane Household",
  "invitedBy": "Aishvarya",
  "membershipType": "temporary_guest",
  "role": "viewer",
  "expiresAt": "2026-05-26T00:00:00Z"
}
```

### Accept invite

POST /api/invites/{token}/accept

Response:

```json
{
  "householdId": "uuid",
  "membershipStatus": "active"
}
```

### Decline invite

POST /api/invites/{token}/decline

Response:

```json
{
  "status": "declined"
}
```

## Member APIs

### List members

GET /api/households/{householdId}/members

### Update member permissions

PATCH /api/households/{householdId}/members/{memberId}

### Remove member

POST /api/households/{householdId}/members/{memberId}/remove

### Leave household

POST /api/households/{householdId}/leave

## Meal plan APIs

### Generate today's meal

POST /api/households/{householdId}/meal-plans/today/generate

Request:

```json
{
  "date": "2026-05-22",
  "mealSlot": "dinner"
}
```

### Generate weekly plan

POST /api/households/{householdId}/meal-plans/week/generate

Request:

```json
{
  "startDate": "2026-05-25",
  "endDate": "2026-05-31"
}
```

### Replace meal

POST /api/meal-plan-items/{mealPlanItemId}/replace

Request:

```json
{
  "replacementDishId": "uuid",
  "reason": "User selected replacement"
}
```

### Mark eating out

POST /api/meal-plan-items/{mealPlanItemId}/eating-out

### Lock meal

POST /api/meal-plan-items/{mealPlanItemId}/lock

### Unlock meal

POST /api/meal-plan-items/{mealPlanItemId}/unlock

## Grocery APIs

### Get grocery list

GET /api/households/{householdId}/grocery-list?mealPlanId={mealPlanId}

### Regenerate grocery list

POST /api/households/{householdId}/grocery-list/regenerate

## Notification APIs

### List notifications

GET /api/notifications

### Mark notification read

POST /api/notifications/{notificationId}/read
