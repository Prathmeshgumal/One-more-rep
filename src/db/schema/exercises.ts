import {sqliteTable, text, integer, index} from 'drizzle-orm/sqlite-core';

/**
 * The exercise library (§29, §30). Built-ins are seeded from free-exercise-db
 * (D12); custom exercises are created by the user and behave identically.
 *
 * Rows are soft-deleted only. An exercise referenced by a past workout must
 * never be hard-deleted, because §39 forbids history changing shape.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    /** JSON array of muscle names. Empty array when there are none. */
    secondaryMuscles: text('secondary_muscles').notNull(),
    equipment: text('equipment'),
    exerciseType: text('exercise_type').notNull(),
    instructions: text('instructions'),
    /**
     * Whether weight is meaningful for this movement (§26). A wrong value here
     * is silent and permanent — the exercise logs zero volume forever, and §39
     * forbids rewriting history. See docs/exercise-weight-review.md.
     */
    weightApplicable: integer('weight_applicable', {mode: 'boolean'}).notNull(),
    isCustom: integer('is_custom', {mode: 'boolean'}).notNull(),
    deletedAt: integer('deleted_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  table => [
    index('exercises_name_idx').on(table.name),
    index('exercises_primary_muscle_idx').on(table.primaryMuscle),
  ],
);

export type ExerciseRow = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
