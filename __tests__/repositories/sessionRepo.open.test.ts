import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startOpenWorkout,
  startWorkout,
  addExercise,
  getSessionForDate,
  getActiveSession,
} from '@/repositories/sessionRepo';
import {startOfLocalDay} from '@/domain/weekday';
import {WORKOUT_NAME_MAX_LENGTH} from '@/constants';
import {createTestDb} from '../helpers/testDb';

// A Monday, so weekday 0 is the day under test.
const MONDAY = new Date(2026, 7, 17, 9).getTime();
const MONDAY_MIDNIGHT = startOfLocalDay(MONDAY);

/**
 * A workout recorded without a plan.
 *
 * The point of these tests is the half that is *not* new: an open session must
 * be the same kind of row as a planned one, so that every screen, every domain
 * function and every history query keeps working without knowing which it is
 * looking at. What differs is only that it points at no plan and starts empty.
 */
describe('startOpenWorkout', () => {
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
  });
  afterEach(() => ctx.close());

  it('creates a session with no plan in the database at all', async () => {
    const session = await startOpenWorkout(ctx.db, {
      name: 'Arms & shoulders',
      now: MONDAY,
    });

    expect(session.dayName).toBe('Arms & shoulders');
    expect(session.status).toBe('in_progress');
    expect(session.date).toBe(MONDAY_MIDNIGHT);
    expect(session.completedAt).toBeNull();
  });

  it('starts empty — there was nothing to materialize', async () => {
    const session = await startOpenWorkout(ctx.db, {
      name: 'Arms',
      now: MONDAY,
    });
    expect(session.exercises).toEqual([]);
  });

  /**
   * The provenance columns are the whole distinction. If these were ever
   * written, the session would resolve through a plan it was never performed
   * against, and editing that plan could change what history says happened.
   */
  it('leaves both plan columns NULL', async () => {
    await startOpenWorkout(ctx.db, {name: 'Arms', now: MONDAY});

    const rows = await ctx.db.all<{
      plan_version_id: string | null;
      plan_day_id: string | null;
    }>(sql`SELECT plan_version_id, plan_day_id FROM workout_sessions`);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan_version_id).toBeNull();
    expect(rows[0]!.plan_day_id).toBeNull();
  });

  it('is found by the same queries every screen already uses', async () => {
    const started = await startOpenWorkout(ctx.db, {
      name: 'Arms',
      now: MONDAY,
    });

    const byDate = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    // The same clock the session was started on: getActiveSession is scoped to
    // today, and today for this fixture is the Monday, not the wall clock.
    const active = await getActiveSession(ctx.db, {now: MONDAY});

    expect(byDate?.id).toBe(started.id);
    expect(active?.id).toBe(started.id);
  });

  it('takes exercises through the path unplanned work already uses', async () => {
    const session = await startOpenWorkout(ctx.db, {
      name: 'Arms',
      now: MONDAY,
    });
    await addExercise(ctx.db, session.id, 'bench');

    const after = await getSessionForDate(ctx.db, MONDAY_MIDNIGHT);
    expect(after!.exercises.map(e => e.name)).toEqual(['Bench Press']);
    // addExercise opens every exercise with one set to record into.
    expect(after!.exercises[0]!.sets).toHaveLength(1);
    expect(after!.exercises[0]!.sets[0]!.targetReps).toBeNull();
    expect(after!.exercises[0]!.sets[0]!.isUnplanned).toBe(true);
  });

  describe('the name', () => {
    it('is trimmed', async () => {
      const session = await startOpenWorkout(ctx.db, {
        name: '   Leg day   ',
        now: MONDAY,
      });
      expect(session.dayName).toBe('Leg day');
    });

    it('is refused when empty, because the column cannot be null', async () => {
      await expect(
        startOpenWorkout(ctx.db, {name: '   ', now: MONDAY}),
      ).rejects.toThrow(/name/i);
    });

    /**
     * Refused rather than truncated: silently cutting words somebody typed is
     * the same failure `setExerciseNotes` refuses to make.
     */
    it('is refused past the limit rather than truncated', async () => {
      const tooLong = 'a'.repeat(WORKOUT_NAME_MAX_LENGTH + 1);
      await expect(
        startOpenWorkout(ctx.db, {name: tooLong, now: MONDAY}),
      ).rejects.toThrow(/name/i);

      const rows = await ctx.db.all<{n: number}>(
        sql`SELECT COUNT(*) AS n FROM workout_sessions`,
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('accepts a name exactly at the limit', async () => {
      const exact = 'a'.repeat(WORKOUT_NAME_MAX_LENGTH);
      const session = await startOpenWorkout(ctx.db, {
        name: exact,
        now: MONDAY,
      });
      expect(session.dayName).toBe(exact);
    });
  });

  describe('alongside a plan', () => {
    beforeEach(async () => {
      await createPlan(ctx.db, {now: MONDAY});
      await editPlan(
        ctx.db,
        d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
        MONDAY,
      );
    });

    /**
     * The plan is not consulted. Walking in and doing something else is the
     * entire reason this exists, so a Monday with a Push Day planned must
     * still open an empty session named what the user said.
     */
    it('ignores a plan that exists for today', async () => {
      const session = await startOpenWorkout(ctx.db, {
        name: 'Arms',
        now: MONDAY,
      });
      expect(session.dayName).toBe('Arms');
      expect(session.exercises).toEqual([]);
    });

    it('works on a rest day, which startWorkout refuses', async () => {
      await editPlan(ctx.db, d => setRestDay(d, 0, true), MONDAY);

      await expect(startWorkout(ctx.db, {now: MONDAY})).rejects.toThrow(
        /rest day/i,
      );
      const session = await startOpenWorkout(ctx.db, {
        name: 'Felt good',
        now: MONDAY,
      });
      expect(session.dayName).toBe('Felt good');
    });

    /**
     * One session per date is an invariant the whole app leans on —
     * `getSessionForDate` returns one row, and history draws one card a day.
     * Extra work on a day that already has a session joins it through
     * `addExercise` instead.
     */
    it('refuses when a planned session already exists today', async () => {
      await startWorkout(ctx.db, {now: MONDAY});
      await expect(
        startOpenWorkout(ctx.db, {name: 'Arms', now: MONDAY}),
      ).rejects.toThrow(/already/i);
    });

    it('refuses a second open session on the same day', async () => {
      await startOpenWorkout(ctx.db, {name: 'Morning', now: MONDAY});
      await expect(
        startOpenWorkout(ctx.db, {name: 'Evening', now: MONDAY}),
      ).rejects.toThrow(/already/i);
    });
  });
});
