import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {exercises} from './exercises';

/**
 * A snapshot of the routine, valid for a span of time (spec 4.2).
 *
 * Editing never mutates a version. The active version is closed and the whole
 * tree is deep-copied into a new one, so a workout performed last month still
 * resolves through the version that was active then — §32, and the reason this
 * table exists at all.
 *
 * Exactly one row may have `effective_to` NULL.
 */
export const planVersions = sqliteTable(
  'plan_versions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    effectiveFrom: integer('effective_from').notNull(),
    /** NULL means currently active. */
    effectiveTo: integer('effective_to'),
  },
  table => [
    index('plan_versions_effective_idx').on(
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

/**
 * One row per weekday per version — always seven, even when unconfigured.
 *
 * `weekday` is 0 = Monday … 6 = Sunday. This is not JavaScript's convention;
 * `Date.getDay()` is converted exactly once, in `weekdayIndex()`.
 *
 * An unconfigured day is `is_rest_day = 0` with no planned exercises, which is
 * distinct from a rest day and renders differently (design 02).
 */
export const planDays = sqliteTable(
  'plan_days',
  {
    id: text('id').primaryKey(),
    planVersionId: text('plan_version_id')
      .notNull()
      .references(() => planVersions.id, {onDelete: 'cascade'}),
    weekday: integer('weekday').notNull(),
    /** NULL falls back to the weekday's own name (§5). */
    customName: text('custom_name'),
    isRestDay: integer('is_rest_day', {mode: 'boolean'}).notNull(),
  },
  table => [
    index('plan_days_version_idx').on(table.planVersionId),
    uniqueIndex('plan_days_version_weekday_idx').on(
      table.planVersionId,
      table.weekday,
    ),
  ],
);

/** An exercise placed on a day, in a deliberate order (§10). */
export const plannedExercises = sqliteTable(
  'planned_exercises',
  {
    id: text('id').primaryKey(),
    planDayId: text('plan_day_id')
      .notNull()
      .references(() => planDays.id, {onDelete: 'cascade'}),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
  },
  table => [index('planned_exercises_day_idx').on(table.planDayId)],
);

/**
 * A target for one set (§9).
 *
 * A real table rather than a `sets: 3` integer, so a ramping 20×12 / 25×10 /
 * 30×8 needs no migration later. `target_weight` is NULL for bodyweight work —
 * never 0, which would log zero volume forever.
 */
export const plannedSets = sqliteTable(
  'planned_sets',
  {
    id: text('id').primaryKey(),
    plannedExerciseId: text('planned_exercise_id')
      .notNull()
      .references(() => plannedExercises.id, {onDelete: 'cascade'}),
    setNumber: integer('set_number').notNull(),
    targetReps: integer('target_reps').notNull(),
    targetWeight: real('target_weight'),
  },
  table => [index('planned_sets_exercise_idx').on(table.plannedExerciseId)],
);

export type PlanVersionRow = typeof planVersions.$inferSelect;
export type PlanDayRow = typeof planDays.$inferSelect;
export type PlannedExerciseRow = typeof plannedExercises.$inferSelect;
export type PlannedSetRow = typeof plannedSets.$inferSelect;
