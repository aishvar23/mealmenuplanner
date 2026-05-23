# Technical Architecture Specification

## Recommended MVP stack

### Frontend

- Next.js
- React
- Tailwind CSS
- shadcn/ui

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row-Level Security
- Supabase Edge Functions or Next.js server actions

### Hosting

- Vercel for web app
- Supabase for database and auth

### Notifications

MVP:

- In-app notifications
- Email for invitations

Later:

- Push notifications
- WhatsApp
- SMS

## Architecture diagram

```text
Web App
  |
  | Next.js pages/components
  |
Server Actions / API Routes
  |
  | Permission checks
  | Recommendation engine
  | Grocery generation
  |
Supabase Postgres
  |
  | Auth
  | RLS
  | Tables
  |
Scheduled Jobs
  |
  | Guest expiry
  | Prep reminders
  | Invite expiry
```

## Core backend services

### Onboarding service

Responsibilities:

- Save draft
- Resume draft
- Complete profile
- Create household
- Create owner membership

### Household service

Responsibilities:

- Create household
- Update preferences
- Manage members
- Enforce permissions

### Invite service

Responsibilities:

- Create invite
- Validate token
- Accept invite
- Decline invite
- Expire invite

### Meal recommendation service

Responsibilities:

- Load preferences
- Apply hard filters
- Score dishes
- Return ranked recommendations
- Generate explanation

### Meal plan service

Responsibilities:

- Generate today plan
- Generate weekly plan
- Replace meal
- Mark eating out
- Lock/unlock meal

### Grocery service

Responsibilities:

- Aggregate ingredients
- Scale quantities by family size
- Group by category
- Regenerate grocery list after plan changes

### Notification service

Responsibilities:

- Create notifications
- Mark read
- Send invite email
- Later send push/WhatsApp

### Admin content service

Responsibilities:

- Create dish
- Edit dish
- Archive dish
- Manage ingredients
- Manage prep tasks
- Manage pairings

## Scheduled jobs

### Expire guests

Run daily or hourly.

Logic:

- Find active temporary guests where expires_at < now().
- Set status = expired.
- Create household event.
- Notify household owner.

### Expire invites

Run daily.

Logic:

- Find pending invites where expires_at < now().
- Set status = expired.

### Prep reminders

Run hourly or based on user timezone.

Logic:

- Find prep tasks due soon.
- Create notification.

## MVP deployment

Use:

- Vercel project
- Supabase project
- Environment variables for Supabase URL and keys
- Separate dev and prod projects

## Future architecture

If the product grows, split into:

- Mobile app
- Dedicated backend API
- Background worker
- Recommendation service
- Notification service
