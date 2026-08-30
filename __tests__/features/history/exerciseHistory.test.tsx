import React from 'react';
import {render} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setTargets} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {formatShortDate} from '@/domain/dateLabels';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import {createTestDb} from '../../helpers/testDb';

const mockParams: {exerciseId: string} = {exerciseId: 'press'};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()}),
  useRoute: () => ({params: mockParams}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

// Three of the same weekday, so one plan covers all three sessions.
const WEEKS = [daysAgo(21), daysAgo(14), daysAgo(7)];

describe('ExerciseHistoryScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExerciseHistoryScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  const trainAt = async (date: number, weight: number | null, reps = 10) => {
    const session = await startWorkout(ctx.db, {now: date + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {
        actualReps: reps,
        actualWeight: weight,
      });
    }
    await finishWorkout(ctx.db, session.id);
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
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockParams.exerciseId = 'press';
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  const seedPress = async () => {
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        setTargets(
          addExercises(
            renameDay(d, weekdayOf(WEEKS[0]!), 'Push Day'),
            weekdayOf(WEEKS[0]!),
            ['press'],
          ),
          weekdayOf(WEEKS[0]!),
          0,
          [
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
            {targetReps: 10, targetWeight: 30},
          ],
        ),
      daysAgo(30),
    );
    await trainAt(WEEKS[0]!, 25);
    await trainAt(WEEKS[1]!, 27.5);
    await trainAt(WEEKS[2]!, 30);
  };

  it('says plainly when an exercise has never been performed', async () => {
    mockParams.exerciseId = 'pushup';
    const view = await renderScreen();
    expect(
      await view.findByText(/complete this exercise to start building/i),
    ).toBeTruthy();
  });

  it('names the exercise', async () => {
    await seedPress();
    const view = await renderScreen();
    expect(await view.findByText('Machine Chest Press')).toBeTruthy();
  });

  it('reads the working weight as a run from oldest to newest', async () => {
    await seedPress();
    const view = await renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText('Working weight')).toBeTruthy();
    expect(view.getByText('25.0')).toBeTruthy();
    expect(view.getByText('27.5')).toBeTruthy();
    expect(view.getByText('30.0')).toBeTruthy();
  });

  it('reports the best set and the best volume', async () => {
    await seedPress();
    const view = await renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText('Best set')).toBeTruthy();
    expect(view.getByText('30.0 × 10')).toBeTruthy();
    expect(view.getByText('Best volume')).toBeTruthy();
    // "900 kg" is both the best-volume figure and the newest session's chip.
    expect(view.getAllByText('900 kg').length).toBe(2);
  });

  it('lists each session with its date, volume and sets', async () => {
    await seedPress();
    const view = await renderScreen();
    await view.findByText('Machine Chest Press');
    expect(view.getByText(formatShortDate(WEEKS[2]!))).toBeTruthy();
    expect(view.getByText('30.0×10 · 30.0×10 · 30.0×10')).toBeTruthy();
    expect(view.getByText('750 kg')).toBeTruthy();
  });

  it('omits volume entirely for a bodyweight exercise', async () => {
    await createPlan(ctx.db, {now: daysAgo(30)});
    await editPlan(
      ctx.db,
      d =>
        addExercises(
          renameDay(d, weekdayOf(WEEKS[2]!), 'Push Day'),
          weekdayOf(WEEKS[2]!),
          ['pushup'],
        ),
      daysAgo(30),
    );
    await trainAt(WEEKS[2]!, null, 15);
    mockParams.exerciseId = 'pushup';

    const view = await renderScreen();
    await view.findByText('Push-up');
    expect(view.queryByText('Working weight')).toBeNull();
    expect(view.queryByText('Best volume')).toBeNull();
    expect(view.getByText('15 reps')).toBeTruthy();
  });
});
