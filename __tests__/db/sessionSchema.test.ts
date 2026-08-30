import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createTestDb} from '../helpers/testDb';

describe('session schema', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO workout_sessions (id,date,day_name_snapshot,status,started_at)
          VALUES ('s1',0,'Push Day','in_progress',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('pe1','s1','bench',0,'pending')`,
    );
  });
  afterEach(() => ctx.close());

  const columns = async (table: string) => {
    const rows = await ctx.db.all<{name: string}>(
      sql.raw(`PRAGMA table_info(${table})`),
    );
    return rows.map(r => r.name);
  };

  it('creates all three session tables', async () => {
    const rows = await ctx.db.all<{name: string}>(
      sql`SELECT name FROM sqlite_master WHERE type='table'`,
    );
    expect(rows.map(r => r.name)).toEqual(
      expect.arrayContaining([
        'workout_sessions',
        'performed_exercises',
        'performed_sets',
      ]),
    );
  });

  it('records what the day was called at the time', async () => {
    expect(await columns('workout_sessions')).toEqual(
      expect.arrayContaining([
        'id',
        'date',
        'plan_version_id',
        'plan_day_id',
        'day_name_snapshot',
        'status',
        'started_at',
        'completed_at',
      ]),
    );
  });

  it('lets an exercise exist with no plan behind it', async () => {
    expect(await columns('performed_exercises')).toEqual(
      expect.arrayContaining([
        'id',
        'workout_session_id',
        'exercise_id',
        'planned_exercise_id',
        'order_index',
        'status',
      ]),
    );
    // D3: an unplanned exercise is one with no planned_exercise_id.
    await ctx.db.run(
      sql`INSERT INTO performed_exercises
            (id,workout_session_id,exercise_id,order_index,status)
          VALUES ('pe2','s1','bench',1,'pending')`,
    );
    const rows = await ctx.db.all<{planned_exercise_id: string | null}>(
      sql`SELECT planned_exercise_id FROM performed_exercises WHERE id='pe2'`,
    );
    expect(rows[0]?.planned_exercise_id).toBeNull();
  });

  it('keeps target and actual as separate columns', async () => {
    expect(await columns('performed_sets')).toEqual(
      expect.arrayContaining([
        'id',
        'performed_exercise_id',
        'set_number',
        'target_reps',
        'target_weight',
        'actual_reps',
        'actual_weight',
        'status',
        'is_unplanned',
        'completed_at',
      ]),
    );
  });

  // Spec 6.2: actuals stay NULL until a set is completed. If the pre-filled
  // value were stored, an untouched set would be indistinguishable from a
  // performed one after a crash — the exact failure this rule prevents.
  it('allows a pending set with a target and no actuals', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,target_reps,target_weight,
             status,is_unplanned)
          VALUES ('ps1','pe1',1,10,30,'pending',0)`,
    );
    const rows = await ctx.db.all<{
      actual_reps: number | null;
      actual_weight: number | null;
    }>(
      sql`SELECT actual_reps, actual_weight FROM performed_sets WHERE id='ps1'`,
    );
    expect(rows[0]?.actual_reps).toBeNull();
    expect(rows[0]?.actual_weight).toBeNull();
  });

  // D3: a bonus set beyond the plan has no target at all.
  it('allows an unplanned set with no target', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,status,is_unplanned)
          VALUES ('ps2','pe1',4,'pending',1)`,
    );
    const rows = await ctx.db.all<{target_reps: number | null}>(
      sql`SELECT target_reps FROM performed_sets WHERE id='ps2'`,
    );
    expect(rows[0]?.target_reps).toBeNull();
  });

  it('cascades a session delete through exercises and sets', async () => {
    await ctx.db.run(
      sql`INSERT INTO performed_sets
            (id,performed_exercise_id,set_number,target_reps,status,is_unplanned)
          VALUES ('ps1','pe1',1,10,'pending',0)`,
    );

    await ctx.db.run(sql`DELETE FROM workout_sessions WHERE id='s1'`);

    for (const table of ['performed_exercises', 'performed_sets']) {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  // §39, structurally: deleting a plan version must never take a session's
  // record of what happened with it.
  it('does not delete a session when its plan version goes away', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from) VALUES ('v1','p',0)`,
    );
    // A different date: the fixture already holds a session on date 0, and
    // one session per date is exactly what the unique index enforces.
    await ctx.db.run(
      sql`INSERT INTO workout_sessions
            (id,date,plan_version_id,day_name_snapshot,status,started_at)
          VALUES ('s2',86400000,'v1','Push Day','completed',0)`,
    );

    await ctx.db.run(sql`DELETE FROM plan_versions WHERE id='v1'`);

    const rows = await ctx.db.all<{plan_version_id: string | null}>(
      sql`SELECT plan_version_id FROM workout_sessions WHERE id='s2'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan_version_id).toBeNull();
  });

  it('refuses two sessions on the same date', async () => {
    const error = await (async () =>
      ctx.db.run(
        sql`INSERT INTO workout_sessions
              (id,date,day_name_snapshot,status,started_at)
            VALUES ('dup',0,'Push Day','in_progress',0)`,
      ))().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();

    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM workout_sessions WHERE date=0`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
