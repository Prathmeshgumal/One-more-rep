import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipSet,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

/**
 * `completed_at` is the only record of *when* work happened. It is written on
 * every set and read by nothing yet, which is exactly how it drifted: a
 * correction restamped it, and nobody noticed because nothing looked.
 */
describe('performed set timestamps', () => {
  let ctx: ReturnType<typeof createTestDb>;
  const today = () => (new Date().getDay() + 6) % 7;

  const sets = async () => {
    const session = (await getActiveSession(ctx.db))!;
    return session.exercises[0]!.sets;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench']),
    );
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);
  });

  afterEach(() => ctx.close());

  it('stamps a set when it is recorded', async () => {
    const before = await sets();
    await completeSet(
      ctx.db,
      before[0]!.id,
      {actualReps: 10, actualWeight: 30},
      {now: 1000},
    );
    expect((await sets())[0]!.completedAt).toBe(1000);
  });

  /**
   * The bug this pins. A set performed on Tuesday and corrected on Thursday
   * was being restamped with Thursday, so the record of when the workout
   * happened was destroyed by the act of fixing a typo in it.
   */
  it('keeps the original time when the set is corrected later', async () => {
    const before = await sets();
    await completeSet(
      ctx.db,
      before[0]!.id,
      {actualReps: 10, actualWeight: 30},
      {now: 1000},
    );
    await completeSet(
      ctx.db,
      before[0]!.id,
      {actualReps: 12, actualWeight: 30},
      {now: 999_000},
    );

    const after = await sets();
    expect(after[0]!.actualReps).toBe(12);
    expect(after[0]!.completedAt).toBe(1000);
  });

  it('stamps a set that comes back from skipped', async () => {
    const before = await sets();
    await skipSet(ctx.db, before[0]!.id);
    expect((await sets())[0]!.completedAt).toBeNull();

    await completeSet(
      ctx.db,
      before[0]!.id,
      {actualReps: 8, actualWeight: 30},
      {now: 2000},
    );
    expect((await sets())[0]!.completedAt).toBe(2000);
  });

  it('clears the time when a recorded set is skipped', async () => {
    const before = await sets();
    await completeSet(
      ctx.db,
      before[0]!.id,
      {actualReps: 10, actualWeight: 30},
      {now: 1000},
    );
    await skipSet(ctx.db, before[0]!.id);
    expect((await sets())[0]!.completedAt).toBeNull();
  });
});
