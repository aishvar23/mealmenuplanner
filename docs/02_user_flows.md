# User Flows

## Flow 1: New user signs up and creates household

1. User opens app.
2. User clicks "Sign in".
3. User signs in using Google or email.
4. App asks whether user wants to create a household.
5. User enters household name.
6. User starts onboarding.
7. App autosaves each step.
8. User completes minimum required preferences.
9. App creates household profile.
10. App generates first meal suggestion.

## Flow 2: Save and resume onboarding

1. User starts preference setup.
2. User completes household basics.
3. App saves draft.
4. User closes app.
5. User returns later.
6. App detects incomplete draft.
7. App shows "Continue setup".
8. User resumes from last completed step.
9. User completes onboarding.
10. Draft status changes to completed.

## Flow 3: Generate today's meal

1. User opens Today screen.
2. App loads household preferences and recent meal history.
3. App evaluates eligible dishes.
4. App recommends meal.
5. User sees reason for recommendation.
6. User accepts, rejects, or asks for another option.

## Flow 4: Reject and replace meal

1. User sees recommended meal.
2. User taps "Suggest another".
3. App records rejection reason if provided.
4. App excludes or penalizes rejected dish.
5. App suggests another meal.
6. Household members receive notification if a confirmed meal changed.

## Flow 5: Mark eating out

1. User opens meal plan.
2. User selects a meal slot.
3. User taps "Eating out".
4. Meal status changes to eating_out.
5. Dish is not counted as cooked.
6. The dish should not be unfairly penalized in rotation.
7. Grocery list should be recalculated if needed.

## Flow 6: Invite permanent member

1. Owner opens Household Members screen.
2. Owner taps "Invite member".
3. Owner enters email or phone.
4. Owner selects "Permanent member".
5. Owner chooses permissions.
6. App creates invite.
7. Invitee receives link.
8. Invitee signs in.
9. Invitee accepts invite.
10. Invitee becomes active household member.
11. Existing members receive notification.

## Flow 7: Invite temporary guest

1. Owner opens Household Members screen.
2. Owner taps "Invite guest".
3. Owner enters email or phone.
4. Owner selects temporary guest duration.
5. Owner chooses permissions.
6. App creates invite with expiry date.
7. Guest accepts invite.
8. Guest sees shared household meal plan.
9. Guest access expires automatically after the configured period.

## Flow 8: Member changes today's menu

1. Member opens Today screen.
2. Member taps "Change meal".
3. App checks permission.
4. If allowed, app applies change.
5. Activity event is created.
6. Other members receive notification.
7. Shared household view updates.

## Flow 9: Remove member

1. Owner opens member management.
2. Owner selects member.
3. Owner taps "Remove".
4. App confirms action.
5. Member status changes to removed.
6. Removed member loses household access.
7. Remaining members receive notification.

## Flow 10: Exit household

1. Member opens household settings.
2. Member taps "Leave household".
3. App confirms action.
4. Member status changes to left.
5. Member loses access.
6. Household owner receives notification.

## Flow 11: Owner exits household

1. Owner tries to leave household.
2. App checks if there is another active admin/member.
3. App requires ownership transfer.
4. Owner transfers ownership.
5. Owner can then leave.
