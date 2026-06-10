# 09 — Open Questions (Meal Provider Workspace)

> **Source specs:** design spec → [`design/meal-provider/01_design_spec.md`](../../meal-provider/01_design_spec.md);
> use-case spec → [`design/meal-provider/02_use_case_spec.md`](../../meal-provider/02_use_case_spec.md).

Only questions that **cannot** be answered from the code, existing design docs, or
the two supplied specs. Each: **why it matters · affected tasks · safe default ·
must implementation stay blocked?** Questions already answered by the specs are
omitted.

---

### Q-1 — Menu structural-edit policy after a member response exists

- **Why it matters:** The use-case spec (UC-MENU-005) explicitly leaves this open and
  says "implementation blocked until a safe policy is selected." There is no
  revalidation infrastructure in the repo to copy. The choice determines whether
  the menu builder allows post-publish structural edits.
- **Affected tasks:** MP-A-012E (structural-edit guard), MP-A-121 (authoring/publish RPC),
  MP-B-030 (menu builder edit affordance). Risk R-05. **Not** MP-A-012 (menu schema) — its
  table shape is ADR-7-independent.
- **Safe default:** **Block** structural edits once any response exists; require
  cancel+recreate; allow non-structural edits (note text). Spice/salt are included
  substitutions and don't restructure.
- **Stay blocked?** **Yes** for MP-A-012E and the edit paths of MP-A-121 / MP-B-030 until
  confirmed. MP-A-012 (schema) and the read/publish-fresh path can proceed under the default.

### Q-2 — Workspace-active persistence shape

- **Why it matters:** `users.active_household_id` is household-typed and can't store a
  provider id. The pointer shape affects the migration and future workspace types.
- **Affected tasks:** MP-A-015 (pointer table + RPC), MP-B-010 (routing). Risk R-02.
- **Safe default:** generalized `user_active_workspace(user_id pk, workspace_type,
workspace_id)` with a membership-verifying RPC; fallback = client-only (no migration).
- **Stay blocked?** **No** — routing works with either; pick before MP-A-015 ships.

### Q-3 — Are overlapping weekly menus forbidden?

- **Why it matters:** Determines whether a partial-unique index on
  `(provider_id, menu_date)` / weekly ranges is added. The design spec §8.6 marks this
  "CLAUDE CODE VERIFY"; no publishing UX exists yet to infer intent.
- **Affected tasks:** MP-A-012 (menu schema constraints).
- **Safe default:** **No** unique constraint in MVP; enforce one-active-day-per-date in
  the service if needed; add the index later once publishing UX is settled.
- **Stay blocked?** **No** — default is non-destructive; an index can be added later.

### Q-4 — Provider in-app notifications: separate table vs. generalized inbox

- **Why it matters:** `notifications.household_id` is NOT NULL; reusing it requires
  relaxing a constraint on a hot household-coupled table.
- **Affected tasks:** MP-A-014 (schema), MP-A-170 (fan-out), member notification UI.
- **Safe default:** **separate `provider_notifications`** (ADR-15) to avoid churning
  shared household infra; revisit a unified inbox only if duplication is costly.
- **Stay blocked?** **No** — default is safe and additive.

### Q-5 — Provider invite email-mismatch acceptance rule

- **Why it matters:** UC-MEMBER-002 ("CLAUDE CODE VERIFY") — whether a signed-in user
  whose email differs from the invited email may accept. Must match household behavior
  for consistency.
- **Affected tasks:** MP-A-102 (accept invite).
- **Safe default:** mirror the **existing household invite matching rule** (read it from
  `lib/services/invite` / `accept_invite` before implementing); do not invent new
  behavior.
- **Stay blocked?** **No** — resolved by inspecting the household rule during MP-A-102.

### Q-6 — Does provider onboarding need a server-side resumable draft?

- **Why it matters:** ADR-6 proposes a provider-specific draft store; but onboarding
  could be short enough to keep stage state client-side, avoiding a table + abandon job.
- **Affected tasks:** MP-A-015 (draft table), MP-B-020 (onboarding UI), MP-A-101.
- **Safe default:** mirror household (server draft) for resumability per UC-PROVIDER-002;
  acceptable fast-follow alternative = client-staged with a single atomic complete call.
- **Stay blocked?** **No** — both satisfy the spec; pick before MP-B-020 ships.

### Q-7 — `@mmp/shared` export-map convention for the new provider subpath

- **Why it matters:** Adding a `@mmp/shared/provider` subpath must follow the existing
  `package.json` `exports` map convention so mobile + web resolve it (don't create a
  second shared package).
- **Affected tasks:** MP-A-001. Risk R-12.
- **Safe default:** replicate the existing `/types`,`/validation`,`/recommendation`
  export entries exactly for `/provider`.
- **Stay blocked?** **No** — mechanical; confirm the map during MP-A-001.

---

## Disposition

- **Hard blocker (must decide before dependent code):** **Q-1** (menu edit policy).
- **Pick-before-ship, not blocking the program:** Q-2, Q-3, Q-4, Q-5, Q-6, Q-7 — all have
  safe defaults that let work proceed and are resolved within their owning task.
