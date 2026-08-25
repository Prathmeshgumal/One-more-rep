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
