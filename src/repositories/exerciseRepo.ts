import {and, asc, eq, inArray, isNull, sql} from 'drizzle-orm';
import {exercises, type ExerciseRow} from '@/db/schema';
import type {AppDatabase} from '@/db/types';

/** An exercise with its JSON muscle list parsed. */
export type Exercise = Omit<ExerciseRow, 'secondaryMuscles'> & {
  secondaryMuscles: string[];
};

export type ExerciseQuery = {
  search?: string;
  /**
   * Primary muscles to include. A group, not a single value: the upstream data
   * splits the back across lats, middle back, lower back and traps, so one
   * "Back" filter must match all four.
   */
  muscles?: readonly string[];
  includeDeleted?: boolean;
};

export type NewCustomExercise = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string | null;
  weightApplicable: boolean;
  instructions?: string | null;
};

export type CustomExercisePatch = Partial<NewCustomExercise>;

function hydrate(row: ExerciseRow): Exercise {
  let parsed: string[] = [];
  try {
    const value: unknown = JSON.parse(row.secondaryMuscles);
    if (Array.isArray(value)) {
      parsed = value.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    // A malformed muscle list is not worth failing a screen over; it renders
    // as "no secondary muscles" and the row is otherwise intact.
  }
  return {...row, secondaryMuscles: parsed};
}

/**
 * LIKE treats % and _ as wildcards; a user typing them means them literally.
 *
 * Escaping alone is not enough — SQLite has no default escape character, so
 * `\%` in a pattern is a literal backslash followed by a wildcard unless the
 * statement also carries `ESCAPE '\'`. Both halves live in `nameMatches` below
 * so they cannot drift apart.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, c => `\\${c}`);
}

function nameMatches(term: string) {
  const pattern = `%${escapeLike(term.toLowerCase())}%`;
  return sql`lower(${exercises.name}) LIKE ${pattern} ESCAPE '\\'`;
}

export async function listExercises(
  db: AppDatabase,
  query: ExerciseQuery = {},
): Promise<Exercise[]> {
  const conditions = [];
  if (!query.includeDeleted) {
    conditions.push(isNull(exercises.deletedAt));
  }
  const search = query.search?.trim();
  if (search) {
    conditions.push(nameMatches(search));
  }
  if (query.muscles && query.muscles.length > 0) {
    conditions.push(inArray(exercises.primaryMuscle, [...query.muscles]));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(exercises.name));

  return rows.map(hydrate);
}

export async function getExercise(
  db: AppDatabase,
  id: string,
): Promise<Exercise | undefined> {
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, id))
    .limit(1);
  const row = rows[0];
  return row ? hydrate(row) : undefined;
}

/** Every row, soft-deleted ones included — this counts storage, not choices. */
export async function countExercises(db: AppDatabase): Promise<number> {
  const rows = await db.select({n: sql<number>`count(*)`}).from(exercises);
  return rows[0]?.n ?? 0;
}

export async function createCustomExercise(
  db: AppDatabase,
  input: NewCustomExercise,
): Promise<Exercise> {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(exercises).values({
    id,
    name: input.name.trim(),
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: JSON.stringify(input.secondaryMuscles),
    equipment: input.equipment,
    exerciseType: 'strength',
    instructions: input.instructions ?? null,
    weightApplicable: input.weightApplicable,
    isCustom: true,
    deletedAt: null,
    updatedAt: Date.now(),
  });

  const created = await getExercise(db, id);
  if (!created) {
    throw new Error('Exercise could not be created.');
  }
  return created;
}

export async function updateCustomExercise(
  db: AppDatabase,
  id: string,
  patch: CustomExercisePatch,
): Promise<Exercise> {
  const values: Record<string, unknown> = {updatedAt: Date.now()};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.primaryMuscle !== undefined) {
    values.primaryMuscle = patch.primaryMuscle;
  }
  if (patch.secondaryMuscles !== undefined) {
    values.secondaryMuscles = JSON.stringify(patch.secondaryMuscles);
  }
  if (patch.equipment !== undefined) values.equipment = patch.equipment;
  if (patch.weightApplicable !== undefined) {
    values.weightApplicable = patch.weightApplicable;
  }
  if (patch.instructions !== undefined) values.instructions = patch.instructions;

  await db.update(exercises).set(values).where(eq(exercises.id, id));

  const updated = await getExercise(db, id);
  if (!updated) {
    throw new Error(`Exercise ${id} does not exist.`);
  }
  return updated;
}

/** Soft delete only — history may reference this row (§39). */
export async function softDeleteExercise(
  db: AppDatabase,
  id: string,
): Promise<void> {
  const now = Date.now();
  await db
    .update(exercises)
    .set({deletedAt: now, updatedAt: now})
    .where(eq(exercises.id, id));
}
