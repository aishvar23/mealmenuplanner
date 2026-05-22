# Recommendation Engine Specification

## Objective
Recommend practical meals for a household based on constraints, preferences, meal history, and preparation requirements.

## MVP approach
Use a deterministic rule-based scoring engine.

Do not start with a fully AI-based system. The first version should be explainable and controllable.

## Inputs

### Household inputs
- Diet type
- Cuisine preferences
- Family size
- Kids count
- Meals to plan
- Cooking time available
- Variety gap days
- Budget preference
- Leftover preference

### Member inputs
- Allergies
- Disliked ingredients
- Liked dishes
- Disliked dishes
- Health preference tags
- Spice preference

### Dish inputs
- Meal slot
- Diet type
- Cuisine
- Ingredients
- Prep time
- Cook time
- Required advance prep
- Tags
- Kid-friendly flag
- Lunchbox-friendly flag
- Difficulty

### Historical inputs
- Recently cooked dishes
- Recently rejected dishes
- Eating-out dates
- Feedback history

## Hard filters
A dish should be excluded if:

- It violates diet type.
- It contains an allergy ingredient.
- It does not match the meal slot.
- It requires prep that is impossible for the selected time.
- It is marked as do-not-suggest-again.
- It violates temporary guest restrictions during guest stay.

## Soft scoring
A dish receives score adjustments.

Example scoring:

- Diet match: +100
- Meal slot match: +50
- Cuisine preference match: +30
- Cooking time within limit: +30
- Not repeated recently: +40
- Kid-friendly when kids exist: +20
- Lunchbox-friendly for lunch: +15
- Uses preferred ingredient: +10
- Recently rejected: -80
- Recently cooked within variety gap: -60
- Missing required prep: -60
- Exceeds cooking time: -40
- High difficulty on weekday: -30

## Rotation logic
The app should avoid repeating the same dish within the configured variety gap.

Example:

If variety_gap_days = 7, do not recommend the same dish within 7 days unless user explicitly asks.

## Ingredient repetition
In later versions, the app should also reduce repetition of the same primary ingredient.

Example:

If paneer was used yesterday, reduce score for paneer dishes today.

## Prep-aware recommendation
If a dish requires advance prep and the prep was not completed, either:

- Reject the dish for today's meal.
- Allow it for tomorrow or later and create prep task.

Example:

Rajma requires soaking for 8 hours. It should not be suggested for dinner if it is already 6 PM and rajma was not soaked.

## Recommendation explanation
Every recommendation should have a short explanation.

Example:

"Suggested because it is vegetarian, fits your 45-minute cooking window, has not been repeated this week, and works well for dinner."

## Pseudocode

```text
getRecommendations(householdId, date, mealSlot):
    household = loadHouseholdPreferences(householdId)
    members = loadActiveMembers(householdId, date)
    dishes = loadActiveDishesForMealSlot(mealSlot)
    history = loadRecentMealHistory(householdId)

    candidates = []

    for dish in dishes:
        if violatesHardFilter(dish, household, members, date):
            continue

        score = 0
        score += scoreDietMatch(dish, household, members)
        score += scoreCuisineMatch(dish, household)
        score += scoreCookingTime(dish, household, date)
        score += scoreVariety(dish, history)
        score += scoreKids(dish, household)
        score += scoreFeedback(dish, history)
        score += scorePrepFeasibility(dish, date)

        candidates.add(dish, score)

    sort candidates by score desc
    return top candidates
```

## MVP output
The recommendation engine should return:

- dish_id
- score
- reason
- missing_constraints
- prep_tasks
- paired_dishes