import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {
  createPlan,
  editPlan,
  getActivePlan,
  getPlanForDate,
  listPlanVersions,
  countSessionsForPlanVersion,
} from '@/repositories/planRepo';
import {startWorkout} from '@/repositories/sessionRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {createTestDb} from '../helpers/testDb';

const MON_9AM = new Date(2026, 7, 17, 9).getTime();
const MON_9PM = new Date(2026, 7, 17, 21).getTime();

describe('editing a plan that has been trained against', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: MON_9AM});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      MON_9AM,
    );
  });
  afterEach(() => ctx.close());

  it('counts nothing before any workout has been started', async () => {
    const plan = (await getActivePlan(ctx.db))!;
    expect(await countSessionsForPlanVersion(ctx.db, plan.version.id)).toBe(0);
  });

  it('counts a session started against the version', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    const plan = (await getActivePlan(ctx.db))!;
    expect(await countSessionsForPlanVersion(ctx.db, plan.version.id)).toBe(1);
  });

  // Compaction still applies while nothing has been performed: an evening of
  // planning must not leave a dozen versions behind.
  it('still edits in place on the same day when nothing was trained', async () => {
    await editPlan(ctx.db, d => renameDay(d, 1, 'Pull Day'), MON_9PM);
    expect(await listPlanVersions(ctx.db)).toHaveLength(1);
  });

  // §32, and the whole point of this task. Plan in the morning, train at
  // lunch, re-plan in the evening — that lunchtime workout must keep the
  // targets it was actually performed against.
  it('forks once a workout has been performed, even on the same day', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});

    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 5, targetWeight: 100}]),
      MON_9PM,
    );

    const versions = await listPlanVersions(ctx.db);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.effectiveTo).toBeNull();
    expect(versions[1]!.effectiveTo).toBe(MON_9PM);
  });

  it('leaves the trained version resolvable at its own targets', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    await editPlan(
      ctx.db,
      d => setTargets(d, 0, 0, [{targetReps: 5, targetWeight: 100}]),
      MON_9PM,
    );

    const asTrained = await getPlanForDate(ctx.db, MON_9AM + 1000);
    expect(asTrained!.days[0]!.exercises[0]!.sets).toHaveLength(3);
    expect(asTrained!.days[0]!.exercises[0]!.sets[0]!.targetReps).toBe(10);

    const now = await getPlanForDate(ctx.db, MON_9PM + 1000);
    expect(now!.days[0]!.exercises[0]!.sets).toHaveLength(1);
    expect(now!.days[0]!.exercises[0]!.sets[0]!.targetReps).toBe(5);
  });

  it('keeps exactly one open version after forking for a session', async () => {
    await startWorkout(ctx.db, {now: MON_9AM});
    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), MON_9PM);

    const rows = await ctx.db.all<{n: number}>(
      sql`SELECT COUNT(*) AS n FROM plan_versions WHERE effective_to IS NULL`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  // The session points at the version it was performed against; forking must
  // not repoint it at the new one.
  it('leaves the session attached to the version it was performed against', async () => {
    const session = await startWorkout(ctx.db, {now: MON_9AM});
    const versionAtStart = session.planVersionId;

    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), MON_9PM);

    const rows = await ctx.db.all<{plan_version_id: string}>(
      sql`SELECT plan_version_id FROM workout_sessions WHERE id=${session.id}`,
    );
    expect(rows[0]?.plan_version_id).toBe(versionAtStart);
  });
});
