import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  getActiveSession,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {TodayScreen} from '@/features/workout/TodayScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(cb, []);
  },
}));

describe('TodayScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <TodayScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  /** Today's weekday, so the fixture always lands on the day under test. */
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
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  const planToday = async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, today(), 'Push Day'), today(), ['bench', 'fly']),
    );
  };

  it('points at the Plan tab when there is no plan at all', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/No plan yet/i)).toBeTruthy();
  });

  it('says so when today has nothing set up', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    expect(await view.findByText(/not set up/i)).toBeTruthy();
  });

  // §33 and design 07: the one screen with no card stack and no primary
  // button. Recovery is a plan, not an absence of one.
  it('shows a rest day as a rest day', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => setRestDay(d, today(), true));

    const view = await renderScreen();
    expect(await view.findByText('Rest day')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it("lists today's exercises and their targets", async () => {
    await planToday();
    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('Bench Press')).toBeTruthy();
    expect(view.getByText('2 exercises · 6 sets')).toBeTruthy();
    expect(view.getAllByText(/3 × 10/).length).toBe(2);
  });

  it('starts a workout and opens it', async () => {
    await planToday();
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Start workout'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeDefined();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Workout');
  });

  // §20 and design 08: after a process kill, the screen offers to continue
  // rather than starting over and losing what was recorded.
  it('offers to continue a session already in progress', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    await completeSet(ctx.db, session.exercises[0]!.sets[0]!.id, {
      actualReps: 10,
      actualWeight: 30,
    });

    const view = await renderScreen();
    expect(await view.findByText('Continue workout')).toBeTruthy();
    // The count and its label are separate nodes, as the design sets them:
    // a big plate-coloured number over a printed caption.
    expect(view.getByText('1')).toBeTruthy();
    expect(view.getByText('of 6 sets recorded')).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });

  it('can close an in-progress workout from here', async () => {
    await planToday();
    await startWorkout(ctx.db);

    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Finish here'));

    await waitFor(async () => {
      expect(await getActiveSession(ctx.db)).toBeUndefined();
    });
  });

  it('shows the day as done once the workout is finished', async () => {
    await planToday();
    const session = await startWorkout(ctx.db);
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    const view = await renderScreen();
    expect(await view.findByText(/Push Day done/i)).toBeTruthy();
    expect(view.queryByText('Start workout')).toBeNull();
  });
});
