import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  addSet,
  finishWorkout,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {getExerciseHistory} from '@/repositories/historyRepo';
import {createTestDb} from '../helpers/testDb';

// The 10th, 17th and 24th of August 2026 are all Mondays.
const MONDAYS = [10, 17, 24];
const AUG_AT = (day: number, hour: number) =>
  new Date(2026, 7, day, hour).getTime();

describe('getExerciseHistory', () => {
  let ctx: ReturnType<typeof createTestDb>;

  /** Trains the Monday plan, completing every set at the given weight. */
  const train = async (day: number, weight: number, reps = 10) => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(day, 9)});
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        await completeSet(ctx.db, set.id, {
          actualReps: reps,
          actualWeight: exercise.weightApplicable ? weight : null,
        });
      }
    }
    await finishWorkout(ctx.db, session.id);
    return session;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('press','Machine Chest Press','chest','[]','machine','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db, {now: AUG_AT(10, 6)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          addExercises(renameDay(d, 0, 'Push Day'), 0, ['press']),
          0,
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      AUG_AT(10, 6),
    );
  });

  afterEach(() => ctx.close());

  it('returns nothing for an exercise that does not exist', async () => {
    expect(await getExerciseHistory(ctx.db, 'nope')).toBeUndefined();
  });

  it('returns an empty history for an exercise never performed', async () => {
    const history = await getExerciseHistory(ctx.db, 'pushup');
    expect(history!.name).toBe('Push-up');
    expect(history!.weightApplicable).toBe(false);
    expect(history!.progress.sessions).toEqual([]);
    expect(history!.progress.bestSet).toBeNull();
  });

  it('returns the sessions newest first with their sets and volume', async () => {
    await train(10, 25);
    await train(17, 27.5);
    await train(24, 30);

    const history = await getExerciseHistory(ctx.db, 'press');
    expect(history!.name).toBe('Machine Chest Press');
    expect(history!.progress.sessions.map(s => s.volume)).toEqual([
      900, 825, 750,
    ]);
    expect(history!.progress.sessions[0]!.sets).toEqual([
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
      {reps: 10, weight: 30},
    ]);
  });

  it('builds the working weight run and the best figures', async () => {
    await train(10, 25);
    await train(17, 27.5);
    await train(24, 30);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.workingWeights).toEqual([25, 27.5, 30]);
    expect(progress.bestSet).toEqual({reps: 10, weight: 30, volume: 300});
    expect(progress.bestVolume).toBe(900);
  });

  it('leaves out sets that were skipped or never recorded', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await skipSet(ctx.db, sets[1]!.id);
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    // One completed set; the skipped one and the one finish marked skipped are
    // not performances and have nothing to plot.
    expect(progress.sessions).toHaveLength(1);
    expect(progress.sessions[0]!.sets).toEqual([{reps: 10, weight: 30}]);
  });

  it('leaves out a session where the exercise was never performed at all', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await skipSet(ctx.db, set.id);
    }
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions).toEqual([]);
  });

  // Spec 6.2: status is the sole source of truth for whether a set happened.
  // Nothing in the app writes actuals onto a skipped set, so filtering on
  // `actual_reps IS NOT NULL` alone would look identical — until something
  // does. This plants exactly that row and asserts status still decides.
  it('trusts status over any actuals a skipped set is carrying', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    const sets = session.exercises[0]!.sets;
    await completeSet(ctx.db, sets[0]!.id, {actualReps: 10, actualWeight: 30});
    await skipSet(ctx.db, sets[1]!.id);
    await ctx.db.run(
      sql`UPDATE performed_sets SET actual_reps = 99, actual_weight = 99
          WHERE id = ${sets[1]!.id}`,
    );
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions[0]!.sets).toEqual([{reps: 10, weight: 30}]);
  });

  // D3: a bonus set is real work. §24 shows what was done, not what was owed.
  it('includes bonus sets', async () => {
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await addSet(ctx.db, session.exercises[0]!.id);
    const reloaded = await getSessionForDate(ctx.db, AUG_AT(17, 0));
    const bonus = reloaded!.exercises[0]!.sets.find(s => s.isUnplanned)!;
    await completeSet(ctx.db, bonus.id, {actualReps: 8, actualWeight: 32.5});
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions[0]!.sets).toHaveLength(4);
    expect(progress.sessions[0]!.volume).toBe(1160);
    expect(progress.workingWeights).toEqual([32.5]);
  });

  it('returns at most the requested number of sessions, newest first', async () => {
    for (const [i, day] of MONDAYS.entries()) {
      await train(day, 25 + i * 2.5);
    }
    const {progress} = (await getExerciseHistory(ctx.db, 'press', {limit: 2}))!;
    expect(progress.sessions).toHaveLength(2);
    expect(progress.sessions.map(s => s.volume)).toEqual([900, 825]);
  });

  it('merges an exercise performed twice in one session into one entry', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['press']), AUG_AT(11, 6));
    const session = await startWorkout(ctx.db, {now: AUG_AT(17, 9)});
    expect(session.exercises).toHaveLength(2);
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
      }
    }
    await finishWorkout(ctx.db, session.id);

    const {progress} = (await getExerciseHistory(ctx.db, 'press'))!;
    expect(progress.sessions).toHaveLength(1);
    expect(progress.sessions[0]!.sets).toHaveLength(6);
  });

  it('omits volume for a bodyweight exercise', async () => {
    await editPlan(ctx.db, d => addExercises(d, 0, ['pushup']), AUG_AT(11, 6));
    await train(17, 30, 12);

    const {progress} = (await getExerciseHistory(ctx.db, 'pushup'))!;
    expect(progress.sessions[0]!.volume).toBeNull();
    expect(progress.bestSet).toEqual({reps: 12, weight: null, volume: null});
    expect(progress.workingWeights).toEqual([]);
  });
});
