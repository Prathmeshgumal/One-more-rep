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
          : swappedNames.get(e.substitutedFromExerciseId) ?? null,
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
 * Targets are **copied in**, not referenced (§39). What that buys is history
 * that cannot be rewritten: a set you recorded on Tuesday keeps the number it
 * was recorded against, whatever the plan says afterwards.
 *
 * It bought one thing too many, though. A target changed while the workout is
 * still running never reached the sets you had not done yet, so raising a
 * weight mid-session meant closing the workout or living with the old number.
 * `syncActiveSessionFromPlan` narrows §39 to what it was protecting: sets that
 * are **pending** follow the plan, sets that are decided never move.
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
/**
 * Brings a running workout back in line with the plan it came from.
 *
 * §39 froze a session's targets at `startWorkout`, which protects history —
 * a recorded set keeps the number it was judged against — but it also froze
 * the sets you had not reached yet. Setting a 3.5 kg target on the exercise
 * you are three sets away from did nothing at all, and there was no way to
 * tell from the screen that the plan and the workout had diverged.
 *
 * So the rule is narrowed rather than dropped:
 *
 * - **Pending sets follow the plan.** Targets are rewritten, sets appear when
 *   the plan gains them, and trailing ones disappear when it loses them.
 * - **Decided sets never move.** Completed or skipped, the target it was
 *   performed against is evidence, and evidence does not get edited.
 * - **Exercises are left alone entirely.** The session has its own menu for
 *   adding, removing and swapping them, and a plan edit that undid a
 *   deliberate session edit would be worse than the problem being fixed.
 * - **Bonus sets survive.** They were never in the plan, so the plan has no
 *   opinion about them; they keep their place after the planned ones.
 *
 * Matching is positional, by exercise, not by `plannedExerciseId`: every plan
 * write rewrites the tree — in place or as a fork — so those ids do not
 * outlive the edit that prompted this call.
 */
export async function syncActiveSessionFromPlan(
  db: AppDatabase,
  opts: {now?: number} = {},
): Promise<void> {
  const now = opts.now ?? Date.now();
  const session = await getActiveSession(db, {now});
  if (!session) {
    return;
  }

  const plan = await getPlanForDate(db, now);
  const day = plan?.days[weekdayIndex(new Date(now))];
  if (!day || day.isRestDay) {
    // Today became a rest day while a workout was running. Ending it is a
    // decision, not a side effect of editing the plan.
    return;
  }

  // Positional first, so two sets of the same exercise on one day keep their
  // order; the id search behind it catches an exercise the session moved.
  const claimed = new Set<number>();
  const matchPlan = (exerciseId: string, orderIndex: number) => {
    const atSamePlace = day.exercises[orderIndex];
    if (
      atSamePlace &&
      atSamePlace.exerciseId === exerciseId &&
      !claimed.has(orderIndex)
    ) {
      claimed.add(orderIndex);
      return atSamePlace;
    }
    const found = day.exercises.findIndex(
      (e, i) => e.exerciseId === exerciseId && !claimed.has(i),
    );
    if (found === -1) {
      return undefined;
    }
    claimed.add(found);
    return day.exercises[found];
  };

  await db.run(sql.raw('BEGIN'));
  try {
    for (const [orderIndex, exercise] of session.exercises.entries()) {
      const planned = matchPlan(exercise.exerciseId, orderIndex);
      if (!planned) {
        // Swapped, added mid-session, or dropped from the plan. The session's
        // own edits win.
        continue;
      }

      const planSets = [...planned.sets].sort(
        (a, b) => a.setNumber - b.setNumber,
      );
      const fromPlan = exercise.sets.filter(s => !s.isUnplanned);
      const bonus = exercise.sets.filter(s => s.isUnplanned);

      // 1. Retarget the pending ones the plan still has.
      for (let i = 0; i < Math.min(fromPlan.length, planSets.length); i++) {
        const set = fromPlan[i]!;
        const target = planSets[i]!;
        if (set.status !== 'pending') {
          continue;
        }
        if (
          set.targetReps === target.targetReps &&
          set.targetWeight === target.targetWeight
        ) {
          continue;
        }
        await db
          .update(performedSets)
          .set({
            targetReps: target.targetReps,
            targetWeight: target.targetWeight,
          })
          .where(eq(performedSets.id, set.id));
      }

      // 2. Drop the trailing planned sets the plan no longer has — but only
      //    the ones you never touched.
      const surplus = fromPlan
        .slice(planSets.length)
        .filter(s => s.status === 'pending');
      if (surplus.length > 0) {
        await db.delete(performedSets).where(
          inArray(
            performedSets.id,
            surplus.map(s => s.id),
          ),
        );
      }

      // 3. Add the ones it has gained.
      const gained = planSets.slice(fromPlan.length);
      if (gained.length > 0) {
        await db.insert(performedSets).values(
          gained.map((target, offset) => ({
            id: newId('pst'),
            performedExerciseId: exercise.id,
            setNumber: fromPlan.length + offset + 1,
            targetReps: target.targetReps,
            targetWeight: target.targetWeight,
            actualReps: null,
            actualWeight: null,
            status: 'pending' as const,
            isUnplanned: false,
            completedAt: null,
          })),
        );
      }

      // 4. Bonus sets sit after the planned ones. Losing a planned set
      //    leaves them numbered above a count that no longer exists, which
      //    reads on screen as "set 5 of 4". The kept planned sets are already
      //    1..n, because the surplus is always trailing.
      const plannedCount = fromPlan.length - surplus.length + gained.length;
      for (const [offset, set] of bonus.entries()) {
        const wanted = plannedCount + offset + 1;
        if (set.setNumber !== wanted) {
          await db
            .update(performedSets)
            .set({setNumber: wanted})
            .where(eq(performedSets.id, set.id));
        }
      }

      // Gaining or losing sets can finish an exercise, or un-finish one.
      await refreshExerciseStatus(db, exercise.id);
    }
    await db.run(sql.raw('COMMIT'));
  } catch (error) {
    await db.run(sql.raw('ROLLBACK'));
    throw error instanceof Error ? error : new Error(String(error));
  }
}

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
 * What a set was, before something changed it.
 *
 * Deliberately the whole of the mutable half of the row rather than a delta:
 * restoring "the previous reps" would leave a set that had been skipped and
 * then recorded sitting in an impossible state, completed with no numbers.
 */
export type SetSnapshot = {
  status: ItemStatus;
  actualReps: number | null;
  actualWeight: number | null;
  completedAt: number | null;
};

/** Reads a set as it stands, for an undo that has not happened yet. */
export async function snapshotSet(
  db: AppDatabase,
  setId: string,
): Promise<SetSnapshot> {
  const row = await requireSet(db, setId);
  return {
    status: row.status,
    actualReps: row.actualReps,
    actualWeight: row.actualWeight,
    completedAt: row.completedAt,
  };
}

/**
 * Puts a set back exactly as it was.
 *
 * The focus flow records into a screen that then leaves — the next set
 * replaces it entirely, so the evidence of what you just did is gone before
 * you can check it. An unreversible tap is not acceptable under those
 * conditions, and this is what the undo behind it writes.
 *
 * Not the same thing as skipping or completing: those two derive a status
 * from an intention, and this one restores whatever the status happened to
 * be, pending included.
 */
export async function restoreSet(
  db: AppDatabase,
  setId: string,
  snapshot: SetSnapshot,
): Promise<void> {
  const set = await requireSet(db, setId);
  await db
    .update(performedSets)
    .set({
      status: snapshot.status,
      actualReps: snapshot.actualReps,
      actualWeight: snapshot.actualWeight,
      completedAt: snapshot.completedAt,
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
    .select({
      id: performedExercises.id,
      orderIndex: performedExercises.orderIndex,
    })
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
 * Deletes a set you added yourself.
 *
 * Only work you invented can be un-invented. A *planned* set you did not do is
 * **skipped**, never erased — deleting it would shrink the denominator of
 * "% of plan" and quietly flatter the workout, which is the one thing this app
 * must not do.
 *
 * A bonus set can go whatever state it is in, including recorded, and that
 * asymmetry is deliberate. The two directions are not the same risk: erasing a
 * planned set makes you look better than you were, while erasing a bonus set
 * only gives you less credit than you earned. The dangerous direction is the
 * first one, and it stays closed.
 *
 * This started stricter — recorded meant it happened, so correct it rather
 * than delete it. Then a bonus set was added and completed by accident during
 * testing, and there was no way back at all: the wrong row was in that workout
 * for good. Refusing left no recourse; allowing it leaves a mistake that can
 * be redone.
 *
 * The last set on an exercise cannot go. An exercise with no sets can never be
 * completed and renders as an empty card; the honest action there is to remove
 * the exercise, which the menu already offers.
 */
export async function removeSet(db: AppDatabase, setId: string): Promise<void> {
  const set = await requireSet(db, setId);

  if (!set.isUnplanned) {
    throw new Error(
      'This set is part of the plan. Skip it rather than removing it.',
    );
  }
  const siblings = await db
    .select({id: performedSets.id})
    .from(performedSets)
    .where(eq(performedSets.performedExerciseId, set.performedExerciseId));
  if (siblings.length <= 1) {
    throw new Error('An exercise needs a set. Remove the exercise instead.');
  }

  await db.delete(performedSets).where(eq(performedSets.id, setId));
  // The exercise may have just lost its last pending work, so its status is
  // no longer whatever it was before.
  await refreshExerciseStatus(db, set.performedExerciseId);
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
