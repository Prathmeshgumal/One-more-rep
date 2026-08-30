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
    /**
     * What happened on this exercise today, in the user's own words. Per
     * session, not per exercise: "shoulder felt off" is about a Tuesday, not
     * about the overhead press.
     */
    notes: text('notes'),
    /**
     * Set when this slot was swapped for a different movement mid-workout
     * (U6). The plan link and the target are kept — the slot was served — and
     * this is what lets history say so, rather than silently claiming the
     * planned exercise was the one performed.
     */
    substitutedFromExerciseId: text('substituted_from_exercise_id').references(
      () => exercises.id,
    ),
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
  table => [index('performed_sets_exercise_idx').on(table.performedExerciseId)],
);

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type PerformedExerciseRow = typeof performedExercises.$inferSelect;
export type PerformedSetRow = typeof performedSets.$inferSelect;
