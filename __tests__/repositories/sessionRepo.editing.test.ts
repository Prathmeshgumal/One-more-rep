import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipExercise,
  finishExercise,
  setExerciseNotes,
  swapExercise,
  removeExercise,
  moveExercise,
  addExercise,
  addSet,
  removeSet,
  skipSet,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();

/**
 * U11. "Skip this exercise" marked the whole exercise skipped even when three
 * of its four sets were recorded, which understates the work — reported from
 * the device at the R2 gate. Finishing is a different act from skipping, and
 * the difference is whether anything actually happened.
 */
describe('finishing an exercise, as opposed to skipping it', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;
  const first = async () => (await reload()).exercises[0]!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
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

  it('reads as completed when something was recorded', async () => {
    const exercise = await first();
    await completeSet(ctx.db, exercise.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 60,
    });

    await finishExercise(ctx.db, exercise.id);

    expect((await first()).status).toBe('completed');
  });

  it('reads as skipped when nothing was', async () => {
    const exercise = await first();
    await finishExercise(ctx.db, exercise.id);
    expect((await first()).status).toBe('skipped');
  });

  it('leaves recorded sets exactly as they are', async () => {
    const exercise = await first();
    await completeSet(ctx.db, exercise.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 60,
    });

    await finishExercise(ctx.db, exercise.id);

    const sets = (await first()).sets;
    expect(sets[0]).toMatchObject({
      status: 'completed',
      actualReps: 10,
      actualWeight: 60,
    });
    expect(sets.slice(1).every(s => s.status === 'skipped')).toBe(true);
    // Skipping never invents an actual.
    expect(sets.slice(1).every(s => s.actualReps === null)).toBe(true);
  });

  it('touches no other exercise', async () => {
    const [one, two] = (await reload()).exercises;
    await finishExercise(ctx.db, one!.id);
    const after = (await reload()).exercises[1]!;
    expect(after.status).toBe('pending');
    expect(after.sets.every(s => s.status === 'pending')).toBe(true);
    expect(two!.id).toBe(after.id);
  });

  // The distinction is the whole point: skipExercise is a decision about the
  // exercise and says so regardless of what was recorded, which is why it
  // writes the status rather than deriving it.
  it('differs from skipExercise on a part-done exercise', async () => {
    const exercise = await first();
    await completeSet(ctx.db, exercise.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 60,
    });

    await skipExercise(ctx.db, exercise.id);
    expect((await first()).status).toBe('skipped');

    await finishExercise(ctx.db, exercise.id);
    expect((await first()).status).toBe('completed');
  });

  it('is a no-op on an exercise that is already finished', async () => {
    const exercise = await first();
    for (const set of exercise.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 60});
    }
    await finishExercise(ctx.db, exercise.id);

    const sets = (await first()).sets;
    expect(sets.every(s => s.status === 'completed')).toBe(true);
    expect((await first()).status).toBe('completed');
  });
});

/**
 * The two columns migration 0006 adds. Asserted through `getActiveSession`
 * rather than by reading the table, because the point is that they reach the
 * screens — and the substituted-from *name* is resolved by a separate batched
 * query that a raw column read would not exercise.
 */
describe('notes and substitutions on a performed exercise', () => {
  let ctx: ReturnType<typeof createTestDb>;
  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
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

  it('carries both as null when nothing has been said or swapped', async () => {
    const exercise = (await reload()).exercises[0]!;
    expect(exercise.notes).toBeNull();
    expect(exercise.substitutedFromName).toBeNull();
  });

  it('surfaces a note', async () => {
    const exercise = (await reload()).exercises[0]!;
    await ctx.db.run(
      sql`UPDATE performed_exercises SET notes = 'Shoulder felt off.'
          WHERE id = ${exercise.id}`,
    );
    expect((await reload()).exercises[0]!.notes).toBe('Shoulder felt off.');
  });

  it('resolves the name of the movement a slot was swapped away from', async () => {
    const exercise = (await reload()).exercises[0]!;
    await ctx.db.run(
      sql`UPDATE performed_exercises
          SET exercise_id = 'fly', substituted_from_exercise_id = 'bench'
          WHERE id = ${exercise.id}`,
    );
    const after = (await reload()).exercises[0]!;
    expect(after.name).toBe('Cable Fly');
    expect(after.substitutedFromName).toBe('Bench Press');
    // U6: the slot is kept, so the exercise still counts against the plan.
    expect(after.plannedExerciseId).not.toBeNull();
  });
});

describe('editing a workout while it is running', () => {
  let ctx: ReturnType<typeof createTestDb>;
  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;
  const first = async () => (await reload()).exercises[0]!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('db','Dumbbell Press','chest','[]','dumbbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0),
                 ('pullup','Pull-up','lats','[]','body only','strength',0,0,0)`,
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

  describe('setExerciseNotes', () => {
    it('stores a note', async () => {
      await setExerciseNotes(ctx.db, (await first()).id, 'Felt strong.');
      expect((await first()).notes).toBe('Felt strong.');
    });

    it('clears back to null rather than to an empty string', async () => {
      const id = (await first()).id;
      await setExerciseNotes(ctx.db, id, 'x');
      await setExerciseNotes(ctx.db, id, null);
      expect((await first()).notes).toBeNull();
    });

    it('trims, so stray whitespace is never stored as a note', async () => {
      await setExerciseNotes(ctx.db, (await first()).id, '   ');
      expect((await first()).notes).toBeNull();
    });
  });

  describe('swapExercise', () => {
    it('keeps the plan slot and the target, and records where it came from', async () => {
      const before = await first();
      await swapExercise(ctx.db, before.id, 'db');

      const after = await first();
      expect(after.exerciseId).toBe('db');
      expect(after.name).toBe('Dumbbell Press');
      expect(after.plannedExerciseId).toBe(before.plannedExerciseId);
      expect(after.substitutedFromName).toBe('Bench Press');
      expect(after.sets.map(s => s.targetReps)).toEqual(
        before.sets.map(s => s.targetReps),
      );
      expect(after.sets.every(s => !s.isUnplanned)).toBe(true);
    });

    it('refuses once a set has been recorded', async () => {
      const exercise = await first();
      await completeSet(ctx.db, exercise.sets[0]!.id, {
        actualReps: 10,
        actualWeight: 60,
      });
      await expect(swapExercise(ctx.db, exercise.id, 'db')).rejects.toThrow(
        /already recorded/i,
      );
    });

    it('refuses once a set has been skipped, too', async () => {
      const exercise = await first();
      await skipExercise(ctx.db, exercise.id);
      await expect(swapExercise(ctx.db, exercise.id, 'db')).rejects.toThrow(
        /already recorded/i,
      );
    });

    it('clears the target weight when the new movement is bodyweight', async () => {
      await swapExercise(ctx.db, (await first()).id, 'pullup');
      const after = await first();
      expect(after.weightApplicable).toBe(false);
      expect(after.sets.every(s => s.targetWeight === null)).toBe(true);
      expect(after.sets.every(s => s.targetReps !== null)).toBe(true);
    });

    it('remembers the original movement across two swaps', async () => {
      const id = (await first()).id;
      await swapExercise(ctx.db, id, 'db');
      await swapExercise(ctx.db, id, 'fly');
      expect((await first()).substitutedFromName).toBe('Bench Press');
    });
  });

  /**
   * Reported from the phone: there was no way to add an exercise mid-workout
   * at all. The picker and this function survived the focus flow; only the
   * door to them was lost. The anchor is the other half of the request —
   * you add a movement standing in front of it, part way down the day.
   */
  describe('addExercise', () => {
    const names = async () => (await reload()).exercises.map(e => e.name);

    it('appends to the end when nothing anchors it', async () => {
      await addExercise(ctx.db, (await reload()).id, 'pullup');
      expect(await names()).toEqual(['Bench Press', 'Cable Fly', 'Pull-up']);
    });

    it('lands directly behind the exercise it was added from', async () => {
      const session = await reload();
      await addExercise(ctx.db, session.id, 'pullup', {
        after: session.exercises[0]!.id,
      });
      expect(await names()).toEqual(['Bench Press', 'Pull-up', 'Cable Fly']);
    });

    it('leaves the order contiguous, so a later move has somewhere to go', async () => {
      const session = await reload();
      await addExercise(ctx.db, session.id, 'pullup', {
        after: session.exercises[0]!.id,
      });
      const rows = await ctx.db.all<{order_index: number}>(
        sql`SELECT order_index FROM performed_exercises
            WHERE workout_session_id = ${session.id} ORDER BY order_index`,
      );
      expect(rows.map(r => r.order_index)).toEqual([0, 1, 2]);
    });

    it('appends when the anchor is not in this session', async () => {
      await addExercise(ctx.db, (await reload()).id, 'pullup', {after: 'nope'});
      expect(await names()).toEqual(['Bench Press', 'Cable Fly', 'Pull-up']);
    });

    it('arrives with one set, pending and unplanned', async () => {
      const session = await reload();
      const id = await addExercise(ctx.db, session.id, 'pullup', {
        after: session.exercises[0]!.id,
      });
      const added = (await reload()).exercises.find(e => e.id === id)!;
      expect(added.sets).toHaveLength(1);
      expect(added.sets[0]!.status).toBe('pending');
      expect(added.sets[0]!.isUnplanned).toBe(true);
      expect(added.plannedExerciseId).toBeNull();
    });
  });

  describe('removeExercise', () => {
    it('deletes an unplanned exercise with nothing recorded', async () => {
      const id = await addExercise(ctx.db, (await reload()).id, 'fly');
      expect((await reload()).exercises).toHaveLength(3);
      await removeExercise(ctx.db, id);
      expect((await reload()).exercises).toHaveLength(2);
    });

    it('takes its sets with it', async () => {
      const id = await addExercise(ctx.db, (await reload()).id, 'fly');
      await removeExercise(ctx.db, id);
      const rows = await ctx.db.all<{n: number}>(
        sql`SELECT COUNT(*) AS n FROM performed_sets
            WHERE performed_exercise_id = ${id}`,
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('refuses a planned exercise, because that is a skip not a deletion', async () => {
      await expect(removeExercise(ctx.db, (await first()).id)).rejects.toThrow(
        /skip/i,
      );
    });

    it('refuses once a set has been recorded', async () => {
      const id = await addExercise(ctx.db, (await reload()).id, 'fly');
      const added = (await reload()).exercises.find(e => e.id === id)!;
      await completeSet(ctx.db, added.sets[0]!.id, {
        actualReps: 8,
        actualWeight: 15,
      });
      await expect(removeExercise(ctx.db, id)).rejects.toThrow(/recorded/i);
    });
  });

  describe('moveExercise', () => {
    const order = async () => (await reload()).exercises.map(e => e.name);

    it('swaps places with its neighbour', async () => {
      expect(await order()).toEqual(['Bench Press', 'Cable Fly']);
      await moveExercise(ctx.db, (await first()).id, 1);
      expect(await order()).toEqual(['Cable Fly', 'Bench Press']);
    });

    it('moves back up again', async () => {
      const benchId = (await first()).id;
      await moveExercise(ctx.db, benchId, 1);
      await moveExercise(ctx.db, benchId, -1);
      expect(await order()).toEqual(['Bench Press', 'Cable Fly']);
    });

    it('does nothing at the ends of the list', async () => {
      await moveExercise(ctx.db, (await first()).id, -1);
      expect(await order()).toEqual(['Bench Press', 'Cable Fly']);
    });

    it('leaves no two exercises sharing a position', async () => {
      await moveExercise(ctx.db, (await first()).id, 1);
      const indexes = (await reload()).exercises.map(e => e.orderIndex);
      expect(new Set(indexes).size).toBe(indexes.length);
    });
  });
});

/**
 * Removing a set you added by mistake. The mirror of removeExercise, and it
 * carries the same rule: only work you invented can be un-invented.
 */
describe('removeSet', () => {
  let ctx: ReturnType<typeof createTestDb>;
  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;
  const first = async () => (await reload()).exercises[0]!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
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

  it('deletes a set that was added and never used', async () => {
    const exercise = await first();
    const added = await addSet(ctx.db, exercise.id);
    expect((await first()).sets).toHaveLength(4);

    await removeSet(ctx.db, added);

    const sets = (await first()).sets;
    expect(sets).toHaveLength(3);
    expect(sets.map(s => s.id)).not.toContain(added);
  });

  // Erasing a planned set would shrink the denominator of "% of plan".
  it('refuses a planned set, and says to skip it', async () => {
    const exercise = await first();
    await expect(removeSet(ctx.db, exercise.sets[0]!.id)).rejects.toThrow(
      /skip/i,
    );
    expect((await first()).sets).toHaveLength(3);
  });

  // Deleting a bonus set can only ever give you less credit than you earned,
  // never more, so there is nothing to protect against. Refusing left no way
  // back from a set completed by accident.
  it('deletes a bonus set even once it has recorded something', async () => {
    const exercise = await first();
    const added = await addSet(ctx.db, exercise.id);
    await completeSet(ctx.db, added, {actualReps: 8, actualWeight: 20});

    await removeSet(ctx.db, added);

    const sets = (await first()).sets;
    expect(sets).toHaveLength(3);
    expect(sets.every(s => !s.isUnplanned)).toBe(true);
  });

  it('deletes a bonus set that was skipped', async () => {
    const exercise = await first();
    const added = await addSet(ctx.db, exercise.id);
    await skipSet(ctx.db, added);

    await removeSet(ctx.db, added);
    expect((await first()).sets).toHaveLength(3);
  });

  // The direction that matters: a planned set stays put whatever its state,
  // because erasing one makes the workout look better than it was.
  it('still refuses a planned set that was skipped', async () => {
    const exercise = await first();
    await skipSet(ctx.db, exercise.sets[0]!.id);

    await expect(removeSet(ctx.db, exercise.sets[0]!.id)).rejects.toThrow(
      /skip/i,
    );
    expect((await first()).sets).toHaveLength(3);
  });

  // An exercise with no sets can never be completed and draws as an empty
  // card. Removing the exercise is the honest action there.
  it('will not empty an exercise, and says to remove it instead', async () => {
    const session = await reload();
    const bonusId = await addExercise(ctx.db, session.id, 'fly');
    const bonus = (await reload()).exercises.find(e => e.id === bonusId)!;
    expect(bonus.sets).toHaveLength(1);

    await expect(removeSet(ctx.db, bonus.sets[0]!.id)).rejects.toThrow(
      /remove the exercise/i,
    );
  });

  it('leaves the exercise finished when the last pending set goes', async () => {
    const exercise = await first();
    for (const set of exercise.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 60});
    }
    // Adding a set reopens the exercise; removing it should close it again.
    const added = await addSet(ctx.db, exercise.id);
    expect((await first()).status).toBe('pending');

    await removeSet(ctx.db, added);
    expect((await first()).status).toBe('completed');
  });
});
