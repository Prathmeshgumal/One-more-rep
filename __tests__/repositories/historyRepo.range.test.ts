import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {
  addExercises,
  renameDay,
  setRestDay,
  setTargets,
} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addSet,
  finishWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {getDay, getDayRange} from '@/repositories/historyRepo';
import {createTestDb} from '../helpers/testDb';

// August 2026 begins on a Saturday: the 10th, 17th and 24th are Mondays.
const AUG = (day: number) => new Date(2026, 7, day).getTime();
const AUG_AT = (day: number, hour: number) =>
  new Date(2026, 7, day, hour).getTime();

describe('getDayRange', () => {
  let ctx: ReturnType<typeof createTestDb>;

  const dayAt = (days: Awaited<ReturnType<typeof getDayRange>>, date: number) =>
    days.find(d => d.date === date);

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    // A plan that starts on Monday the 10th: Monday trains, Tuesday rests,
    // every other weekday is left unconfigured.
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          setRestDay(
            addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
            1,
            true,
          ),
          0,
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      AUG(10),
    );
  });

  afterEach(() => ctx.close());

  it('returns one resolved day per date in the range, oldest first', async () => {
    const days = await getDayRange(
      ctx.db,
      {from: AUG(10), to: AUG(16)},
      {now: AUG(24)},
    );
    expect(days).toHaveLength(7);
    expect(days.map(d => d.date)).toEqual([10, 11, 12, 13, 14, 15, 16].map(AUG));
  });

  it('reads rest days and unconfigured days out of the plan', async () => {
    const days = await getDayRange(
      ctx.db,
      {from: AUG(10), to: AUG(16)},
      {now: AUG(24)},
    );
    expect(dayAt(days, AUG(11))!.status).toBe('rest');
    // Wednesday was never configured, so nothing was owed.
    expect(dayAt(days, AUG(12))!.status).toBe('no_plan');
  });

  it('reports a past training day with no session as missed, with what was owed', async () => {
    const days = await getDayRange(
      ctx.db,
      {from: AUG(10), to: AUG(16)},
      {now: AUG(24)},
    );
    const monday = dayAt(days, AUG(10))!;
    expect(monday.status).toBe('missed');
    expect(monday.name).toBe('Push Day');
    expect(monday.exerciseCount).toBe(1);
    expect(monday.plannedSets).toBe(3);
  });

  it('carries a finished session into the range with its figures', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const days = await getDayRange(
      ctx.db,
      {from: AUG(17), to: AUG(17)},
      {now: AUG(24)},
    );
    const monday = days[0]!;
    expect(monday.status).toBe('completed');
    expect(monday.sessionId).toBe(session.id);
    expect(monday.name).toBe('Push Day');
    expect(monday.exerciseCount).toBe(1);
    expect(monday.plannedSets).toBe(3);
    expect(monday.completedSets).toBe(3);
    expect(monday.volume).toBe(900);
  });

  it('reports a session that was cut short as partial', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await skipSet(ctx.db, sets[1]!.id);
    await skipSet(ctx.db, sets[2]!.id);
    // Left in progress, then rolled over — the shape a real abandoned day has.
    await ctx.db.run(
      sql`UPDATE workout_sessions SET status = 'abandoned' WHERE id = ${session.id}`,
    );

    const day = await getDay(ctx.db, AUG(17), {now: AUG(24)});
    expect(day.status).toBe('partial');
    expect(day.completedSets).toBe(1);
    expect(day.skippedSets).toBe(2);
  });

  // Spec 5.5: bonus work is real training, but it never had a target, so it
  // cannot be allowed to inflate the plan it was never part of.
  it('excludes bonus sets from both halves of the set count but not from volume', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await addSet(ctx.db, session.exercises[0]!.id);
    const withBonus = await getSessionForDate(ctx.db, AUG(17));
    const bonus = withBonus!.exercises[0]!.sets.find(s => s.isUnplanned)!;
    await completeSet(ctx.db, bonus.id, {actualReps: 8, actualWeight: 30});
    await finishWorkout(ctx.db, session.id);

    const day = await getDay(ctx.db, AUG(17), {now: AUG(24)});
    expect(day.plannedSets).toBe(3);
    expect(day.completedSets).toBe(3);
    // 3 x 10 x 30 planned, plus 8 x 30 of bonus work that was genuinely lifted.
    expect(day.volume).toBe(1140);
  });

  it('omits volume rather than reporting zero for a bodyweight-only day', async () => {
    await editPlan(
      ctx.db,
      d => addExercises(setRestDay(d, 2, false), 2, ['pushup']),
      AUG(12),
    );
    const session = await startWorkout(ctx.db, {now: AUG_AT(19, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 12, actualWeight: null});
    }
    await finishWorkout(ctx.db, session.id);

    const day = await getDay(ctx.db, AUG(19), {now: AUG(24)});
    expect(day.status).toBe('completed');
    expect(day.volume).toBeNull();
  });
});

// The gate of this whole phase, expressed as a test.
describe('getDayRange after the plan is edited', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      AUG(10),
    );
  });

  afterEach(() => ctx.close());

  it('leaves past days resolving through the version that was in force then', async () => {
    // Wednesday the 19th: turn Monday into a rest day. Editing on a later day
    // forks a new version rather than mutating the old one.
    await editPlan(ctx.db, d => setRestDay(d, 0, true), AUG(19));

    const days = await getDayRange(
      ctx.db,
      {from: AUG(10), to: AUG(24)},
      {now: AUG(26)},
    );
    const at = (date: number) => days.find(d => d.date === date)!;

    // Before the fork, Monday was a training day, and still is in history.
    expect(at(AUG(10)).status).toBe('missed');
    expect(at(AUG(10)).name).toBe('Push Day');
    expect(at(AUG(17)).status).toBe('missed');
    // After the fork it is a rest day.
    expect(at(AUG(24)).status).toBe('rest');
  });

  it('keeps a finished workout untouched when the day is later renamed', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const before = await getDay(ctx.db, AUG(17), {now: AUG(26)});
    await editPlan(ctx.db, d => renameDay(d, 0, 'Chest Day'), AUG(19));
    const after = await getDay(ctx.db, AUG(17), {now: AUG(26)});

    expect(before.name).toBe('Push Day');
    expect(after).toEqual(before);
  });
});

describe('getDayRange query batching', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG(10)});
    await editPlan(
      ctx.db,
      d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
      AUG(10),
    );
    // Three Mondays of real sessions, so both ranges below have sessions to
    // aggregate and the comparison is like for like.
    for (const monday of [AUG(10), AUG(17), AUG(24)]) {
      const session = await startWorkout(ctx.db, {now: monday + 9 * 3600_000});
      await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
        actualReps: 10,
        actualWeight: 30,
      });
      await finishWorkout(ctx.db, session.id);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ctx.close();
  });

  // Spec 5.4: "Per-date querying is a defect." This is that sentence, asserted.
  it('issues the same number of queries for one day as for a whole year', async () => {
    const spy = jest.spyOn(ctx.db, 'select');

    await getDayRange(ctx.db, {from: AUG(17), to: AUG(17)}, {now: AUG(31)});
    expect(spy).toHaveBeenCalledTimes(4);

    spy.mockClear();
    await getDayRange(
      ctx.db,
      {
        from: new Date(2026, 0, 1).getTime(),
        to: new Date(2026, 11, 31).getTime(),
      },
      {now: AUG(31)},
    );
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('still resolves the whole year correctly', async () => {
    const days = await getDayRange(
      ctx.db,
      {
        from: new Date(2026, 0, 1).getTime(),
        to: new Date(2026, 11, 31).getTime(),
      },
      {now: AUG(31)},
    );
    expect(days).toHaveLength(365);
    expect(days.filter(d => d.status === 'completed')).toHaveLength(3);
    // Before the plan existed there was nothing to adhere to.
    expect(days[0]!.status).toBe('no_plan');
  });
});
