# Workout Tracker — Design Spec

**Date:** 2026-08-22
**Status:** Approved for planning
**Source requirements:** `docs/app_features.md` (sections referenced below as §N)

---

## 1. Overview

A personal gym workout planning and execution app for Android, built with React Native CLI. The user defines a weekly routine, follows it while training, and records what they actually did — set by set — so that planned targets and real performance are stored independently and remain comparable over time.

The product principle from §2 governs the entire design: **the plan is what you intended, the session is what happened, and neither may overwrite the other.**

Scope is a single user's personal tool. Explicitly not a social platform (§1).

---

## 2. Decisions

These were settled during brainstorming and are not open for re-litigation during implementation.

| # | Decision | Consequence |
|---|---|---|
| D1 | **Android only, permanently.** No web, no iOS. | §43's "desktop browsers" requirement is withdrawn. Native-only libraries are usable with no fallback story. |
| D2 | **Local SQLite is the source of truth.** Supabase is added *after* validation, serving both backup and the web dashboard — never as the live data path for the app. | No network code in the MVP. Schema is built sync-ready from day one so the addition is additive. |
| D3 | **Unplanned work is first-class.** Users may add unplanned exercises and extra sets mid-workout. | `performed_exercises.planned_exercise_id` is nullable; `performed_sets.is_unplanned` flags extra sets. |
| D4 | **Plans are versioned copy-on-write** with effective-from/to dates. | Missed days and adherence resolve against the plan actually in force on a past date, satisfying §39 and delivering §32. |
| D5 | **React Native CLI, no Expo anywhere.** No Expo Router. | `@op-engineering/op-sqlite` instead of expo-sqlite; React Navigation instead of Expo Router; Android Studio builds instead of EAS. |
| D6 | **Calendar view included in the MVP** (originally proposed for deferral). | §23 ships as part of the History work in Phase 4; the day resolver already does the hard part. |

| D7 | **Migrations ship as exported TypeScript string constants**, not via a Babel inline-import transform. | Retires R1 outright. `drizzle-kit` still generates the SQL; a small runner applies it and tracks state in the `user_version` pragma. |
| D8 | **Reactivity is TanStack Query with invalidation on write.** op-sqlite native reactive queries are an optional later optimization. | Retires R2 outright. Repositories are the single mutation funnel, so invalidation is one call per write site. |
| D9 | **A web dashboard is planned**, following a 2–3 month validation period and a Play Store release. | Makes the Postgres port a committed deliverable rather than hypothetical, which is the primary reason Drizzle is the right ORM (see section 3). |
| D10 | **Phases are vertical slices.** Each ships schema, domain logic, repository, and UI together and is independently testable end-to-end on a device. | Domain functions are built in the phase whose UI consumes them, never bulk-built in advance. Phase 0 is the only non-user-testable phase. |
| D11 | **Screen designs are produced and approved before implementation planning**, and committed to `docs/design/` as images. | The implementation plan references approved screens rather than inventing UI during coding. |

Throughout this document, **"the MVP" means Phases 0 through 5** in section 11. Numbered phases always refer to that table, never to release milestones.

D7 and D8 exist because both were originally specified as the clever option with a boring fallback. Inverting that — choosing the boring option by default — eliminates the risk at negligible cost. The clever options remain available as optimizations if ever needed.

### Development environment constraint

Development happens on Windows 11. React Native CLI builds iOS only through Xcode on macOS, and dropping Expo removes the cloud-build escape hatch. This is accepted: the target device is Android, and iOS is out of scope permanently per D1.

---

## 3. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React Native CLI (bare) | Explicit user requirement (D5). |
| Language | TypeScript, strict mode | Domain rules benefit from exhaustive union checking. |
| Database | SQLite via `@op-engineering/op-sqlite` | JSI-based, fast, bare-RN native, actively maintained. |
| ORM | Drizzle ORM (`drizzle-orm/op-sqlite`) | Typed schema, real migrations, and a near-mechanical port path to `pg-core` for the future Supabase backend (D2). |
| Migrations | `drizzle-kit` generate → committed as TS string constants (D7) | No bundler plugin, no filesystem access required. |
| Navigation | React Navigation — native stack + bottom tabs | Five tabs map directly onto §3. |
| Read cache / reactivity | TanStack Query, invalidated on write (D8) | Screens re-render after mutations without depending on native change listeners. |
| Ephemeral state | Zustand | Holds only in-flight set inputs; not a persistence layer. |
| Testing | Jest + `better-sqlite3` for repositories; React Native Testing Library for critical screens | See section 9. |

### Why Drizzle, given D9

The web dashboard requires the data to reach Postgres, which makes schema portability a committed requirement rather than a nice-to-have. Drizzle is the only mainstream option that keeps one schema definition style across both targets: `sqlite-core` on the device, `pg-core` on Supabase, with identical table and column shapes and a mechanical translation between them.

Alternatives were evaluated and rejected: **TypeORM** shares entity classes across both dialects but its React Native driver is the callback-based `react-native-sqlite-storage` rather than JSI, which is slower on exactly the write path §46 prioritizes. **WatermelonDB** has strong reactivity but no Postgres portability. **Realm / Atlas Device SDK** is a deprecated platform and must not be used. **Prisma** is a reasonable choice for the future dashboard backend but its React Native support is immature. **Kysely** hits the same migration problem with weaker typing.

---

## 4. Data Model

All tables carry `id` (UUID text primary key), `created_at`, and `updated_at`. Tables whose rows may be referenced by history additionally carry `deleted_at` for soft deletion. UUIDs and timestamps exist to make the future sync layer (D2) additive rather than a migration.

### 4.1 Exercise library

**`exercises`** (§29, §30)

| Column | Type | Notes |
|---|---|---|
| name | text | |
| primary_muscle | text | |
| secondary_muscles | text (JSON array) | |
| equipment | text | |
| exercise_type | text | |
| instructions | text? | |
| weight_applicable | boolean | Drives volume omission for bodyweight work (§26) |
| is_custom | boolean | Custom exercises behave identically to built-ins (§30) |
| deleted_at | int? | **Soft delete only** — an exercise referenced by history must never be hard-deleted |

Seeded at first launch from a bundled JSON library of common gym exercises.

### 4.2 The plan (versioned)

**`plan_versions`**

| Column | Type | Notes |
|---|---|---|
| name | text | |
| effective_from | int (epoch ms) | |
| effective_to | int? | `NULL` means currently active. Exactly one row may have `NULL`. |

**`plan_days`** — `plan_version_id`, `weekday` (0–6), `custom_name?`, `is_rest_day`

**`planned_exercises`** — `plan_day_id`, `exercise_id`, `order_index`

**`planned_sets`** — `planned_exercise_id`, `set_number`, `target_reps`, `target_weight?`

`planned_sets` being a real table rather than a `sets: 3` integer is what provides §9's per-set targets (e.g. 20kg×12, 25kg×10, 30kg×8) without a later migration. The initial UI defaults to the same target across all sets, as §9 permits.

**Copy-on-write rule.** Any edit to a plan closes the active version (`effective_to = now`) and deep-copies the entire tree — days, exercises, sets — into a new version, to which the edit is applied.

**Compaction exception.** If the active version's `effective_from` is today *and* no `workout_session` references it, the edit is applied in place instead of forking. Without this, a single planning session produces a dozen near-identical versions.

### 4.3 What actually happened

**`workout_sessions`**

| Column | Type | Notes |
|---|---|---|
| date | int (local date) | |
| plan_version_id | uuid? | `NULL` for a fully ad-hoc workout |
| plan_day_id | uuid? | |
| day_name_snapshot | text | Preserves "Push Day" after the plan renames it |
| status | enum | `in_progress` \| `completed` \| `abandoned` |
| started_at | int | |
| completed_at | int? | |

**`performed_exercises`**

| Column | Type | Notes |
|---|---|---|
| workout_session_id | uuid | |
| exercise_id | uuid | |
| planned_exercise_id | uuid? | **`NULL` = unplanned exercise** (D3) |
| order_index | int | |
| status | enum | `pending` \| `completed` \| `skipped` |

**`performed_sets`**

| Column | Type | Notes |
|---|---|---|
| performed_exercise_id | uuid | |
| set_number | int | |
| target_reps | int? | **Snapshot copied at session start** |
| target_weight | real? | **Snapshot copied at session start** |
| actual_reps | int? | `NULL` until the set is completed |
| actual_weight | real? | `NULL` until the set is completed |
| status | enum | `pending` \| `completed` \| `skipped` |
| is_unplanned | boolean | **`true` = extra set beyond the plan** (D3) |
| completed_at | int? | |

**Target snapshotting is the physical implementation of §39.** History renders without joining back to the plan, making it structurally incapable of shifting when the routine is edited.

### 4.4 Settings

**`settings`** — single row: `unit` (`kg` | `lb`), `week_start_day`, default weight increment.

### 4.5 Explicitly not stored

Missed days, adherence percentages, volume totals, and target-comparison statuses are **computed at read time**. Nothing is written on days the user does not train, and no background job or scheduled task exists anywhere in the system.

### 4.6 Indexes

- `performed_exercises(exercise_id)` — exercise history (§24)
- `performed_sets(performed_exercise_id)` — session detail
- `workout_sessions(date)` — timeline and resolver
- `plan_versions(effective_from, effective_to)` — version resolution

---

## 5. Core Rules

All rules in this section are pure functions in `domain/`, unit-tested, with no database or React Native imports.

### 5.1 Set comparison (§15)

`compare(target_reps, target_weight, actual_reps, actual_weight) → { status, message }`

| Condition | Status | Example message |
|---|---|---|
| Reps and weight both equal target | `achieved` | "Target achieved" |
| Weight equal, reps above | `exceeded` | "2 reps above target" |
| Reps equal, weight above | `exceeded` | "2.5 kg above target" |
| Weight equal, reps below | `below` | "2 reps short" |
| Reps equal, weight below | `below` | "5 kg below target" |
| **One dimension up, the other down** | **by volume** | See below |
| No target weight (bodyweight) | compare reps only | |
| Set skipped | `skipped` | |

**Mixed-result rule.** When one dimension rises and the other falls, the comparison is decided by volume (`weight × reps`). Target 10×30kg = 300; actual 8×32.5kg = 260 ⇒ `below`. This rule is chosen for consistency with §17 and §26, which already aggregate on volume.

### 5.2 Exercise-level aggregation (§17)

Sum actual volume across completed sets, sum target volume across planned sets, and compare. Skipped sets are reported separately and are never counted as achieved. For exercises where `weight_applicable` is false, aggregate on reps.

### 5.3 Volume (§26)

`SUM(actual_weight × actual_reps)` over completed sets. Omitted entirely — not recorded as zero — when `weight_applicable` is false.

### 5.4 Day resolution

```
resolveDay(date) →
  version ← plan_version where effective_from <= date < (effective_to ?? ∞)
  if no version                    → no_plan
  day ← plan_day(version, weekday(date))
  session ← workout_session on date
  if session exists                → completed | partial   (by status and completion %)
  else if day.is_rest_day          → rest
  else if date < today             → missed
  else                             → upcoming
```

This single function drives the §22 timeline, §23 calendar, §27 adherence, and the future §28 dashboard. Because it resolves through `plan_versions`, editing the current routine cannot retroactively change whether a past day was missed.

**Session status mapping.** A session resolves to `completed` when its status is `completed`. A session with status `abandoned` resolves to `partial` if it recorded at least one completed set, and to `missed` if it recorded none — an abandoned session with no work done is indistinguishable from not training, and must not be presented as partial credit.

**Batching requirement.** Implementations must load overlapping plan versions once and in-range sessions once, then resolve in memory — **two queries per range**, regardless of range length. Per-date querying is a defect.

### 5.5 Adherence (§27) and completion percentage (§19)

Completion % = completed planned sets ÷ total planned sets.

**Unplanned work is excluded from both numerator and denominator**, so a workout can never exceed 100%. Skipped sets count toward the denominator only.

---

## 6. Workout Execution

### 6.1 Starting (§12 → §13)

"Start Workout" performs a single transaction: create the session, then materialize a `performed_exercise` row for every planned exercise and a `performed_set` row for every planned set, copying targets in, leaving actuals `NULL`, and setting status `pending`.

Full up-front materialization makes resume a plain read, progress a `COUNT`, and removes any need to invent structure mid-workout.

### 6.2 Actuals stay NULL until completion

The UI pre-fills the weight and reps inputs with the target values per §35, but the database stores `NULL` until the set is completed. Storing the pre-fill would make untouched sets indistinguishable from performed ones after a crash. **`status` is the sole source of truth for whether a set happened.**

### 6.3 Recording a set

Stepper controls, not a keyboard (§34): weight ± the configured increment (default 2.5 kg), reps ± 1, long-press for direct numeric entry. "Complete Set" writes actuals, status, and timestamp in a single indexed `UPDATE`, then auto-advances to the next set.

### 6.4 Crash safety and resume (§20)

Every set completion is its own committed transaction. There is no end-of-workout save that could lose a session. Zustand holds only the values currently on screen; a process kill loses at most the set being entered.

On launch, a `status = in_progress` session for today surfaces "Continue Workout," resuming at the first pending set.

**Stale session rule.** An `in_progress` session from a previous day auto-closes as `abandoned` at day rollover, **retaining every set already recorded**, so it appears in history as a genuine partial workout rather than a lingering prompt.

### 6.5 Skipping and unplanned work (§21, D3)

- **Skip Set** → `status = skipped`, actuals remain `NULL`
- **Skip Exercise** → exercise `skipped`, cascading to all its pending sets
- **Add Set** → appended with `is_unplanned = true`, targets `NULL`
- **Add Exercise** → exercise picker, appended with `planned_exercise_id = NULL`

Skipped is a distinct state from pending; this distinction is what makes adherence honest. Unplanned work receives a quiet badge, never a warning.

### 6.6 Previous performance (§36)

One indexed query on `(exercise_id, completed_at)` retrieves the most recent prior session's sets for the current exercise, rendered inline as "Last time: 30kg × 10, 30kg × 10, 30kg × 8". No navigation to History required.

### 6.7 Finishing (§19)

If pending sets remain, confirm: "N sets not recorded. Mark skipped and finish?" The summary reports exercises and sets completed, a breakdown of achieved / exceeded / below / skipped, and the completion percentage from section 5.5.

---

## 7. History and Analytics

**History is a day timeline, not a session list.** §22 interleaves rest days between workouts, so the list is generated from a date range via `resolveDay` and enriched with sessions.

- **Day detail** — the §16 per-set table of target, actual, and result
- **Calendar (§23)** — month grid with a status indicator per day from `resolveDay`; tapping a date opens day detail
- **Exercise history (§24)** — prior sessions for one exercise, newest first, with each session's sets and volume
- **Weekly adherence strip (§27)** — workouts and sets completed against planned, for the current week

---

## 8. Project Structure

```
src/
  db/
    schema/          exercises.ts · plan.ts · sessions.ts · settings.ts
    migrations/      drizzle-kit generated
    seed/            exercises.json
    client.ts
  domain/            comparison · aggregation · volume · dayResolver · adherence
  repositories/      planRepo · sessionRepo · exerciseRepo · historyRepo
  features/          today/ · plan/ · workout/ · history/ · exercises/ · settings/
  navigation/
  ui/                Stepper · Card · Text · primitives
  theme/
```

**Two hard boundaries:**

1. `domain/` imports nothing from `db/` or `react-native`. It operates on plain objects and is trivially testable.
2. `repositories/` is the only place SQL appears. Screens never write queries.

Repositories receive a Drizzle instance by dependency injection rather than importing one — this is what makes them testable (see section 9).

---

## 9. Testing Strategy

Domain logic is developed test-first. Priority cases:

- Mixed-result comparison in both directions (section 5.1)
- Volume with `NULL` weights and non-weighted exercises
- `resolveDay` across plan-version boundaries, including a day whose weekday changed between versions
- Adherence with unplanned exercises and extra sets present, asserting completion cannot exceed 100%
- Session materialization producing exactly the planned set count
- Stale-session auto-abandonment preserving recorded sets

**Repository testing.** `op-sqlite` is a native module and cannot run under Jest in Node. Repositories therefore receive their Drizzle instance by injection: tests supply a `better-sqlite3`-backed instance using the identical schema, while the app supplies op-sqlite. Same dialect, same queries, same migrations — only the driver differs.

*Accepted limitation:* this validates SQL and logic but not native driver behavior. Migrations are additionally verified by a fresh install on a real device at each phase gate.

React Native Testing Library covers the workout screen's critical paths: complete set, skip set, skip exercise, resume after kill. No E2E framework in the MVP.

---

## 10. Error Handling

- **Set completion is the data-critical path.** A failed write surfaces inline with entered values preserved in Zustand for retry. It is never silently swallowed.
- **Migrations** run behind a startup gate; failure shows a blocking error screen rather than a crash loop.
- **Repositories return typed results** rather than throwing into render.
- No network exists in the MVP, so this is the complete error surface.

---

## 11. Phases

| Phase | Contents | Gate |
|---|---|---|
> **Vertical slice rule (D10).** Every phase from 1 onward ships its own schema, domain logic, repository, **and UI together**, so the user can test that phase end-to-end on a device before the next begins. Domain functions are built in the phase whose UI consumes them — never bulk-built in a layer beforehand. Phase 0 is the sole exception, since a navigation shell has nothing to demonstrate yet.

| Phase | Contents | Gate — testable by the user |
|---|---|---|
| **0 — Foundation** *(not user-testable)* | RN CLI init, TypeScript strict, op-sqlite + Drizzle wiring, TS-constant migration runner (D7), TanStack Query (D8), five-tab navigation shell, Jest harness. | Fresh install applies migrations; tabs navigate; a screen round-trips a row; tests green. |
| **1 — Exercise Library** | `exercises` schema + bundled seed, `exerciseRepo`, library browse and search UI, custom exercise create/edit. | **End-to-end:** open Exercises, search the library, create a custom exercise, see it listed and searchable. |
| **2 — Weekly Plan** | Plan tables, copy-on-write versioning, `planRepo`, week overview, day config, rest-day toggle, add/reorder exercises, target editor. | **End-to-end:** build a full week from empty, rename days, mark rest days, reorder exercises, edit targets — and confirm an edit forks a new version. |
| **3 — Today & Workout** | Session tables, comparison + aggregation domain, `sessionRepo`, Today screen, workout execution, skip, unplanned work, live progress, resume, finish summary. | **End-to-end:** start today's workout, record every set, skip one, add an unplanned exercise and an extra set, force-kill the app and resume, finish and read the summary. |
| **4 — History** | `dayResolver` + adherence domain, `historyRepo`, timeline, day detail, calendar, exercise history, volume, weekly adherence strip. | **End-to-end:** browse past workouts, open a day's detail, view one exercise's progression — then edit the plan and confirm history is unchanged. |
| **5 — Polish** | Empty states (§40), visual design pass (§34, §42), on-device performance. | Set recorded in under a second on device; every empty state reachable. |

Exercise Library precedes Plan because you cannot add an exercise that does not exist. Plan precedes Workout because a routine must exist before it can be executed. History comes last because it only reads what earlier phases write. Each phase therefore depends only on phases before it, and leaves the app in a shippable, demonstrable state.

### Roadmap beyond the MVP

Out of scope for this spec and not to be designed now, but recorded so the MVP does not foreclose them (D9):

| Stage | Contents |
|---|---|
| **Play Store release** | Signing, versioning, release build, store listing. Android only — no iOS work is ever required (D1, R4). |
| **Validation period** | 2–3 months of real personal use. The intended output is knowing whether the idea holds up, and what the data actually looks like at scale. |
| **Backend + sync** | Port the schema to `pg-core` on Supabase, add an outbox table and push worker. Local SQLite remains the source of truth (D2). |
| **Web dashboard** | Reads from Supabase. Requires the backend stage; cannot ship before it. |

The sync mechanism is deliberately left unchosen. Hand-rolled outbox sync and managed options such as PowerSync were both evaluated; the decision is deferred until after validation, when the data volume and access patterns are known rather than guessed.

---

## 12. Deferred

Not in the MVP. **None require changes to the tables defined in section 4** — each is either a different read over data the MVP already records, or purely additive.

The one item that adds storage is Supabase sync (D2), which introduces a new outbox table and a push worker. It still alters nothing that already exists, which is the entire purpose of the UUID keys, `updated_at` columns, and soft deletes specified in section 4.

Play Store release, the validation period, backend sync, and the **web dashboard (D9)** are sequenced in the roadmap at the end of section 11.

Progression charts (§25), personal records (§37), the full planned-vs-actual dashboard (§28), Supabase sync and backup (D2), authentication, multiple workout plans, rest timers, supersets, dropsets, warm-up sets, RPE/RIR tracking, per-set and per-workout notes, body measurements, CSV/JSON export, notifications, exercise media.

---

## 13. Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | ~~Migration bundling in bare RN requires a Babel inline-import transform.~~ | **Retired by D7.** Migrations ship as TS string constants; no transform, no filesystem access, no bundler plugin. |
| **R2** | ~~Drizzle's `useLiveQuery` is expo-sqlite-only; reactivity approach unproven.~~ | **Retired by D8.** TanStack Query invalidation-on-write is the default and depends on no native change listener. |
| **R3** | Copy-on-write versioning could produce excessive versions under heavy editing. | **Open, low severity.** Same-day compaction rule (section 4.2) covers the realistic case. Row volume is a few hundred per year regardless. Not ORM-dependent — no library choice affects it. |
| **R4** | Windows development means no iOS build path exists. | **Moot.** The release target is the Play Store, which is Android-only. iOS is never required under D1. |

---

## 14. Success Criteria

From §46. The app succeeds when the user can:

1. Create a weekly plan in a few minutes
2. Understand today's workout immediately on opening the app
3. Start a workout in one tap
4. Record a set with minimal interaction
5. See exactly how actual performance compares to target
6. Finish a workout and receive a clear summary
7. Return weeks later and understand precisely what they did
8. See measurable progression per exercise
9. **Change the routine without corrupting historical records**

Criterion 9 is the one most easily broken by ordinary implementation shortcuts. Decision D4 and section 4.3's target snapshotting exist specifically to make it structurally guaranteed rather than merely intended.
