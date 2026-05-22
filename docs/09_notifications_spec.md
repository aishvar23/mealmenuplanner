# Notification Specification

## Objective
Notify household members about important meal, schedule, member, and prep changes.

## Notification channels

### MVP
- In-app notifications
- Email notifications for invites

### Later
- Push notifications
- WhatsApp notifications
- SMS reminders

## Notification events

### Meal events
- meal_changed
- meal_rejected
- meal_marked_eating_out
- meal_locked
- meal_unlocked
- weekly_plan_generated
- weekly_plan_updated

### Prep events
- prep_task_due
- prep_task_completed
- prep_task_missed

### Grocery events
- grocery_list_generated
- grocery_list_updated
- grocery_item_checked

### Household events
- member_invited
- invite_accepted
- invite_declined
- member_removed
- member_left
- guest_expiring
- guest_expired
- role_changed
- permissions_changed

## Notification content examples

### Meal changed
Title:
Dinner changed

Message:
Aishvarya changed tonight's dinner from Rajma Rice to Paneer Bhurji.

### Eating out
Title:
Meal marked as eating out

Message:
Riya marked Saturday dinner as eating out.

### Invite accepted
Title:
New household member

Message:
Rahul joined Suhane Household as a guest until May 26.

### Prep reminder
Title:
Prep needed tonight

Message:
Soak chickpeas by 9 PM for tomorrow's Chole Rice.

## Notification creation rules
When a household event occurs:

1. Identify all active household members.
2. Exclude the actor.
3. Check notification preferences.
4. Create notifications.
5. Send external notification if configured.

## Data model

### notifications
Fields:

- id
- household_id
- recipient_user_id
- actor_user_id
- event_type
- title
- message
- read_at
- created_at

## Notification preferences
V2 table:

notification_preferences

Fields:

- user_id
- household_id
- in_app_enabled
- email_enabled
- push_enabled
- whatsapp_enabled
- prep_reminders_enabled
- menu_change_enabled
- grocery_updates_enabled

## MVP notification rules
MVP should support:

- In-app notifications for menu/schedule changes
- Email invite notification
- In-app notifications for member joined/left
- Prep reminders shown on dashboard

Push notifications can wait.