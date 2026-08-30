import {sql} from 'drizzle-orm';
import {runMigrations, getSchemaVersion} from '@/db/migrate';
import {migrations as shipped} from '@/db/migrations';
import type {AppDatabase} from '@/db/types';
import {createTestDb} from '../helpers/testDb';

/**
 * The app is installed and in use, with real training in it. Every migration
 * from here on has to be additive: a release that loses somebody's history is
 * not a release, it is an accident.
 *
 * These tests exist because every other migration test starts from an empty
 * database, and an empty database cannot tell you whether an upgrade preserved
 * anything. This one fills a database at the version the user is actually on,
 * upgrades it, and checks the rows are still there with the same values.
 *
 * When a migration is added: bump `INSTALLED_VERSION` only if the fixture
 * below needs to describe a newer schema. The point is to seed at the version
 * a real phone is on and migrate forward from it.
 */
const INSTALLED_VERSION = 5;

/** Everything a real install has: a plan, a workout, and settings. */
async function seedRealData(db: AppDatabase): Promise<void> {
  await db.run(
    sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
          equipment,exercise_type,weight_applicable,is_custom,updated_at)
        VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,1),
               ('mine','My Own Lift','chest','[]','barbell','strength',1,1,1)`,
  );
  await db.run(
    sql`INSERT INTO plan_versions (id,name,effective_from,effective_to)
        VALUES ('pv1','My plan',1000,NULL)`,
  );
  await db.run(
    sql`INSERT INTO plan_days (id,plan_version_id,weekday,custom_name,is_rest_day)
        VALUES ('pd1','pv1',0,'Push Day',0)`,
  );
  await db.run(
    sql`INSERT INTO planned_exercises (id,plan_day_id,exercise_id,order_index)
        VALUES ('ple1','pd1','bench',0)`,
  );
  await db.run(
    sql`INSERT INTO planned_sets (id,planned_exercise_id,set_number,target_reps,target_weight)
        VALUES ('pls1','ple1',1,10,60), ('pls2','ple1',2,10,62.5)`,
  );
  await db.run(
    sql`INSERT INTO workout_sessions
          (id,date,plan_version_id,plan_day_id,day_name_snapshot,status,started_at,completed_at)
        VALUES ('ws1',86400000,'pv1','pd1','Push Day','completed',1,2)`,
  );
  await db.run(
    sql`INSERT INTO performed_exercises
          (id,workout_session_id,exercise_id,planned_exercise_id,order_index,status)
        VALUES ('pex1','ws1','bench','ple1',0,'completed')`,
  );
  await db.run(
    sql`INSERT INTO performed_sets
          (id,performed_exercise_id,set_number,target_reps,target_weight,
           actual_reps,actual_weight,status,is_unplanned,completed_at)
        VALUES ('ps1','pex1',1,10,60,10,60,'completed',0,3),
               ('ps2','pex1',2,10,62.5,8,62.5,'completed',0,4)`,
  );
  await db.run(
    sql`INSERT INTO settings (id,unit,week_start_day,default_increment,updated_at)
        VALUES ('singleton','lb',1,2.5,5)`,
  );
}

describe('an upgrade never loses what is already there', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const upgradedFromInstalled = async () => {
    // The schema a phone in the field is actually running...
    await runMigrations(ctx.db, shipped.slice(0, INSTALLED_VERSION));
    await seedRealData(ctx.db);
    // ...then every release since.
    return runMigrations(ctx.db);
  };

  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => ctx.close());

  it('actually has newer migrations to apply, or this proves nothing', async () => {
    const result = await upgradedFromInstalled();
    expect(result.applied).toBeGreaterThan(0);
    expect(await getSchemaVersion(ctx.db)).toBe(shipped.length);
  });

  it('keeps every recorded set, with its numbers', async () => {
    await upgradedFromInstalled();
    const sets = await ctx.db.all<{
      id: string;
      actual_reps: number;
      actual_weight: number;
      status: string;
    }>(sql`SELECT id, actual_reps, actual_weight, status
           FROM performed_sets ORDER BY set_number`);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({
      id: 'ps1',
      actual_reps: 10,
      actual_weight: 60,
      status: 'completed',
    });
    expect(sets[1]).toMatchObject({
      id: 'ps2',
      actual_reps: 8,
      actual_weight: 62.5,
    });
  });

  it('keeps the workout and the exercise it was performed against', async () => {
    await upgradedFromInstalled();
    const sessions = await ctx.db.all<{id: string; day_name_snapshot: string}>(
      sql`SELECT id, day_name_snapshot FROM workout_sessions`,
    );
    expect(sessions).toEqual([{id: 'ws1', day_name_snapshot: 'Push Day'}]);

    const performed = await ctx.db.all<{
      id: string;
      planned_exercise_id: string;
    }>(sql`SELECT id, planned_exercise_id FROM performed_exercises`);
    expect(performed).toEqual([{id: 'pex1', planned_exercise_id: 'ple1'}]);
  });

  it('keeps the plan, including a custom day name', async () => {
    await upgradedFromInstalled();
    const days = await ctx.db.all<{custom_name: string}>(
      sql`SELECT custom_name FROM plan_days`,
    );
    expect(days).toEqual([{custom_name: 'Push Day'}]);
    const targets = await ctx.db.all<{target_weight: number}>(
      sql`SELECT target_weight FROM planned_sets ORDER BY set_number`,
    );
    expect(targets.map(t => t.target_weight)).toEqual([60, 62.5]);
  });

  it('keeps a custom exercise the user made', async () => {
    await upgradedFromInstalled();
    const custom = await ctx.db.all<{name: string}>(
      sql`SELECT name FROM exercises WHERE is_custom = 1`,
    );
    expect(custom).toEqual([{name: 'My Own Lift'}]);
  });

  it('keeps settings the user chose rather than resetting them', async () => {
    await upgradedFromInstalled();
    const rows = await ctx.db.all<{unit: string; default_increment: number}>(
      sql`SELECT unit, default_increment FROM settings`,
    );
    expect(rows).toEqual([{unit: 'lb', default_increment: 2.5}]);
  });

  it('gives a column added later a sensible value on an existing row', async () => {
    await upgradedFromInstalled();
    // theme_mode arrived in 0005 and did not exist when this row was written.
    const rows = await ctx.db.all<{theme_mode: string}>(
      sql`SELECT theme_mode FROM settings`,
    );
    expect(rows).toEqual([{theme_mode: 'system'}]);

    // notes arrived in 0006 and is nullable, so an old row simply has none.
    const notes = await ctx.db.all<{notes: string | null}>(
      sql`SELECT notes FROM performed_exercises`,
    );
    expect(notes).toEqual([{notes: null}]);
  });

  it('is repeatable — running the upgrade twice changes nothing', async () => {
    await upgradedFromInstalled();
    const again = await runMigrations(ctx.db);
    expect(again.applied).toBe(0);
    const sets = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM performed_sets`,
    );
    expect(sets[0]?.n).toBe(2);
  });
});

/**
 * A structural guard on the migrations themselves, so a destructive one cannot
 * be added without somebody deliberately arguing with this test.
 */
describe('no shipped migration is destructive', () => {
  const statements = shipped.flatMap(m =>
    m.statements.map(s => ({name: m.name, sql: s})),
  );

  it('never drops a table', () => {
    const drops = statements.filter(s => /\bDROP\s+TABLE\b/i.test(s.sql));
    expect(drops.map(d => d.name)).toEqual([]);
  });

  it('never drops a column', () => {
    // SQLite can drop columns since 3.35, and Drizzle will happily generate it
    // from a removed field. On an installed app that is somebody's data.
    const drops = statements.filter(s => /\bDROP\s+COLUMN\b/i.test(s.sql));
    expect(drops.map(d => d.name)).toEqual([]);
  });

  it('only ever deletes rows that are already orphans', () => {
    // 0003 prunes plan rows whose parent no longer exists — a repair, not a
    // loss. Any other DELETE has to justify itself here first.
    const deletes = statements.filter(s => /\bDELETE\s+FROM\b/i.test(s.sql));
    for (const statement of deletes) {
      expect(statement.sql).toMatch(/NOT IN \(SELECT/i);
    }
  });
});
