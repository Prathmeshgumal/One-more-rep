import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  getActivePlan,
  getPlanForDate,
  createPlan,
  listPlanVersions,
  toDraft,
} from '@/repositories/planRepo';
import {createTestDb} from '../helpers/testDb';

const MONDAY = new Date(2026, 7, 17, 10).getTime();

describe('planRepo reads', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
  });
  afterEach(() => ctx.close());

  it('has no plan before one is created', async () => {
    expect(await getActivePlan(ctx.db)).toBeUndefined();
    expect(await listPlanVersions(ctx.db)).toEqual([]);
  });

  it('creates a plan with seven unconfigured days', async () => {
    const plan = await createPlan(ctx.db, {now: MONDAY});
    expect(plan.days).toHaveLength(7);
    expect(plan.days.map(d => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.days.every(d => !d.isRestDay)).toBe(true);
    expect(plan.days.every(d => d.exercises.length === 0)).toBe(true);
    expect(plan.version.effectiveTo).toBeNull();
    expect(plan.version.effectiveFrom).toBe(MONDAY);
  });

  it('reads the plan back as the active one', async () => {
    await createPlan(ctx.db, {now: MONDAY});
    const active = await getActivePlan(ctx.db);
    expect(active?.days).toHaveLength(7);
  });

  it('refuses to create a second plan while one is active', async () => {
    await createPlan(ctx.db, {now: MONDAY});
    await expect(createPlan(ctx.db, {now: MONDAY})).rejects.toThrow(/already/i);
  });

  // Days are indexed by weekday, so a screen can say days[weekday] without
  // scanning — and a missing day is a bug rather than a silent gap.
  it('returns days indexed by weekday even when rows come back unordered', async () => {
    const plan = await createPlan(ctx.db, {now: MONDAY});
    for (const [index, day] of plan.days.entries()) {
      expect(day.weekday).toBe(index);
    }
  });

  it('joins each planned exercise to its library row', async () => {
    const plan = await createPlan(ctx.db, {now: MONDAY});
    const dayId = plan.days[0]!.id;
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id, plan_day_id, exercise_id, order_index)
          VALUES ('pe1', ${dayId}, 'bench', 0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id, planned_exercise_id, set_number, target_reps, target_weight)
          VALUES ('ps1','pe1',1,10,60)`,
    );

    const read = await getActivePlan(ctx.db);
    const exercise = read!.days[0]!.exercises[0]!;
    expect(exercise.name).toBe('Bench Press');
    expect(exercise.equipment).toBe('barbell');
    expect(exercise.weightApplicable).toBe(true);
    expect(exercise.sets).toEqual([
      {setNumber: 1, targetReps: 10, targetWeight: 60},
    ]);
  });

  it('orders exercises by order_index and sets by set_number', async () => {
    const plan = await createPlan(ctx.db, {now: MONDAY});
    const dayId = plan.days[0]!.id;
    // Inserted deliberately out of order.
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id, plan_day_id, exercise_id, order_index)
          VALUES ('b', ${dayId}, 'bench', 1), ('a', ${dayId}, 'bench', 0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id, planned_exercise_id, set_number, target_reps)
          VALUES ('s2','a',2,8), ('s1','a',1,12)`,
    );

    const read = await getActivePlan(ctx.db);
    expect(read!.days[0]!.exercises.map(e => e.plannedExerciseId)).toEqual([
      'a',
      'b',
    ]);
    expect(read!.days[0]!.exercises[0]!.sets.map(s => s.setNumber)).toEqual([
      1, 2,
    ]);
  });

  it('turns a plan into an id-free draft', async () => {
    const plan = await createPlan(ctx.db, {now: MONDAY});
    const dayId = plan.days[0]!.id;
    await ctx.db.run(
      sql`INSERT INTO planned_exercises (id, plan_day_id, exercise_id, order_index)
          VALUES ('pe1', ${dayId}, 'bench', 0)`,
    );
    await ctx.db.run(
      sql`INSERT INTO planned_sets (id, planned_exercise_id, set_number, target_reps, target_weight)
          VALUES ('ps1','pe1',1,10,60)`,
    );
    await ctx.db.run(
      sql`UPDATE plan_days SET custom_name='Push Day' WHERE id=${dayId}`,
    );

    const draft = toDraft((await getActivePlan(ctx.db))!);
    expect(draft.days).toHaveLength(7);
    expect(draft.days[0]!.customName).toBe('Push Day');
    expect(draft.days[0]!.exercises).toEqual([
      {exerciseId: 'bench', sets: [{targetReps: 10, targetWeight: 60}]},
    ]);
    expect(JSON.stringify(draft)).not.toContain('pe1');
  });

  // The whole point of versioning: a past date resolves through the version
  // that was active then, not the one active now (section 32).
  it('resolves a date to the version that covered it', async () => {
    const older = new Date(2026, 7, 10).getTime();
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from,effective_to)
          VALUES ('old','My plan',${older},${MONDAY})`,
    );
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from,effective_to)
          VALUES ('new','My plan',${MONDAY},NULL)`,
    );
    for (const [version, id] of [
      ['old', 'od'],
      ['new', 'nd'],
    ] as const) {
      for (let weekday = 0; weekday < 7; weekday++) {
        await ctx.db.run(
          sql`INSERT INTO plan_days (id, plan_version_id, weekday, is_rest_day)
              VALUES (${`${id}${weekday}`}, ${version}, ${weekday}, 0)`,
        );
      }
    }

    expect((await getPlanForDate(ctx.db, older + 1000))?.version.id).toBe(
      'old',
    );
    expect((await getPlanForDate(ctx.db, MONDAY + 1000))?.version.id).toBe(
      'new',
    );
    expect(await getPlanForDate(ctx.db, older - 1000)).toBeUndefined();
  });

  it('lists versions newest first', async () => {
    await ctx.db.run(
      sql`INSERT INTO plan_versions (id,name,effective_from,effective_to)
          VALUES ('old','My plan',1,2), ('new','My plan',2,NULL)`,
    );
    expect((await listPlanVersions(ctx.db)).map(v => v.id)).toEqual([
      'new',
      'old',
    ]);
  });
});
