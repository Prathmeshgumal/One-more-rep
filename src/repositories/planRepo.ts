import {and, asc, desc, eq, inArray, isNull, or, gt, lte, sql} from 'drizzle-orm';
import {
  planVersions,
  planDays,
  plannedExercises,
  plannedSets,
  exercises,
  type PlanVersionRow,
} from '@/db/schema';
import type {AppDatabase} from '@/db/types';
import {WEEKDAY_NAMES} from '@/domain/weekday';
import {emptyDraft, type PlanDraft} from '@/domain/planDraft';

export type PlanSet = {
  setNumber: number;
  targetReps: number;
  targetWeight: number | null;
};

export type PlanExercise = {
  plannedExerciseId: string;
  exerciseId: string;
  /** Joined from the library, so a screen never has to fetch names itself. */
  name: string;
  equipment: string | null;
  weightApplicable: boolean;
  sets: PlanSet[];
};

export type PlanDayView = {
  id: string;
  weekday: number;
  customName: string | null;
  isRestDay: boolean;
  exercises: PlanExercise[];
};

/** `days` is always length 7 and indexed by weekday — days[0] is Monday. */
export type Plan = {version: PlanVersionRow; days: PlanDayView[]};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Loads a version's whole tree in three queries, not one per day.
 *
 * Seven days times five exercises is 35 round trips if done naively, on the
 * screen the user opens most often.
 */
async function loadTree(
  db: AppDatabase,
  version: PlanVersionRow,
): Promise<Plan> {
  const dayRows = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planVersionId, version.id))
    .orderBy(asc(planDays.weekday));

  const dayIds = dayRows.map(d => d.id);

  const exerciseRows = dayIds.length
    ? await db
        .select({
          id: plannedExercises.id,
          planDayId: plannedExercises.planDayId,
          exerciseId: plannedExercises.exerciseId,
          orderIndex: plannedExercises.orderIndex,
          name: exercises.name,
          equipment: exercises.equipment,
          weightApplicable: exercises.weightApplicable,
        })
        .from(plannedExercises)
        .innerJoin(exercises, eq(exercises.id, plannedExercises.exerciseId))
        .where(inArray(plannedExercises.planDayId, dayIds))
        .orderBy(asc(plannedExercises.orderIndex))
    : [];

  const setRows = exerciseRows.length
    ? await db
        .select()
        .from(plannedSets)
        .where(
          inArray(
            plannedSets.plannedExerciseId,
            exerciseRows.map(e => e.id),
          ),
        )
        .orderBy(asc(plannedSets.setNumber))
    : [];

  const setsByExercise = new Map<string, PlanSet[]>();
  for (const row of setRows) {
    const list = setsByExercise.get(row.plannedExerciseId) ?? [];
    list.push({
      setNumber: row.setNumber,
      targetReps: row.targetReps,
      targetWeight: row.targetWeight,
    });
    setsByExercise.set(row.plannedExerciseId, list);
  }

  const exercisesByDay = new Map<string, PlanExercise[]>();
  for (const row of exerciseRows) {
    const list = exercisesByDay.get(row.planDayId) ?? [];
    list.push({
      plannedExerciseId: row.id,
      exerciseId: row.exerciseId,
      name: row.name,
      equipment: row.equipment,
      weightApplicable: row.weightApplicable,
      sets: setsByExercise.get(row.id) ?? [],
    });
    exercisesByDay.set(row.planDayId, list);
  }

  // Indexed by weekday rather than returned in row order: a screen says
  // days[weekday] and a missing day is a loud failure, not a silent gap.
  const byWeekday = new Map(dayRows.map(d => [d.weekday, d]));
  const days: PlanDayView[] = WEEKDAY_NAMES.map((_, weekday) => {
    const row = byWeekday.get(weekday);
    if (!row) {
      throw new Error(
        `Plan version ${version.id} is missing weekday ${weekday}.`,
      );
    }
    return {
      id: row.id,
      weekday: row.weekday,
      customName: row.customName,
      isRestDay: row.isRestDay,
      exercises: exercisesByDay.get(row.id) ?? [],
    };
  });

  return {version, days};
}

export async function getActivePlan(
  db: AppDatabase,
): Promise<Plan | undefined> {
  const rows = await db
    .select()
    .from(planVersions)
    .where(isNull(planVersions.effectiveTo))
    .limit(1);
  const version = rows[0];
  return version ? loadTree(db, version) : undefined;
}

/**
 * The version covering `at` — the query that makes history immutable.
 *
 * Phase 4's day resolver is built on this. It is here rather than there
 * because Phase 2's gate is "an edit forks a new version", and proving that
 * means proving an older date still resolves to the older targets.
 */
export async function getPlanForDate(
  db: AppDatabase,
  at: number,
): Promise<Plan | undefined> {
  const rows = await db
    .select()
    .from(planVersions)
    .where(
      and(
        lte(planVersions.effectiveFrom, at),
        or(isNull(planVersions.effectiveTo), gt(planVersions.effectiveTo, at)),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom))
    .limit(1);
  const version = rows[0];
  return version ? loadTree(db, version) : undefined;
}

export async function listPlanVersions(
  db: AppDatabase,
): Promise<PlanVersionRow[]> {
  return db
    .select()
    .from(planVersions)
    .orderBy(desc(planVersions.effectiveFrom));
}

export async function createPlan(
  db: AppDatabase,
  opts: {name?: string; now?: number} = {},
): Promise<Plan> {
  const existing = await getActivePlan(db);
  if (existing) {
    throw new Error('A plan is already active. Edit it instead of creating another.');
  }

  const now = opts.now ?? Date.now();
  const draft = emptyDraft(opts.name);
  const versionId = newId('pv');

  await db.run(sql.raw('BEGIN'));
  try {
    await db.insert(planVersions).values({
      id: versionId,
      name: draft.name,
      effectiveFrom: now,
      effectiveTo: null,
    });
    await db.insert(planDays).values(
      draft.days.map((day, weekday) => ({
        id: newId('pd'),
        planVersionId: versionId,
        weekday,
        customName: day.customName,
        isRestDay: day.isRestDay,
      })),
    );
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }

  const created = await getActivePlan(db);
  if (!created) {
    throw new Error('Plan could not be created.');
  }
  return created;
}

/** Strips ids so the result can be edited by the pure functions in domain/. */
export function toDraft(plan: Plan): PlanDraft {
  return {
    name: plan.version.name,
    days: plan.days.map(day => ({
      customName: day.customName,
      isRestDay: day.isRestDay,
      exercises: day.exercises.map(exercise => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets.map(set => ({
          targetReps: set.targetReps,
          targetWeight: set.targetWeight,
        })),
      })),
    })),
  };
}
