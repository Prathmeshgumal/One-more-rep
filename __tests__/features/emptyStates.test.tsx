import React from 'react';
import {render} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {WorkoutHomeScreen} from '@/features/workout/WorkoutHomeScreen';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {ExerciseHistoryScreen} from '@/features/history/ExerciseHistoryScreen';
import {createTestDb} from '../helpers/testDb';

const mockParams = {exerciseId: 'bench'};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: () => () => {},
  }),
  useRoute: () => ({params: mockParams}),
  useFocusEffect: (cb: () => void) => {
    const React_ = require('react');
    React_.useEffect(cb, []);
  },
}));

/**
 * §40. Every one of these is a state a real user is in on day one, and an
 * empty state that has never been asserted is an empty state that quietly
 * becomes a blank screen.
 */
describe('empty states', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const wrap = (node: React.ReactElement) =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>{node}</NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    // One exercise, never performed, and no plan at all: exactly the state the
    // app is in the first time it is opened.
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('says the week is empty, and what to do about it', async () => {
    const view = await wrap(<PlanWeekScreen />);
    expect(await view.findByText(/your week is empty/i)).toBeTruthy();
  });

  it('points at the Plan tab when there is no plan for today', async () => {
    const view = await wrap(<WorkoutHomeScreen />);
    expect(await view.findByText(/no plan yet/i)).toBeTruthy();
  });

  it('says completed workouts will appear in History', async () => {
    const view = await wrap(<CalendarScreen />);
    expect(
      await view.findByText(/completed workouts will appear here/i),
    ).toBeTruthy();
  });

  it('says what to do to start an exercise history', async () => {
    const view = await wrap(<ExerciseHistoryScreen />);
    expect(
      await view.findByText(/complete this exercise to start building/i),
    ).toBeTruthy();
  });
});
