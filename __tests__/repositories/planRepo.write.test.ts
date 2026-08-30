import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  createPlan,
  getActivePlan,
  getPlanForDate,
  listPlanVersions,
  editPlan,
} from '@/repositories/planRepo';
import {
  addExercises,
  renameDay,
  setRestDay,
  setTargets,
} from '@/domain/planDraft';
import {createTestDb} from '../helpers/testDb';

const MON_9AM = new Date(2026, 7, 17, 9).getTime();
const MON_9PM = new Date(2026, 7, 17, 21).getTime();
const TUE_9AM = new Date(2026, 7, 18, 9).getTime();

const openVersions = async (ctx: ReturnType<typeof createTestDb>) => {
  const rows = await ctx.db.all<{n: number}>(
    sql`SELECT COUNT(*) AS n FROM plan_versions WHERE effective_to IS NULL`,
  );
  return rows[0]!.n;
};

describe('planRepo writes', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: MON_9AM});
  });
  afterEach(() => ctx.close());

  it('persists a rename', async () => {
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), MON_9AM);
    expect((await getActivePlan(ctx.db))!.days[0]!.customName).toBe('Push Day');
  });

  it('persists exercises with their targets and order', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench', 'fly']), MON_9AM);
    const day = (await getActivePlan(ctx.db))!.days[0]!;
    expect(day.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Cable Fly',
    ]);
    expect(day.exercises[0]!.sets).toEqual([
      {setNumber: 1, targetReps: 10, targetWeight: null},
      {setNumber: 2, targetReps: 10, targetWeight: null},
      {setNumber: 3, targetReps: 10, targetWeight: null},
    ]);
  });

  it('numbers sets from one, in array order', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), MON_9AM);
    await editPlan(
      ctx.db,
      d =>
        setTargets(d, 0, 0, [
          {targetReps: 12, targetWeight: 20},
          {targetReps: 10, targetWeight: 25},
        ]),
      MON_9AM,
    );
    expect((await getActivePlan(ctx.db))!.days[0]!.exercises[0]!.sets).toEqual([
      {setNumber: 1, targetReps: 12, targetWeight: 20},
      {setNumber: 2, targetReps: 10, targetWeight: 25},
    ]);
  });

  it('persists a rest day', async () => {
    await editPlan(ctx.db, d => setRestDay(d, 2, true), MON_9AM);
    expect((await getActivePlan(ctx.db))!.days[2]!.isRestDay).toBe(true);
  });

  // Compaction: an evening of planning should not leave a dozen versions.
  it('edits in place while the version is still from today', async () => {
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), MON_9AM);
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), MON_9PM);
    expect(await listPlanVersions(ctx.db)).toHaveLength(1);
  });

  it('forks a new version once the day has turned over', async () => {
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), MON_9AM);
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), TUE_9AM);

    const versions = await listPlanVersions(ctx.db);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.effectiveTo).toBeNull();
    expect(versions[0]!.effectiveFrom).toBe(TUE_9AM);
    expect(versions[1]!.effectiveTo).toBe(TUE_9AM);
  });

  it('keeps exactly one open version after every kind of edit', async () => {
    expect(await openVersions(ctx)).toBe(1);
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), TUE_9AM);
    expect(await openVersions(ctx)).toBe(1);
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), TUE_9AM);
    expect(await openVersions(ctx)).toBe(1);
  });

  // Section 32, and the reason the whole phase is shaped this way.
  it('leaves the old version untouched when a fork happens', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), MON_9AM);
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 5, targetWeight: 80}]),
      TUE_9AM,
    );

    const before = await getPlanForDate(ctx.db, MON_9AM + 1000);
    const after = await getPlanForDate(ctx.db, TUE_9AM + 1000);

    expect(before!.days[0]!.exercises[0]!.sets).toEqual([
      {setNumber: 1, targetReps: 10, targetWeight: null},
      {setNumber: 2, targetReps: 10, targetWeight: null},
      {setNumber: 3, targetReps: 10, targetWeight: null},
    ]);
    expect(after!.days[0]!.exercises[0]!.sets).toEqual([
      {setNumber: 1, targetReps: 5, targetWeight: 80},
    ]);
  });

  it('carries the whole tree into the fork, not just the edited day', async () => {
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 3, 'Leg Day'), 3, ['bench']),
      MON_9AM,
    );
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), TUE_9AM);

    const active = (await getActivePlan(ctx.db))!;
    expect(active.days[0]!.customName).toBe('Push Day');
    expect(active.days[3]!.customName).toBe('Leg Day');
    expect(active.days[3]!.exercises).toHaveLength(1);
  });

  it('gives the forked version fresh row ids', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['bench']), MON_9AM);
    const before = (await getActivePlan(ctx.db))!.days[0]!.exercises[0]!
      .plannedExerciseId;
    await editPlan(ctx.db, d => renameDay(d, 0, 'Push Day'), TUE_9AM);
    const after = (await getActivePlan(ctx.db))!.days[0]!.exercises[0]!
      .plannedExerciseId;
    expect(after).not.toBe(before);
  });

  it('leaves nothing behind when a save fails partway', async () => {
    const versionsBefore = await listPlanVersions(ctx.db);
    await expect(
      // 'ghost' is not in the exercise library, so the foreign key rejects it.
      editPlan(ctx.db, d => addExercises(d, 0, ['ghost']), TUE_9AM),
    ).rejects.toThrow();

    expect(await listPlanVersions(ctx.db)).toHaveLength(versionsBefore.length);
    expect(await openVersions(ctx)).toBe(1);
    expect((await getActivePlan(ctx.db))!.days[0]!.exercises).toEqual([]);
  });
});
