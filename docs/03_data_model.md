# Data Model Specification

## users

Represents authenticated users.

Fields:

- id
- email
- phone
- display_name
- avatar_url
- auth_provider
- created_at
- updated_at

## households

Represents a household.

Fields:

- id
- name
- created_by_user_id
- default_location_country
- default_location_city
- created_at
- updated_at

## household_profile_drafts

Stores incomplete onboarding progress.

Fields:

- id
- user_id
- household_id nullable
- current_step
- completion_percentage
- status
- draft_data jsonb
- last_saved_at
- created_at
- updated_at

Status values:

- in_progress
- completed
- abandoned

## household_members

Represents membership of users in households.

Fields:

- id
- household_id
- user_id
- role
- membership_type
- status
- invited_by_user_id
- starts_at
- expires_at nullable
- joined_at
- can_view_plan
- can_suggest_meals
- can_change_today_menu
- can_change_weekly_schedule
- can_manage_grocery_list
- can_invite_members
- can_remove_members
- can_edit_household_preferences
- created_at
- updated_at

Role values:

- owner
- admin
- member
- viewer

Membership type values:

- permanent
- temporary_guest

Status values:

- invited
- active
- declined
- expired
- removed
- left

## household_invites

Represents pending invitations.

Fields:

- id
- household_id
- invited_by_user_id
- invited_email nullable
- invited_phone nullable
- invite_token
- role
- membership_type
- permissions jsonb
- starts_at
- expires_at
- status
- accepted_by_user_id nullable
- accepted_at nullable
- declined_at nullable
- created_at
- updated_at

Status values:

- pending
- accepted
- declined
- expired
- cancelled

## household_preferences

Stores household-level preferences.

Fields:

- id
- household_id
- family_size
- adults_count
- kids_count
- diet_type
- preferred_cuisines text[]
- spice_level
- weekday_cooking_time_minutes
- weekend_cooking_time_minutes
- meals_to_plan text[]
- variety_gap_days
- allow_leftovers
- budget_preference
- created_at
- updated_at

## user_food_preferences

Stores member-level food preferences.

Fields:

- id
- user_id
- household_id
- diet_type
- allergies text[]
- disliked_ingredients text[]
- liked_dishes text[]
- disliked_dishes text[]
- spice_preference
- health_preference_tags text[]
- created_at
- updated_at

## dishes

Represents dishes in the app.

Fields:

- id
- name
- description
- cuisine
- region
- meal_slots text[]
- diet_type
- prep_time_minutes
- cook_time_minutes
- total_time_minutes
- difficulty
- spice_level
- kid_friendly
- lunchbox_friendly
- leftover_friendly
- batch_cook_friendly
- diabetic_friendly
- low_sodium
- high_protein
- low_carb
- status
- created_at
- updated_at

Status values:

- draft
- active
- archived

## ingredients

Represents ingredients.

Fields:

- id
- name
- category
- default_unit
- common_names text[]
- allergen_type nullable
- created_at
- updated_at

## dish_ingredients

Maps dishes to ingredients.

Fields:

- id
- dish_id
- ingredient_id
- quantity_per_serving
- unit
- is_required
- is_optional
- created_at
- updated_at

## dish_prep_tasks

Represents advance-prep tasks.

Fields:

- id
- dish_id
- task_name
- required_before_minutes
- description
- created_at
- updated_at

## dish_pairings

Represents dish combinations.

Fields:

- id
- primary_dish_id
- paired_dish_id
- pairing_type
- created_at
- updated_at

Pairing types:

- main_side
- rice_pairing
- bread_pairing
- condiment
- beverage

## meal_plans

Represents a generated plan for a date range.

Fields:

- id
- household_id
- start_date
- end_date
- status
- generated_by_user_id
- created_at
- updated_at

Status values:

- draft
- active
- archived

## meal_plan_items

Represents individual planned meals.

Fields:

- id
- meal_plan_id
- household_id
- date
- meal_slot
- dish_id nullable
- status
- locked
- reason
- changed_by_user_id nullable
- created_at
- updated_at

Status values:

- suggested
- accepted
- rejected
- replaced
- cooked
- skipped
- eating_out

## meal_feedback

Stores user feedback on meals.

Fields:

- id
- household_id
- meal_plan_item_id
- user_id
- feedback_type
- reason
- created_at

Feedback types:

- liked
- disliked
- too_much_effort
- ingredients_unavailable
- kids_disliked
- do_not_suggest_again
- suggest_more_often

## grocery_lists

Represents grocery list for a plan.

Fields:

- id
- household_id
- meal_plan_id
- status
- created_at
- updated_at

## grocery_list_items

Represents grocery list entries.

Fields:

- id
- grocery_list_id
- ingredient_id
- name
- category
- quantity
- unit
- checked
- created_at
- updated_at

## household_activity_events

Audit log for household changes.

Fields:

- id
- household_id
- actor_user_id
- event_type
- entity_type
- entity_id
- old_value jsonb
- new_value jsonb
- created_at

## notifications

Represents user notifications.

Fields:

- id
- household_id
- recipient_user_id
- actor_user_id nullable
- event_type
- title
- message
- read_at nullable
- created_at
