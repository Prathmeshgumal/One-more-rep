import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  skipSet,
  getActiveSession,
  getSessionForDate,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseSummaryScreen} from '@/features/workout/ExerciseSummaryScreen';
import {WorkoutCompleteScreen} from '@/features/workout/WorkoutCompleteScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    popToTop: mockPopToTop,
  }),
  useRoute: () => ({params: {exerciseIndex: 0}}),
}));

describe('the workout summaries', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const wrap = (ui: React.ReactElement) =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>{ui}</NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const today = () => {
    const d = new Date();
    return (d.getDay() + 6) % 7;
  };

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0)`,
    );
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
    // Real targets, so set 3 below is a genuine mixed case decided by volume
    // rather than a bodyweight comparison on reps alone.
    await editPlan(ctx.db, d =>
      setTargets(d, today(), 0, [
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
        {targetReps: 10, targetWeight: 30},
      ]),
    );
    await startWorkout(ctx.db);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockPopToTop.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** Records the three bench sets as 10x30, 12x30, 8x32.5 — the design's data. */
  const recordBench = async () => {
    const session = (await getActiveSession(ctx.db))!;
    const [a, b, c] = session.exercises[0]!.sets;
    await completeSet(ctx.db, a!.id, {actualReps: 10, actualWeight: 30});
    await completeSet(ctx.db, b!.id, {actualReps: 12, actualWeight: 30});
    await completeSet(ctx.db, c!.id, {actualReps: 8, actualWeight: 32.5});
  };

  describe('ExerciseSummaryScreen', () => {
    it('reads out every set against its target', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);

      expect(await view.findByText('Bench Press')).toBeTruthy();
      expect(view.getByText('3 of 3 sets recorded')).toBeTruthy();
      expect(view.getByText('even')).toBeTruthy();
      expect(view.getByText('+2 reps')).toBeTruthy();
      // 8 x 32.5 = 260 against 300: heavier but shorter is still below.
      expect(view.getByText('−40 kg vol')).toBeTruthy();
    });

    it('totals the volume and the gap to target', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);
      // 300 + 360 + 260 = 920 against a target of 900.
      expect(await view.findByText('920 kg')).toBeTruthy();
      expect(view.getByText('+20')).toBeTruthy();
    });

    it('reports a skipped set rather than hiding it', async () => {
      const session = (await getActiveSession(ctx.db))!;
      const [a, b, c] = session.exercises[0]!.sets;
      await completeSet(ctx.db, a!.id, {actualReps: 10, actualWeight: 30});
      await skipSet(ctx.db, b!.id);
      await skipSet(ctx.db, c!.id);

      const view = await wrap(<ExerciseSummaryScreen />);
      expect(await view.findByText('1 of 3 sets recorded')).toBeTruthy();
      expect(view.getAllByText('Skipped').length).toBe(2);
    });

    it('moves on to the next exercise', async () => {
      await recordBench();
      const view = await wrap(<ExerciseSummaryScreen />);
      await fireEvent.press(await view.findByText(/Next — Cable Fly/));
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('WorkoutCompleteScreen', () => {
    it('reports the completion percentage of the plan', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      // Three of six planned sets recorded.
      expect(await view.findByText('50')).toBeTruthy();
      expect(view.getByText('% of plan')).toBeTruthy();
    });

    it('breaks the session down against target', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      await view.findByText('50');
      expect(view.getByText('Achieved')).toBeTruthy();
      expect(view.getByText('Exceeded')).toBeTruthy();
      expect(view.getByText('Below')).toBeTruthy();
    });

    it('counts exercises and sets', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('3 / 6')).toBeTruthy();
    });

    it('totals the volume lifted', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('920 kg')).toBeTruthy();
    });

    it('saves the workout and leaves', async () => {
      await recordBench();
      const view = await wrap(<WorkoutCompleteScreen />);
      await fireEvent.press(await view.findByText('Save workout'));

      await waitFor(async () => {
        expect(await getActiveSession(ctx.db)).toBeUndefined();
      });
      expect(mockPopToTop).toHaveBeenCalled();
    });

    // §19: finishing with sets outstanding says so rather than silently
    // recording them as skipped.
    it('warns about what has not been recorded before finishing', async () => {
      const view = await wrap(<WorkoutCompleteScreen />);
      expect(
        await view.findByText(/6 sets not recorded/i),
      ).toBeTruthy();
    });

    it('reads a session that is already finished without offering to save', async () => {
      await recordBench();
      const session = (await getActiveSession(ctx.db))!;
      const {finishWorkout} = require('@/repositories/sessionRepo');
      await finishWorkout(ctx.db, session.id);

      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText('Done')).toBeTruthy();
      expect(view.queryByText('Save workout')).toBeNull();
    });

    // A fully ad-hoc session has no plan to be a percentage of, so the screen
    // must not print a confident 0%.
    it('says so when there was no plan to measure against', async () => {
      await ctx.db.run(sql`DELETE FROM performed_sets`);
      const session = (await getSessionForDate(ctx.db, Date.now()))!;
      expect(session.exercises.every(e => e.sets.length === 0)).toBe(true);

      const view = await wrap(<WorkoutCompleteScreen />);
      expect(await view.findByText(/Nothing was planned/i)).toBeTruthy();
    });
  });
});
