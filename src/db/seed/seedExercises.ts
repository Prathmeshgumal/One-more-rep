import {sql} from 'drizzle-orm';
import {exercises} from '@/db/schema';
import type {AppDatabase} from '@/db/types';
import {loadSeedExercises, type SeedExercise} from './index';

/**
 * Inserts in batches rather than one statement per row: ~800 individual
 * round trips is slow enough to be visible on first launch.
 */
const BATCH_SIZE = 100;

/**
 * Populates the exercise library on first launch.
 *
 * Idempotent by counting built-ins rather than by upsert, so a user's edits to
 * their own exercises are never touched. A future library refresh ships as a
 * migration that clears built-ins and re-seeds, not as a change here.
 */
export async function seedExercises(
  db: AppDatabase,
  data?: readonly SeedExercise[],
): Promise<{inserted: number}> {
  const existing = await db.all<{n: number}>(
    sql`SELECT COUNT(*) AS n FROM exercises WHERE is_custom = 0`,
  );
  if ((existing[0]?.n ?? 0) > 0) {
    return {inserted: 0};
  }

  // Loaded only now, past the point of no return: on every launch after the
  // first this function has already returned, and the 776 KB of seed data is
  // never touched.
  const now = Date.now();
  const rows = (data ?? loadSeedExercises()).map(e => ({
    id: e.id,
    name: e.name,
    primaryMuscle: e.primaryMuscle,
    secondaryMuscles: JSON.stringify(e.secondaryMuscles),
    equipment: e.equipment,
    exerciseType: e.exerciseType,
    instructions: e.instructions,
    weightApplicable: e.weightApplicable,
    isCustom: false,
    deletedAt: null,
    updatedAt: now,
  }));

  // Explicit BEGIN/COMMIT rather than db.transaction(): the callback form is
  // synchronous under better-sqlite3 and asynchronous under op-sqlite, so one
  // body cannot satisfy both. Same reasoning as src/db/migrate.ts.
  const started = Date.now();
  await db.run(sql.raw('BEGIN'));
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(exercises).values(rows.slice(i, i + BATCH_SIZE));
    }
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }

  // This runs once per install and holds the first launch behind a spinner,
  // so the number matters and is otherwise invisible. Development only.
  if (__DEV__) {
    console.log(
      `[seed] ${rows.length} exercises in ${Date.now() - started}ms`,
    );
  }

  return {inserted: rows.length};
}
