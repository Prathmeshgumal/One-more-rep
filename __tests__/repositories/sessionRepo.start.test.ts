import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  getSessionForDate,
  getActiveSession,
} from '@/repositories/sessionRepo';
import {startOfLocalDay} from '@/domain/weekday';
import {createTestDb} from '../helpers/testDb';

// A Monday, so weekday 0 is the day under test.
const MONDAY = new Date(2026, 7, 17, 9).getTime();
const MONDAY_MIDNIGHT = startOfLocalDay(MONDAY);

describe('startWorkout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db, {now: MONDAY});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench', 'pushup']),
      MONDAY,
    );
  });
  afterEach(() => ctx.close());

  it('creates a session for today from the plan', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.dayName).toBe('Push Day');
    expect(session.status).toBe('in_progress');
    expect(session.date).toBe(MONDAY_MIDNIGHT);
    expect(session.completedAt).toBeNull();
  });

  it('materializes every planned exercise and every planned set', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Push-up',
    ]);
    expect(session.exercises[0]!.sets).toHaveLength(3);
    expect(session.exercises[0]!.sets.map(s => s.setNumber)).toEqual([1, 2, 3]);
    expect(session.exercises.every(e => e.status === 'pending')).toBe(true);
  });

  // Spec 6.2: the UI pre-fills from the target, but nothing is stored until
  // the set is completed. Otherwise an untouched set and a performed one look
  // identical after a crash.
  it('copies targets in and leaves actuals empty', async () => {
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 8, targetWeight: 60}]),
      MONDAY,
    );
    const session = await startWorkout(ctx.db, {now: MONDAY});
    const set = session.exercises[0]!.sets[0]!;
    expect(set.targetReps).toBe(8);
    expect(set.targetWeight).toBe(60);
    expect(set.actualReps).toBeNull();
    expect(set.actualWeight).toBeNull();
    expect(set.status).toBe('pending');
    expect(set.isUnplanned).toBe(false);
  });

  it('carries the exercise library details each set needs on screen', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises[0]!.weightApplicable).toBe(true);
    expect(session.exercises[0]!.equipment).toBe('barbell');
    expect(session.exercises[1]!.weightApplicable).toBe(false);
  });

  it('remembers which plan version it came from', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.planVersionId).not.toBeNull();
    expect(session.planDayId).not.toBeNull();
    expect(session.exercises[0]!.plannedExerciseId).not.toBeNull();
  });

  // §39, and the reason targets are columns rather than a join: editing the
  // plan afterwards must not reach back into what was already recorded.
  it('keeps its targets when the plan is edited afterwards', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    const before = session.exercises[0]!.sets.map(s => s.targetReps);

    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 99, targetWeight: 999}]),
      TUESDAY,
    );

    const reread = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    expect(reread!.exercises[0]!.sets.map(s => s.targetReps)).toEqual(before);
  });

  it('refuses to start a second workout on the same day', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(
      /already/i,
    );
  });

  it('refuses to start on a rest day', async () => {
    await editPlan(ctx.db, d => setRestDay(d, 0, true), MONDAY);
    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(/rest/i);
  });

  it('refuses to start a day with nothing on it', async () => {
    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    await expect(startWorkout(ctx.db, {now: TUESDAY})).rejects.toThrow(
      /no exercises/i,
    );
  });

  // The whole materialization is one transaction, so a failure partway must
  // leave no half-built session behind. There is no natural way to trip it —
  // the plan is read through a join, so a missing exercise simply drops out of
  // the plan rather than failing the insert — so the failure is injected.
  it('leaves nothing behind when starting fails partway', async () => {
    const insert = ctx.db.insert.bind(ctx.db);
    let calls = 0;
    const spy = jest
      .spyOn(ctx.db, 'insert')
      .mockImplementation(((table: Parameters<typeof insert>[0]) => {
        calls += 1;
        // The session and its exercises land, then the sets blow up.
        if (calls > 2) {
          throw new Error('injected failure');
        }
        return insert(table);
      }) as typeof insert);

    await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(
      /injected failure/,
    );
    spy.mockRestore();

    for (const table of [
      'workout_sessions',
      'performed_exercises',
      'performed_sets',
    ]) {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  it('reads back the session it just created', async () => {
    const created = await startWorkout(ctx.db, {now: MONDAY});
    const read = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    expect(read?.id).toBe(created.id);
    expect(read?.exercises).toHaveLength(2);
  });

  it('has no session for a day nothing happened on', async () => {
    expect(await getSessionForDate(ctx.db, MONDAY_MIDNIGHT)).toBeUndefined();
  });

  it('surfaces an in-progress session for today as the active one', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    const active = await getActiveSession(ctx.db, {now: MONDAY});
    expect(active?.status).toBe('in_progress');
  });

  it('does not treat yesterday as active', async () => {
    await startWorkout(ctx.db, {now: MONDAY});
    const TUESDAY = new Date(2026, 7, 18, 9).getTime();
    expect(await getActiveSession(ctx.db, {now: TUESDAY})).toBeUndefined();
  });

  it('orders exercises and sets the way the plan had them', async () => {
    const session = await startWorkout(ctx.db, {now: MONDAY});
    expect(session.exercises.map(e => e.orderIndex)).toEqual([0, 1]);
    expect(session.exercises[1]!.sets.map(s => s.setNumber)).toEqual([1, 2, 3]);
  });
});
