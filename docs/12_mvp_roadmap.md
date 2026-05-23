# MVP Roadmap

## Phase 0: Product preparation

### Deliverables

- Final MVP scope
- Dish seed spreadsheet
- Database schema
- Wireframes
- Recommendation scoring rules

### Acceptance criteria

- 100 starter dishes collected
- Core onboarding questions finalized
- MVP screens defined

## Phase 1: Foundation

### Build

- Auth
- Household creation
- User profile
- Database schema
- Basic navigation

### Acceptance criteria

- User can sign in
- User can create household
- Owner membership is created

## Phase 2: Save and resume onboarding

### Build

- Multi-step onboarding
- Draft save API
- Resume flow
- Completion flow

### Acceptance criteria

- User can leave onboarding and resume
- Draft completion creates household preferences

## Phase 3: Dish admin

### Build

- Admin dish list
- Add/edit dish
- Add ingredients
- Add prep tasks
- Activate/archive dish

### Acceptance criteria

- Operator can manage dishes without database access
- Active dishes can be used by recommender

## Phase 4: Recommendation engine

### Build

- Hard filters
- Scoring logic
- Recommendation reason
- Today’s meal suggestion

### Acceptance criteria

- App recommends valid meals
- App avoids diet/allergy conflicts
- App explains recommendation

## Phase 5: Meal planning

### Build

- Today screen
- Weekly plan
- Replace meal
- Mark eating out
- Lock meal
- Meal history

### Acceptance criteria

- User can generate and edit meal plan
- Meal changes persist
- Eating-out status affects grocery list

## Phase 6: Household collaboration

### Build

- Invite member
- Accept/decline invite
- Member list
- Roles and permissions
- Remove member
- Leave household
- Temporary guest expiry

### Acceptance criteria

- Two signed-in users can see same household plan
- Permissions control edit actions
- Guest access expires

## Phase 7: Grocery and prep

### Build

- Grocery list generation
- Prep task extraction
- Prep reminders on dashboard

### Acceptance criteria

- Weekly plan generates grocery list
- Prep tasks show before required time

## Phase 8: Notifications

### Build

- Activity event log
- In-app notifications
- Invite email
- Menu change notifications

### Acceptance criteria

- Members receive notifications when plan changes
- Actor does not receive duplicate notification

## Phase 9: Beta test

### Build

- Bug fixes
- Analytics
- Feedback collection
- Seed data improvements

### Acceptance criteria

- 10 to 20 households use app for 2 weeks
- Collect feedback on recommendation quality
