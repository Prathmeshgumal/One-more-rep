import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipSet,
  skipExercise,
  addSet,
  addExercise,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();

describe('recording a workout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
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

  it('writes the actuals, the status, and the time', async () => {
    const before = await reload();
    const setId = before.exercises[0]!.sets[0]!.id;

    await completeSet(
      ctx.db,
      setId,
      {actualReps: 12, actualWeight: 32.5},
      {now: MONDAY + 1000},
    );

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(12);
    expect(set.actualWeight).toBe(32.5);
    expect(set.status).toBe('completed');
    expect(set.completedAt).toBe(MONDAY + 1000);
  });

  it('leaves the target alone when actuals are written', async () => {
    const before = await reload();
    const set = before.exercises[0]!.sets[0]!;
    await completeSet(ctx.db, set.id, {actualReps: 12, actualWeight: 32.5});

    const after = (await reload()).exercises[0]!.sets[0]!;
    expect(after.targetReps).toBe(set.targetReps);
    expect(after.targetWeight).toBe(set.targetWeight);
  });

  it('touches only the set it was given', async () => {
    const before = await reload();
    await completeSet(ctx.db, before.exercises[0]!.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 30,
    });

    const after = await reload();
    expect(after.exercises[0]!.sets[1]!.status).toBe('pending');
    expect(after.exercises[0]!.sets[1]!.actualReps).toBeNull();
  });

  // §14: the actual is editable. Completing an already-completed set corrects
  // it rather than refusing, because the alternative is a wrong number stuck
  // in history forever.
  it('lets a recorded set be corrected', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await completeSet(ctx.db, setId, {actualReps: 12, actualWeight: 30});
    await completeSet(ctx.db, setId, {actualReps: 10, actualWeight: 30});

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(10);
    expect(set.status).toBe('completed');
  });

  it('accepts a bodyweight set with no weight at all', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await completeSet(ctx.db, setId, {actualReps: 15, actualWeight: null});

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.actualWeight).toBeNull();
    expect(set.status).toBe('completed');
  });

  // §21: skipped is a distinct state from pending, and actuals stay empty.
  // Pretending a skipped set was performed is what makes adherence a lie.
  it('records a skipped set as skipped, with nothing recorded', async () => {
    const setId = (await reload()).exercises[0]!.sets[0]!.id;
    await skipSet(ctx.db, setId);

    const set = (await reload()).exercises[0]!.sets[0]!;
    expect(set.status).toBe('skipped');
    expect(set.actualReps).toBeNull();
    expect(set.actualWeight).toBeNull();
  });

  it('marks the exercise complete once none of its sets are pending', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');
    // The next exercise is untouched.
    expect((await reload()).exercises[1]!.status).toBe('pending');
  });

  it('calls an exercise whose sets were all skipped skipped, not complete', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await skipSet(ctx.db, set.id);
    }
    expect((await reload()).exercises[0]!.status).toBe('skipped');
  });

  it('counts a part-skipped exercise as complete once nothing is pending', async () => {
    const session = await reload();
    const [first, ...rest] = session.exercises[0]!.sets;
    await completeSet(ctx.db, first!.id, {actualReps: 10, actualWeight: 30});
    for (const set of rest) {
      await skipSet(ctx.db, set.id);
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');
  });

  // Spec 6.5: skipping an exercise cascades to its pending sets, and only to
  // those — work already recorded is never rewritten.
  it('skips an exercise and its pending sets, keeping what was done', async () => {
    const session = await reload();
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});

    await skipExercise(ctx.db, session.exercises[0]!.id);

    const after = (await reload()).exercises[0]!;
    expect(after.status).toBe('skipped');
    expect(after.sets[0]!.status).toBe('completed');
    expect(after.sets[0]!.actualReps).toBe(10);
    expect(after.sets[1]!.status).toBe('skipped');
    expect(after.sets[2]!.status).toBe('skipped');
  });

  // D3: a bonus set has no target, because there was nothing to aim at.
  it('appends an unplanned set with no target', async () => {
    const session = await reload();
    const id = await addSet(ctx.db, session.exercises[0]!.id);

    const sets = (await reload()).exercises[0]!.sets;
    expect(sets).toHaveLength(4);
    const added = sets.find(s => s.id === id)!;
    expect(added.setNumber).toBe(4);
    expect(added.isUnplanned).toBe(true);
    expect(added.targetReps).toBeNull();
    expect(added.targetWeight).toBeNull();
    expect(added.status).toBe('pending');
  });

  it('numbers a second added set after the first', async () => {
    const session = await reload();
    await addSet(ctx.db, session.exercises[0]!.id);
    await addSet(ctx.db, session.exercises[0]!.id);
    expect((await reload()).exercises[0]!.sets.map(s => s.setNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('reopens an exercise that had been finished when a set is added', async () => {
    const session = await reload();
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');

    await addSet(ctx.db, session.exercises[0]!.id);
    expect((await reload()).exercises[0]!.status).toBe('pending');
  });

  // D3: an exercise added mid-workout has no planned_exercise_id, which is
  // exactly what excludes it from the completion percentage later.
  it('appends an unplanned exercise at the end', async () => {
    const session = await reload();
    const id = await addExercise(ctx.db, session.id, 'pushup');

    const after = await reload();
    expect(after.exercises).toHaveLength(3);
    const added = after.exercises.find(e => e.id === id)!;
    expect(added.name).toBe('Push-up');
    expect(added.plannedExerciseId).toBeNull();
    expect(added.orderIndex).toBe(2);
    expect(added.weightApplicable).toBe(false);
  });

  it('gives an added exercise one set to record into', async () => {
    const session = await reload();
    const id = await addExercise(ctx.db, session.id, 'pushup');
    const added = (await reload()).exercises.find(e => e.id === id)!;
    expect(added.sets).toHaveLength(1);
    expect(added.sets[0]!.isUnplanned).toBe(true);
    expect(added.sets[0]!.targetReps).toBeNull();
  });

  it('refuses to record against a set that does not exist', async () => {
    await expect(
      completeSet(ctx.db, 'nope', {actualReps: 10, actualWeight: 30}),
    ).rejects.toThrow(/does not exist/i);
  });
});
