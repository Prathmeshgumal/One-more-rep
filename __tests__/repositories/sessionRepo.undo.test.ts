import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  completeSet,
  skipSet,
  snapshotSet,
  restoreSet,
} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();

/**
 * Undo, for a screen that leaves.
 *
 * The focus flow records a set and then replaces the whole screen with the
 * next one, so the evidence of what was just written is gone before it can be
 * checked. That makes an unreversible tap unacceptable in a way it is not on a
 * list, where the row you touched stays in front of you.
 */
describe('snapshotSet and restoreSet', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const reload = async () => (await getActiveSession(ctx.db, {now: MONDAY}))!;
  const firstSet = async () => (await reload()).exercises[0]!.sets[0]!;

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

  it('puts a recorded set back to untouched', async () => {
    const set = await firstSet();
    const before = await snapshotSet(ctx.db, set.id);
    expect(before.status).toBe('pending');

    await completeSet(ctx.db, set.id, {actualReps: 9, actualWeight: 40});
    expect((await firstSet()).status).toBe('completed');

    await restoreSet(ctx.db, set.id, before);
    const after = await firstSet();
    expect(after.status).toBe('pending');
    expect(after.actualReps).toBeNull();
    expect(after.actualWeight).toBeNull();
    expect(after.completedAt).toBeNull();
  });

  it('puts a skipped set back to untouched', async () => {
    const set = await firstSet();
    const before = await snapshotSet(ctx.db, set.id);

    await skipSet(ctx.db, set.id);
    expect((await firstSet()).status).toBe('skipped');

    await restoreSet(ctx.db, set.id, before);
    expect((await firstSet()).status).toBe('pending');
  });

  /**
   * The interesting one. Restoring only "the previous reps" would leave a set
   * that had been skipped and then recorded sitting in an impossible state:
   * completed, with no numbers on it.
   */
  it('restores the numbers a correction overwrote, not just the status', async () => {
    const set = await firstSet();
    await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 40});
    const before = await snapshotSet(ctx.db, set.id);

    await completeSet(ctx.db, set.id, {actualReps: 6, actualWeight: 20});
    expect((await firstSet()).actualReps).toBe(6);

    await restoreSet(ctx.db, set.id, before);
    const after = await firstSet();
    expect(after.status).toBe('completed');
    expect(after.actualReps).toBe(10);
    expect(after.actualWeight).toBe(40);
    expect(after.completedAt).toBe(before.completedAt);
  });

  // The exercise's status is derived from its sets, so undoing the set that
  // completed an exercise has to walk that back too -- otherwise the exercise
  // reads completed with a pending set under it.
  it('walks the exercise status back with the set', async () => {
    const session = await reload();
    const exercise = session.exercises[0]!;
    const snapshots = [];
    for (const s of exercise.sets) {
      snapshots.push({id: s.id, snap: await snapshotSet(ctx.db, s.id)});
      await completeSet(ctx.db, s.id, {actualReps: 10, actualWeight: 40});
    }
    expect((await reload()).exercises[0]!.status).toBe('completed');

    const last = snapshots[snapshots.length - 1]!;
    await restoreSet(ctx.db, last.id, last.snap);
    expect((await reload()).exercises[0]!.status).toBe('pending');
  });

  // An exercise whose every set was skipped reads skipped, not completed --
  // and undoing one of those skips has to bring it back to pending.
  it('brings a fully skipped exercise back when one skip is undone', async () => {
    const session = await reload();
    const exercise = session.exercises[0]!;
    const first = exercise.sets[0]!;
    const snap = await snapshotSet(ctx.db, first.id);
    for (const s of exercise.sets) {
      await skipSet(ctx.db, s.id);
    }
    expect((await reload()).exercises[0]!.status).toBe('skipped');

    await restoreSet(ctx.db, first.id, snap);
    expect((await reload()).exercises[0]!.status).toBe('pending');
  });

  it('refuses a set that is not there', async () => {
    await expect(
      restoreSet(ctx.db, 'nope', {
        status: 'pending',
        actualReps: null,
        actualWeight: null,
        completedAt: null,
      }),
    ).rejects.toThrow(/does not exist/);
  });
});
