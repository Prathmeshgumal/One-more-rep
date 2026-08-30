import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipSet,
  addSet,
  swapExercise,
  addExercise,
  syncActiveSessionFromPlan,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

/**
 * §39 froze a session's targets at `startWorkout` so that history could not be
 * rewritten. It also froze the sets you had not reached yet, which is how a
 * 3.5 kg target set mid-workout reached nothing at all.
 *
 * These tests pin the narrowed rule: pending follows the plan, decided never
 * moves.
 */
describe('syncActiveSessionFromPlan', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const today = () => (new Date().getDay() + 6) % 7;

  const sets = async (exerciseIndex = 0) => {
    const session = (await getActiveSession(ctx.db))!;
    return session.exercises[exerciseIndex]!.sets;
  };

  const retarget = (
    targets: Array<{targetReps: number; targetWeight: number | null}>,
  ) => editPlan(ctx.db, d => setTargets(d, today(), 0, targets));

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('roller','Ab Roller','abdominals','[]','body only','strength',0,0,0),
                 ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), [
        'roller',
        'bench',
      ]),
    );
    await retarget([
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
    ]);
    await startWorkout(ctx.db);
  });

  afterEach(() => ctx.close());

  /** The reported case, end to end. */
  it('carries a target weight set after the workout started', async () => {
    expect((await sets())[0]!.targetWeight).toBeNull();

    await retarget([
      {targetReps: 10, targetWeight: 3.5},
      {targetReps: 10, targetWeight: 3.5},
      {targetReps: 10, targetWeight: 3.5},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    expect((await sets()).map(s => s.targetWeight)).toEqual([3.5, 3.5, 3.5]);
  });

  it('carries a changed rep target too', async () => {
    await retarget([
      {targetReps: 12, targetWeight: null},
      {targetReps: 12, targetWeight: null},
      {targetReps: 12, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);
    expect((await sets()).map(s => s.targetReps)).toEqual([12, 12, 12]);
  });

  /**
   * The half of §39 that stays. A recorded set was judged against the number
   * that was there at the time, and that judgement is evidence.
   */
  it('leaves a recorded set on the target it was performed against', async () => {
    const before = await sets();
    await completeSet(ctx.db, before[0]!.id, {
      actualReps: 10,
      actualWeight: null,
    });

    await retarget([
      {targetReps: 20, targetWeight: 50},
      {targetReps: 20, targetWeight: 50},
      {targetReps: 20, targetWeight: 50},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = await sets();
    expect(after[0]!.targetReps).toBe(10);
    expect(after[0]!.targetWeight).toBeNull();
    // ...while the ones still to come do move.
    expect(after[1]!.targetReps).toBe(20);
    expect(after[2]!.targetWeight).toBe(50);
  });

  it('leaves a skipped set alone as well', async () => {
    const before = await sets();
    await skipSet(ctx.db, before[1]!.id);

    await retarget([
      {targetReps: 20, targetWeight: null},
      {targetReps: 20, targetWeight: null},
      {targetReps: 20, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = await sets();
    expect(after[1]!.targetReps).toBe(10);
    expect(after[1]!.status).toBe('skipped');
  });

  it('gains a set when the plan gains one', async () => {
    await retarget([
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
      {targetReps: 8, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = await sets();
    expect(after).toHaveLength(4);
    expect(after.map(s => s.setNumber)).toEqual([1, 2, 3, 4]);
    expect(after[3]!.targetReps).toBe(8);
    expect(after[3]!.status).toBe('pending');
    expect(after[3]!.isUnplanned).toBe(false);
  });

  it('loses an untouched set when the plan loses one', async () => {
    await retarget([
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);
    expect(await sets()).toHaveLength(2);
  });

  /**
   * The denominator must never shrink around work that happened. Deleting a
   * recorded set would flatter the workout, which is the one thing this app
   * must not do.
   */
  it('keeps a recorded set the plan no longer has', async () => {
    const before = await sets();
    await completeSet(ctx.db, before[2]!.id, {
      actualReps: 9,
      actualWeight: null,
    });

    await retarget([
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = await sets();
    expect(after).toHaveLength(3);
    expect(after[2]!.actualReps).toBe(9);
  });

  it('keeps a bonus set and renumbers it behind the planned ones', async () => {
    const session = (await getActiveSession(ctx.db))!;
    await addSet(ctx.db, session.exercises[0]!.id);
    expect((await sets())[3]!.setNumber).toBe(4);

    await retarget([
      {targetReps: 10, targetWeight: null},
      {targetReps: 10, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = await sets();
    expect(after).toHaveLength(3);
    const bonus = after.find(s => s.isUnplanned)!;
    // Was set 4 of 3; must not now read as set 4 of 2.
    expect(bonus.setNumber).toBe(3);
  });

  /**
   * The session has its own menu for adding, removing and swapping exercises.
   * A plan edit undoing a deliberate session edit would be worse than the
   * problem this fixes.
   */
  it('does not undo an exercise swapped during the session', async () => {
    const session = (await getActiveSession(ctx.db))!;
    await swapExercise(ctx.db, session.exercises[0]!.id, 'bench');

    await retarget([
      {targetReps: 99, targetWeight: null},
      {targetReps: 99, targetWeight: null},
      {targetReps: 99, targetWeight: null},
    ]);
    await syncActiveSessionFromPlan(ctx.db);

    const after = (await getActiveSession(ctx.db))!;
    expect(after.exercises[0]!.exerciseId).toBe('bench');
    // The slot no longer holds what the plan has there, so the plan's targets
    // are not its business.
    expect(after.exercises[0]!.sets[0]!.targetReps).toBe(10);
  });

  it('leaves an exercise added during the session untouched', async () => {
    const session = (await getActiveSession(ctx.db))!;
    await addExercise(ctx.db, session.id, 'bench');
    const grown = (await getActiveSession(ctx.db))!;
    expect(grown.exercises).toHaveLength(3);

    await syncActiveSessionFromPlan(ctx.db);
    expect((await getActiveSession(ctx.db))!.exercises).toHaveLength(3);
  });

  it('does not add an exercise the plan gained mid-session', async () => {
    await editPlan(ctx.db, d => addExercises(d, today(), ['bench']));
    await syncActiveSessionFromPlan(ctx.db);
    expect((await getActiveSession(ctx.db))!.exercises).toHaveLength(2);
  });

  it('does nothing when there is no session running', async () => {
    const session = (await getActiveSession(ctx.db))!;
    await ctx.db.run(
      sql`UPDATE workout_sessions SET status = 'completed' WHERE id = ${session.id}`,
    );
    await expect(syncActiveSessionFromPlan(ctx.db)).resolves.toBeUndefined();
  });

  it('leaves the session alone when today becomes a rest day', async () => {
    await editPlan(ctx.db, d => ({
      ...d,
      days: d.days.map((day, i) =>
        i === today() ? {...day, isRestDay: true, exercises: []} : day,
      ),
    }));
    await syncActiveSessionFromPlan(ctx.db);
    expect(await sets()).toHaveLength(3);
  });

  /** Retargeting the second exercise must not land on the first. */
  it('matches exercises by position, not by order of appearance', async () => {
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 1, [
        {targetReps: 5, targetWeight: 60},
        {targetReps: 5, targetWeight: 60},
        {targetReps: 5, targetWeight: 60},
      ]),
    );
    await syncActiveSessionFromPlan(ctx.db);

    expect((await sets(0)).map(s => s.targetReps)).toEqual([10, 10, 10]);
    expect((await sets(1)).map(s => s.targetWeight)).toEqual([60, 60, 60]);
  });
});
