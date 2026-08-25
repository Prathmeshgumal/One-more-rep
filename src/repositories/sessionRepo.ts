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
  /** What happened on this exercise today, in the user's own words. */
  notes: string | null;
  /**
   * The movement this slot originally asked for, when it was swapped
   * mid-workout (U6). NULL for every exercise that was not.
   */
  substitutedFromName: string | null;
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

/**
 * Loads a session's whole tree in three queries, not one per exercise.
 *
 * A swap adds a fourth, and only when one actually happened — the names of
 * substituted-from movements are fetched in a single batch rather than per
 * row. An aliased self-join would have kept it at three, but `AppDatabase` is
 * a `'sync' | 'async'` union and a second join collapses the inferred row type
 * to `never`; a small extra query is a better trade than defeating the types.
 */
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
      notes: performedExercises.notes,
      substitutedFromExerciseId: performedExercises.substitutedFromExerciseId,
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

  // Only when something was actually swapped, which is almost never.
  const swappedIds = [
    ...new Set(
      exerciseRows
        .map(e => e.substitutedFromExerciseId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const swappedNames = new Map<string, string>();
  if (swappedIds.length > 0) {
    const rows = await db
      .select({id: exercises.id, name: exercises.name})
      .from(exercises)
      .where(inArray(exercises.id, swappedIds));
    for (const r of rows) {
      swappedNames.set(r.id, r.name);
    }
  }

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
      notes: e.notes,
      substitutedFromName:
        e.substitutedFromExerciseId === null
          ? null
          : (swappedNames.get(e.substitutedFromExerciseId) ?? null),
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

/**
 * Closes an exercise off, keeping what was done (U11).
 *
 * Everything still pending is skipped and the status is then **derived**, so
 * an exercise that was three-quarters done reads as completed rather than as
 * skipped. That is the whole difference from `skipExercise`, which writes
 * 'skipped' outright because it is a decision the user made about the exercise
 * as a whole rather than a summary of what happened in it.
 *
 * Reported from the device: "I cannot mark exercise 4 as done, the only option
 * I have is to skip."
 */
export async function finishExercise(
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
  await refreshExerciseStatus(db, performedExerciseId);
}

/** Loads one performed exercise, or explains that it is not there. */
async function requireExercise(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<typeof performedExercises.$inferSelect> {
  const rows = await db
    .select()
    .from(performedExercises)
    .where(eq(performedExercises.id, performedExerciseId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Exercise ${performedExerciseId} does not exist.`);
  }
  return row;
}

/** True once any set on this exercise has been completed or skipped. */
async function anySetDecided(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<boolean> {
  const sets = await db
    .select({status: performedSets.status})
    .from(performedSets)
    .where(eq(performedSets.performedExerciseId, performedExerciseId));
  return sets.some(set => set.status !== 'pending');
}

/** What happened on this exercise today, in the user's own words. */
export async function setExerciseNotes(
  db: AppDatabase,
  performedExerciseId: string,
  notes: string | null,
): Promise<void> {
  const trimmed = notes?.trim() ?? '';
  await db
    .update(performedExercises)
    // Empty is NULL, never '': a note nobody wrote and a note somebody erased
    // are the same thing, and two representations of it would mean two code
    // paths everywhere it is read.
    .set({notes: trimmed === '' ? null : trimmed})
    .where(eq(performedExercises.id, performedExerciseId));
}

/**
 * Substitutes a different movement into this slot (U6).
 *
 * The plan link and the rep targets are kept, because the slot is still being
 * served — a dumbbell press done because the rack was busy is the bench press
 * slot, not bonus work, and "% of plan" should say so. What changes is which
 * movement it was, and `substituted_from_exercise_id` is what lets history
 * report that rather than silently claiming the planned exercise happened.
 *
 * U7: refused once any set has been decided. Those sets belong to the old
 * movement and re-attributing them would be a lie. The honest move at that
 * point is to finish this exercise and add the new one separately, and the UI
 * says so.
 */
export async function swapExercise(
  db: AppDatabase,
  performedExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  const current = await requireExercise(db, performedExerciseId);

  if (await anySetDecided(db, performedExerciseId)) {
    throw new Error(
      'This exercise already recorded a set. Finish it and add the new one instead.',
    );
  }

  const rows = await db
    .select({weightApplicable: exercises.weightApplicable})
    .from(exercises)
    .where(eq(exercises.id, newExerciseId))
    .limit(1);
  const replacement = rows[0];
  if (!replacement) {
    throw new Error(`Exercise ${newExerciseId} does not exist.`);
  }

  await db.run(sql.raw('BEGIN'));
  try {
    await db
      .update(performedExercises)
      .set({
        exerciseId: newExerciseId,
        // Only on the first swap: the slot originally asked for the bench
        // press, and it still did after a second change of mind.
        substitutedFromExerciseId:
          current.substitutedFromExerciseId ?? current.exerciseId,
      })
      .where(eq(performedExercises.id, performedExerciseId));

    if (!replacement.weightApplicable) {
      // A kilogram target means nothing on a pull-up, and leaving one there
      // would score the set against a number that cannot be lifted.
      await db
        .update(performedSets)
        .set({targetWeight: null})
        .where(eq(performedSets.performedExerciseId, performedExerciseId));
    }
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Deletes an exercise from the session entirely (U8).
 *
 * Only ever an exercise added during the workout, with nothing recorded on it —
 * something added by mistake a minute ago. A planned exercise you did not do is
 * *skipped*, not erased: removing it would quietly shrink the denominator of
 * "% of plan" and flatter the workout.
 */
export async function removeExercise(
  db: AppDatabase,
  performedExerciseId: string,
): Promise<void> {
  const current = await requireExercise(db, performedExerciseId);

  if (current.plannedExerciseId !== null) {
    throw new Error(
      'This exercise is part of the plan. Skip it rather than removing it.',
    );
  }
  if (await anySetDecided(db, performedExerciseId)) {
    throw new Error(
      'This exercise already recorded a set, so it is part of the workout now.',
    );
  }

  // performed_sets cascades on this delete; the schema declares it and a test
  // asserts the cascade actually fires.
  await db
    .delete(performedExercises)
    .where(eq(performedExercises.id, performedExerciseId));
}

/**
 * Moves an exercise one place up or down the session.
 *
 * One place at a time, from a menu, rather than a drag: inside a scrolling
 * workout a long-press drag competes with the scroll gesture. Both rows are
 * written in one transaction, so no two exercises can ever be seen sharing a
 * position.
 */
export async function moveExercise(
  db: AppDatabase,
  performedExerciseId: string,
  direction: -1 | 1,
): Promise<void> {
  const current = await requireExercise(db, performedExerciseId);

  const siblings = await db
    .select({id: performedExercises.id, orderIndex: performedExercises.orderIndex})
    .from(performedExercises)
    .where(eq(performedExercises.workoutSessionId, current.workoutSessionId))
    .orderBy(asc(performedExercises.orderIndex));

  const at = siblings.findIndex(e => e.id === performedExerciseId);
  const neighbour = siblings[at + direction];
  // Already at the end. A no-op rather than an error: the control is simply
  // disabled there, and a thrown error would be noise.
  if (!neighbour) {
    return;
  }

  await db.run(sql.raw('BEGIN'));
  try {
    await db
      .update(performedExercises)
      .set({orderIndex: neighbour.orderIndex})
      .where(eq(performedExercises.id, performedExerciseId));
    await db
      .update(performedExercises)
      .set({orderIndex: siblings[at]!.orderIndex})
      .where(eq(performedExercises.id, neighbour.id));
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }
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
