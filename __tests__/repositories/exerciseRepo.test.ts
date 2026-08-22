import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  listExercises,
  getExercise,
  createCustomExercise,
  updateCustomExercise,
  softDeleteExercise,
  countExercises,
} from '@/repositories/exerciseRepo';
import {createTestDb} from '../helpers/testDb';

describe('exerciseRepo', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const seed = async () => {
    await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders'],
      equipment: 'cable',
      weightApplicable: true,
    });
    await createCustomExercise(ctx.db, {
      name: 'Air Squat',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: 'body only',
      weightApplicable: false,
    });
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
  });
  afterEach(() => ctx.close());

  it('starts empty', async () => {
    expect(await countExercises(ctx.db)).toBe(0);
  });

  it('creates a custom exercise and reads it back with parsed muscles', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: ['shoulders', 'triceps'],
      equipment: 'cable',
      weightApplicable: true,
    });
    expect(created.isCustom).toBe(true);
    expect(created.secondaryMuscles).toEqual(['shoulders', 'triceps']);

    const read = await getExercise(ctx.db, created.id);
    expect(read?.secondaryMuscles).toEqual(['shoulders', 'triceps']);
  });

  it('lists alphabetically by name', async () => {
    await seed();
    const all = await listExercises(ctx.db);
    expect(all.map(e => e.name)).toEqual(['Air Squat', 'Cable Fly']);
  });

  it('searches by name, case-insensitively', async () => {
    await seed();
    const found = await listExercises(ctx.db, {search: 'cable'});
    expect(found.map(e => e.name)).toEqual(['Cable Fly']);
  });

  it('matches a search term anywhere in the name', async () => {
    await seed();
    const found = await listExercises(ctx.db, {search: 'squat'});
    expect(found.map(e => e.name)).toEqual(['Air Squat']);
  });

  it('treats a search term with SQL wildcards literally', async () => {
    await seed();
    expect(await listExercises(ctx.db, {search: '%'})).toEqual([]);
  });

  it('finds a name that genuinely contains a wildcard character', async () => {
    await createCustomExercise(ctx.db, {
      name: 'Treadmill 5% Incline Walk',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: null,
      weightApplicable: false,
    });
    const found = await listExercises(ctx.db, {search: '5%'});
    expect(found.map(e => e.name)).toEqual(['Treadmill 5% Incline Walk']);
  });

  it('filters by primary muscle', async () => {
    await seed();
    const found = await listExercises(ctx.db, {muscles: ['chest']});
    expect(found.map(e => e.name)).toEqual(['Cable Fly']);
  });

  it('filters by a group of muscles, so Back catches lats and traps alike', async () => {
    await seed();
    const found = await listExercises(ctx.db, {muscles: ['chest', 'quadriceps']});
    expect(found.map(e => e.name)).toEqual(['Air Squat', 'Cable Fly']);
  });

  it('treats an empty muscle group as no filter', async () => {
    await seed();
    expect(await listExercises(ctx.db, {muscles: []})).toHaveLength(2);
  });

  it('combines search and muscle filter', async () => {
    await seed();
    expect(
      await listExercises(ctx.db, {search: 'cable', muscles: ['quadriceps']}),
    ).toEqual([]);
  });

  it('updates a custom exercise', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    const updated = await updateCustomExercise(ctx.db, created.id, {
      name: 'Cable Fly (wide grip)',
      weightApplicable: false,
    });
    expect(updated.name).toBe('Cable Fly (wide grip)');
    expect(updated.weightApplicable).toBe(false);
    expect(updated.primaryMuscle).toBe('chest');
  });

  it('hides soft-deleted exercises but keeps the row', async () => {
    await seed();
    const [first] = await listExercises(ctx.db);
    await softDeleteExercise(ctx.db, first!.id);

    expect((await listExercises(ctx.db)).map(e => e.name)).toEqual(['Cable Fly']);
    expect(await countExercises(ctx.db)).toBe(2);
    expect(await getExercise(ctx.db, first!.id)).toBeDefined();
  });

  it('can be asked for deleted exercises explicitly', async () => {
    await seed();
    const [first] = await listExercises(ctx.db);
    await softDeleteExercise(ctx.db, first!.id);
    expect(await listExercises(ctx.db, {includeDeleted: true})).toHaveLength(2);
  });

  it('stamps updatedAt on every write', async () => {
    const created = await createCustomExercise(ctx.db, {
      name: 'Cable Fly',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'cable',
      weightApplicable: true,
    });
    await new Promise(r => setTimeout(r, 5));
    const updated = await updateCustomExercise(ctx.db, created.id, {name: 'Fly'});
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  // Phase 1's exit criteria say built-ins cannot be edited. Today the detail
  // screen's Edit button is the only thing enforcing that, and a rule that
  // lives in one button is one the next screen breaks without noticing.
  it('refuses to edit a built-in exercise', async () => {
    await ctx.db.run(
      sql`INSERT INTO exercises (id, name, primary_muscle, secondary_muscles,
            equipment, exercise_type, weight_applicable, is_custom, updated_at)
          VALUES ('Barbell_Squat', 'Barbell Squat', 'quadriceps', '[]',
            'barbell', 'strength', 1, 0, 0)`,
    );
    await expect(
      updateCustomExercise(ctx.db, 'Barbell_Squat', {name: 'Mine now'}),
    ).rejects.toThrow(/Built-in exercises cannot be edited/);

    expect((await getExercise(ctx.db, 'Barbell_Squat'))!.name).toBe(
      'Barbell Squat',
    );
  });

  it('says so when asked to edit an exercise that does not exist', async () => {
    await expect(
      updateCustomExercise(ctx.db, 'nope', {name: 'x'}),
    ).rejects.toThrow(/does not exist/);
  });
});
