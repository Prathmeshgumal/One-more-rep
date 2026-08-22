import {readFileSync} from 'node:fs';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {seedExercises} from '@/db/seed/seedExercises';
import * as seedModule from '@/db/seed';
import {loadSeedExercises} from '@/db/seed';
import {listExercises, createCustomExercise} from '@/repositories/exerciseRepo';
import {createTestDb} from '../helpers/testDb';

const seedExerciseData = loadSeedExercises();

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

  // The seed data is 776 KB, three quarters of it instruction text. It must be
  // read once in the app's lifetime, not on every cold start — so the count
  // check has to come first, and nothing may pull the JSON in statically.
  it('never reads the seed data on a database that is already seeded', async () => {
    await seedExercises(ctx.db);
    const load = jest.spyOn(seedModule, 'loadSeedExercises');
    try {
      expect((await seedExercises(ctx.db)).inserted).toBe(0);
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it('reaches the seed data only through the on-demand loader', () => {
    const sources = [
      readFileSync('src/db/seed/index.ts', 'utf8'),
      readFileSync('src/db/seed/seedExercises.ts', 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/^import .*exercises\.json/m);
    }
  });
});
