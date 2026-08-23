import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {getPreviousPerformance} from '@/repositories/sessionRepo';
import {createTestDb} from '../helpers/testDb';

const day = (d: number) => new Date(2026, 7, d).getTime();

describe('getPreviousPerformance', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const session = async (id: string, date: number, status = 'completed') =>
    ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES (${id},${date},'Push Day',${status},${date})`,
    );

  const performed = async (id: string, sessionId: string, exerciseId: string) =>
    ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES (${id},${sessionId},${exerciseId},0,'completed')`,
    );

  const set = async (
    id: string,
    performedExerciseId: string,
    setNumber: number,
    reps: number | null,
    weight: number | null,
    status = 'completed',
  ) =>
    ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,actual_reps,actual_weight,
             status,is_unplanned)
          VALUES (${id},${performedExerciseId},${setNumber},${reps},${weight},
                  ${status},0)`,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0),
                 ('fly','Fly','chest','[]','strength',1,0,0)`,
    );
  });
  afterEach(() => ctx.close());

  it('has nothing to report the first time an exercise is done', async () => {
    expect(
      await getPreviousPerformance(ctx.db, 'bench', {before: day(20)}),
    ).toBeUndefined();
  });

  it('reports the sets from the last time, in order', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await set('ps2', 'pe1', 2, 10, 30);
    await set('ps3', 'pe1', 3, 8, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(15));
    expect(previous?.sets).toEqual([
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 8, weight: 30},
    ]);
  });

  it('reaches for the most recent session, not the first', async () => {
    await session('s1', day(8));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 5, 20);

    await session('s2', day(15));
    await performed('pe2', 's2', 'bench');
    await set('ps2', 'pe2', 1, 10, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(15));
    expect(previous?.sets).toEqual([{reps: 10, weight: 30}]);
  });

  // Today's own session must not be its own "last time" — that would show the
  // set you are standing there doing as history.
  it('ignores anything on or after the date it is asked about', async () => {
    await session('s1', day(20));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    expect(
      await getPreviousPerformance(ctx.db, 'bench', {before: day(20)}),
    ).toBeUndefined();
  });

  it('reports only the exercise it was asked about', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await performed('pe2', 's1', 'fly');
    await set('ps2', 'pe2', 1, 12, 15);

    const previous = await getPreviousPerformance(ctx.db, 'fly', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 12, weight: 15}]);
  });

  // Sets that were skipped are not performance. Showing them as "last time"
  // would suggest a number that was never lifted.
  it('leaves out sets that were never recorded', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);
    await set('ps2', 'pe1', 2, null, null, 'skipped');
    await set('ps3', 'pe1', 3, null, null, 'pending');

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 10, weight: 30}]);
  });

  // A partial workout is still real work, so an abandoned session counts.
  it('counts work recorded in a session that was abandoned', async () => {
    await session('s1', day(15), 'abandoned');
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toHaveLength(1);
  });

  it('skips a session where the exercise was entirely skipped', async () => {
    await session('s1', day(8));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 10, 30);

    await session('s2', day(15));
    await performed('pe2', 's2', 'bench');
    await set('ps2', 'pe2', 1, null, null, 'skipped');

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.date).toBe(day(8));
  });

  it('reports a bodyweight set with no weight', async () => {
    await session('s1', day(15));
    await performed('pe1', 's1', 'bench');
    await set('ps1', 'pe1', 1, 15, null);

    const previous = await getPreviousPerformance(ctx.db, 'bench', {
      before: day(20),
    });
    expect(previous?.sets).toEqual([{reps: 15, weight: null}]);
  });
});
