import {and, asc, eq, inArray, sql} from 'drizzle-orm';
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
