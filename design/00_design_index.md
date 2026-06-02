# Design Documentation Index

This folder contains the **production-level technical design** for Home Meal
Planner. Each document focuses on one area and is ordered by build priority.
Where the product specs in [`../docs/`](../docs/) describe _what_ to build, these
documents describe _how_ to build it — schemas, contracts, diagrams, algorithms,
and the decisions behind them.

All diagrams use [Mermaid](https://mermaid.js.org/) so they render directly on
GitHub.

## Reading / build order

| #   | Document                                                                        | Area                                       | Depends on | Priority       |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------ | ---------- | -------------- |
| 01  | [Database Design](01_database_design.md)                                        | Schema, enums, indexes, RLS                | —          | **P0 — first** |
| 02  | [System Architecture](02_system_architecture.md)                                | Stack, layers, deployment, jobs            | 01         | P0             |
| 03  | [Auth & Security Design](03_auth_and_security_design.md)                        | Auth flows, RLS policies, permissions      | 01, 02     | P0             |
| 04  | [API Design](04_api_design.md)                                                  | Endpoint contracts, error model, sequences | 01, 02, 03 | P1             |
| 05  | [Recommendation Engine Design](05_recommendation_engine_design.md)              | Filter + scoring pipeline                  | 01, 04     | P1             |
| 06  | [Onboarding Design](06_onboarding_design.md)                                    | Save/resume draft state machine            | 01, 04     | P1             |
| 07  | [Household Collaboration Design](07_household_collaboration_design.md)          | Roles, invites, guest lifecycle            | 01, 03, 04 | P2             |
| 08  | [Meal Planning, Grocery & Prep Design](08_meal_planning_grocery_prep_design.md) | Plan generation, grocery, prep             | 01, 04, 05 | P2             |
| 09  | [Notifications Design](09_notifications_design.md)                              | Event fan-out, channels                    | 01, 04, 07 | P2             |
| 10  | [Mobile App Design](10_mobile_app_design.md)                                    | Native iOS/Android (RN + Expo) on the API  | 02, 03, 04 | Post-MVP       |

## How these map to the MVP roadmap

The phased plan in [`../docs/12_mvp_roadmap.md`](../docs/12_mvp_roadmap.md) is the
delivery sequence. These design docs are the implementation reference for it:

- **Phase 1 (Foundation):** docs 01, 02, 03
- **Phase 2 (Onboarding):** doc 06
- **Phase 3 (Dish admin):** docs 01, 04
- **Phase 4 (Recommendation):** doc 05
- **Phase 5 (Meal planning):** doc 08
- **Phase 6 (Collaboration):** doc 07
- **Phase 7 (Grocery & prep):** doc 08
- **Phase 8 (Notifications):** doc 09

## Conventions used across all design docs

- **Database identifiers:** `snake_case`. **API payloads:** `camelCase`.
- **Primary keys:** `uuid`, defaulted with `gen_random_uuid()`.
- **Timestamps:** `timestamptz`, defaulted to `now()`.
- **Enumerations:** native PostgreSQL `enum` types (see doc 01).
- **Source of truth:** the database schema in doc 01. If any other doc disagrees
  with it on a table/column/enum, doc 01 wins — fix the other doc.
