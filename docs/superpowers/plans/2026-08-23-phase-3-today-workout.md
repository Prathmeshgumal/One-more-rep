# Phase 3 — Today & Workout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the app, see today's workout, start it, record every set against its target, skip what you skipped, add what you added, survive a process kill, and finish with an honest summary.

**Architecture:** Starting a workout materializes the whole session up front in one transaction — a row per planned exercise and a row per planned set, with the targets **copied in** rather than referenced. That snapshot is the physical implementation of §39: history renders without ever joining back to the plan, so editing the routine cannot reach backwards. Every set completion is its own committed transaction, so a process kill loses at most the set being typed. Comparison, aggregation and completion are pure functions over plain values, with the weight unit passed in rather than known.

**Tech Stack:** Everything Phases 0–2 established. Nothing new: no new native modules, no new dependencies. Zustand is already installed and finally earns its place here, holding only the numbers currently on screen.

**Spec:** `docs/superpowers/specs/2026-08-22-workout-tracker-design.md` (§4.3 session tables, §5.1 comparison, §5.2 aggregation, §5.3 volume, §5.5 completion, §6 execution). Requirements: `docs/app_features.md` §12–§21, §26, §33–§36, §39. Design: `docs/design/screens.html`, figures 06–11.

## Global Constraints

Everything in Phases 0–2's Global Constraints still applies. Restated because they are load-bearing, with this phase's additions at the end:

- **React Native CLI only — no Expo, no Expo Router. Android only.** No iOS or web work, ever.
- **`src/db/client.ts` adapts the op-sqlite connection for drizzle.** drizzle-orm 0.45.2's driver is broken on every read path against op-sqlite v18. Do not remove the adapter, and do not upgrade either package without re-running a device gate.
- **`applyConnectionPragmas` runs `PRAGMA foreign_keys = ON` when the connection opens.** SQLite enforces foreign keys per connection and off by default. Phase 2 shipped without this and left 65 orphaned rows on a real device while every cascade test passed. Any new connection path must apply it.
- **Colours and type come from `src/theme/tokens.ts` by name.** No literal hex, no literal `fontSize`, outside that file. Below-target is **ochre (`short`), never red** — this phase renders more below-target states than any other, so it matters most here.
- **Repositories take a database by injection**; they never import one.
- **`domain/` imports nothing from `db/` and nothing from React Native.** Pure functions over plain values.
- **React Native Testing Library 14 is async throughout.** `await render(...)`, `await fireEvent...`, `await view.rerender(...)`.
- **Wait for what should be present, not for what should be gone.**
- **QueryClients in tests need `gcTime: 0` and an explicit `clear()` in teardown**, and every `createTestDb()` must be closed.
- **Do not render concurrently in tests.** Loop sequentially.
- **Assert database constraints by behaviour, not by error message.** Drizzle wraps the driver error and the `cause` chain is not reliably walkable across Jest's per-file sandboxes.
- **Asserting that a write is rejected needs an async IIFE.** better-sqlite3 throws synchronously; op-sqlite rejects. `await expect((async () => db.run(...))()).rejects` holds for both.
- **Weekday is 0 = Monday … 6 = Sunday.** `Date.getDay()` is converted exactly once, in `weekdayIndex()`.
- **Render once per test.** Calling `render` repeatedly inside a single test —
  even with `unmount()` between — leaves RNTL returning a stale tree from the
  third render onward, which reads as a component bug and is not one. Use
  `it.each` for a table of cases.
- **A percentage width is a string.** `width: '40%'` is what React Native lays
  out against the parent; a test walking the tree for a numeric width finds
  nothing.
- **A `View` needs `accessible` for its `accessibilityRole` to be findable.**
  Without it the role is set but neither a screen reader nor `getByRole` can
  see it.
- **Judge performance on release builds only.**
- **A `gap` on a container does not reach between list cells.** Rows rendered by a `FlatList`/`ReorderableList` must carry their own spacing. This shipped as a visible bug in Phase 2.

New for this phase:

- **`status` is the sole source of truth for whether a set happened.** Actuals stay `NULL` until a set is completed, even though the inputs are pre-filled with the target (§35). Storing the pre-fill would make an untouched set indistinguishable from a performed one after a crash — which is the entire failure this rule exists to prevent.
- **Targets are snapshotted into `performed_sets` at session start and never read from the plan again.** This is §39 made structural. A test asserts that editing the plan after a session leaves that session's targets untouched.
- **Unplanned work is excluded from completion percentage, numerator and denominator both.** A workout can never exceed 100%. Skipped sets count toward the denominator only.
- **Every set completion is its own transaction.** There is no end-of-workout save that could lose data. Do not batch set writes.
- **The weight unit is a setting, so `domain/` never hard-codes "kg".** Comparison returns a structured delta; wording happens in `describeComparison(comparison, unit)`, which takes the unit as an argument.
- **Below-target is never framed as failure.** Ochre, quiet wording, and unplanned work gets a badge rather than a warning (§21, D3).
- **A rest day is not an empty workout day.** It gets its own screen with no card stack and no primary button (design 07).

---

## File Structure

**Database**
- `src/db/schema/session.ts` — the three session tables. *(new)*
- `src/db/schema/index.ts` — re-export. *(modify)*
- `drizzle/0004_*.sql` + `src/db/migrations/0004_*.ts` — generated. *(new)*

**Domain — pure, no database and no React Native imports**
- `src/domain/setComparison.ts` — `compareSet`, `describeComparison`. *(new)*
- `src/domain/sessionProgress.ts` — `aggregateExercise`, `sessionVolume`, `completionPercent`, `countByStatus`. *(new)*

**Repository**
- `src/repositories/sessionRepo.ts` — start, read, record, skip, append, finish, roll over. *(new)*
- `src/repositories/planRepo.ts` — `savePlanDraft` stops passing a hard-coded `sessionCount: 0`. *(modify)*

**UI primitives**
- `src/ui/ProgressBar.tsx` — the design's `.progress`, with a `gain` variant. *(new)*
- `src/ui/StatusChip.tsx` — achieved / exceeded / below / skipped / unplanned, by token. *(new)*
- `src/ui/BigNumber.tsx` — the design's `.bignum`. *(new)*
- `src/ui/LedgerTable.tsx` — the set-by-set target/actual/result table. *(new)*

**Feature — workout**
- `src/features/workout/useSession.ts` — query keys, queries, mutations. *(new)*
- `src/features/workout/useActiveSet.ts` — the Zustand store holding the numbers on screen. *(new)*
- `src/features/workout/TodayScreen.tsx` — replaces the Phase 0 placeholder; four states. *(replace)*
- `src/features/workout/SetRow.tsx` — one row of design 09, in its three states. *(new)*
- `src/features/workout/WorkoutScreen.tsx` — the signature screen. *(new)*
- `src/features/workout/ExerciseSummaryScreen.tsx` — design 10. *(new)*
- `src/features/workout/WorkoutCompleteScreen.tsx` — design 11. *(new)*
- `src/features/workout/WorkoutExercisePickerScreen.tsx` — adding an exercise mid-workout. *(new, not in the approved designs — see Task 13)*
- `src/features/today/TodayScreen.tsx` — **delete**, replaced by the workout feature's version.

**Navigation**
- `src/navigation/TodayStack.tsx` — five routes. *(new)*
- `src/navigation/types.ts` — `TodayStackParamList`. *(modify)*
- `src/navigation/RootNavigator.tsx` — Today tab renders the stack. *(modify)*

**Docs**
- `docs/deferred.md` — remove the Phase 3 `sessionCount` entry once Task 7 closes it. *(modify)*

---

## Task 1: The session tables

**Files:**
- Create: `src/db/schema/session.ts`
- Modify: `src/db/schema/index.ts`
- Test: `__tests__/db/sessionSchema.test.ts`

**Interfaces:**
- Consumes: `exercises` (Phase 1), `planVersions`, `planDays`, `plannedExercises` (Phase 2).
- Produces: `workoutSessions`, `performedExercises`, `performedSets` tables, their `$inferSelect` row types, and the `SessionStatus` / `ItemStatus` unions.

- [ ] **Step 1: Write the failing test**

Create `__tests__/db/sessionSchema.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createTestDb} from '../helpers/testDb';

describe('session schema', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('s1',0,'Push Day','in_progress',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('pe1','s1','bench',0,'pending')`,
    );
  });
  afterEach(() => ctx.close());

  const columns = async (table: string) => {
    const rows = await ctx.db.all<{name: string}>(
      sql.raw(`PRAGMA table_info(${table})`),
    );
    return rows.map(r => r.name);
  };

  it('creates all three session tables', async () => {
    const rows = await ctx.db.all<{name: string}>(
      sql`SELECT name FROM sqlite_master WHERE type='table'`,
    );
    expect(rows.map(r => r.name)).toEqual(
      expect.arrayContaining([
        'workout_sessions',
        'performed_exercises',
        'performed_sets',
      ]),
    );
  });

  it('records what the day was called at the time', async () => {
    expect(await columns('workout_sessions')).toEqual(
      expect.arrayContaining([
        'id',
        'date',
        'plan_version_id',
        'plan_day_id',
        'day_name_snapshot',
        'status',
        'started_at',
        'completed_at',
      ]),
    );
  });

  it('lets an exercise exist with no plan behind it', async () => {
    expect(await columns('performed_exercises')).toEqual(
      expect.arrayContaining([
        'id',
        'workout_session_id',
        'exercise_id',
        'planned_exercise_id',
        'order_index',
        'status',
      ]),
    );
    // D3: an unplanned exercise is one with no planned_exercise_id.
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('pe2','s1','bench',1,'pending')`,
    );
    const rows = await ctx.db.all<{planned_exercise_id: string | null}>(
      sql`SELECT planned_exercise_id FROM performed_exercises WHERE id='pe2'`,
    );
    expect(rows[0]?.planned_exercise_id).toBeNull();
  });

  it('keeps target and actual as separate columns', async () => {
    expect(await columns('performed_sets')).toEqual(
      expect.arrayContaining([
        'id',
        'performed_exercise_id',
        'set_number',
        'target_reps',
        'target_weight',
        'actual_reps',
        'actual_weight',
        'status',
        'is_unplanned',
        'completed_at',
      ]),
    );
  });

  // Spec 6.2: actuals stay NULL until a set is completed. If the pre-filled
  // value were stored, an untouched set would be indistinguishable from a
  // performed one after a crash — the exact failure this rule prevents.
  it('allows a pending set with a target and no actuals', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,target_reps,target_weight,
             status,is_unplanned)
          VALUES ('ps1','pe1',1,10,30,'pending',0)`,
    );
    const rows = await ctx.db.all<{
      actual_reps: number | null;
      actual_weight: number | null;
    }>(sql`SELECT actual_reps, actual_weight FROM performed_sets WHERE id='ps1'`);
    expect(rows[0]?.actual_reps).toBeNull();
    expect(rows[0]?.actual_weight).toBeNull();
  });

  // D3: a bonus set beyond the plan has no target at all.
  it('allows an unplanned set with no target', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,status,is_unplanned)
          VALUES ('ps2','pe1',4,'pending',1)`,
    );
    const rows = await ctx.db.all<{target_reps: number | null}>(
      sql`SELECT target_reps FROM performed_sets WHERE id='ps2'`,
    );
    expect(rows[0]?.target_reps).toBeNull();
  });

  it('cascades a session delete through exercises and sets', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,target_reps,status,is_unplanned)
          VALUES ('ps1','pe1',1,10,'pending',0)`,
    );

    await ctx.db.run(sql`DELETE FROM workout_sessions WHERE id='s1'`);

    for (const table of ['performed_exercises', 'performed_sets']) {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  // §39, structurally: deleting a plan version must never take a session's
  // record of what happened with it.
  it('does not delete a session when its plan version goes away', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from) VALUES ('v1','p',0)`,
    );
    // A different date: the fixture already holds a session on date 0, and
    // one session per date is exactly what the unique index enforces.
    await ctx.db.run(
      sql`INSERT INTO workout_sessions
            (id,date,plan_version_id,day_name_snapshot,status,started_at)
          VALUES ('s2',86400000,'v1','Push Day','completed',0)`,
    );

    await ctx.db.run(sql`DELETE FROM plan_versions WHERE id='v1'`);

    const rows = await ctx.db.all<{plan_version_id: string | null}>(
      sql`SELECT plan_version_id FROM workout_sessions WHERE id='s2'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan_version_id).toBeNull();
  });

  it('refuses two sessions on the same date', async () => {
    const error = await (async () =>
      ctx.db.run(
        sql`INSERT INTO workout_sessions
              (id,date,day_name_snapshot,status,started_at)
            VALUES ('dup',0,'Push Day','in_progress',0)`,
      ))().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();

    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM workout_sessions WHERE date=0`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionSchema
```

Expected: FAIL — `no such table: workout_sessions`.

- [ ] **Step 3: Write the schema**

Create `src/db/schema/session.ts`:

```ts
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {exercises} from './exercises';
import {planVersions, planDays, plannedExercises} from './plan';

/** §20: a session is in progress until it is finished or rolled over. */
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

/** §21: skipped is a distinct state from pending. That is what makes adherence honest. */
export type ItemStatus = 'pending' | 'completed' | 'skipped';

/**
 * One training day (spec 4.3).
 *
 * `plan_version_id` and `plan_day_id` are nullable and deliberately do **not**
 * cascade: a fully ad-hoc workout has neither, and a session must survive its
 * plan version being deleted. They are provenance, not ownership.
 *
 * `day_name_snapshot` is why the session still says "Push Day" in history after
 * the plan renames that day to something else.
 */
export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    /** Local midnight of the day trained. One session per date. */
    date: integer('date').notNull(),
    planVersionId: text('plan_version_id').references(() => planVersions.id, {
      onDelete: 'set null',
    }),
    planDayId: text('plan_day_id').references(() => planDays.id, {
      onDelete: 'set null',
    }),
    dayNameSnapshot: text('day_name_snapshot').notNull(),
    status: text('status', {
      enum: ['in_progress', 'completed', 'abandoned'],
    }).notNull(),
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at'),
  },
  table => [
    // Spec 4.6: the timeline and the day resolver both scan by date.
    index('workout_sessions_date_idx').on(table.date),
    uniqueIndex('workout_sessions_date_unique').on(table.date),
  ],
);

/**
 * An exercise as actually attempted.
 *
 * `planned_exercise_id` NULL means unplanned (D3) — added during the workout,
 * excluded from completion percentage, and badged rather than warned about.
 */
export const performedExercises = sqliteTable(
  'performed_exercises',
  {
    id: text('id').primaryKey(),
    workoutSessionId: text('workout_session_id')
      .notNull()
      .references(() => workoutSessions.id, {onDelete: 'cascade'}),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    plannedExerciseId: text('planned_exercise_id').references(
      () => plannedExercises.id,
      {onDelete: 'set null'},
    ),
    orderIndex: integer('order_index').notNull(),
    status: text('status', {
      enum: ['pending', 'completed', 'skipped'],
    }).notNull(),
  },
  table => [
    index('performed_exercises_session_idx').on(table.workoutSessionId),
    // Spec 4.6: exercise history (§24) and previous performance (§36).
    index('performed_exercises_exercise_idx').on(table.exerciseId),
  ],
);

/**
 * One set, with the target frozen beside the actual.
 *
 * The target columns are a **snapshot taken at session start**, never a join
 * back to `planned_sets`. That is the physical implementation of §39: history
 * is structurally incapable of shifting when the routine is edited.
 *
 * Actuals stay NULL until the set is completed even though the inputs are
 * pre-filled with the target (§35, spec 6.2). `status` is the sole source of
 * truth for whether the set happened.
 */
export const performedSets = sqliteTable(
  'performed_sets',
  {
    id: text('id').primaryKey(),
    performedExerciseId: text('performed_exercise_id')
      .notNull()
      .references(() => performedExercises.id, {onDelete: 'cascade'}),
    setNumber: integer('set_number').notNull(),
    /** NULL on an unplanned set — there was nothing to aim at. */
    targetReps: integer('target_reps'),
    targetWeight: real('target_weight'),
    actualReps: integer('actual_reps'),
    actualWeight: real('actual_weight'),
    status: text('status', {
      enum: ['pending', 'completed', 'skipped'],
    }).notNull(),
    isUnplanned: integer('is_unplanned', {mode: 'boolean'}).notNull(),
    completedAt: integer('completed_at'),
  },
  table => [
    index('performed_sets_exercise_idx').on(table.performedExerciseId),
  ],
);

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type PerformedExerciseRow = typeof performedExercises.$inferSelect;
export type PerformedSetRow = typeof performedSets.$inferSelect;
```

- [ ] **Step 4: Re-export it**

Append to `src/db/schema/index.ts`:

```ts
export * from './session';
```

- [ ] **Step 5: Generate the migration**

```bash
npm run db:generate
```

**Verify the generated SQL** contains `ON DELETE cascade` for `performed_exercises → workout_sessions` and `performed_sets → performed_exercises`, and `ON DELETE set null` for `workout_sessions → plan_versions`. A cascade on that last one would delete history when a plan version is pruned, which is the opposite of what §39 requires.

> `drizzle/` now contains a hand-written `0003_prune_plan_orphans.sql` that drizzle-kit did not author. `scripts/build-migrations.mjs` reads every `.sql` in that directory in sorted order, so the new file becomes `0004` and nothing else moves. Do not renumber anything.

- [ ] **Step 6: Run the tests**

```bash
npx jest sessionSchema
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the workout session tables"
```

---

## Task 2: Comparing a set against its target

§15 and spec 5.1. Pure, and the single most-read rule in the app — every set row, every ledger row, and the finish summary go through it.

**Files:**
- Create: `src/domain/setComparison.ts`
- Test: `__tests__/domain/setComparison.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ComparisonStatus = 'achieved' | 'exceeded' | 'below' | 'skipped' | 'unplanned'`
  - `type ComparisonDelta = {kind: 'none' | 'reps' | 'weight' | 'volume'; amount: number}`
  - `type SetComparison = {status: ComparisonStatus; delta: ComparisonDelta}`
  - `compareSet(args: {targetReps: number | null; targetWeight: number | null; actualReps: number | null; actualWeight: number | null; status: 'pending' | 'completed' | 'skipped'}): SetComparison`
  - `describeComparison(comparison: SetComparison, unit: string): string`

> **Deliberate refinement of spec 5.1.** The spec's signature returns `{status, message}`. The weight unit is a user setting, so a message built inside `domain/` would have to hard-code "kg". `compareSet` therefore returns a structured delta and `describeComparison` words it with the unit passed in. Both are pure and both live in `domain/`; only the seam moved.

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/setComparison.test.ts`:

```ts
import {compareSet, describeComparison} from '@/domain/setComparison';

const compare = (
  targetReps: number | null,
  targetWeight: number | null,
  actualReps: number | null,
  actualWeight: number | null,
  status: 'pending' | 'completed' | 'skipped' = 'completed',
) =>
  compareSet({targetReps, targetWeight, actualReps, actualWeight, status});

describe('compareSet', () => {
  it('calls an exact match achieved', () => {
    expect(compare(10, 30, 10, 30)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reads more reps at the same weight as exceeded', () => {
    expect(compare(10, 30, 12, 30)).toEqual({
      status: 'exceeded',
      delta: {kind: 'reps', amount: 2},
    });
  });

  it('reads fewer reps at the same weight as below', () => {
    expect(compare(10, 30, 8, 30)).toEqual({
      status: 'below',
      delta: {kind: 'reps', amount: -2},
    });
  });

  it('reads more weight at the same reps as exceeded', () => {
    expect(compare(10, 30, 10, 32.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'weight', amount: 2.5},
    });
  });

  it('reads less weight at the same reps as below', () => {
    expect(compare(10, 30, 10, 25)).toEqual({
      status: 'below',
      delta: {kind: 'weight', amount: -5},
    });
  });

  // Spec 5.1's mixed-result rule. 8 x 32.5 = 260 against a target of 300, so
  // going heavier but shorter is still below — decided by volume, for
  // consistency with §17 and §26 which already aggregate that way.
  it('decides a heavier-but-shorter set by volume', () => {
    expect(compare(10, 30, 8, 32.5)).toEqual({
      status: 'below',
      delta: {kind: 'volume', amount: -40},
    });
  });

  it('decides a lighter-but-longer set by volume', () => {
    // 12 x 27.5 = 330 against 300.
    expect(compare(10, 30, 12, 27.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'volume', amount: 30},
    });
  });

  it('calls a mixed set that lands on the same volume achieved', () => {
    // 5 x 60 = 300, exactly the target volume.
    expect(compare(10, 30, 5, 60)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('counts both dimensions rising as exceeded, by volume', () => {
    // 12 x 32.5 = 390 against 300.
    expect(compare(10, 30, 12, 32.5)).toEqual({
      status: 'exceeded',
      delta: {kind: 'volume', amount: 90},
    });
  });

  it('counts both dimensions falling as below, by volume', () => {
    // 8 x 25 = 200 against 300.
    expect(compare(10, 30, 8, 25)).toEqual({
      status: 'below',
      delta: {kind: 'volume', amount: -100},
    });
  });

  // §9 and §26: a bodyweight movement has no weight to compare, so reps decide
  // it alone. Comparing against a weight of 0 would make every set "below".
  it('compares reps only when there is no target weight', () => {
    expect(compare(10, null, 12, null)).toEqual({
      status: 'exceeded',
      delta: {kind: 'reps', amount: 2},
    });
    expect(compare(10, null, 10, null)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
    expect(compare(10, null, 7, null)).toEqual({
      status: 'below',
      delta: {kind: 'reps', amount: -3},
    });
  });

  it('ignores a weight that was recorded against no target', () => {
    // Someone held a dumbbell during a bodyweight movement. There is no target
    // weight to compare it to, so reps still decide.
    expect(compare(10, null, 10, 5)).toEqual({
      status: 'achieved',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reports a skipped set as skipped whatever else it holds', () => {
    expect(compare(10, 30, null, null, 'skipped')).toEqual({
      status: 'skipped',
      delta: {kind: 'none', amount: 0},
    });
  });

  // D3: a bonus set had nothing to aim at, so it is not a success or a
  // failure. It is extra work, and it gets a badge rather than a verdict.
  it('reports a set with no target as unplanned', () => {
    expect(compare(null, null, 12, 40)).toEqual({
      status: 'unplanned',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('reports a pending set as pending-shaped, not as below', () => {
    expect(compare(10, 30, null, null, 'pending')).toEqual({
      status: 'skipped',
      delta: {kind: 'none', amount: 0},
    });
  });

  it('does not accumulate floating point noise in a weight delta', () => {
    // 32.5 - 30 is 2.5, not 2.4999999999999996.
    expect(compare(10, 30, 10, 32.5).delta.amount).toBe(2.5);
    expect(compare(10, 0.3, 10, 0.1).delta.amount).toBe(-0.2);
  });
});

describe('describeComparison', () => {
  const describe_ = (
    targetReps: number | null,
    targetWeight: number | null,
    actualReps: number | null,
    actualWeight: number | null,
    unit = 'kg',
    status: 'pending' | 'completed' | 'skipped' = 'completed',
  ) =>
    describeComparison(
      compareSet({targetReps, targetWeight, actualReps, actualWeight, status}),
      unit,
    );

  it('says even when nothing differed', () => {
    expect(describe_(10, 30, 10, 30)).toBe('even');
  });

  it('signs a rep difference', () => {
    expect(describe_(10, 30, 12, 30)).toBe('+2 reps');
    expect(describe_(10, 30, 9, 30)).toBe('−1 rep');
  });

  it('signs a weight difference in the unit it is given', () => {
    expect(describe_(10, 30, 10, 32.5)).toBe('+2.5 kg');
    expect(describe_(10, 30, 10, 25, 'lb')).toBe('−5.0 lb');
  });

  it('words a volume difference as volume', () => {
    expect(describe_(10, 30, 8, 32.5)).toBe('−40 kg vol');
  });

  it('words the states that have no numbers', () => {
    expect(describe_(10, 30, null, null, 'kg', 'skipped')).toBe('Skipped');
    expect(describe_(null, null, 12, 40)).toBe('Bonus');
  });

  // A minus sign, not a hyphen. The design sets these in tabular figures and a
  // hyphen is visibly the wrong width beside them.
  it('uses a true minus sign', () => {
    expect(describe_(10, 30, 8, 30)).toContain('−');
    expect(describe_(10, 30, 8, 30)).not.toContain('-');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest setComparison
```

Expected: FAIL — `Cannot find module '@/domain/setComparison'`.

- [ ] **Step 3: Write it**

Create `src/domain/setComparison.ts`:

```ts
export type ComparisonStatus =
  | 'achieved'
  | 'exceeded'
  | 'below'
  | 'skipped'
  | 'unplanned';

/** What actually differed, unworded so the unit can be applied later. */
export type ComparisonDelta = {
  kind: 'none' | 'reps' | 'weight' | 'volume';
  amount: number;
};

export type SetComparison = {status: ComparisonStatus; delta: ComparisonDelta};

const EVEN: ComparisonDelta = {kind: 'none', amount: 0};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Compares one set against the target it was given (§15, spec 5.1).
 *
 * The interesting case is the mixed one — heavier but shorter, or lighter but
 * longer. Neither dimension can settle it, so volume does, which is the same
 * basis §17 and §26 already aggregate on. Deciding it any other way would make
 * a set read as "exceeded" while dragging the exercise total down.
 */
export function compareSet(args: {
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
}): SetComparison {
  const {targetReps, targetWeight, actualReps, actualWeight} = args;

  // A set that has not been recorded has nothing to compare, whether it was
  // skipped outright or the workout ended before it. Both read as skipped:
  // `status` is the sole source of truth for whether a set happened.
  if (args.status !== 'completed' || actualReps === null) {
    return {status: 'skipped', delta: EVEN};
  }

  // D3: a bonus set had no target. Not a success, not a failure — extra work.
  if (targetReps === null) {
    return {status: 'unplanned', delta: EVEN};
  }

  // Bodyweight: reps decide alone. Comparing against a weight of zero — or
  // against a dumbbell someone happened to hold — would be meaningless.
  if (targetWeight === null) {
    const diff = actualReps - targetReps;
    if (diff === 0) {
      return {status: 'achieved', delta: EVEN};
    }
    return {
      status: diff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'reps', amount: diff},
    };
  }

  const weight = actualWeight ?? 0;
  const repsDiff = actualReps - targetReps;
  const weightDiff = round(weight - targetWeight);

  if (repsDiff === 0 && weightDiff === 0) {
    return {status: 'achieved', delta: EVEN};
  }

  // One dimension held, so the other one names the difference on its own.
  if (weightDiff === 0) {
    return {
      status: repsDiff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'reps', amount: repsDiff},
    };
  }
  if (repsDiff === 0) {
    return {
      status: weightDiff > 0 ? 'exceeded' : 'below',
      delta: {kind: 'weight', amount: weightDiff},
    };
  }

  // Both moved. Volume settles it.
  const volumeDiff = round(weight * actualReps - targetWeight * targetReps);
  if (volumeDiff === 0) {
    return {status: 'achieved', delta: EVEN};
  }
  return {
    status: volumeDiff > 0 ? 'exceeded' : 'below',
    delta: {kind: 'volume', amount: volumeDiff},
  };
}

/** A true minus sign — a hyphen is the wrong width beside tabular figures. */
const MINUS = '−';

const signed = (amount: number, body: string): string =>
  `${amount > 0 ? '+' : MINUS}${body}`;

/** Words a comparison for display, in whichever unit the user has set. */
export function describeComparison(
  comparison: SetComparison,
  unit: string,
): string {
  if (comparison.status === 'skipped') {
    return 'Skipped';
  }
  if (comparison.status === 'unplanned') {
    return 'Bonus';
  }

  const {kind, amount} = comparison.delta;
  const magnitude = Math.abs(amount);

  switch (kind) {
    case 'reps':
      return signed(amount, `${magnitude} ${magnitude === 1 ? 'rep' : 'reps'}`);
    case 'weight':
      return signed(amount, `${magnitude.toFixed(1)} ${unit}`);
    case 'volume':
      return signed(amount, `${magnitude} ${unit} vol`);
    default:
      return 'even';
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest setComparison
```

Expected: PASS, all twenty.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add set target comparison"
```

---

## Task 3: Aggregating an exercise, a session, and a percentage

§17, §19, §26 and spec 5.2 / 5.3 / 5.5. Still pure, still no database.

**Files:**
- Create: `src/domain/sessionProgress.ts`
- Test: `__tests__/domain/sessionProgress.test.ts`

**Interfaces:**
- Consumes: `compareSet` (Task 2).
- Produces:
  - `type ProgressSet = {targetReps: number | null; targetWeight: number | null; actualReps: number | null; actualWeight: number | null; status: 'pending' | 'completed' | 'skipped'; isUnplanned: boolean}`
  - `type ExerciseAggregate = {plannedSets; completedSets; skippedSets; unplannedSets; actualVolume: number | null; targetVolume: number | null; actualReps: number; targetReps: number; status: 'achieved' | 'exceeded' | 'below'}`
  - `aggregateExercise(sets: readonly ProgressSet[], weightApplicable: boolean): ExerciseAggregate`
  - `sessionVolume(exercises: readonly {sets: readonly ProgressSet[]; weightApplicable: boolean}[]): number`
  - `completionPercent(sets: readonly ProgressSet[]): number | null`
  - `countByStatus(sets: readonly ProgressSet[]): {achieved: number; exceeded: number; below: number; skipped: number}`

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/sessionProgress.test.ts`:

```ts
import {
  aggregateExercise,
  sessionVolume,
  completionPercent,
  countByStatus,
  type ProgressSet,
} from '@/domain/sessionProgress';

const set = (over: Partial<ProgressSet> = {}): ProgressSet => ({
  targetReps: 10,
  targetWeight: 30,
  actualReps: 10,
  actualWeight: 30,
  status: 'completed',
  isUnplanned: false,
  ...over,
});

describe('aggregateExercise', () => {
  it('sums actual and target volume across the sets', () => {
    const result = aggregateExercise([set(), set(), set()], true);
    expect(result.actualVolume).toBe(900);
    expect(result.targetVolume).toBe(900);
    expect(result.status).toBe('achieved');
  });

  it('counts completed, skipped, planned and unplanned separately', () => {
    const result = aggregateExercise(
      [
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
        set({status: 'pending', actualReps: null, actualWeight: null}),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
          actualReps: 8,
          actualWeight: 40,
        }),
      ],
      true,
    );
    expect(result.plannedSets).toBe(3);
    expect(result.completedSets).toBe(2);
    expect(result.skippedSets).toBe(1);
    expect(result.unplannedSets).toBe(1);
  });

  // §17: a skipped set is reported separately and is never counted as
  // achieved. Its target still stands, which is what drags the total below.
  it('leaves a skipped set counting against the target', () => {
    const result = aggregateExercise(
      [set(), set(), set({status: 'skipped', actualReps: null, actualWeight: null})],
      true,
    );
    expect(result.actualVolume).toBe(600);
    expect(result.targetVolume).toBe(900);
    expect(result.status).toBe('below');
  });

  it('counts bonus work towards actual volume but not towards the target', () => {
    const result = aggregateExercise(
      [
        set(),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
          actualReps: 10,
          actualWeight: 30,
        }),
      ],
      true,
    );
    expect(result.actualVolume).toBe(600);
    expect(result.targetVolume).toBe(300);
    expect(result.status).toBe('exceeded');
  });

  // §26: volume is omitted entirely for bodyweight work, never recorded as
  // zero. A zero would average into progression charts as a real number.
  it('omits volume for an exercise that carries no weight', () => {
    const result = aggregateExercise(
      [
        set({targetWeight: null, actualWeight: null}),
        set({targetWeight: null, actualWeight: null, actualReps: 12}),
      ],
      false,
    );
    expect(result.actualVolume).toBeNull();
    expect(result.targetVolume).toBeNull();
    expect(result.actualReps).toBe(22);
    expect(result.targetReps).toBe(20);
    expect(result.status).toBe('exceeded');
  });

  it('judges a bodyweight exercise on reps alone', () => {
    const short = aggregateExercise(
      [
        set({targetWeight: null, actualWeight: null, actualReps: 8}),
        set({targetWeight: null, actualWeight: null, actualReps: 8}),
      ],
      false,
    );
    expect(short.status).toBe('below');
  });

  it('handles an exercise with nothing recorded at all', () => {
    const result = aggregateExercise(
      [
        set({status: 'pending', actualReps: null, actualWeight: null}),
        set({status: 'pending', actualReps: null, actualWeight: null}),
      ],
      true,
    );
    expect(result.completedSets).toBe(0);
    expect(result.actualVolume).toBe(0);
    expect(result.status).toBe('below');
  });

  it('survives an empty set list', () => {
    const result = aggregateExercise([], true);
    expect(result.plannedSets).toBe(0);
    expect(result.actualVolume).toBe(0);
    expect(result.status).toBe('achieved');
  });
});

describe('sessionVolume', () => {
  it('adds up every weighted set that was completed', () => {
    expect(
      sessionVolume([
        {sets: [set(), set()], weightApplicable: true},
        {sets: [set({actualWeight: 20, actualReps: 5})], weightApplicable: true},
      ]),
    ).toBe(700);
  });

  it('leaves bodyweight exercises out of the total entirely', () => {
    expect(
      sessionVolume([
        {sets: [set()], weightApplicable: true},
        {
          sets: [set({targetWeight: null, actualWeight: null})],
          weightApplicable: false,
        },
      ]),
    ).toBe(300);
  });

  it('ignores sets that were never completed', () => {
    expect(
      sessionVolume([
        {
          sets: [
            set(),
            set({status: 'skipped', actualReps: null, actualWeight: null}),
          ],
          weightApplicable: true,
        },
      ]),
    ).toBe(300);
  });
});

describe('completionPercent', () => {
  it('is the share of planned sets that were completed', () => {
    expect(
      completionPercent([
        set(),
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toBe(67);
  });

  // §19 and spec 5.5: bonus work is excluded from both halves of the fraction,
  // so a workout can never read above 100%.
  it('cannot exceed one hundred percent however much extra is done', () => {
    expect(
      completionPercent([
        set(),
        set(),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
        }),
        set({
          isUnplanned: true,
          targetReps: null,
          targetWeight: null,
        }),
      ]),
    ).toBe(100);
  });

  it('counts a skipped set in the denominator only', () => {
    expect(
      completionPercent([
        set(),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toBe(50);
  });

  // A fully ad-hoc workout planned nothing, so there is no percentage of a
  // plan to report. Zero would read as total failure for a session where
  // everything went right.
  it('has no answer when nothing was planned', () => {
    expect(
      completionPercent([
        set({isUnplanned: true, targetReps: null, targetWeight: null}),
      ]),
    ).toBeNull();
    expect(completionPercent([])).toBeNull();
  });
});

describe('countByStatus', () => {
  it('breaks the session down the way the finish summary reads it', () => {
    expect(
      countByStatus([
        set(),
        set(),
        set({actualReps: 12}),
        set({actualReps: 8}),
        set({status: 'skipped', actualReps: null, actualWeight: null}),
      ]),
    ).toEqual({achieved: 2, exceeded: 1, below: 1, skipped: 1});
  });

  it('leaves bonus sets out of the verdict counts', () => {
    expect(
      countByStatus([
        set(),
        set({isUnplanned: true, targetReps: null, targetWeight: null}),
      ]),
    ).toEqual({achieved: 1, exceeded: 0, below: 0, skipped: 0});
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionProgress
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `src/domain/sessionProgress.ts`:

```ts
import {compareSet} from './setComparison';

/** The shape every aggregate reads. A row, minus everything they ignore. */
export type ProgressSet = {
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
};

export type ExerciseAggregate = {
  plannedSets: number;
  completedSets: number;
  skippedSets: number;
  unplannedSets: number;
  /** NULL, never 0, when the exercise carries no weight (§26). */
  actualVolume: number | null;
  targetVolume: number | null;
  actualReps: number;
  targetReps: number;
  status: 'achieved' | 'exceeded' | 'below';
};

const round = (value: number): number => Math.round(value * 100) / 100;

const isDone = (set: ProgressSet): boolean =>
  set.status === 'completed' && set.actualReps !== null;

/**
 * Rolls a single exercise up (§17, spec 5.2).
 *
 * Skipped sets are counted separately and never as achieved, but their target
 * still stands in `targetVolume` — that is precisely what makes skipping show
 * up as below target rather than quietly disappearing.
 */
export function aggregateExercise(
  sets: readonly ProgressSet[],
  weightApplicable: boolean,
): ExerciseAggregate {
  let plannedSets = 0;
  let completedSets = 0;
  let skippedSets = 0;
  let unplannedSets = 0;
  let actualVolume = 0;
  let targetVolume = 0;
  let actualReps = 0;
  let targetReps = 0;

  for (const set of sets) {
    if (set.isUnplanned) {
      unplannedSets += 1;
    } else {
      plannedSets += 1;
      targetVolume += (set.targetWeight ?? 0) * (set.targetReps ?? 0);
      targetReps += set.targetReps ?? 0;
    }

    if (set.status === 'skipped') {
      skippedSets += 1;
    }
    if (isDone(set)) {
      completedSets += 1;
      // Bonus work counts towards what was actually lifted. It is real work;
      // it just never had a target to be measured against.
      actualVolume += (set.actualWeight ?? 0) * (set.actualReps ?? 0);
      actualReps += set.actualReps ?? 0;
    }
  }

  // §26: for a movement that carries no weight, volume is omitted rather than
  // reported as zero, and reps decide the verdict instead.
  const [actual, target] = weightApplicable
    ? [actualVolume, targetVolume]
    : [actualReps, targetReps];

  const status =
    actual > target ? 'exceeded' : actual < target ? 'below' : 'achieved';

  return {
    plannedSets,
    completedSets,
    skippedSets,
    unplannedSets,
    actualVolume: weightApplicable ? round(actualVolume) : null,
    targetVolume: weightApplicable ? round(targetVolume) : null,
    actualReps,
    targetReps,
    status,
  };
}

/**
 * Total weight moved in a session (§26).
 *
 * Bodyweight exercises contribute nothing at all — not zero, nothing — so the
 * number stays a straight answer to "how much did I lift".
 */
export function sessionVolume(
  exercises: readonly {
    sets: readonly ProgressSet[];
    weightApplicable: boolean;
  }[],
): number {
  let total = 0;
  for (const exercise of exercises) {
    if (!exercise.weightApplicable) {
      continue;
    }
    for (const set of exercise.sets) {
      if (isDone(set)) {
        total += (set.actualWeight ?? 0) * (set.actualReps ?? 0);
      }
    }
  }
  return round(total);
}

/**
 * Completed planned sets over total planned sets (§19, spec 5.5).
 *
 * Unplanned work is excluded from both halves, so the number can never pass
 * 100 — 93% has to mean 93% of the plan, or it means nothing.
 *
 * Returns null when nothing was planned: a fully ad-hoc session has no plan to
 * be a percentage of, and 0% would read as total failure for a workout where
 * everything went right.
 */
export function completionPercent(
  sets: readonly ProgressSet[],
): number | null {
  const planned = sets.filter(s => !s.isUnplanned);
  if (planned.length === 0) {
    return null;
  }
  const done = planned.filter(isDone).length;
  return Math.round((done / planned.length) * 100);
}

/** The achieved / exceeded / below / skipped breakdown of the finish summary. */
export function countByStatus(sets: readonly ProgressSet[]): {
  achieved: number;
  exceeded: number;
  below: number;
  skipped: number;
} {
  const counts = {achieved: 0, exceeded: 0, below: 0, skipped: 0};
  for (const set of sets) {
    const {status} = compareSet(set);
    if (status !== 'unplanned') {
      counts[status] += 1;
    }
  }
  return counts;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest sessionProgress
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add session aggregation, volume, and completion"
```

---

## Task 4: sessionRepo — starting a workout and reading it back

Spec 6.1. One transaction materializes the whole session, targets copied in.

**Files:**
- Create: `src/repositories/sessionRepo.ts`
- Test: `__tests__/repositories/sessionRepo.start.test.ts`

**Interfaces:**
- Consumes: session tables (Task 1); `getPlanForDate` (Phase 2); `startOfLocalDay`, `weekdayIndex` (Phase 2); `WEEKDAY_NAMES`.
- Produces:
  - `type SessionSet = {id: string; setNumber: number; targetReps: number | null; targetWeight: number | null; actualReps: number | null; actualWeight: number | null; status: ItemStatus; isUnplanned: boolean; completedAt: number | null}`
  - `type SessionExercise = {id: string; exerciseId: string; name: string; equipment: string | null; weightApplicable: boolean; plannedExerciseId: string | null; orderIndex: number; status: ItemStatus; sets: SessionSet[]}`
  - `type Session = {id: string; date: number; dayName: string; status: SessionStatus; startedAt: number; completedAt: number | null; planVersionId: string | null; planDayId: string | null; exercises: SessionExercise[]}`
  - `startWorkout(db, opts?: {now?: number}): Promise<Session>`
  - `getSessionForDate(db, date: number): Promise<Session | undefined>`
  - `getActiveSession(db, opts?: {now?: number}): Promise<Session | undefined>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/sessionRepo.start.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getSessionForDate,
  getActiveSession,
} from '@/repositories/sessionRepo';
import {startOfLocalDay} from '@/domain/weekday';
import {createTestDb} from '../helpers/testDb';

// A Monday, so weekday 0 is the day under test.
const MONDAY = new Date(2026, 7, 17, 9).getTime();
const MONDAY_MIDNIGHT = startOfLocalDay(MONDAY);

describe('startWorkout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db, {now: MONDAY});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench', 'pushup']),
      MONDAY,
    );
  });
  afterEach(() => ctx.close());

  it('creates a session for today from the plan', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.dayName).toBe('Push Day');
    expect(session.status).toBe('in_progress');
    expect(session.date).toBe(MONDAY_MIDNIGHT);
    expect(session.completedAt).toBeNull();
  });

  it('materializes every planned exercise and every planned set', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Push-up',
    ]);
    expect(session.exercises[0]!.sets).toHaveLength(3);
    expect(session.exercises[0]!.sets.map(s => s.setNumber)).toEqual([1, 2, 3]);
    expect(session.exercises.every(e => e.status === 'pending')).toBe(true);
  });

  // Spec 6.2: the UI pre-fills from the target, but nothing is stored until
  // the set is completed. Otherwise an untouched set and a performed one look
  // identical after a crash.
  it('copies targets in and leaves actuals empty', async () => {
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 8, targetWeight: 60}]),
      MONDAY,
    );
    const session = await startWorkout(ctx.db, {now: MONDAY});
    const set = session.exercises[0]!.sets[0]!;
    expect(set.targetReps).toBe(8);
    expect(set.targetWeight).toBe(60);
    expect(set.actualReps).toBeNull();
    expect(set.actualWeight).toBeNull();
    expect(set.status).toBe('pending');
    expect(set.isUnplanned).toBe(false);
  });

  it('carries the exercise library details each set needs on screen', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises[0]!.weightApplicable).toBe(true);
    expect(session.exercises[0]!.equipment).toBe('barbell');
    expect(session.exercises[1]!.weightApplicable).toBe(false);
  });

  it('remembers which plan version it came from', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.planVersionId).not.toBeNull();
    expect(session.planDayId).not.toBeNull();
    expect(session.exercises[0]!.plannedExerciseId).not.toBeNull();
  });

  // §39, and the reason targets are columns rather than a join: editing the
  // plan afterwards must not reach back into what was already recorded.
  it('keeps its targets when the plan is edited afterwards', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    const before = session.exercises[0]!.sets.map(s => s.targetReps);

    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 99, targetWeight: 999}]),
      TUESDAY,
    );

    const reread = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    expect(reread!.exercises[0]!.sets.map(s => s.targetReps)).toEqual(before);
  });

  it('refuses to start a second workout on the same day', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(
      /already/i,
    );
  });

  it('refuses to start on a rest day', async () => {
    await editPlan(ctx.db, d => setRestDay(d, 0, true), MONDAY);
    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(/rest/i);
  });

  it('refuses to start a day with nothing on it', async () => {
    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    await expect(startWorkout(ctx.db, {now: TUESDAY})).rejects.toThrow(
      /no exercises/i,
    );
  });

  // The whole materialization is one transaction, so a failure partway must
  // leave no half-built session behind. There is no natural way to trip it —
  // the plan is read through a join, so a missing exercise simply drops out of
  // the plan rather than failing the insert — so the failure is injected.
  it('leaves nothing behind when starting fails partway', async () => {
    const insert = ctx.db.insert.bind(ctx.db);
    let calls = 0;
    const spy = jest
      .spyOn(ctx.db, 'insert')
      .mockImplementation(((table: Parameters<typeof insert>[0]) => {
        calls += 1;
        // The session and its exercises land, then the sets blow up.
        if (calls > 2) {
          throw new Error('injected failure');
        }
        return insert(table);
      }) as typeof insert);

    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(
      /injected failure/,
    );
    spy.mockRestore();

    for (const table of [
      'workout_sessions',
      'performed_exercises',
      'performed_sets',
    ]) {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  it('reads back the session it just created', async () => {
    const created = await startWorkout(ctx.db, {now: MONDAY});
    const read = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    expect(read?.id).toBe(created.id);
    expect(read?.exercises).toHaveLength(2);
  });

  it('has no session for a day nothing happened on', async () => {
    expect(await getSessionForDate(ctx.db, MONDAY_MIDNIGHT)).toBeUndefined();
  });

  it('surfaces an in-progress session for today as the active one', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    const active = await getActiveSession(ctx.db, {now: MONDAY});
    expect(active?.status).toBe('in_progress');
  });

  it('does not treat yesterday as active', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    expect(await getActiveSession(ctx.db, {now: TUESDAY})).toBeUndefined();
  });

  it('orders exercises and sets the way the plan had them', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises.map(e => e.orderIndex)).toEqual([0, 1]);
    expect(session.exercises[1]!.sets.map(s => s.setNumber)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionRepo.start
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `src/repositories/sessionRepo.ts`:

```ts
import {and, asc, desc, eq, inArray, sql} from 'drizzle-orm';
import {
  workoutSessions,
  performedExercises,
  performedSets,
  exercises,
  type SessionStatus,
  type ItemStatus,
} from '@/db/schema';
import type {AppDatabase} from '@/db/types';
import {startOfLocalDay, weekdayIndex, WEEKDAY_NAMES} from '@/domain/weekday';
import {getPlanForDate} from './planRepo';

export type SessionSet = {
  id: string;
  setNumber: number;
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: ItemStatus;
  isUnplanned: boolean;
  completedAt: number | null;
};

export type SessionExercise = {
  id: string;
  exerciseId: string;
  /** Joined from the library so no screen has to fetch names itself. */
  name: string;
  equipment: string | null;
  weightApplicable: boolean;
  /** NULL means the exercise was added during the workout (D3). */
  plannedExerciseId: string | null;
  orderIndex: number;
  status: ItemStatus;
  sets: SessionSet[];
};

export type Session = {
  id: string;
  date: number;
  dayName: string;
  status: SessionStatus;
  startedAt: number;
  completedAt: number | null;
  planVersionId: string | null;
  planDayId: string | null;
  exercises: SessionExercise[];
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/** Loads a session's whole tree in three queries, not one per exercise. */
async function loadSession(
  db: AppDatabase,
  row: typeof workoutSessions.$inferSelect,
): Promise<Session> {
  const exerciseRows = await db
    .select({
      id: performedExercises.id,
      exerciseId: performedExercises.exerciseId,
      plannedExerciseId: performedExercises.plannedExerciseId,
      orderIndex: performedExercises.orderIndex,
      status: performedExercises.status,
      name: exercises.name,
      equipment: exercises.equipment,
      weightApplicable: exercises.weightApplicable,
    })
    .from(performedExercises)
    .innerJoin(exercises, eq(exercises.id, performedExercises.exerciseId))
    .where(eq(performedExercises.workoutSessionId, row.id))
    .orderBy(asc(performedExercises.orderIndex));

  const setRows = exerciseRows.length
    ? await db
        .select()
        .from(performedSets)
        .where(
          inArray(
            performedSets.performedExerciseId,
            exerciseRows.map(e => e.id),
          ),
        )
        .orderBy(asc(performedSets.setNumber))
    : [];

  const setsByExercise = new Map<string, SessionSet[]>();
  for (const set of setRows) {
    const list = setsByExercise.get(set.performedExerciseId) ?? [];
    list.push({
      id: set.id,
      setNumber: set.setNumber,
      targetReps: set.targetReps,
      targetWeight: set.targetWeight,
      actualReps: set.actualReps,
      actualWeight: set.actualWeight,
      status: set.status,
      isUnplanned: set.isUnplanned,
      completedAt: set.completedAt,
    });
    setsByExercise.set(set.performedExerciseId, list);
  }

  return {
    id: row.id,
    date: row.date,
    dayName: row.dayNameSnapshot,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    planVersionId: row.planVersionId,
    planDayId: row.planDayId,
    exercises: exerciseRows.map(e => ({
      id: e.id,
      exerciseId: e.exerciseId,
      name: e.name,
      equipment: e.equipment,
      weightApplicable: e.weightApplicable,
      plannedExerciseId: e.plannedExerciseId,
      orderIndex: e.orderIndex,
      status: e.status,
      sets: setsByExercise.get(e.id) ?? [],
    })),
  };
}

export async function getSessionForDate(
  db: AppDatabase,
  date: number,
): Promise<Session | undefined> {
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.date, startOfLocalDay(date)))
    .limit(1);
  const row = rows[0];
  return row ? loadSession(db, row) : undefined;
}

/** Today's session, if one is still open (§20). */
export async function getActiveSession(
  db: AppDatabase,
  opts: {now?: number} = {},
): Promise<Session | undefined> {
  const today = startOfLocalDay(opts.now ?? Date.now());
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.date, today),
        eq(workoutSessions.status, 'in_progress'),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? loadSession(db, row) : undefined;
}

/**
 * Materializes today's workout from the plan, in one transaction (spec 6.1).
 *
 * Everything is written up front — a row per planned exercise, a row per
 * planned set — which makes resume a plain read, progress a COUNT, and removes
 * any need to invent structure halfway through a workout.
 *
 * Targets are **copied in**, not referenced. That is §39 made structural: this
 * session can no longer be changed by editing the plan.
 */
export async function startWorkout(
  db: AppDatabase,
  opts: {now?: number} = {},
): Promise<Session> {
  const now = opts.now ?? Date.now();
  const date = startOfLocalDay(now);

  const existing = await getSessionForDate(db, date);
  if (existing) {
    throw new Error('A workout has already been started for today.');
  }

  const plan = await getPlanForDate(db, now);
  const day = plan?.days[weekdayIndex(new Date(now))];
  if (!plan || !day) {
    throw new Error('There is no plan for today.');
  }
  if (day.isRestDay) {
    throw new Error('Today is a rest day.');
  }
  if (day.exercises.length === 0) {
    throw new Error('Today has no exercises planned.');
  }

  const sessionId = newId('ws');
  const dayName = day.customName ?? WEEKDAY_NAMES[day.weekday]!;

  await db.run(sql.raw('BEGIN'));
  try {
    await db.insert(workoutSessions).values({
      id: sessionId,
      date,
      planVersionId: plan.version.id,
      planDayId: day.id,
      dayNameSnapshot: dayName,
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
    });

    const exerciseValues = day.exercises.map((exercise, orderIndex) => ({
      id: newId('pex'),
      workoutSessionId: sessionId,
      exerciseId: exercise.exerciseId,
      plannedExerciseId: exercise.plannedExerciseId,
      orderIndex,
      status: 'pending' as const,
    }));
    await db.insert(performedExercises).values(exerciseValues);

    const setValues = day.exercises.flatMap((exercise, index) =>
      exercise.sets.map(set => ({
        id: newId('pst'),
        performedExerciseId: exerciseValues[index]!.id,
        setNumber: set.setNumber,
        targetReps: set.targetReps,
        targetWeight: set.targetWeight,
        actualReps: null,
        actualWeight: null,
        status: 'pending' as const,
        isUnplanned: false,
        completedAt: null,
      })),
    );
    if (setValues.length > 0) {
      await db.insert(performedSets).values(setValues);
    }

    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }

  const created = await getSessionForDate(db, date);
  if (!created) {
    throw new Error('The workout could not be started.');
  }
  return created;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest sessionRepo.start
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: start a workout by materializing the plan"
```

---

## Task 5: sessionRepo — recording, skipping, and adding

Spec 6.3 and 6.5. Every one of these is its own committed transaction, so a process kill costs at most the set being typed.

**Files:**
- Modify: `src/repositories/sessionRepo.ts`
- Test: `__tests__/repositories/sessionRepo.record.test.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces:
  - `completeSet(db, setId: string, actuals: {actualReps: number; actualWeight: number | null}, opts?: {now?: number}): Promise<void>`
  - `skipSet(db, setId: string): Promise<void>`
  - `skipExercise(db, performedExerciseId: string): Promise<void>`
  - `addSet(db, performedExerciseId: string): Promise<string>` — returns the new set id
  - `addExercise(db, sessionId: string, exerciseId: string): Promise<string>` — returns the new performed-exercise id

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/sessionRepo.record.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipSet,
  skipExercise,
  addSet,
  addExercise,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();

describe('recording a workout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db, {now: MONDAY});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench', 'fly']),
      MONDAY,
    );
    await startWorkout(ctx.db, {now: MONDAY});
  });
  afterEach(() => ctx.close());

  it('writes the actuals, the status, and the time', async () => {
    const before = await reload();
    const setId = before.exercises[0]!.sets[0]!.id;

    await completeSet(
      ctx.db,
      setId,
      {actualReps: 12, actualWeight: 32.5},
      {now: MONDAY + 1000},
    );

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(12);
    expect(set.actualWeight).toBe(32.5);
    expect(set.status).toBe('completed');
    expect(set.completedAt).toBe(MONDAY + 1000);
  });

  it('leaves the target alone when actuals are written', async () => {
    const before = await reload();
    const set = before.exercises[0]!.sets[0]!;
    await completeSet(ctx.db, set.id, {actualReps: 12, actualWeight: 32.5});

    const after = (await reload()).exercises[0]!.sets[0]!;
    expect(after.targetReps).toBe(set.targetReps);
    expect(after.targetWeight).toBe(set.targetWeight);
  });

  it('touches only the set it was given', async () => {
    const before = await reload();
    await completeSet(ctx.db, before.exercises[0]!.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 30,
    });

    const after = await reload();
    expect(after.exercises[0]!.sets[1]!.status).toBe('pending');
    expect(after.exercises[0]!.sets[1]!.actualReps).toBeNull();
  });

  // §14: the actual is editable. Completing an already-completed set corrects
  // it rather than refusing, because the alternative is a wrong number stuck
  // in history forever.
  it('lets a recorded set be corrected', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await completeSet(ctx.db, setId, {actualReps: 12, actualWeight: 30});
    await completeSet(ctx.db, setId, {actualReps: 10, actualWeight: 30});

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(10);
    expect(set.status).toBe('completed');
  });

  it('accepts a bodyweight set with no weight at all', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await completeSet(ctx.db, setId, {actualReps: 15, actualWeight: null});

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualWeight).toBeNull();
    expect(set.status).toBe('completed');
  });

  // §21: skipped is a distinct state from pending, and actuals stay empty.
  // Pretending a skipped set was performed is what makes adherence a lie.
  it('records a skipped set as skipped, with nothing recorded', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await skipSet(ctx.db, setId);

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.status).toBe('skipped');
    expect(set.actualReps).toBeNull();
    expect(set.actualWeight).toBeNull();
  });

  it('marks the exercise complete once none of its sets are pending', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');
    // The next exercise is untouched.
    expect((await reload()).exercises[1]!.status).toBe('pending');
  });

  it('calls an exercise whose sets were all skipped skipped, not complete', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await skipSet(ctx.db, set.id);
    }
    expect((await reload()).exercises[0]!.status).toBe('skipped');
  });

  it('counts a part-skipped exercise as complete once nothing is pending', async () => {
    const session = await reload();
    const [first, ...rest] = session.exercises[0]!.sets;
    await completeSet(ctx.db, first!.id, {actualReps: 10, actualWeight: 30});
    for (const set of rest) {
      await skipSet(ctx.db, set.id);
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');
  });

  // Spec 6.5: skipping an exercise cascades to its pending sets, and only to
  // those — work already recorded is never rewritten.
  it('skips an exercise and its pending sets, keeping what was done', async () => {
    const session = await reload();
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});

    await skipExercise(ctx.db, session.exercises[0]!.id);

    const after = (await reload()).exercises[0]!;
    expect(after.status).toBe('skipped');
    expect(after.sets[0]!.status).toBe('completed');
    expect(after.sets[0]!.actualReps).toBe(10);
    expect(after.sets[1]!.status).toBe('skipped');
    expect(after.sets[2]!.status).toBe('skipped');
  });

  // D3: a bonus set has no target, because there was nothing to aim at.
  it('appends an unplanned set with no target', async () => {
    const session = await reload();
    const id = await addSet(ctx.db, session.exercises[0]!.id);

    const sets = (await reload()).exercises[0]!.sets;
    expect(sets).toHaveLength(4);
    const added = sets.find(s => s.id === id)!;
    expect(added.setNumber).toBe(4);
    expect(added.isUnplanned).toBe(true);
    expect(added.targetReps).toBeNull();
    expect(added.targetWeight).toBeNull();
    expect(added.status).toBe('pending');
  });

  it('numbers a second added set after the first', async () => {
    const session = await reload();
    await addSet(ctx.db, session.exercises[0]!.id);
    await addSet(ctx.db, session.exercises[0]!.id);
    expect(
      (await reload()).exercises[0]!.sets.map(s => s.setNumber),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it('reopens an exercise that had been finished when a set is added', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');

    await addSet(ctx.db, session.exercises[0]!.id);
    expect((await reload()).exercises[0]!.status).toBe('pending');
  });

  // D3: an exercise added mid-workout has no planned_exercise_id, which is
  // exactly what excludes it from the completion percentage later.
  it('appends an unplanned exercise at the end', async () => {
    const session = await reload();
    const id = await addExercise(ctx.db, session.id, 'pushup');

    const after = await reload();
    expect(after.exercises).toHaveLength(3);
    const added = after.exercises.find(e => e.id === id)!;
    expect(added.name).toBe('Push-up');
    expect(added.plannedExerciseId).toBeNull();
    expect(added.orderIndex).toBe(2);
    expect(added.weightApplicable).toBe(false);
  });

  it('gives an added exercise one set to record into', async () => {
    const session = await reload();
    const id = await addExercise(ctx.db, session.id, 'pushup');
    const added = (await reload()).exercises.find(e => e.id === id)!;
    expect(added.sets).toHaveLength(1);
    expect(added.sets[0]!.isUnplanned).toBe(true);
    expect(added.sets[0]!.targetReps).toBeNull();
  });

  it('refuses to record against a set that does not exist', async () => {
    await expect(
      completeSet(ctx.db, 'nope', {actualReps: 10, actualWeight: 30}),
    ).rejects.toThrow(/does not exist/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionRepo.record
```

Expected: FAIL — `completeSet is not a function`.

- [ ] **Step 3: Write it**

Append to `src/repositories/sessionRepo.ts`:

```ts
/**
 * Recomputes one exercise's status from its sets.
 *
 * An exercise is finished when nothing is pending. Whether that reads as
 * completed or skipped depends on whether anything was actually done — an
 * exercise whose every set was skipped one by one should not be reported as
 * completed, and one that was part-done should not be reported as skipped.
 *
 * An explicit "skip exercise" is not routed through here: that is a decision
 * the user made, not a state derived from the sets.
 */
async function refreshExerciseStatus(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<void> {
  const sets = await db
    .select({status: performedSets.status})
    .from(performedSets)
    .where(eq(performedSets.performedExerciseId, performedExerciseId));

  const pending = sets.some(s => s.status === 'pending');
  const anyCompleted = sets.some(s => s.status === 'completed');

  const status: ItemStatus = pending
    ? 'pending'
    : anyCompleted
      ? 'completed'
      : 'skipped';

  await db
    .update(performedExercises)
    .set({status})
    .where(eq(performedExercises.id, performedExerciseId));
}

async function requireSet(
  db: AppDatabase,
  setId: string,
): Promise<typeof performedSets.$inferSelect> {
  const rows = await db
    .select()
    .from(performedSets)
    .where(eq(performedSets.id, setId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Set ${setId} does not exist.`);
  }
  return row;
}

/**
 * Records what was actually lifted (spec 6.3).
 *
 * Its own committed write, deliberately: there is no end-of-workout save that
 * a crash could lose. Re-completing an already-completed set corrects it,
 * because §14 makes the actual editable and the alternative is a wrong number
 * stuck in history forever.
 */
export async function completeSet(
  db: AppDatabase,
  setId: string,
  actuals: {actualReps: number; actualWeight: number | null},
  opts: {now?: number} = {},
): Promise<void> {
  const set = await requireSet(db, setId);
  await db
    .update(performedSets)
    .set({
      actualReps: actuals.actualReps,
      actualWeight: actuals.actualWeight,
      status: 'completed',
      completedAt: opts.now ?? Date.now(),
    })
    .where(eq(performedSets.id, setId));
  await refreshExerciseStatus(db, set.performedExerciseId);
}

/** §21: skipped, with actuals left empty. Never pretend it happened. */
export async function skipSet(db: AppDatabase, setId: string): Promise<void> {
  const set = await requireSet(db, setId);
  await db
    .update(performedSets)
    .set({
      status: 'skipped',
      actualReps: null,
      actualWeight: null,
      completedAt: null,
    })
    .where(eq(performedSets.id, setId));
  await refreshExerciseStatus(db, set.performedExerciseId);
}

/**
 * Skips an exercise and every set still pending on it (spec 6.5).
 *
 * Sets already recorded are left exactly as they are — someone who did two
 * sets and gave up on the third did two sets, and history should say so.
 */
export async function skipExercise(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<void> {
  await db
    .update(performedSets)
    .set({status: 'skipped', actualReps: null, actualWeight: null})
    .where(
      and(
        eq(performedSets.performedExerciseId, performedExerciseId),
        eq(performedSets.status, 'pending'),
      ),
    );
  await db
    .update(performedExercises)
    .set({status: 'skipped'})
    .where(eq(performedExercises.id, performedExerciseId));
}

/** An extra set beyond the plan (D3). No target, because there was none. */
export async function addSet(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<string> {
  const rows = await db
    .select({setNumber: performedSets.setNumber})
    .from(performedSets)
    .where(eq(performedSets.performedExerciseId, performedExerciseId))
    .orderBy(desc(performedSets.setNumber))
    .limit(1);

  const id = newId('pst');
  await db.insert(performedSets).values({
    id,
    performedExerciseId,
    setNumber: (rows[0]?.setNumber ?? 0) + 1,
    targetReps: null,
    targetWeight: null,
    actualReps: null,
    actualWeight: null,
    status: 'pending',
    isUnplanned: true,
    completedAt: null,
  });
  // The exercise has pending work again, so it is no longer finished.
  await refreshExerciseStatus(db, performedExerciseId);
  return id;
}

/**
 * An exercise added during the workout (D3).
 *
 * It arrives with one unplanned set already on it. Appending an exercise with
 * nothing to record into would cost a second tap in a gym for no reason, and
 * "Add set" is right there for anyone who wants more.
 */
export async function addExercise(
  db: AppDatabase,
  sessionId: string,
  exerciseId: string,
): Promise<string> {
  const rows = await db
    .select({orderIndex: performedExercises.orderIndex})
    .from(performedExercises)
    .where(eq(performedExercises.workoutSessionId, sessionId))
    .orderBy(desc(performedExercises.orderIndex))
    .limit(1);

  const id = newId('pex');
  await db.insert(performedExercises).values({
    id,
    workoutSessionId: sessionId,
    exerciseId,
    plannedExerciseId: null,
    orderIndex: (rows[0]?.orderIndex ?? -1) + 1,
    status: 'pending',
  });
  await addSet(db, id);
  return id;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest sessionRepo
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: record, skip, and add sets during a workout"
```

---

## Task 6: sessionRepo — finishing, and the session that outlived its day

Spec 6.7 and the stale-session rule in 6.4.

**Files:**
- Modify: `src/repositories/sessionRepo.ts`
- Test: `__tests__/repositories/sessionRepo.finish.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–5.
- Produces:
  - `finishWorkout(db, sessionId: string, opts?: {now?: number}): Promise<Session>`
  - `rollOverStaleSessions(db, opts?: {now?: number}): Promise<number>` — returns how many were closed

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/sessionRepo.finish.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  getSessionForDate,
  completeSet,
  finishWorkout,
  rollOverStaleSessions,
} from '@/repositories/sessionRepo';
import {startOfLocalDay} from '@/domain/weekday';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();
const TUESDAY = new Date(2026, 7, 18, 9).getTime();

describe('finishing a workout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: MONDAY});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      MONDAY,
    );
    await startWorkout(ctx.db, {now: MONDAY});
  });
  afterEach(() => ctx.close());

  it('closes the session and stamps the time', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    const finished = await finishWorkout(ctx.db, session.id, {
      now: MONDAY + 5000,
    });
    expect(finished.status).toBe('completed');
    expect(finished.completedAt).toBe(MONDAY + 5000);
  });

  // Spec 6.7: rather than leaving sets pending forever, finishing marks them
  // skipped — which is the honest record and keeps adherence meaningful.
  it('marks anything still pending as skipped', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const finished = await finishWorkout(ctx.db, session.id, {now: MONDAY});
    expect(finished.exercises[0]!.sets.map(s => s.status)).toEqual([
      'completed',
      'skipped',
      'skipped',
    ]);
  });

  it('leaves recorded work exactly as it was', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 32.5,
    });

    const finished = await finishWorkout(ctx.db, session.id, {now: MONDAY});
    const set = finished.exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(12);
    expect(set.actualWeight).toBe(32.5);
  });

  it('stops being the active session once finished', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await finishWorkout(ctx.db, session.id, {now: MONDAY});
    expect(await getActiveSession(ctx.db, {now: MONDAY})).toBeUndefined();
  });

  it('refuses to finish a session that does not exist', async () => {
    await expect(finishWorkout(ctx.db, 'nope')).rejects.toThrow(
      /does not exist/i,
    );
  });
});

describe('a session that outlived its day', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: MONDAY});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      MONDAY,
    );
    await startWorkout(ctx.db, {now: MONDAY});
  });
  afterEach(() => ctx.close());

  // Spec 6.4: an in-progress session from a previous day closes as abandoned
  // at rollover, keeping every set already recorded — so it reads in history
  // as a genuine partial workout rather than a prompt that never goes away.
  it('closes as abandoned the next day, keeping what was recorded', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const closed = await rollOverStaleSessions(ctx.db, {now: TUESDAY});
    expect(closed).toBe(1);

    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    expect(monday.status).toBe('abandoned');
    expect(monday.exercises[0]!.sets[0]!.actualReps).toBe(10);
    expect(monday.exercises[0]!.sets[0]!.status).toBe('completed');
  });

  it("does not touch today's own session", async () => {
    expect(await rollOverStaleSessions(ctx.db, {now: MONDAY})).toBe(0);
    expect(await getActiveSession(ctx.db, {now: MONDAY})).toBeDefined();
  });

  it('does not reopen or re-close a finished session', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await finishWorkout(ctx.db, session.id, {now: MONDAY});

    expect(await rollOverStaleSessions(ctx.db, {now: TUESDAY})).toBe(0);
    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    expect(monday.status).toBe('completed');
  });

  it('leaves pending sets pending rather than inventing skips', async () => {
    await rollOverStaleSessions(ctx.db, {now: TUESDAY});
    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    // Nothing was done, so nothing is claimed either way. Phase 4's resolver
    // reads this as missed rather than partial.
    expect(monday.exercises[0]!.sets.every(s => s.status === 'pending')).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionRepo.finish
```

Expected: FAIL — `finishWorkout is not a function`.

- [ ] **Step 3: Write it**

Append to `src/repositories/sessionRepo.ts`:

```ts
/**
 * Closes a session (spec 6.7).
 *
 * Sets still pending become skipped. Leaving them pending would make the
 * session look permanently unfinished, and marking them completed would be a
 * lie — skipped is the only honest reading of "the workout ended and this
 * never happened".
 */
export async function finishWorkout(
  db: AppDatabase,
  sessionId: string,
  opts: {now?: number} = {},
): Promise<Session> {
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Session ${sessionId} does not exist.`);
  }

  const now = opts.now ?? Date.now();
  const exerciseIds = (
    await db
      .select({id: performedExercises.id})
      .from(performedExercises)
      .where(eq(performedExercises.workoutSessionId, sessionId))
  ).map(e => e.id);

  await db.run(sql.raw('BEGIN'));
  try {
    if (exerciseIds.length > 0) {
      await db
        .update(performedSets)
        .set({status: 'skipped'})
        .where(
          and(
            inArray(performedSets.performedExerciseId, exerciseIds),
            eq(performedSets.status, 'pending'),
          ),
        );
      await db
        .update(performedExercises)
        .set({status: 'skipped'})
        .where(
          and(
            eq(performedExercises.workoutSessionId, sessionId),
            eq(performedExercises.status, 'pending'),
          ),
        );
    }
    await db
      .update(workoutSessions)
      .set({status: 'completed', completedAt: now})
      .where(eq(workoutSessions.id, sessionId));
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }

  // Exercise statuses are derived, so recompute them now the sets have moved.
  for (const id of exerciseIds) {
    await refreshExerciseStatus(db, id);
  }

  const finished = await getSessionForDate(db, row.date);
  if (!finished) {
    throw new Error('The workout could not be finished.');
  }
  return finished;
}

/**
 * Closes any in-progress session left over from a previous day (spec 6.4).
 *
 * Every set already recorded is retained, and pending sets are deliberately
 * **not** marked skipped: nothing was decided about them, and Phase 4's
 * resolver reads a session with no completed sets as missed rather than
 * awarding partial credit for a workout that never happened.
 *
 * Called on launch. There is no background job anywhere in this app.
 */
export async function rollOverStaleSessions(
  db: AppDatabase,
  opts: {now?: number} = {},
): Promise<number> {
  const today = startOfLocalDay(opts.now ?? Date.now());
  const stale = await db
    .select({id: workoutSessions.id})
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.status, 'in_progress'),
        sql`${workoutSessions.date} < ${today}`,
      ),
    );

  if (stale.length === 0) {
    return 0;
  }

  await db
    .update(workoutSessions)
    .set({status: 'abandoned'})
    .where(
      inArray(
        workoutSessions.id,
        stale.map(s => s.id),
      ),
    );
  return stale.length;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest sessionRepo
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: finish a workout and close sessions that outlived their day"
```

---

## Task 7: Close the Phase 2 loophole — editing a plan you have already trained against

`docs/deferred.md` records that `savePlanDraft` passes a hard-coded `sessionCount: 0`. `workout_sessions` now exists, so this task is the one that makes §32 actually hold.

**Files:**
- Modify: `src/repositories/planRepo.ts`
- Modify: `docs/deferred.md`
- Test: `__tests__/repositories/planRepo.sessions.test.ts`

**Interfaces:**
- Consumes: `workoutSessions` (Task 1); `canEditInPlace` (Phase 2).
- Produces: `countSessionsForPlanVersion(db, planVersionId: string): Promise<number>`, exported from `planRepo`.

> **Why the count lives in `planRepo` and not `sessionRepo`.** `sessionRepo` already imports `getPlanForDate` from `planRepo`. Importing back the other way would make the two modules circular. The count is a four-line query against a table, not a session behaviour, so `planRepo` owns it and neither module imports the other.

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/planRepo.sessions.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  createPlan,
  editPlan,
  getActivePlan,
  getPlanForDate,
  listPlanVersions,
  countSessionsForPlanVersion,
} from '@/repositories/planRepo';
import {startWorkout} from '@/repositories/sessionRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {createTestDb} from '../helpers/testDb';

const MON_9AM = new Date(2026, 7, 17, 9).getTime();
const MON_9PM = new Date(2026, 7, 17, 21).getTime();

describe('editing a plan that has been trained against', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: MON_9AM});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      MON_9AM,
    );
  });
  afterEach(() => ctx.close());

  it('counts nothing before any workout has been started', async () => {
    const plan = (await getActivePlan(ctx.db))!;
    expect(await countSessionsForPlanVersion(ctx.db, plan.version.id)).toBe(0);
  });

  it('counts a session started against the version', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    const plan = (await getActivePlan(ctx.db))!;
    expect(await countSessionsForPlanVersion(ctx.db, plan.version.id)).toBe(1);
  });

  // Compaction still applies while nothing has been performed: an evening of
  // planning must not leave a dozen versions behind.
  it('still edits in place on the same day when nothing was trained', async () => {
    await editPlan(ctx.db, d => renameDay(d, 1, 'Pull Day'), MON_9PM);
    expect(await listPlanVersions(ctx.db)).toHaveLength(1);
  });

  // §32, and the whole point of this task. Plan in the morning, train at
  // lunch, re-plan in the evening — that lunchtime workout must keep the
  // targets it was actually performed against.
  it('forks once a workout has been performed, even on the same day', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});

    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 5, targetWeight: 100}]),
      MON_9PM,
    );

    const versions = await listPlanVersions(ctx.db);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.effectiveTo).toBeNull();
    expect(versions[1]!.effectiveTo).toBe(MON_9PM);
  });

  it('leaves the trained version resolvable at its own targets', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 5, targetWeight: 100}]),
      MON_9PM,
    );

    const asTrained = await getPlanForDate(ctx.db, MON_9AM + 1000);
    expect(asTrained!.days[0]!.exercises[0]!.sets).toHaveLength(3);
    expect(asTrained!.days[0]!.exercises[0]!.sets[0]!.targetReps).toBe(10);

    const now = await getPlanForDate(ctx.db, MON_9PM + 1000);
    expect(now!.days[0]!.exercises[0]!.sets).toHaveLength(1);
    expect(now!.days[0]!.exercises[0]!.sets[0]!.targetReps).toBe(5);
  });

  it('keeps exactly one open version after forking for a session', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), MON_9PM);

    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM plan_versions WHERE effective_to IS NULL`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  // The session points at the version it was performed against; forking must
  // not repoint it at the new one.
  it('leaves the session attached to the version it was performed against', async () => {
    const session = await startWorkout(ctx.db, {now: MON_9AM});
    const versionAtStart = session.planVersionId;

    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), MON_9PM);

    const rows = await ctx.db.all<{plan_version_id: string}>(
      sql`SELECT plan_version_id FROM workout_sessions WHERE id=${session.id}`,
    );
    expect(rows[0]?.plan_version_id).toBe(versionAtStart);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest planRepo.sessions
```

Expected: FAIL — `countSessionsForPlanVersion is not a function`, and once that exists, the fork test fails because the count is still hard-coded to zero.

- [ ] **Step 3: Add the count and use it**

In `src/repositories/planRepo.ts`, add `workoutSessions` to the schema import, then add:

```ts
/**
 * How many workouts were performed against a plan version.
 *
 * This is the number `canEditInPlace` has been waiting for. Until a version
 * has been trained against, editing it the same day is harmless compaction;
 * afterwards its targets are evidence, and editing must fork (§32).
 */
export async function countSessionsForPlanVersion(
  db: AppDatabase,
  planVersionId: string,
): Promise<number> {
  const rows = await db
    .select({n: sql<number>`COUNT(*)`})
    .from(workoutSessions)
    .where(eq(workoutSessions.planVersionId, planVersionId));
  return Number(rows[0]?.n ?? 0);
}
```

Then in `savePlanDraft`, replace the hard-coded literal and its note:

```ts
  const inPlace = canEditInPlace({
    effectiveFrom: active.version.effectiveFrom,
    now,
    sessionCount: await countSessionsForPlanVersion(db, active.version.id),
  });
```

Delete the `NOTE:` paragraph above `savePlanDraft` that explains the hard-coded zero, and replace it with:

```ts
 * The session count is real from Phase 3 onward: once a workout has been
 * performed against the active version, editing forks even on the same day,
 * because that workout's targets are evidence.
```

- [ ] **Step 4: Remove the deferral**

Delete the whole `## Phase 3 — Today & Workout` section from `docs/deferred.md`, including its `### canEditInPlace is always told there are zero sessions` entry. It is done, and a deferred list that keeps closed items stops being read.

- [ ] **Step 5: Run everything**

```bash
npx jest planRepo
npm test
npm run typecheck
npm run lint
```

Expected: PASS. Phase 2's `planRepo.write` tests must still pass untouched — they never start a workout, so their count is genuinely zero and compaction still applies to them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: fork the plan once it has been trained against"
```

---

## Task 8: What you lifted last time

§36 and spec 6.6. One indexed query, rendered inline so nobody navigates to History mid-set.

**Files:**
- Modify: `src/repositories/sessionRepo.ts`
- Test: `__tests__/repositories/sessionRepo.previous.test.ts`

**Interfaces:**
- Consumes: session tables (Task 1).
- Produces:
  - `type PreviousPerformance = {date: number; sets: {reps: number; weight: number | null}[]}`
  - `getPreviousPerformance(db, exerciseId: string, opts: {before: number}): Promise<PreviousPerformance | undefined>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/repositories/sessionRepo.previous.test.ts`:

```ts
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {getPreviousPerformance} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const day = (d: number) => new Date(2026, 7, d).getTime();

describe('getPreviousPerformance', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const session = async (id: string, date: number, status = 'completed') =>
    ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES (${id},${date},'Push Day',${status},${date})`,
    );

  const performed = async (id: string, sessionId: string, exerciseId: string) =>
    ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES (${id},${sessionId},${exerciseId},0,'completed')`,
    );

  const set = async (
    id: string,
    performedExerciseId: string,
    setNumber: number,
    reps: number | null,
    weight: number | null,
    status = 'completed',
  ) =>
    ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,actual_reps,actual_weight,
             status,is_unplanned)
          VALUES (${id},${performedExerciseId},${setNumber},${reps},${weight},
                  ${status},0)`,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0),
                 ('fly','Fly','chest','[]','strength',1,0,0)`,
    );
  });
  afterEach(() => ctx.close());

  it('has nothing to report the first time an exercise is done', async () => {
    expect(
      await getPreviousPerformance(ctx.db, 'bench', {before: day(20)}),
    ).toBeUndefined();
  });

  it('reports the sets from the last time, in order', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await set('ps2', 'pe1', 2, 10, 30);
    await set('ps3', 'pe1', 3, 8, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(15));
    expect(previous?.sets).toEqual([
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 8, weight: 30},
    ]);
  });

  it('reaches for the most recent session, not the first', async () => {
    await session('s1', day(8));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 5, 20);

    await session('s2', day(15));
    await performed('pe2', 's2', 'bench');
    await set('ps2', 'pe2', 1, 10, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(15));
    expect(previous?.sets).toEqual([{reps: 10, weight: 30}]);
  });

  // Today's own session must not be its own "last time" — that would show the
  // set you are standing there doing as history.
  it('ignores anything on or after the date it is asked about', async () => {
    await session('s1', day(20));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    expect(
      await getPreviousPerformance(ctx.db, 'bench', {before: day(20)}),
    ).toBeUndefined();
  });

  it('reports only the exercise it was asked about', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await performed('pe2', 's1', 'fly');
    await set('ps2', 'pe2', 1, 12, 15);

    const previous = await getPreviousPerformance(ctx.db, 'fly', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 12, weight: 15}]);
  });

  // Sets that were skipped are not performance. Showing them as "last time"
  // would suggest a number that was never lifted.
  it('leaves out sets that were never recorded', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await set('ps2', 'pe1', 2, null, null, 'skipped');
    await set('ps3', 'pe1', 3, null, null, 'pending');

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 10, weight: 30}]);
  });

  // A partial workout is still real work, so an abandoned session counts.
  it('counts work recorded in a session that was abandoned', async () => {
    await session('s1', day(15), 'abandoned');
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toHaveLength(1);
  });

  it('skips a session where the exercise was entirely skipped', async () => {
    await session('s1', day(8));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    await session('s2', day(15));
    await performed('pe2', 's2', 'bench');
    await set('ps2', 'pe2', 1, null, null, 'skipped');

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(8));
  });

  it('reports a bodyweight set with no weight', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 15, null);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 15, weight: null}]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest sessionRepo.previous
```

Expected: FAIL — `getPreviousPerformance is not a function`.

- [ ] **Step 3: Write it**

Append to `src/repositories/sessionRepo.ts`:

```ts
export type PreviousPerformance = {
  date: number;
  sets: {reps: number; weight: number | null}[];
};

/**
 * What was actually lifted the last time this exercise came up (§36).
 *
 * Rendered inline during the workout so nobody has to leave the set they are
 * standing in front of to remember what they did last week.
 *
 * Only completed sets count: a skipped set is not a performance, and showing
 * one would suggest a number that was never lifted. A session that was
 * abandoned still counts, because the sets it did record really happened.
 *
 * One query, over the `performed_exercises(exercise_id)` index (spec 4.6).
 */
export async function getPreviousPerformance(
  db: AppDatabase,
  exerciseId: string,
  opts: {before: number},
): Promise<PreviousPerformance | undefined> {
  const before = startOfLocalDay(opts.before);

  const rows = await db
    .select({
      date: workoutSessions.date,
      setNumber: performedSets.setNumber,
      actualReps: performedSets.actualReps,
      actualWeight: performedSets.actualWeight,
    })
    .from(performedSets)
    .innerJoin(
      performedExercises,
      eq(performedExercises.id, performedSets.performedExerciseId),
    )
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, performedExercises.workoutSessionId),
    )
    .where(
      and(
        eq(performedExercises.exerciseId, exerciseId),
        eq(performedSets.status, 'completed'),
        sql`${workoutSessions.date} < ${before}`,
      ),
    )
    .orderBy(desc(workoutSessions.date), asc(performedSets.setNumber));

  const first = rows[0];
  if (!first) {
    return undefined;
  }

  // The query is ordered newest first, so the leading run of rows sharing the
  // newest date is the whole of that session's work on this exercise.
  return {
    date: first.date,
    sets: rows
      .filter(r => r.date === first.date && r.actualReps !== null)
      .map(r => ({reps: r.actualReps!, weight: r.actualWeight})),
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest sessionRepo
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: show what was lifted last time"
```

---

## Task 9: The primitives the workout screens need

Four small components and one new type token. Extracted first so the three screens after this are assembly rather than invention.

**Files:**
- Create: `src/ui/ProgressBar.tsx`, `src/ui/StatusChip.tsx`, `src/ui/BigNumber.tsx`, `src/ui/LedgerTable.tsx`
- Modify: `src/theme/tokens.ts` (add the `bignum` type token)
- Test: `__tests__/ui/workoutPrimitives.test.tsx`

**Interfaces:**
- Consumes: `useTheme`, `type`, `space`, `radius`; `AppText`.
- Produces:
  - `ProgressBar` — `{value: number; total: number; variant?: 'plate' | 'gain'; label?: string}`
  - `StatusChip` — `{status: ComparisonStatus; label?: string}`
  - `BigNumber` — `{value: string; suffix?: string; color?: ColorToken}`
  - `LedgerTable` — `{rows: {setNumber: number; target: string; actual: string; result: string; status: ComparisonStatus}[]}`

- [ ] **Step 1: Write the failing test**

> **Amended during execution (2026-08-23).** The version below rendered several
> times inside one test and asserted numeric widths; both are wrong, for the
> reasons now in Global Constraints. The shipped file splits the statuses with
> `it.each` and asserts `'40%'`. Follow the shipped file.

Create `__tests__/ui/workoutPrimitives.test.tsx`:

```tsx
import React from 'react';
import {render} from '@testing-library/react-native';
import {ThemeProvider} from '@/theme';
import {ProgressBar} from '@/ui/ProgressBar';
import {StatusChip} from '@/ui/StatusChip';
import {BigNumber} from '@/ui/BigNumber';
import {LedgerTable} from '@/ui/LedgerTable';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

/** Collects every numeric value of one style key in the rendered tree. */
function styleValues(node: unknown, key: string): number[] {
  const found: number[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') {
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const el = n as {props?: {style?: unknown}; children?: unknown};
    const style = el.props?.style;
    for (const entry of Array.isArray(style) ? style : [style]) {
      const value = (entry as Record<string, unknown> | undefined)?.[key];
      if (typeof value === 'number') {
        found.push(value);
      }
    }
    walk(el.children);
  };
  walk(node);
  return found;
}

describe('ProgressBar', () => {
  it('reports progress to a screen reader as well as drawing it', async () => {
    const view = await wrap(<ProgressBar value={6} total={15} />);
    const bar = view.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({min: 0, max: 15, now: 6});
  });

  it('fills in proportion to the value', async () => {
    const view = await wrap(<ProgressBar value={6} total={15} />);
    expect(styleValues(view.toJSON(), 'width')).toContain(40);
  });

  // A workout with nothing planned would divide by zero and render NaN, which
  // React Native turns into a hard crash rather than an empty bar.
  it('survives a total of zero', async () => {
    const view = await wrap(<ProgressBar value={0} total={0} />);
    expect(styleValues(view.toJSON(), 'width')).toContain(0);
  });

  it('never overflows past full', async () => {
    const view = await wrap(<ProgressBar value={20} total={15} />);
    expect(styleValues(view.toJSON(), 'width')).toContain(100);
  });
});

describe('StatusChip', () => {
  it('words each status the way the design does', async () => {
    for (const [status, label] of [
      ['achieved', 'Achieved'],
      ['exceeded', 'Exceeded'],
      ['below', 'Below'],
      ['skipped', 'Skipped'],
      ['unplanned', 'Bonus'],
    ] as const) {
      const view = await wrap(<StatusChip status={status} />);
      expect(view.getByText(label)).toBeTruthy();
      view.unmount();
    }
  });

  it('takes an explicit label when there is a number to show', async () => {
    const view = await wrap(<StatusChip status="exceeded" label="+2 reps" />);
    expect(view.getByText('+2 reps')).toBeTruthy();
  });
});

describe('BigNumber', () => {
  it('shows the value and its suffix', async () => {
    const view = await wrap(<BigNumber value="93" suffix="% of plan" />);
    expect(view.getByText('93')).toBeTruthy();
    expect(view.getByText('% of plan')).toBeTruthy();
  });
});

describe('LedgerTable', () => {
  const rows = [
    {
      setNumber: 1,
      target: '10 × 30.0',
      actual: '10 × 30.0',
      result: 'even',
      status: 'achieved' as const,
    },
    {
      setNumber: 3,
      target: '10 × 30.0',
      actual: '8 × 32.5',
      result: '−40 kg vol',
      status: 'below' as const,
    },
  ];

  it('heads the columns the way the design does', async () => {
    const view = await wrap(<LedgerTable rows={rows} />);
    for (const heading of ['Set', 'Target', 'Actual', 'Result']) {
      expect(view.getByText(heading)).toBeTruthy();
    }
  });

  it('renders a row per set', async () => {
    const view = await wrap(<LedgerTable rows={rows} />);
    expect(view.getByText('8 × 32.5')).toBeTruthy();
    expect(view.getByText('−40 kg vol')).toBeTruthy();
    expect(view.getByText('3')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest workoutPrimitives
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Add the `bignum` token**

In `src/theme/tokens.ts`, add to the `type` object, after `display`:

```ts
  /** The design's `.bignum` — the completion percentage and nothing else. */
  bignum: {
    fontFamily: font.wideBold,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1.96,
    fontVariant: TABULAR,
  },
```

`__tests__/theme/tokens.test.ts` asserts over the token set. If it enumerates keys, add `bignum` to that list; if it only spot-checks values, it needs no change. Run it and see.

- [ ] **Step 4: Write ProgressBar**

Create `src/ui/ProgressBar.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, radius} from '@/theme';

/**
 * The design's `.progress`: a 5px rule that fills as the workout does.
 *
 * `gain` is for a finished workout; `plate` for one in progress.
 */
export function ProgressBar({
  value,
  total,
  variant = 'plate',
  label,
}: {
  value: number;
  total: number;
  variant?: 'plate' | 'gain';
  label?: string;
}) {
  const {colors} = useTheme();

  // A session with nothing planned would divide by zero and render NaN, which
  // React Native treats as a fatal style value rather than an empty bar.
  const percent =
    total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

  return (
    <View
      // Without `accessible`, React Native does not treat this View as an
      // accessibility element, so the role is set but nothing can find it —
      // neither a screen reader nor getByRole.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{min: 0, max: total, now: value}}
      style={[styles.track, {backgroundColor: colors.ruleSoft}]}>
      <View
        style={[
          styles.fill,
          {width: `${percent}%`, backgroundColor: colors[variant]},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {height: 5, borderRadius: radius.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: radius.pill},
});
```

- [ ] **Step 5: Write StatusChip**

Create `src/ui/StatusChip.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, radius, type ColorToken} from '@/theme';
import {AppText} from './Text';
import type {ComparisonStatus} from '@/domain/setComparison';

/**
 * The design's `.chip` in its five states.
 *
 * Below target is ochre and never red: falling short of a target is
 * information, not an error, and the palette says so.
 */
const TONE: Record<ComparisonStatus, {fill: ColorToken; ink: ColorToken}> = {
  achieved: {fill: 'plateSoft', ink: 'plate'},
  exceeded: {fill: 'gainSoft', ink: 'gain'},
  below: {fill: 'shortSoft', ink: 'short'},
  skipped: {fill: 'skipSoft', ink: 'skip'},
  unplanned: {fill: 'surface2', ink: 'muted'},
};

const DEFAULT_LABEL: Record<ComparisonStatus, string> = {
  achieved: 'Achieved',
  exceeded: 'Exceeded',
  below: 'Below',
  skipped: 'Skipped',
  unplanned: 'Bonus',
};

export function StatusChip({
  status,
  label,
}: {
  status: ComparisonStatus;
  label?: string;
}) {
  const {colors} = useTheme();
  const tone = TONE[status];
  return (
    <View style={[styles.chip, {backgroundColor: colors[tone.fill]}]}>
      <AppText variant="monoSmall" color={tone.ink}>
        {label ?? DEFAULT_LABEL[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
```

- [ ] **Step 6: Write BigNumber**

Create `src/ui/BigNumber.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {space, type ColorToken} from '@/theme';
import {AppText} from './Text';

/** The largest number in the app, and it is used exactly twice. */
export function BigNumber({
  value,
  suffix,
  color = 'ink',
}: {
  value: string;
  suffix?: string;
  color?: ColorToken;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="bignum" color={color}>
        {value}
      </AppText>
      {suffix ? (
        <AppText variant="printed" color="muted">
          {suffix}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
});
```

- [ ] **Step 7: Write LedgerTable**

Create `src/ui/LedgerTable.tsx`:

```tsx
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme, space, type ColorToken} from '@/theme';
import {AppText} from './Text';
import type {ComparisonStatus} from '@/domain/setComparison';

const RESULT_INK: Record<ComparisonStatus, ColorToken> = {
  achieved: 'plate',
  exceeded: 'gain',
  below: 'short',
  skipped: 'skip',
  unplanned: 'muted',
};

export type LedgerRow = {
  setNumber: number;
  target: string;
  actual: string;
  result: string;
  status: ComparisonStatus;
};

/**
 * The §16 set-by-set table: target in faint type, actual written over it, the
 * verdict on the right. Monospaced and tabular so the columns line up as a
 * ledger rather than drifting per row.
 */
export function LedgerTable({rows}: {rows: readonly LedgerRow[]}) {
  const {colors} = useTheme();
  return (
    <View>
      <View style={[styles.head, {borderBottomColor: colors.rule}]}>
        <AppText variant="printed" color="muted" style={styles.setCol}>
          Set
        </AppText>
        <AppText variant="printed" color="muted" style={styles.grow}>
          Target
        </AppText>
        <AppText variant="printed" color="muted" style={styles.grow}>
          Actual
        </AppText>
        <AppText variant="printed" color="muted" style={styles.resultCol}>
          Result
        </AppText>
      </View>
      {rows.map(row => (
        <View
          key={row.setNumber}
          style={[styles.row, {borderBottomColor: colors.ruleSoft}]}>
          <AppText variant="mono" color="muted" style={styles.setCol}>
            {String(row.setNumber)}
          </AppText>
          <AppText variant="mono" color="faint" style={styles.grow}>
            {row.target}
          </AppText>
          <AppText variant="mono" style={styles.grow}>
            {row.actual}
          </AppText>
          <AppText
            variant="mono"
            color={RESULT_INK[row.status]}
            style={styles.resultCol}>
            {row.result}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {flexDirection: 'row', paddingBottom: space.sm, borderBottomWidth: 1},
  row: {flexDirection: 'row', paddingVertical: space.sm, borderBottomWidth: 1},
  setCol: {width: 32},
  grow: {flex: 1},
  resultCol: {width: 86, textAlign: 'right'},
});
```

- [ ] **Step 8: Run everything**

```bash
npx jest workoutPrimitives
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add progress, status chip, big number, and ledger primitives"
```

---

## Task 10: The Today screen

Designs 06, 07 and 08 — one screen in four states, decided by what today actually is. This is also where the Today tab stops being a placeholder and becomes a stack, and where stale sessions are closed on launch.

**Files:**
- Create: `src/features/workout/useSession.ts`, `src/features/workout/TodayScreen.tsx`, `src/navigation/TodayStack.tsx`
- Modify: `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`, `src/providers/DatabaseGate.tsx`
- Delete: `src/features/today/TodayScreen.tsx`
- Test: `__tests__/features/workout/TodayScreen.test.tsx`

**Interfaces:**
- Consumes: `sessionRepo` (Tasks 4–8); `getPlanForDate` (Phase 2); `ProgressBar`, `StatusChip`, `Button`, `Card`, `Hatch` (Tasks 7, 9 and Phase 2); `WEEKDAY_NAMES`, `weekdayIndex`, `startOfLocalDay`.
- Produces:
  - `sessionKeys = {all, today, previous(exerciseId)}`
  - `useTodaySessionQuery()`, `useTodayPlanQuery()`, `useStartWorkout()`, `useFinishWorkout()`
  - `type TodayStackParamList = {Today: undefined; Workout: undefined; ExerciseSummary: {exerciseIndex: number}; WorkoutComplete: undefined; WorkoutExercisePicker: undefined}`

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/workout/TodayScreen.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  getActiveSession,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {TodayScreen} from '@/features/workout/TodayScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(cb, []);
  },
}));

describe('TodayScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <TodayScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  /** Today's weekday, so the fixture always lands on the day under test. */
  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  const planToday = async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
  };

  it('points at the Plan tab when there is no plan at all', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/No plan yet/i)).toBeTruthy();
  });

  it('says so when today has nothing set up', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    expect(await view.findByText(/not set up/i)).toBeTruthy();
  });

  // §33 and design 07: the one screen with no card stack and no primary
  // button. Recovery is a plan, not an absence of one.
  it('shows a rest day as a rest day', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => setRestDay(d, today(), true));

    const view = await renderScreen();
    expect(await view.findByText('Rest day')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it("lists today's exercises and their targets", async () => {
    await planToday();
    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getByText('2 exercises · 6 sets')).toBeTruthy();
    expect(view.getAllByText(/3 × 10/).length).toBe(2);
  });

  it('starts a workout and opens it', async () => {
    await planToday();
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Start workout'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeDefined();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Workout');
  });

  // §20 and design 08: after a process kill, the screen offers to continue
  // rather than starting over and losing what was recorded.
  it('offers to continue a session already in progress', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const view = await renderScreen();
    expect(await view.findByText('Continue workout')).toBeTruthy();
    // The count and its label are separate nodes, as the design sets them:
    // a big plate-coloured number over a printed caption.
    expect(view.getByText('1')).toBeTruthy();
    expect(view.getByText('of 6 sets recorded')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it('can close an in-progress workout from here', async () => {
    await planToday();
    await startWorkout(ctx.db);

    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Finish here'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeUndefined();
    });
  });

  it('shows the day as done once the workout is finished', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const view = await renderScreen();
    expect(await view.findByText(/Push Day done/i)).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest TodayScreen
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the query layer**

Create `src/features/workout/useSession.ts`:

```ts
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useDatabase} from '@/providers/DatabaseGate';
import {
  getSessionForDate,
  startWorkout,
  finishWorkout,
  completeSet,
  skipSet,
  skipExercise,
  addSet,
  addExercise,
  getPreviousPerformance,
} from '@/repositories/sessionRepo';
import {getPlanForDate} from '@/repositories/planRepo';
import {startOfLocalDay} from '@/domain/weekday';

export const sessionKeys = {
  all: ['session'] as const,
  today: () => ['session', 'today'] as const,
  todayPlan: () => ['session', 'todayPlan'] as const,
  previous: (exerciseId: string) =>
    ['session', 'previous', exerciseId] as const,
};

/** Today's session, or null when nothing has been started. */
export function useTodaySessionQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.today(),
    // Null rather than undefined: TanStack Query treats an undefined result as
    // a failed query, which would make "no workout yet" and "the database
    // threw" render identically.
    queryFn: async () =>
      (await getSessionForDate(db, Date.now())) ?? null,
    staleTime: Infinity,
  });
}

/** The plan as it stands for today, for the pre-workout listing. */
export function useTodayPlanQuery() {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.todayPlan(),
    queryFn: async () => (await getPlanForDate(db, Date.now())) ?? null,
    staleTime: Infinity,
  });
}

export function usePreviousPerformanceQuery(exerciseId: string) {
  const db = useDatabase();
  return useQuery({
    queryKey: sessionKeys.previous(exerciseId),
    queryFn: async () =>
      (await getPreviousPerformance(db, exerciseId, {
        before: startOfLocalDay(Date.now()),
      })) ?? null,
    enabled: exerciseId !== '',
    staleTime: Infinity,
  });
}

/**
 * Every workout write invalidates the session branch.
 *
 * They are deliberately separate mutations rather than one generic one: each
 * is its own committed transaction (spec 6.4), and naming them separately is
 * what keeps that visible at the call site.
 */
function useSessionMutation<TArgs>(
  run: (db: ReturnType<typeof useDatabase>, args: TArgs) => Promise<unknown>,
) {
  const db = useDatabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => run(db, args),
    onSuccess: () => client.invalidateQueries({queryKey: sessionKeys.all}),
  });
}

export const useStartWorkout = () =>
  useSessionMutation<void>(db => startWorkout(db));

export const useFinishWorkout = () =>
  useSessionMutation<string>((db, sessionId) => finishWorkout(db, sessionId));

export const useCompleteSet = () =>
  useSessionMutation<{
    setId: string;
    actualReps: number;
    actualWeight: number | null;
  }>((db, {setId, actualReps, actualWeight}) =>
    completeSet(db, setId, {actualReps, actualWeight}),
  );

export const useSkipSet = () =>
  useSessionMutation<string>((db, setId) => skipSet(db, setId));

export const useSkipExercise = () =>
  useSessionMutation<string>((db, id) => skipExercise(db, id));

export const useAddSet = () =>
  useSessionMutation<string>((db, id) => addSet(db, id));

export const useAddExercise = () =>
  useSessionMutation<{sessionId: string; exerciseId: string}>(
    (db, {sessionId, exerciseId}) => addExercise(db, sessionId, exerciseId),
  );
```

- [ ] **Step 4: Write the screen**

Create `src/features/workout/TodayScreen.tsx`:

```tsx
import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space, radius} from '@/theme';
import {WEEKDAY_NAMES, weekdayIndex} from '@/domain/weekday';
import type {PlanDayView} from '@/repositories/planRepo';
import type {TodayStackParamList} from '@/navigation/types';
import {
  useTodaySessionQuery,
  useTodayPlanQuery,
  useStartWorkout,
  useFinishWorkout,
} from './useSession';

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** "3 × 10 · 30.0 kg", or "3 sets · varied" when the sets differ. */
function targetLine(exercise: PlanDayView['exercises'][number]): string {
  const [first, ...rest] = exercise.sets;
  if (!first) {
    return 'No sets';
  }
  const uniform = rest.every(
    s =>
      s.targetReps === first.targetReps &&
      s.targetWeight === first.targetWeight,
  );
  if (!uniform) {
    return `${exercise.sets.length} sets · varied`;
  }
  const base = `${exercise.sets.length} × ${first.targetReps}`;
  return first.targetWeight === null
    ? base
    : `${base} · ${first.targetWeight.toFixed(1)} kg`;
}

export function TodayScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const {data: session, isPending: sessionPending} = useTodaySessionQuery();
  const {data: plan, isPending: planPending} = useTodayPlanQuery();
  const start = useStartWorkout();
  const finish = useFinishWorkout();

  const now = Date.now();
  const weekday = weekdayIndex(new Date(now));
  const day = plan?.days[weekday];

  if (sessionPending || planPending) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const frame = (children: React.ReactNode) => (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      {children}
    </ScrollView>
  );

  // ---- The workout is already in progress (§20, design 08) ----------------
  if (session && session.status === 'in_progress') {
    const sets = session.exercises.flatMap(e => e.sets);
    const done = sets.filter(s => s.status === 'completed').length;
    const next = session.exercises.find(e => e.status === 'pending');

    return frame(
      <>
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            {longDate(now)}
          </AppText>
          <AppText variant="h1">{session.dayName}</AppText>
        </View>

        <View style={[styles.banner, {backgroundColor: colors.plateSoft}]}>
          <AppText variant="eyebrow" color="plate">
            In progress
          </AppText>
          <View style={styles.bannerRow}>
            <AppText variant="display" color="plate">
              {String(done)}
            </AppText>
            <AppText variant="printed" color="muted">
              {`of ${sets.length} sets recorded`}
            </AppText>
          </View>
          <ProgressBar value={done} total={sets.length} label="Workout progress" />
        </View>

        <Button
          label="Continue workout"
          onPress={() => navigation.navigate('Workout')}
        />
        <Button
          label="Finish here"
          variant="secondary"
          disabled={finish.isPending}
          onPress={() => finish.mutate(session.id)}
        />

        {next ? (
          <>
            <AppText variant="eyebrow" color="muted">
              Where you stopped
            </AppText>
            <Card>
              <AppText variant="bodyStrong">{next.name}</AppText>
              <AppText variant="printed" color="muted">
                {`set ${
                  next.sets.findIndex(s => s.status === 'pending') + 1
                } of ${next.sets.length}`}
              </AppText>
            </Card>
          </>
        ) : null}
      </>,
    );
  }

  // ---- Today is already done ---------------------------------------------
  if (session) {
    const sets = session.exercises.flatMap(e => e.sets);
    const done = sets.filter(s => s.status === 'completed').length;
    return frame(
      <>
        <View style={styles.headerBlock}>
          <AppText variant="eyebrow" color="muted">
            {longDate(now)}
          </AppText>
          <AppText variant="h1">{`${session.dayName} done`}</AppText>
          <AppText variant="small" color="muted">
            {`${done} of ${sets.length} sets recorded`}
          </AppText>
        </View>
        <ProgressBar
          value={done}
          total={sets.length}
          variant="gain"
          label="Workout progress"
        />
        <Button
          label="See the summary"
          variant="secondary"
          onPress={() => navigation.navigate('WorkoutComplete')}
        />
      </>,
    );
  }

  // ---- No plan at all (§40) ----------------------------------------------
  if (!plan || !day) {
    return frame(
      <View style={styles.blank}>
        <AppText variant="h2">No plan yet</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Build a weekly routine on the Plan tab, and today's workout will
          appear here.
        </AppText>
      </View>,
    );
  }

  // ---- Rest day (§33, design 07) -----------------------------------------
  if (day.isRestDay) {
    const tomorrow = plan.days[(weekday + 1) % 7]!;
    const tomorrowSets = tomorrow.exercises.reduce(
      (total, e) => total + e.sets.length,
      0,
    );
    return frame(
      <View style={styles.blank}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="display">Rest day</AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Nothing planned. Recovery counts as training.
        </AppText>
        <View style={styles.fullWidth}>
          <Card>
            <AppText variant="eyebrow" color="muted">
              Tomorrow
            </AppText>
            <AppText variant="bodyStrong">
              {tomorrow.isRestDay
                ? 'Rest day'
                : (tomorrow.customName ?? WEEKDAY_NAMES[tomorrow.weekday]!)}
            </AppText>
            {!tomorrow.isRestDay && tomorrow.exercises.length > 0 ? (
              <AppText variant="printed" color="muted">
                {`${plural(
                  tomorrow.exercises.length,
                  'exercise',
                  'exercises',
                )} · ${tomorrowSets} sets`}
              </AppText>
            ) : null}
          </Card>
        </View>
      </View>,
    );
  }

  // ---- Nothing planned for today -----------------------------------------
  if (day.exercises.length === 0) {
    return frame(
      <View style={styles.blank}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="h2">
          {`${WEEKDAY_NAMES[weekday]} is not set up`}
        </AppText>
        <AppText variant="body" color="muted" style={styles.centred}>
          Add exercises to this day on the Plan tab, or mark it a rest day.
        </AppText>
      </View>,
    );
  }

  // ---- A workout waiting to be started (§12, design 06) ------------------
  const totalSets = day.exercises.reduce(
    (total, e) => total + e.sets.length,
    0,
  );

  return frame(
    <>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {longDate(now)}
        </AppText>
        <AppText variant="h1">
          {day.customName ?? WEEKDAY_NAMES[weekday]!}
        </AppText>
        <AppText variant="small" color="muted">
          {`${plural(day.exercises.length, 'exercise', 'exercises')} · ${plural(
            totalSets,
            'set',
            'sets',
          )}`}
        </AppText>
      </View>

      <View style={styles.stack}>
        {day.exercises.map(exercise => (
          <Card key={exercise.plannedExerciseId}>
            <AppText variant="bodyStrong">{exercise.name}</AppText>
            {/* Printed type, because nothing has happened yet. */}
            <AppText variant="printed" color="muted">
              {`target ${targetLine(exercise)}`}
            </AppText>
          </Card>
        ))}
      </View>

      <Button
        label="Start workout"
        disabled={start.isPending}
        onPress={() =>
          start.mutate(undefined, {
            onSuccess: () => navigation.navigate('Workout'),
          })
        }
      />
    </>,
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  headerBlock: {gap: 2, marginBottom: space.sm},
  stack: {gap: space.sm, marginBottom: space.sm},
  banner: {borderRadius: radius.md, padding: space.lg, gap: space.sm},
  bannerRow: {flexDirection: 'row', alignItems: 'baseline', gap: space.sm},
  blank: {alignItems: 'center', gap: space.sm, paddingTop: space.xxxl},
  centred: {textAlign: 'center'},
  fullWidth: {width: '100%', marginTop: space.md},
});
```

- [ ] **Step 5: Add the stack**

Add to `src/navigation/types.ts`:

```ts
export type TodayStackParamList = {
  Today: undefined;
  Workout: undefined;
  ExerciseSummary: {exerciseIndex: number};
  WorkoutComplete: undefined;
  WorkoutExercisePicker: undefined;
};
```

Create `src/navigation/TodayStack.tsx`. Register only `Today` for now; Tasks 11–12 add the rest as they are built:

```tsx
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {TodayScreen} from '@/features/workout/TodayScreen';
import type {TodayStackParamList} from './types';

const Stack = createNativeStackNavigator<TodayStackParamList>();

/** The Today tab: today's workout and everything it leads into. */
export function TodayStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="Today" component={TodayScreen} />
    </Stack.Navigator>
  );
}
```

In `src/navigation/RootNavigator.tsx`, swap the `TodayScreen` import for `TodayStack` and render it on the Today tab. Delete `src/features/today/TodayScreen.tsx`.

Update the marker in `__tests__/navigation/RootNavigator.test.tsx` — the Today row currently matches the placeholder's copy:

```ts
      ['Today', /No plan yet/i],
```

- [ ] **Step 6: Close stale sessions on launch**

Spec 6.4 says an in-progress session from a previous day closes as abandoned at day rollover. There is no background job in this app, so launch is the moment.

In `src/providers/DatabaseGate.tsx`, add the import and one line after seeding:

```ts
import {rollOverStaleSessions} from '@/repositories/sessionRepo';
```

```ts
        await runMigrations(db);
        await seedExercises(db);
        // Spec 6.4: a session left open overnight closes as abandoned, keeping
        // every set it recorded. Launch is the only moment this can happen —
        // there is no background job anywhere in this app.
        await rollOverStaleSessions(db);
```

Add to `__tests__/providers/DatabaseGate.test.tsx`:

```tsx
  it('closes a session left open from a previous day', async () => {
    const ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('old', 0, 'Push Day', 'in_progress', 0)`,
    );

    await render(
      <ThemeProvider>
        <DatabaseGate getDb={() => ctx.db}>
          <AppText>ready</AppText>
        </DatabaseGate>
      </ThemeProvider>,
    );

    await waitFor(async () => {
      const rows = await ctx.db.all<{status: string}>(
        sql`SELECT status FROM workout_sessions WHERE id='old'`,
      );
      expect(rows[0]?.status).toBe('abandoned');
    });
    ctx.close();
  });
```

Match the imports and helpers that file already uses rather than adding new ones.

- [ ] **Step 7: Run everything**

```bash
npx jest TodayScreen DatabaseGate RootNavigator
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add the Today screen and close stale sessions on launch"
```

---

## Task 11: The workout screen

Design 09 — the signature screen, and the one the whole app is for. Target sits printed in the header strip; the actual numbers are written large beneath it. An on-plan set costs exactly one tap.

**Files:**
- Create: `src/features/workout/useActiveSet.ts`, `src/features/workout/SetRow.tsx`, `src/features/workout/WorkoutScreen.tsx`
- Modify: `src/navigation/TodayStack.tsx`
- Test: `__tests__/features/workout/WorkoutScreen.test.tsx`

**Interfaces:**
- Consumes: `useSession` hooks (Task 10); `compareSet`, `describeComparison` (Task 2); `StatusChip`, `ProgressBar`, `Button` (Task 9); `useSettingsQuery` (Phase 0).
- Produces:
  - `useActiveSet` — a Zustand store holding `{setId, weight, reps}` and the actions to change them
  - `SetRow` — `{setNumber, targetReps, targetWeight, actualReps, actualWeight, status, isUnplanned, isActive, unit, increment, onChangeWeight, onChangeReps, onComplete}`
  - `WorkoutScreen`

> **Why Zustand, finally.** It has been a dependency since Phase 0 without a use. This is it: the weight and reps currently on screen are transient UI state that must survive a re-render from a query invalidation but must **not** be written to the database until the set is completed (spec 6.2). Holding them in the store rather than in the query cache is what keeps "typed but not recorded" and "recorded" distinguishable after a crash.

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/workout/WorkoutScreen.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {startWorkout, getActiveSession} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutScreen} from '@/features/workout/WorkoutScreen';
import {useActiveSet} from '@/features/workout/useActiveSet';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
}));

describe('WorkoutScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  const sets = async () => {
    const session = (await getActiveSession(ctx.db))!;
    return session.exercises[0]!.sets;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
    // A real target weight, so the pre-fill has something to pre-fill from.
    // addExercises defaults to 3 x 10 with no weight, which would make every
    // weight assertion below trivially zero.
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    useActiveSet.getState().reset();
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the first exercise with its progress', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
    expect(view.getByText(/0 \/ 6 sets/)).toBeTruthy();
  });

  // §35: the inputs arrive holding the target, so an on-plan set is one tap.
  it('pre-fills the active set with the target', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.getByLabelText('Weight').props.children).toBe('30.0');
    expect(view.getByLabelText('Reps').props.children).toBe('10');
  });

  // Spec 6.2: pre-filled is not recorded. Until the set is completed the
  // database holds NULL, or a crash would make an untouched set look done.
  it('records nothing until the set is completed', async () => {
    await renderScreen();
    expect((await sets())[0]!.actualReps).toBeNull();
    expect((await sets())[0]!.status).toBe('pending');
  });

  it('writes the actuals when the set is completed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));

    await waitFor(async () => {
      expect((await sets())[0]!.status).toBe('completed');
    });
    expect((await sets())[0]!.actualReps).toBe(10);
    expect((await sets())[0]!.actualWeight).toBe(30);
  });

  it('steps the weight by the configured increment and the reps by one', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');

    await fireEvent.press(view.getByLabelText('Increase weight'));
    await fireEvent.press(view.getByLabelText('Increase reps'));
    await fireEvent.press(view.getByLabelText('Increase reps'));
    expect(view.getByLabelText('Weight').props.children).toBe('32.5');
    expect(view.getByLabelText('Reps').props.children).toBe('12');

    await fireEvent.press(view.getByLabelText('Complete set'));
    await waitFor(async () => {
      expect((await sets())[0]!.actualWeight).toBe(32.5);
    });
    expect((await sets())[0]!.actualReps).toBe(12);
  });

  it('will not step reps below one or weight below zero', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    for (let i = 0; i < 20; i++) {
      await fireEvent.press(view.getByLabelText('Decrease reps'));
      await fireEvent.press(view.getByLabelText('Decrease weight'));
    }
    expect(view.getByLabelText('Reps').props.children).toBe('1');
    expect(view.getByLabelText('Weight').props.children).toBe('0.0');
  });

  // Spec 6.3: completing a set auto-advances, so the next set is already
  // waiting rather than needing to be found.
  it('advances to the next set once one is recorded', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Complete set'));

    await waitFor(() => {
      expect(view.getByText('Set 2')).toBeTruthy();
    });
    expect(view.getByText(/1 \/ 6 sets/)).toBeTruthy();
  });

  it('shows a recorded set with its verdict', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Increase reps'));
    await fireEvent.press(view.getByLabelText('Complete set'));

    await waitFor(() => {
      expect(view.getByText('+1 rep')).toBeTruthy();
    });
  });

  it('skips a set without recording anything', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Skip set'));

    await waitFor(async () => {
      expect((await sets())[0]!.status).toBe('skipped');
    });
    expect((await sets())[0]!.actualReps).toBeNull();
  });

  it('adds a bonus set with no target', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Add set'));

    await waitFor(async () => {
      expect(await sets()).toHaveLength(4);
    });
    expect((await sets())[3]!.isUnplanned).toBe(true);
  });

  it('skips the whole exercise and moves on', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Skip this exercise'));

    await waitFor(async () => {
      const session = (await getActiveSession(ctx.db))!;
      expect(session.exercises[0]!.status).toBe('skipped');
    });
  });

  it('moves to the next exercise on request', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText(/Next — Cable Fly/));
    await waitFor(() => {
      expect(view.getByText('Cable Fly')).toBeTruthy();
    });
  });

  // §36: what you lifted last time, inline, so nobody leaves the set they are
  // standing in front of to go and look it up.
  it('shows what was lifted last time', async () => {
    await ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('old', 1, 'Push Day', 'completed', 1)`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('opex','old','bench',0,'completed')`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,actual_reps,actual_weight,
             status,is_unplanned)
          VALUES ('ops','opex',1,10,27.5,'completed',0)`,
    );

    const view = await renderScreen();
    expect(await view.findByText(/last time/)).toBeTruthy();
    expect(view.getByText(/27.5×10/)).toBeTruthy();
  });

  it('opens the exercise summary when an exercise is finished', async () => {
    const view = await renderScreen();
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(await view.findByLabelText('Complete set'));
    }
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('ExerciseSummary', {
        exerciseIndex: 0,
      });
    });
  });

  it('leaves the workout when closed', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Close workout'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest WorkoutScreen
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the store**

Create `src/features/workout/useActiveSet.ts`:

```ts
import {create} from 'zustand';

/**
 * The weight and reps currently on screen — and nothing else.
 *
 * These are deliberately **not** in the query cache and **not** in the
 * database. Spec 6.2: a pre-filled value that has not been confirmed must stay
 * indistinguishable from nothing at all, so that a process kill loses at most
 * the set being typed rather than inventing one that was never performed.
 */
type ActiveSetState = {
  setId: string | null;
  weight: number | null;
  reps: number;
  /** Called when the active set changes; resets the on-screen numbers. */
  load: (args: {setId: string; weight: number | null; reps: number}) => void;
  adjustWeight: (delta: number) => void;
  adjustReps: (delta: number) => void;
  reset: () => void;
};

/** Two decimals is finer than any plate; beyond that it is float noise. */
const round = (value: number): number => Math.round(value * 100) / 100;

export const useActiveSet = create<ActiveSetState>(set => ({
  setId: null,
  weight: null,
  reps: 10,
  load: ({setId, weight, reps}) => set({setId, weight, reps}),
  adjustWeight: delta =>
    set(state => ({
      // A weight of zero is meaningful here — it is what a bodyweight set
      // shows — so this floors at zero rather than at the increment.
      weight: Math.max(0, round((state.weight ?? 0) + delta)),
    })),
  adjustReps: delta =>
    set(state => ({reps: Math.max(1, state.reps + delta)})),
  reset: () => set({setId: null, weight: null, reps: 10}),
}));
```

- [ ] **Step 4: Write the set row**

Create `src/features/workout/SetRow.tsx`:

```tsx
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {StatusChip} from '@/ui/StatusChip';
import {useTheme, space, radius} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';

/**
 * One row of design 09.
 *
 * The target is printed across the head strip; the actual is written large
 * beneath it. A recorded row shrinks and carries its verdict; the active row
 * gets the steppers and the check; anything further down is dimmed, because it
 * has not happened yet and should not compete for attention.
 */
export function SetRow({
  setNumber,
  targetReps,
  targetWeight,
  actualReps,
  actualWeight,
  status,
  isUnplanned,
  isActive,
  unit,
  increment,
  onAdjustWeight,
  onAdjustReps,
  onComplete,
}: {
  setNumber: number;
  targetReps: number | null;
  targetWeight: number | null;
  actualReps: number | null;
  actualWeight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  isUnplanned: boolean;
  isActive: boolean;
  unit: string;
  increment: number;
  onAdjustWeight?: (delta: number) => void;
  onAdjustReps?: (delta: number) => void;
  onComplete?: () => void;
}) {
  const {colors} = useTheme();

  const targetLabel =
    targetReps === null
      ? 'bonus set'
      : targetWeight === null
        ? `target ${targetReps}`
        : `target ${targetReps} × ${targetWeight.toFixed(1)}`;

  const comparison = compareSet({
    targetReps,
    targetWeight,
    actualReps,
    actualWeight,
    status,
  });

  const done = status !== 'pending';

  return (
    <View
      style={[
        styles.row,
        {borderColor: isActive ? colors.plate : colors.ruleSoft},
        {backgroundColor: colors.surface},
        !done && !isActive && styles.dim,
      ]}>
      <View
        style={[
          styles.head,
          {
            borderBottomColor: isActive ? colors.plate : colors.ruleSoft,
            backgroundColor: isActive ? colors.plateSoft : 'transparent',
          },
        ]}>
        <AppText variant="eyebrow" color={isActive ? 'plate' : 'muted'}>
          {`Set ${setNumber}`}
        </AppText>
        <AppText variant="printed" color="muted">
          {targetLabel}
        </AppText>
      </View>

      <View style={styles.body}>
        <View style={styles.field}>
          <AppText
            accessibilityLabel={isActive ? 'Weight' : undefined}
            variant={isActive ? 'display' : 'inkNum'}
            color={done || isActive ? 'ink' : 'faint'}>
            {(isActive ? actualWeight : actualWeight) === null
              ? '—'
              : (actualWeight ?? 0).toFixed(1)}
          </AppText>
          <AppText variant="printed" color="muted">
            {unit}
          </AppText>
          {isActive && onAdjustWeight ? (
            <Stepper
              onDown={() => onAdjustWeight(-increment)}
              onUp={() => onAdjustWeight(increment)}
              label="weight"
            />
          ) : null}
        </View>

        <AppText variant="printed" color="faint">
          ×
        </AppText>

        <View style={styles.field}>
          <AppText
            accessibilityLabel={isActive ? 'Reps' : undefined}
            variant={isActive ? 'display' : 'inkNum'}
            color={done || isActive ? 'ink' : 'faint'}>
            {actualReps === null ? '—' : String(actualReps)}
          </AppText>
          <AppText variant="printed" color="muted">
            reps
          </AppText>
          {isActive && onAdjustReps ? (
            <Stepper
              onDown={() => onAdjustReps(-1)}
              onUp={() => onAdjustReps(1)}
              label="reps"
            />
          ) : null}
        </View>

        {isActive && onComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Complete set"
            onPress={onComplete}
            style={[styles.check, {backgroundColor: colors.plate}]}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 13l4 4L19 7"
                stroke={colors.plateInk}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ) : done ? (
          <StatusChip
            status={isUnplanned ? 'unplanned' : comparison.status}
            label={
              isUnplanned
                ? 'Bonus'
                : comparison.status === 'achieved'
                  ? 'Achieved'
                  : describeComparison(comparison, unit)
            }
          />
        ) : null}
      </View>
    </View>
  );
}

/** The design's −/+ shoulders. Big enough to hit with a chalked-up thumb. */
function Stepper({
  onDown,
  onUp,
  label,
}: {
  onDown: () => void;
  onUp: () => void;
  label: string;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        onPress={onDown}
        style={[styles.shoulder, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="ink2">
          −
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        onPress={onUp}
        style={[styles.shoulder, {borderColor: colors.rule}]}>
        <AppText variant="bodyStrong" color="ink2">
          +
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  dim: {opacity: 0.55},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
  },
  field: {flex: 1, alignItems: 'center', gap: 2},
  stepper: {flexDirection: 'row', gap: space.sm, marginTop: space.sm},
  shoulder: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 5: Write the screen**

Create `src/features/workout/WorkoutScreen.tsx`:

```tsx
import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space} from '@/theme';
import {useSettingsQuery} from '@/features/settings/useSettings';
import type {TodayStackParamList} from '@/navigation/types';
import {SetRow} from './SetRow';
import {useActiveSet} from './useActiveSet';
import {
  useTodaySessionQuery,
  usePreviousPerformanceQuery,
  useCompleteSet,
  useSkipSet,
  useSkipExercise,
  useAddSet,
} from './useSession';

export function WorkoutScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<TodayStackParamList>>();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const complete = useCompleteSet();
  const skip = useSkipSet();
  const skipExercise = useSkipExercise();
  const addSet = useAddSet();

  const [index, setIndex] = useState(0);
  const active = useActiveSet();

  const exercise = session?.exercises[index];
  const {data: previous} = usePreviousPerformanceQuery(
    exercise?.exerciseId ?? '',
  );

  // The first set still pending is the one being worked on.
  const activeSet = exercise?.sets.find(s => s.status === 'pending');

  // §35: the inputs arrive holding the target. For a bonus set there is no
  // target, so the last thing actually lifted on this exercise is the better
  // guess than an empty field in a gym.
  useEffect(() => {
    if (!activeSet || active.setId === activeSet.id) {
      return;
    }
    const lastRecorded = [...(exercise?.sets ?? [])]
      .reverse()
      .find(s => s.status === 'completed');
    active.load({
      setId: activeSet.id,
      weight:
        activeSet.targetWeight ??
        lastRecorded?.actualWeight ??
        (exercise?.weightApplicable ? 0 : null),
      reps: activeSet.targetReps ?? lastRecorded?.actualReps ?? 10,
    });
  }, [activeSet, active, exercise]);

  if (!session || !exercise) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const increment = settings?.defaultIncrement ?? 2.5;

  const allSets = session.exercises.flatMap(e => e.sets);
  const doneSets = allSets.filter(s => s.status === 'completed').length;
  const doneExercises = session.exercises.filter(
    e => e.status !== 'pending',
  ).length;
  const next = session.exercises[index + 1];

  const onComplete = () => {
    if (!activeSet) {
      return;
    }
    const wasLast =
      exercise.sets.filter(s => s.status === 'pending').length === 1;
    complete.mutate(
      {
        setId: activeSet.id,
        actualReps: active.reps,
        actualWeight: exercise.weightApplicable ? active.weight : null,
      },
      {
        onSuccess: () => {
          active.reset();
          // Spec 6.3: auto-advance. Finishing the last set of an exercise
          // means the exercise is done, so its summary is what comes next.
          if (wasLast) {
            navigation.navigate('ExerciseSummary', {exerciseIndex: index});
          }
        },
      },
    );
  };

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.md},
      ]}>
      <View style={styles.header}>
        <View style={styles.grow}>
          <AppText variant="eyebrow" color="muted">
            {session.dayName}
          </AppText>
          <AppText variant="mono" color="ink2">
            {`${doneSets} / ${allSets.length} sets · ${doneExercises} of ${session.exercises.length} exercises`}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workout"
          hitSlop={space.md}
          onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 6l12 12M18 6L6 18"
              stroke={colors.ink2}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>

      <ProgressBar
        value={doneSets}
        total={allSets.length}
        label="Workout progress"
      />

      <AppText variant="h1">{exercise.name}</AppText>

      {previous ? (
        <AppText variant="printed" color="muted">
          {`last time ${previous.sets
            .map(
              s =>
                `${s.weight === null ? '' : `${s.weight.toFixed(1)}×`}${s.reps}`,
            )
            .join(' · ')}`}
        </AppText>
      ) : null}

      <View style={styles.sets}>
        {exercise.sets.map(set => (
          <SetRow
            key={set.id}
            setNumber={set.setNumber}
            targetReps={set.targetReps}
            targetWeight={set.targetWeight}
            actualReps={
              activeSet?.id === set.id ? active.reps : set.actualReps
            }
            actualWeight={
              activeSet?.id === set.id ? active.weight : set.actualWeight
            }
            status={set.status}
            isUnplanned={set.isUnplanned}
            isActive={activeSet?.id === set.id}
            unit={unit}
            increment={increment}
            onAdjustWeight={active.adjustWeight}
            onAdjustReps={active.adjustReps}
            onComplete={onComplete}
          />
        ))}
      </View>

      <View style={styles.pair}>
        <View style={styles.grow}>
          <Button
            label="Add set"
            variant="ghost"
            size="sm"
            onPress={() => addSet.mutate(exercise.id)}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label="Skip set"
            variant="ghost"
            size="sm"
            disabled={!activeSet}
            onPress={() => activeSet && skip.mutate(activeSet.id)}
          />
        </View>
      </View>

      {next ? (
        <Button
          label={`Next — ${next.name}`}
          variant="secondary"
          size="sm"
          onPress={() => {
            active.reset();
            setIndex(index + 1);
          }}
        />
      ) : (
        <Button
          label="Finish workout"
          onPress={() => navigation.navigate('WorkoutComplete')}
        />
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          skipExercise.mutate(exercise.id, {
            onSuccess: () => {
              active.reset();
              if (next) {
                setIndex(index + 1);
              }
            },
          });
        }}
        style={styles.quiet}>
        {/* Ochre, never red: skipping is a decision, not an error. */}
        <AppText variant="small" color="short">
          Skip this exercise
        </AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  header: {flexDirection: 'row', alignItems: 'flex-start', gap: space.md},
  grow: {flex: 1},
  sets: {marginTop: space.xs},
  pair: {flexDirection: 'row', gap: space.sm},
  quiet: {alignItems: 'center', paddingVertical: space.sm},
});
```

- [ ] **Step 6: Register the route**

In `src/navigation/TodayStack.tsx`:

```tsx
import {WorkoutScreen} from '@/features/workout/WorkoutScreen';
// ...
      <Stack.Screen name="Workout" component={WorkoutScreen} />
```

- [ ] **Step 7: Run everything**

```bash
npx jest WorkoutScreen
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add the workout screen"
```

---

## Task 12: The two summaries

Designs 10 and 11. One reads a single exercise; the other reads the whole session and is where the workout is actually saved.

**Files:**
- Create: `src/features/workout/ExerciseSummaryScreen.tsx`, `src/features/workout/WorkoutCompleteScreen.tsx`
- Modify: `src/navigation/TodayStack.tsx`
- Test: `__tests__/features/workout/summaries.test.tsx`

**Interfaces:**
- Consumes: `aggregateExercise`, `sessionVolume`, `completionPercent`, `countByStatus` (Task 3); `compareSet`, `describeComparison` (Task 2); `LedgerTable`, `BigNumber`, `ProgressBar`, `StatusChip` (Task 9); `useFinishWorkout` (Task 10).
- Produces: `ExerciseSummaryScreen` (reads `route.params.exerciseIndex`), `WorkoutCompleteScreen`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/workout/summaries.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  getActiveSession,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseSummaryScreen} from '@/features/workout/ExerciseSummaryScreen';
import {WorkoutCompleteScreen} from '@/features/workout/WorkoutCompleteScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    popToTop: mockPopToTop,
  }),
  useRoute: () => ({params: {exerciseIndex: 0}}),
}));

describe('the workout summaries', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const wrap = (ui: React.ReactElement) =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>{ui}</NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
    // Real targets, so set 3 below is a genuine mixed case decided by volume
    // rather than a bodyweight comparison on reps alone.
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockPopToTop.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** Records the three bench sets as 10x30, 12x30, 8x32.5 — the design's data. */
  const recordBench = async () => {
    const session = (await getActiveSession(ctx.db))!;
    const [a, b, c] = session.exercises[0]!.sets;
    await completeSet(ctx.db, a!.id, {actualReps: 10, actualWeight: 30});
    await completeSet(ctx.db, b!.id, {actualReps: 12, actualWeight: 30});
    await completeSet(ctx.db, c!.id, {actualReps: 8, actualWeight: 32.5});
  };

  describe('ExerciseSummaryScreen', () => {
    it('reads out every set against its target', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);

      expect(await view.findByText('Bench Press')).toBeTruthy();
      expect(view.getByText('3 of 3 sets recorded')).toBeTruthy();
      expect(view.getByText('even')).toBeTruthy();
      expect(view.getByText('+2 reps')).toBeTruthy();
      // 8 x 32.5 = 260 against 300: heavier but shorter is still below.
      expect(view.getByText('−40 kg vol')).toBeTruthy();
    });

    it('totals the volume and the gap to target', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);
      // 300 + 360 + 260 = 920 against a target of 900.
      expect(await view.findByText('920 kg')).toBeTruthy();
      expect(view.getByText('+20')).toBeTruthy();
    });

    it('reports a skipped set rather than hiding it', async () => {
      const session = (await getActiveSession(ctx.db))!;
      const [a, b, c] = session.exercises[0]!.sets;
      await completeSet(ctx.db, a!.id, {actualReps: 10, actualWeight: 30});
      await skipSet(ctx.db, b!.id);
      await skipSet(ctx.db, c!.id);

      const view = await wrap(<ExerciseSummaryScreen />);
      expect(await view.findByText('1 of 3 sets recorded')).toBeTruthy();
      expect(view.getAllByText('Skipped').length).toBe(2);
    });

    it('moves on to the next exercise', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);
      await fireEvent.press(await view.findByText(/Next — Cable Fly/));
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('WorkoutCompleteScreen', () => {
    it('reports the completion percentage of the plan', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      // Three of six planned sets recorded.
      expect(await view.findByText('50')).toBeTruthy();
      expect(view.getByText('% of plan')).toBeTruthy();
    });

    it('breaks the session down against target', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      await view.findByText('50');
      expect(view.getByText('Achieved')).toBeTruthy();
      expect(view.getByText('Exceeded')).toBeTruthy();
      expect(view.getByText('Below')).toBeTruthy();
    });

    it('counts exercises and sets', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('3 / 6')).toBeTruthy();
    });

    it('totals the volume lifted', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('920 kg')).toBeTruthy();
    });

    it('saves the workout and leaves', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      await fireEvent.press(await view.findByText('Save workout'));

      await waitFor(async () => {
        expect(await getActiveSession(ctx.db)).toBeUndefined();
      });
      expect(mockPopToTop).toHaveBeenCalled();
    });

    // §19: finishing with sets outstanding says so rather than silently
    // recording them as skipped.
    it('warns about what has not been recorded before finishing', async () => {
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(
        await view.findByText(/6 sets not recorded/i),
      ).toBeTruthy();
    });

    it('reads a session that is already finished without offering to save', async () => {
      await recordBench();
      const session = (await getActiveSession(ctx.db))!;
      const {finishWorkout} = require('@/repositories/sessionRepo');
      await finishWorkout(ctx.db, session.id);

      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('Done')).toBeTruthy();
      expect(view.queryByText('Save workout')).toBeNull();
    });

    // A fully ad-hoc session has no plan to be a percentage of, so the screen
    // must not print a confident 0%.
    it('says so when there was no plan to measure against', async () => {
      await ctx.db.run(sql`DELETE FROM performed_sets`);
      const session = (await getSessionForDate(ctx.db, Date.now()))!;
      expect(session.exercises.every(e => e.sets.length === 0)).toBe(true);

      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText(/Nothing was planned/i)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest summaries
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the exercise summary**

Create `src/features/workout/ExerciseSummaryScreen.tsx`:

```tsx
import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {StatusChip} from '@/ui/StatusChip';
import {ProgressBar} from '@/ui/ProgressBar';
import {LedgerTable, type LedgerRow} from '@/ui/LedgerTable';
import {useTheme, space} from '@/theme';
import {compareSet, describeComparison} from '@/domain/setComparison';
import {aggregateExercise} from '@/domain/sessionProgress';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useTodaySessionQuery} from './useSession';

const pair = (reps: number | null, weight: number | null): string => {
  if (reps === null) {
    return '—';
  }
  return weight === null ? `${reps}` : `${reps} × ${weight.toFixed(1)}`;
};

/** Design 10: the §16 table for one exercise, plus its §26 volume. */
export function ExerciseSummaryScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {exerciseIndex} = useRoute().params as {exerciseIndex: number};

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();

  const exercise = session?.exercises[exerciseIndex];
  if (!session || !exercise) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const aggregate = aggregateExercise(exercise.sets, exercise.weightApplicable);
  const next = session.exercises[exerciseIndex + 1];

  const rows: LedgerRow[] = exercise.sets.map(set => {
    const comparison = compareSet(set);
    return {
      setNumber: set.setNumber,
      target: set.isUnplanned ? 'bonus' : pair(set.targetReps, set.targetWeight),
      actual: pair(set.actualReps, set.actualWeight),
      result:
        comparison.status === 'skipped'
          ? 'Skipped'
          : describeComparison(comparison, unit),
      status: comparison.status,
    };
  });

  const volumeGap =
    aggregate.actualVolume !== null && aggregate.targetVolume !== null
      ? aggregate.actualVolume - aggregate.targetVolume
      : null;

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.lg},
      ]}>
      <ProgressBar
        value={exerciseIndex + 1}
        total={session.exercises.length}
        label="Workout progress"
      />

      <StatusChip status={aggregate.status} label="Exercise complete" />
      <AppText variant="h1">{exercise.name}</AppText>
      <AppText variant="printed" color="muted">
        {`${aggregate.completedSets} of ${aggregate.plannedSets} sets recorded`}
      </AppText>

      <LedgerTable rows={rows} />

      {aggregate.actualVolume !== null ? (
        <View style={styles.stats}>
          <Card>
            <AppText variant="eyebrow" color="muted">
              Volume
            </AppText>
            <AppText variant="inkNum">
              {`${aggregate.actualVolume} ${unit}`}
            </AppText>
          </Card>
          <Card>
            <AppText variant="eyebrow" color="muted">
              vs target
            </AppText>
            {/* Ochre when short, never red. */}
            <AppText
              variant="inkNum"
              color={
                volumeGap === null || volumeGap === 0
                  ? 'ink'
                  : volumeGap > 0
                    ? 'gain'
                    : 'short'
              }>
              {volumeGap === null
                ? '—'
                : `${volumeGap > 0 ? '+' : volumeGap < 0 ? '−' : ''}${Math.abs(
                    volumeGap,
                  )}`}
            </AppText>
          </Card>
        </View>
      ) : null}

      <Button
        label={next ? `Next — ${next.name}` : 'Back to the workout'}
        onPress={() => navigation.goBack()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  stats: {flexDirection: 'row', gap: space.sm},
});
```

- [ ] **Step 4: Write the complete screen**

Create `src/features/workout/WorkoutCompleteScreen.tsx`:

```tsx
import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Button} from '@/ui/Button';
import {Card} from '@/ui/Card';
import {BigNumber} from '@/ui/BigNumber';
import {StatusChip} from '@/ui/StatusChip';
import {ProgressBar} from '@/ui/ProgressBar';
import {useTheme, space} from '@/theme';
import {
  completionPercent,
  countByStatus,
  sessionVolume,
} from '@/domain/sessionProgress';
import {useSettingsQuery} from '@/features/settings/useSettings';
import {useTodaySessionQuery, useFinishWorkout} from './useSession';

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** Design 11: §19's summary, and the only place a workout is saved. */
export function WorkoutCompleteScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const {data: session} = useTodaySessionQuery();
  const {data: settings} = useSettingsQuery();
  const finish = useFinishWorkout();

  if (!session) {
    return <View style={[styles.root, {backgroundColor: colors.paper}]} />;
  }

  const unit = settings?.unit ?? 'kg';
  const allSets = session.exercises.flatMap(e => e.sets);
  const plannedSets = allSets.filter(s => !s.isUnplanned);
  const doneSets = allSets.filter(s => s.status === 'completed');
  const pendingSets = allSets.filter(s => s.status === 'pending');

  const percent = completionPercent(allSets);
  const counts = countByStatus(allSets);
  const volume = sessionVolume(session.exercises);
  const doneExercises = session.exercises.filter(
    e => e.status === 'completed',
  ).length;

  const isOpen = session.status === 'in_progress';

  return (
    <ScrollView
      style={{backgroundColor: colors.paper}}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + space.xl},
      ]}>
      <View style={styles.headerBlock}>
        <AppText variant="eyebrow" color="muted">
          {longDate(session.date)}
        </AppText>
        <AppText variant="h1">{`${session.dayName} done`}</AppText>
      </View>

      {percent === null ? (
        <AppText variant="body" color="muted">
          Nothing was planned for this session, so there is no percentage to
          report — just what you actually did.
        </AppText>
      ) : (
        <>
          <BigNumber value={String(percent)} suffix="% of plan" />
          <ProgressBar
            value={doneSets.filter(s => !s.isUnplanned).length}
            total={plannedSets.length}
            variant="gain"
            label="Completion"
          />
        </>
      )}

      <View style={styles.stats}>
        <Card>
          <AppText variant="eyebrow" color="muted">
            Exercises
          </AppText>
          <AppText variant="inkNum">
            {`${doneExercises} / ${session.exercises.length}`}
          </AppText>
        </Card>
        <Card>
          <AppText variant="eyebrow" color="muted">
            Sets
          </AppText>
          <AppText variant="inkNum">
            {`${doneSets.filter(s => !s.isUnplanned).length} / ${
              plannedSets.length
            }`}
          </AppText>
        </Card>
      </View>

      <Card>
        <AppText variant="eyebrow" color="muted">
          Against target
        </AppText>
        {(
          [
            ['achieved', counts.achieved],
            ['exceeded', counts.exceeded],
            ['below', counts.below],
            ['skipped', counts.skipped],
          ] as const
        ).map(([status, count]) => (
          <View key={status} style={styles.row}>
            <StatusChip status={status} />
            <AppText variant="inkNum">{String(count)}</AppText>
          </View>
        ))}
        <View style={[styles.divider, {backgroundColor: colors.ruleSoft}]} />
        <View style={styles.row}>
          <AppText variant="printed" color="muted">
            total volume
          </AppText>
          <AppText variant="inkNum">{`${volume} ${unit}`}</AppText>
        </View>
      </Card>

      {isOpen && pendingSets.length > 0 ? (
        <AppText variant="small" color="short">
          {`${pendingSets.length} ${
            pendingSets.length === 1 ? 'set' : 'sets'
          } not recorded. Saving marks them skipped.`}
        </AppText>
      ) : null}

      <Button
        label={isOpen ? 'Save workout' : 'Done'}
        disabled={finish.isPending}
        onPress={() => {
          if (!isOpen) {
            navigation.popToTop();
            return;
          }
          finish.mutate(session.id, {onSuccess: () => navigation.popToTop()});
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  headerBlock: {gap: 2},
  stats: {flexDirection: 'row', gap: space.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  divider: {height: 1, marginVertical: space.md},
});
```

- [ ] **Step 5: Register both routes**

In `src/navigation/TodayStack.tsx`:

```tsx
import {ExerciseSummaryScreen} from '@/features/workout/ExerciseSummaryScreen';
import {WorkoutCompleteScreen} from '@/features/workout/WorkoutCompleteScreen';
// ...
      <Stack.Screen name="ExerciseSummary" component={ExerciseSummaryScreen} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} />
```

- [ ] **Step 6: Run everything**

```bash
npx jest summaries
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the exercise and workout summaries"
```

---

## Task 13: Adding an exercise that was never planned

§21 and D3. The designs do not draw this control — design 09 shows Add set, Skip set, Next and Skip exercise, and no way to add an exercise. The phase gate requires it (*"add an unplanned exercise and an extra set"*), so it is built, and the departure from the drawn design is deliberate and recorded.

**Files:**
- Create: `src/features/workout/WorkoutExercisePickerScreen.tsx`
- Modify: `src/features/workout/WorkoutScreen.tsx`, `src/navigation/TodayStack.tsx`
- Test: `__tests__/features/workout/WorkoutExercisePicker.test.tsx`

**Interfaces:**
- Consumes: `useExerciseListQuery`, `useDebounced`, `MUSCLE_FILTERS` (Phase 1); `useAddExercise`, `useTodaySessionQuery` (Task 10); `SearchField`, `Chip`, `Card` (Phases 1–2).
- Produces: `WorkoutExercisePickerScreen`.

> **Single-select, unlike the plan's picker.** Mid-workout you are adding the one thing you decided to do, and walking back with it immediately is faster than building a selection. The plan's picker is multi-select because building a week means adding twenty-five exercises at once; this is the opposite situation.

- [ ] **Step 1: Write the failing test**

Create `__tests__/features/workout/WorkoutExercisePicker.test.tsx`:

```tsx
import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {startWorkout, getActiveSession} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: jest.fn()}),
}));

describe('WorkoutExercisePickerScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <WorkoutExercisePickerScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('dip','Parallel Bar Dip','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench']),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('lists the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Parallel Bar Dip')).toBeTruthy();
  });

  it('adds the exercise on one tap and returns', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Parallel Bar Dip'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const session = (await getActiveSession(ctx.db))!;
    expect(session.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Parallel Bar Dip',
    ]);
  });

  // D3: no planned_exercise_id is exactly what keeps bonus work out of the
  // completion percentage.
  it('adds it as unplanned, with a set ready to record', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Parallel Bar Dip'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const session = (await getActiveSession(ctx.db))!;
    const added = session.exercises[1]!;
    expect(added.plannedExerciseId).toBeNull();
    expect(added.sets).toHaveLength(1);
    expect(added.sets[0]!.isUnplanned).toBe(true);
    expect(added.sets[0]!.targetReps).toBeNull();
  });

  it('narrows the list as the user searches', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'dip',
    );
    await waitFor(() => {
      expect(view.queryByText('Bench Press')).toBeNull();
      expect(view.getByText('Parallel Bar Dip')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest WorkoutExercisePicker
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the screen**

Create `src/features/workout/WorkoutExercisePickerScreen.tsx`:

```tsx
import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppText} from '@/ui/Text';
import {Card} from '@/ui/Card';
import {Chip} from '@/ui/Chip';
import {SearchField} from '@/ui/SearchField';
import {useTheme, space} from '@/theme';
import {MUSCLE_FILTERS} from '@/features/exercises/muscles';
import {useDebounced} from '@/features/exercises/useDebounced';
import {useExerciseListQuery} from '@/features/exercises/useExercises';
import {useTodaySessionQuery, useAddExercise} from './useSession';

/**
 * Adding one exercise mid-workout (§21, D3).
 *
 * Single-select and immediate, unlike the plan's picker: here you are adding
 * the one thing you just decided to do, and a selection step would be pure
 * friction with a barbell waiting.
 */
export function WorkoutExercisePickerScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const {data: session} = useTodaySessionQuery();
  const add = useAddExercise();

  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const settledSearch = useDebounced(search, 250);
  const filter =
    MUSCLE_FILTERS.find(f => f.label === group) ?? MUSCLE_FILTERS[0]!;

  const {data: exercises} = useExerciseListQuery({
    search: settledSearch || undefined,
    muscles: filter.values.length ? filter.values : undefined,
  });

  const header = (
    <View style={styles.header}>
      <AppText variant="eyebrow" color="muted">
        Add to this workout
      </AppText>
      <AppText variant="h1">Pick an exercise</AppText>
      <AppText variant="small" color="muted">
        Added as bonus work — it never counts against your plan.
      </AppText>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
      />
      <View style={styles.chips}>
        {MUSCLE_FILTERS.map(f => (
          <Chip
            key={f.label}
            label={f.label}
            selected={group === f.label}
            onPress={() => setGroup(f.label)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: colors.paper}]}>
      <FlatList
        data={exercises ?? []}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {paddingTop: insets.top + space.xl},
        ]}
        renderItem={({item}) => (
          <Card
            onPress={() => {
              if (!session || add.isPending) {
                return;
              }
              add.mutate(
                {sessionId: session.id, exerciseId: item.id},
                {onSuccess: () => navigation.goBack()},
              );
            }}>
            <AppText variant="bodyStrong">{item.name}</AppText>
            <AppText variant="small" color="muted">
              {item.equipment ?? 'No equipment'}
            </AppText>
            {!item.weightApplicable ? (
              <AppText variant="monoSmall" color="short">
                No weight
              </AppText>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxxl,
    gap: space.sm,
  },
  header: {gap: space.md, marginBottom: space.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: space.sm},
});
```

- [ ] **Step 4: Reach it from the workout**

In `src/features/workout/WorkoutScreen.tsx`, add a third control beside Add set and Skip set. Replace the `styles.pair` block with:

```tsx
      <View style={styles.pair}>
        <View style={styles.grow}>
          <Button
            label="Add set"
            variant="ghost"
            size="sm"
            onPress={() => addSet.mutate(exercise.id)}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label="Skip set"
            variant="ghost"
            size="sm"
            disabled={!activeSet}
            onPress={() => activeSet && skip.mutate(activeSet.id)}
          />
        </View>
      </View>

      <Button
        label="Add an exercise"
        variant="ghost"
        size="sm"
        onPress={() => navigation.navigate('WorkoutExercisePicker')}
      />
```

- [ ] **Step 5: Register the route**

In `src/navigation/TodayStack.tsx`:

```tsx
import {WorkoutExercisePickerScreen} from '@/features/workout/WorkoutExercisePickerScreen';
// ...
      <Stack.Screen
        name="WorkoutExercisePicker"
        component={WorkoutExercisePickerScreen}
      />
```

- [ ] **Step 6: Record the departure from the design**

Add to `docs/deferred.md`, under a new `## Design departures` heading placed above `## Phase 5 — Polish`:

```markdown
## Design departures

### The workout screen has an "Add an exercise" control the design does not draw
**Added:** 2026-08-23, during Phase 3.

Design 09 shows Add set, Skip set, Next and Skip this exercise, and no way to
add an exercise mid-workout. Spec 6.5 and §21 both require one, and Phase 3's
gate explicitly asks for "an unplanned exercise", so it is built as a quiet
ghost button below the set controls.

It is deliberately understated because it is rare, and unplanned work is badged
rather than warned about (D3). If the design is ever revisited, this is the
control to place properly rather than the one to remove.

Affects: `src/features/workout/WorkoutScreen.tsx`.
```

- [ ] **Step 7: Run everything**

```bash
npx jest WorkoutExercisePicker WorkoutScreen
npm test
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add an unplanned exercise mid-workout"
```

---

## Task 14: The phase gate

**Files:** none — this task verifies.

- [ ] **Step 1: Re-read the deferred list**

```bash
cat docs/deferred.md
```

Task 7 should have removed the Phase 3 `sessionCount` entry; Task 13 should have added the design departure. Anything remaining that the user will see must be restated when this phase is declared complete.

- [ ] **Step 2: Build and install**

No native modules were added this phase, so Metro alone would do — but the gate is run on a release build, because debug timings are meaningless (Phase 1 measured 470 ms release against 1348–2605 ms debug).

```bash
cd android && ./gradlew app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.onemorerep
adb shell am start -n com.onemorerep/.MainActivity
```

- [ ] **Step 3: Walk the gate**

The spec's Phase 3 gate is: *start today's workout, record every set, skip one, add an unplanned exercise and an extra set, force-kill the app and resume, finish and read the summary.*

1. Open **Today**. If today is not set up, set it up on the Plan tab first — the screen says so.
2. On a workout day, the screen lists each exercise with its target in printed type, and **Start workout**.
3. Tap it. The workout screen opens on the first exercise, set 1 active, weight and reps **already holding the target**.
4. Tap the check. The set records, the verdict chip appears, and set 2 becomes active by itself.
5. On set 2, raise the reps once and tap the check. The chip reads **+1 rep** in green.
6. On set 3, lower the weight and raise the reps so both move. The chip should read a **volume** verdict in ochre or green — that is spec 5.1's mixed rule, and the one worth seeing on a real screen.
7. The exercise summary opens. Check the ledger table's three rows, the volume, and the gap against target.
8. Back on the workout, **Skip set** on the next exercise, then **Add set** and record it — the bonus set shows a **Bonus** badge and no target.
9. **Add an exercise**, pick anything, and record its set.
10. **Force-kill the app** from the recents switcher, reopen it. Today shows **Continue workout** with the count of what was recorded. Continue, and check nothing was lost.
11. **Finish workout**. The summary reports the percentage, the achieved/exceeded/below/skipped breakdown, and total volume. If sets remain, it says how many will be marked skipped.
12. **Save workout**. Today now reads as done.
13. Switch the device between light and dark mode and check every workout screen.
14. **§34 check:** recording one on-plan set should be a single tap and feel instant.

- [ ] **Step 4: Confirm the exit criteria**

```bash
npm test
npm run typecheck
npm run lint
grep -rn "#[0-9A-Fa-f]\{6\}\|fontSize:" src/features src/ui && echo "FAIL: literal found" || echo "ok"
grep -rn "getDay()" src --include=*.ts --include=*.tsx | grep -v "domain/weekday.ts" | grep -vE ":\s*(\*|//)" && echo "FAIL" || echo "ok"
find android -name "*.kt" | wc -l   # still 2
```

- [ ] **Step 5: Verify the record against the database**

Input injection is blocked on MIUI, so read the rows directly.

```bash
adb exec-out run-as com.onemorerep cat databases/onemorerep.db > ./session-check.db
node - <<'EOF'
const D=require('better-sqlite3');
const db=new D('./session-check.db',{readonly:true});
const q=s=>db.prepare(s).all();
const one=s=>db.prepare(s).get();
console.log('user_version    ', db.pragma('user_version',{simple:true}), '(expect 5)');
console.log('sessions        ', q('SELECT id,date,status,day_name_snapshot FROM workout_sessions ORDER BY date'));
console.log('open sessions   ', one("SELECT COUNT(*) c FROM workout_sessions WHERE status='in_progress'").c);
console.log('sets by status  ', q('SELECT status, COUNT(*) n FROM performed_sets GROUP BY status'));
console.log('unplanned sets  ', one('SELECT COUNT(*) c FROM performed_sets WHERE is_unplanned=1').c, '(expect >= 1)');
console.log('unplanned exers ', one('SELECT COUNT(*) c FROM performed_exercises WHERE planned_exercise_id IS NULL').c, '(expect >= 1)');
console.log('actuals on pend ', one("SELECT COUNT(*) c FROM performed_sets WHERE status!='completed' AND actual_reps IS NOT NULL").c, '(MUST be 0)');
console.log('targets on plan ', one('SELECT COUNT(*) c FROM performed_sets WHERE is_unplanned=0 AND target_reps IS NULL').c, '(MUST be 0)');
console.log('orphan sets     ', one('SELECT COUNT(*) c FROM performed_sets WHERE performed_exercise_id NOT IN (SELECT id FROM performed_exercises)').c, '(MUST be 0)');
console.log('orphan exers    ', one('SELECT COUNT(*) c FROM performed_exercises WHERE workout_session_id NOT IN (SELECT id FROM workout_sessions)').c, '(MUST be 0)');
db.close();
EOF
rm -f ./session-check.db
```

The two lines marked **MUST be 0** are the ones that matter most:

- **Actuals on a set that is not completed** would mean the pre-fill is being stored, which is exactly the crash-safety failure spec 6.2 exists to prevent.
- **A planned set with no target** would mean the snapshot did not happen, and history would have nothing to compare against.

- [ ] **Step 6: Prove history cannot be rewritten**

This is §39 on the device rather than in a test. After finishing a workout, go to **Plan**, open the day you just trained, change a target, and save. Then re-read the database:

```bash
adb exec-out run-as com.onemorerep cat databases/onemorerep.db > ./session-check.db
node -e "
const D=require('better-sqlite3');const db=new D('./session-check.db',{readonly:true});
console.log(db.prepare('SELECT set_number,target_reps,target_weight,actual_reps,actual_weight FROM performed_sets ORDER BY set_number').all());
console.log('plan versions:', db.prepare('SELECT COUNT(*) c FROM plan_versions').get().c, '(expect 2 — the edit forked)');
db.close();"
rm -f ./session-check.db
```

The performed sets must be **unchanged**, and there must now be a second plan version — the edit forked because a workout had been performed against the first (Task 7).

- [ ] **Step 7: Tag**

```bash
git tag -a phase-3 -m "Phase 3: today and workout complete"
```

---

## Phase 3 Exit Criteria

- [ ] `npm test`, `npm run typecheck` and `npm run lint` all pass.
- [ ] A workout can be started, recorded set by set, and finished, on a device.
- [ ] A set that has not been completed holds **no** actuals in the database.
- [ ] Every planned set carries a target snapshot; editing the plan afterwards leaves it untouched.
- [ ] Editing a plan that has been trained against **forks** a new version, even on the same day.
- [ ] A skipped set is stored as skipped, not as pending and not as completed.
- [ ] Unplanned work is recorded, badged, and excluded from the completion percentage.
- [ ] Force-killing mid-workout loses nothing already recorded, and Today offers to continue.
- [ ] A session left open overnight closes as abandoned on next launch, keeping its sets.
- [ ] Completion percentage never exceeds 100.
- [ ] Volume is omitted, not zeroed, for bodyweight exercises.
- [ ] Below-target is ochre everywhere it appears; nothing in this phase is red.
- [ ] No literal hex or `fontSize` outside `src/theme/tokens.ts`; no `getDay()` outside `src/domain/weekday.ts`.
- [ ] Both themes render legibly on all five new screens.
- [ ] `docs/deferred.md` no longer lists the `sessionCount` item, and does list the design departure.

---

## Self-Review

**Spec coverage.** §4.3's three tables are Task 1. §5.1 is Task 2; §5.2, §5.3 and §5.5 are Task 3. §6.1 is Task 4; §6.2 is enforced by Task 4's schema and Task 11's store, and asserted in both. §6.3 is Tasks 5 and 11. §6.4's crash safety is the one-transaction-per-set rule in Task 5, and its stale-session rule is Task 6 plus the launch hook in Task 10. §6.5 is Tasks 5, 11 and 13. §6.6 is Task 8. §6.7 is Tasks 6 and 12. Of the requirements: §12 is Task 10, §13–§14 Task 11, §15–§16 Tasks 2 and 12, §17 Tasks 3 and 12, §18 Tasks 10 and 11, §19 Task 12, §20 Tasks 6 and 10, §21 Tasks 5, 11 and 13, §26 Task 3, §33 Task 10, §34 the whole of Task 11, §35 Task 11, §36 Task 8, §39 Tasks 1, 4 and 7. All six approved designs (06–11) have a task.

**Deliberate gaps.** §37 personal records is not in §41's MVP list and is not built. §22–§25 and §27 are History, which is Phase 4 — `resolveDay` is deliberately **not** built here even though Task 6's rollover produces the `abandoned` status it will read, because Phase 4 owns the timeline that consumes it. A fully ad-hoc workout with no plan is supported by the schema and handled by `completionPercent` returning null, but there is no UI to start one; the designs do not draw it and §41 does not ask for it. Editing a set from a *previous* day is not reachable: §14's editability is satisfied within the live session, which is where the design puts it.

**Type consistency.** `ProgressSet` (Task 3) is the shape every aggregate reads, and `SessionSet` (Task 4) is structurally compatible with it, which is what lets the screens pass session rows straight into the domain functions. `ComparisonStatus` (Task 2) is the same union `StatusChip` and `LedgerTable` key their colour maps on (Task 9). `ItemStatus` is `'pending' | 'completed' | 'skipped'` everywhere — sets and exercises share it. `TodayStackParamList` is declared in Task 10 and consumed by Tasks 10–13.

**Risks.** Three, all gated rather than assumed. The first is the pre-fill: it lives in Zustand and must never reach the database before the check is tapped, so both Task 11's tests and Task 14's database read assert that no incomplete set holds actuals. The second is the auto-advance in Task 11 — deriving the active set from "the first pending one" is simple and survives a refetch, but it means completing set 2 out of order jumps back to set 1; the design records sets in order and that is accepted, not overlooked. The third is that `WorkoutScreen` re-reads the whole session on every mutation; at five exercises and fifteen sets that is a three-query read of a few dozen rows, which is nothing, but §34 asks for a set in under a second and Task 14 step 3.14 checks it on the device rather than trusting the arithmetic.
