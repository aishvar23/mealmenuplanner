# Admin and Operator Specification

## Objective

Allow internal operators to maintain the dish knowledge base with high-quality metadata.

## Admin roles

### Super admin

Can manage users, dishes, ingredients, and system settings.

### Content operator

Can add and edit dishes, ingredients, tags, and prep metadata.

### Reviewer

Can review dishes and approve them for production.

## Admin screens

### Dish list

Features:

- Search by name
- Filter by cuisine
- Filter by meal slot
- Filter by diet type
- Filter by status
- Filter by missing metadata
- Sort by recently updated

### Add/edit dish

Fields:

- Dish name
- Description
- Cuisine
- Region
- Meal slots
- Diet type
- Prep time
- Cook time
- Difficulty
- Spice level
- Tags
- Instructions
- Kid-friendly
- Lunchbox-friendly
- Leftover-friendly
- Health tags
- Status

### Ingredient manager

Fields:

- Ingredient name
- Category
- Default unit
- Common names
- Allergen type
- Substitutes

### Dish ingredient editor

For each dish:

- Ingredient
- Quantity per serving
- Unit
- Required or optional

### Prep task editor

For each dish:

- Task name
- Required before minutes
- Description

Example:

- Task: Soak chickpeas
- Required before: 480 minutes
- Description: Soak chickpeas overnight or at least 8 hours before cooking.

### Pairing editor

For each dish, operator can define pairings.

Example:

- Rajma pairs with rice.
- Chole pairs with rice or bhature.
- Sambar pairs with idli, dosa, and rice.

## Dish quality checklist

A dish should not be activated unless it has:

- Name
- Cuisine
- Meal slot
- Diet type
- Total time
- Ingredients
- At least one serving quantity
- Prep tasks if required
- Tags
- Status set to active

## Content rules

Operators should avoid:

- Duplicate dishes with slightly different names
- Missing advance-prep metadata
- Ambiguous ingredients
- Unrealistic cooking times
- Incorrect diet classification
- Unverified medical claims

## MVP admin requirements

The MVP admin panel must support:

- Add dish
- Edit dish
- Archive dish
- Add ingredients
- Add dish ingredients
- Add prep tasks
- Mark dish active
