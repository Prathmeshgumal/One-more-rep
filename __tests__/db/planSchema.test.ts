import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createTestDb} from '../helpers/testDb';

describe('plan schema', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  const columns = async (table: string) => {
    const rows = await ctx.db.all<{name: string; notnull: number}>(
      sql.raw(`PRAGMA table_info(${table})`),
    );
    return rows.map(r => r.name);
  };

  it('creates all four plan tables', async () => {
    const rows = await ctx.db.all<{name: string}>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    const names = rows.map(r => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'plan_versions',
        'plan_days',
        'planned_exercises',
        'planned_sets',
      ]),
    );
  });

  it('gives plan_versions an open-ended effective_to', async () => {
    expect(await columns('plan_versions')).toEqual(
      expect.arrayContaining(['id', 'name', 'effective_from', 'effective_to']),
    );
  });

  it('gives a day its weekday, optional name, and rest flag', async () => {
    expect(await columns('plan_days')).toEqual(
      expect.arrayContaining([
        'id',
        'plan_version_id',
        'weekday',
        'custom_name',
        'is_rest_day',
      ]),
    );
  });

  it('orders planned exercises explicitly', async () => {
    expect(await columns('planned_exercises')).toEqual(
      expect.arrayContaining([
        'id',
        'plan_day_id',
        'exercise_id',
        'order_index',
      ]),
    );
  });

  it('stores a target per set, not a count of sets', async () => {
    expect(await columns('planned_sets')).toEqual(
      expect.arrayContaining([
        'id',
        'planned_exercise_id',
        'set_number',
        'target_reps',
        'target_weight',
      ]),
    );
  });

  // §9: weight is optional. A zero target would log zero volume forever and
  // §39 forbids rewriting history, so the column must accept NULL.
  it('allows a set with no target weight', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id, name, effective_from) VALUES ('v1','My plan',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_days (id, plan_version_id, weekday, is_rest_day)
          VALUES ('d1','v1',0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('e1','Push-up','chest','[]','strength',0,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id, plan_day_id, exercise_id, order_index)
          VALUES ('pe1','d1','e1',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id, planned_exercise_id, set_number, target_reps)
          VALUES ('ps1','pe1',1,10)`,
    );
    const rows = await ctx.db.all<{target_weight: number | null}>(
      sql`SELECT target_weight FROM planned_sets WHERE id='ps1'`,
    );
    expect(rows[0]?.target_weight).toBeNull();
  });

  // Deleting a version must take its whole tree with it, or a fork that is
  // later discarded leaves orphan days behind.
  it('cascades a version delete through days, exercises, and sets', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id, name, effective_from) VALUES ('v1','My plan',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_days (id, plan_version_id, weekday, is_rest_day)
          VALUES ('d1','v1',0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('e1','Bench','chest','[]','strength',1,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id, plan_day_id, exercise_id, order_index)
          VALUES ('pe1','d1','e1',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id, planned_exercise_id, set_number, target_reps)
          VALUES ('ps1','pe1',1,10)`,
    );

    await ctx.db.run(sql`DELETE FROM plan_versions WHERE id='v1'`);

    for (const table of ['plan_days', 'planned_exercises', 'planned_sets']) {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  it('refuses two days with the same weekday in one version', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id, name, effective_from) VALUES ('v1','My plan',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_days (id, plan_version_id, weekday, is_rest_day)
          VALUES ('d1','v1',0,0)`,
    );
    // better-sqlite3 throws synchronously; op-sqlite rejects. Running the
    // insert inside an async IIFE turns either into a rejection, so this
    // assertion holds against the driver under test and the one that ships.
    // Drizzle wraps the driver error, so the constraint name is on `cause`.
    const error = await (async () =>
      ctx.db.run(
        sql`INSERT INTO plan_days (id, plan_version_id, weekday, is_rest_day)
            VALUES ('d2','v1',0,0)`,
      ))().then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).not.toBeNull();

    // Asserted as behaviour rather than by matching the error message. Drizzle
    // wraps the driver error and the `cause` chain is not reliably walkable
    // across Jest's per-file sandboxes, which made an earlier message-matching
    // version of this test fail intermittently. What matters is that the
    // second row was refused, and that is what is checked.
    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM plan_days WHERE plan_version_id='v1'`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
