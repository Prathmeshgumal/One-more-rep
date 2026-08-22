import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {seedExercises} from '@/db/seed/seedExercises';
import {seedExerciseData} from '@/db/seed';
import {listExercises, createCustomExercise} from '@/repositories/exerciseRepo';
import {createTestDb} from '../helpers/testDb';

describe('seedExercises', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  it('inserts the whole library on an empty database', async () => {
    const result = await seedExercises(ctx.db);
    expect(result.inserted).toBe(seedExerciseData.length);
    expect(await listExercises(ctx.db)).toHaveLength(seedExerciseData.length);
  });

  it('is a no-op on a database that already holds the library', async () => {
    await seedExercises(ctx.db);
    const second = await seedExercises(ctx.db);
    expect(second.inserted).toBe(0);
    expect(await listExercises(ctx.db)).toHaveLength(seedExerciseData.length);
  });

  it('never overwrites a custom exercise', async () => {
    const mine = await createCustomExercise(ctx.db, {
      name: 'My Movement',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.find(e => e.id === mine.id)?.name).toBe('My Movement');
    expect(all).toHaveLength(seedExerciseData.length + 1);
  });

  it('marks every seeded exercise as not custom', async () => {
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.every(e => e.isCustom === false)).toBe(true);
  });

  it('stores secondary muscles as parseable JSON', async () => {
    await seedExercises(ctx.db);
    const all = await listExercises(ctx.db);
    expect(all.every(e => Array.isArray(e.secondaryMuscles))).toBe(true);
  });

  it('inserts inside a transaction, leaving nothing behind on failure', async () => {
    const poison = [
      ...seedExerciseData.slice(0, 3),
      {...seedExerciseData[0]!, name: null as unknown as string},
    ];
    await expect(seedExercises(ctx.db, poison)).rejects.toThrow();
    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM exercises`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});
