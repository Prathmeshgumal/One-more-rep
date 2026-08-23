import {sql} from 'drizzle-orm';
import {CONNECTION_PRAGMAS, applyConnectionPragmas} from '@/db/client';
import {runMigrations} from '@/db/migrate';
import * as pruneMigration from '@/db/migrations/0003_prune_plan_orphans';
import {createTestDb} from '../helpers/testDb';

describe('connection pragmas', () => {
  // SQLite enforces foreign keys per connection and off by default. The schema
  // declares ON DELETE CASCADE, and without this the cascade silently does
  // nothing in the shipped app while every test still passes — which is exactly
  // what happened, leaving 65 orphaned rows on a real device.
  it('turns foreign key enforcement on', () => {
    expect(CONNECTION_PRAGMAS).toContain('PRAGMA foreign_keys = ON');
  });

  it('applies every pragma to the connection it is given', () => {
    const issued: string[] = [];
    applyConnectionPragmas({
      executeSync: (query: string) => {
        issued.push(query);
        return undefined;
      },
    });
    expect(issued).toEqual([...CONNECTION_PRAGMAS]);
  });
});

describe('the orphan-pruning migration', () => {
  let ctx: ReturnType<typeof createTestDb>;

  afterEach(() => ctx.close());

  it('deletes rows left behind while foreign keys were off', async () => {
    ctx = createTestDb();

    // Foreign keys off is the state the shipped app was in, and the only way
    // to create the orphans this migration exists to clean up.
    await ctx.db.run(sql.raw('PRAGMA foreign_keys = OFF'));
    await runMigrations(ctx.db);

    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from) VALUES ('v1','p',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_days (id,plan_version_id,weekday,is_rest_day)
          VALUES ('live','v1',0,0)`,
    );
    // A day that no longer exists, and a whole tree hanging off it.
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id,plan_day_id,exercise_id,order_index)
          VALUES ('keep','live','bench',0), ('orphan','deleted-day','bench',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id,planned_exercise_id,set_number,target_reps)
          VALUES ('s-keep','keep',1,10), ('s-orphan','orphan',1,10)`,
    );

    // Run the pruning migration's own statements over the rows just planted.
    // Rewinding user_version and replaying the chain would re-run every later
    // migration too, and their CREATE TABLEs would fail on tables that exist.
    for (const statement of pruneMigration.statements) {
      await ctx.db.run(sql.raw(statement));
    }

    const ids = async (table: string) => {
      const rows = await ctx.db.all<{id: string}>(
        sql.raw(`SELECT id FROM ${table} ORDER BY id`),
      );
      return rows.map(r => r.id);
    };

    expect(await ids('planned_exercises')).toEqual(['keep']);
    expect(await ids('planned_sets')).toEqual(['s-keep']);
  });

  it('leaves a healthy plan completely alone', async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);

    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench','chest','[]','strength',1,0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from) VALUES ('v1','p',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_days (id,plan_version_id,weekday,is_rest_day)
          VALUES ('d1','v1',0,0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id,plan_day_id,exercise_id,order_index)
          VALUES ('pe1','d1','bench',0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id,planned_exercise_id,set_number,target_reps)
          VALUES ('ps1','pe1',1,10)`,
    );

    for (const statement of pruneMigration.statements) {
      await ctx.db.run(sql.raw(statement));
    }

    const count = async (table: string) => {
      const rows = await ctx.db.all<{n: number}>(
        sql.raw(`SELECT COUNT(*) AS n FROM ${table}`),
      );
      return rows[0]?.n;
    };
    expect(await count('plan_days')).toBe(1);
    expect(await count('planned_exercises')).toBe(1);
    expect(await count('planned_sets')).toBe(1);
  });
});
