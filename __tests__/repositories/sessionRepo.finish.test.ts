import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  getActiveSession,
  getSessionForDate,
  completeSet,
  finishWorkout,
  rollOverStaleSessions,
} from '@/repositories/sessionRepo';
import {startOfLocalDay} from '@/domain/weekday';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 9).getTime();
const TUESDAY = new Date(2026, 7, 18, 9).getTime();

describe('finishing a workout', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
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

  it('closes the session and stamps the time', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    const finished = await finishWorkout(ctx.db, session.id, {
      now: MONDAY + 5000,
    });
    expect(finished.status).toBe('completed');
    expect(finished.completedAt).toBe(MONDAY + 5000);
  });

  // Spec 6.7: rather than leaving sets pending forever, finishing marks them
  // skipped — which is the honest record and keeps adherence meaningful.
  it('marks anything still pending as skipped', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const finished = await finishWorkout(ctx.db, session.id, {now: MONDAY});
    expect(finished.exercises[0]!.sets.map(s => s.status)).toEqual([
      'completed',
      'skipped',
      'skipped',
    ]);
  });

  it('leaves recorded work exactly as it was', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 12,
      actualWeight: 32.5,
    });

    const finished = await finishWorkout(ctx.db, session.id, {now: MONDAY});
    const set = finished.exercises[0]!.sets[0]!;
    expect(set.actualReps).toBe(12);
    expect(set.actualWeight).toBe(32.5);
  });

  it('stops being the active session once finished', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await finishWorkout(ctx.db, session.id, {now: MONDAY});
    expect(await getActiveSession(ctx.db, {now: MONDAY})).toBeUndefined();
  });

  it('refuses to finish a session that does not exist', async () => {
    await expect(finishWorkout(ctx.db, 'nope')).rejects.toThrow(
      /does not exist/i,
    );
  });
});

describe('a session that outlived its day', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
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

  // Spec 6.4: an in-progress session from a previous day closes as abandoned
  // at rollover, keeping every set already recorded — so it reads in history
  // as a genuine partial workout rather than a prompt that never goes away.
  it('closes as abandoned the next day, keeping what was recorded', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const closed = await rollOverStaleSessions(ctx.db, {now: TUESDAY});
    expect(closed).toBe(1);

    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    expect(monday.status).toBe('abandoned');
    expect(monday.exercises[0]!.sets[0]!.actualReps).toBe(10);
    expect(monday.exercises[0]!.sets[0]!.status).toBe('completed');
  });

  it("does not touch today's own session", async () => {
    expect(await rollOverStaleSessions(ctx.db, {now: MONDAY})).toBe(0);
    expect(await getActiveSession(ctx.db, {now: MONDAY})).toBeDefined();
  });

  it('does not reopen or re-close a finished session', async () => {
    const session = (await getActiveSession(ctx.db, {now: MONDAY}))!;
    await finishWorkout(ctx.db, session.id, {now: MONDAY});

    expect(await rollOverStaleSessions(ctx.db, {now: TUESDAY})).toBe(0);
    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    expect(monday.status).toBe('completed');
  });

  it('leaves pending sets pending rather than inventing skips', async () => {
    await rollOverStaleSessions(ctx.db, {now: TUESDAY});
    const monday = (await getSessionForDate(ctx.db, startOfLocalDay(MONDAY)))!;
    // Nothing was done, so nothing is claimed either way. Phase 4's resolver
    // reads this as missed rather than partial.
    expect(monday.exercises[0]!.sets.every(s => s.status === 'pending')).toBe(
      true,
    );
  });
});
