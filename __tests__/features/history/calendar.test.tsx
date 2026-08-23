import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan} from '@/repositories/planRepo';
import {addExercises, renameDay} from '@/domain/planDraft';
import {
  startWorkout,
  completeSet,
  finishWorkout,
} from '@/repositories/sessionRepo';
import {
  addLocalDays,
  startOfLocalDay,
  startOfLocalMonth,
  weekdayIndex,
} from '@/domain/weekday';
import {formatMonthTitle} from '@/domain/dateLabels';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {CalendarScreen} from '@/features/history/CalendarScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
}));

const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

describe('CalendarScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <CalendarScreen />
            </NavigationContainer>
          </DatabaseContextTestProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );

  beforeEach(async () => {
    ctx = createTestDb();
    await runMigrations(ctx.db);
    await ctx.db.run(
      sql`INSERT INTO exercises (id,name,primary_muscle,secondary_muscles,
            equipment,exercise_type,weight_applicable,is_custom,updated_at)
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0)`,
    );
    // A plan from 60 days ago, training on today's weekday. Training *today*
    // is what makes the fixture land in the month the screen opens on, whatever
    // day of the month the suite happens to run.
    await createPlan(ctx.db, {now: daysAgo(60)});
    await editPlan(
      ctx.db,
      d =>
        addExercises(renameDay(d, weekdayOf(TODAY), 'Push Day'), weekdayOf(TODAY), [
          'bench',
        ]),
      daysAgo(60),
    );
    const session = await startWorkout(ctx.db, {now: TODAY + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);

    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('opens on the current month', async () => {
    const view = await renderScreen();
    expect(await view.findByText(formatMonthTitle(TODAY))).toBeTruthy();
  });

  it('shows the weekday header, Monday first', async () => {
    const view = await renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByLabelText('Monday')).toBeTruthy();
    expect(view.getByLabelText('Sunday')).toBeTruthy();
  });

  it('marks the day that was trained as completed', async () => {
    const view = await renderScreen();
    // The heading renders before the query resolves, so wait on a cell.
    expect(await view.findByLabelText(/Completed$/)).toBeTruthy();
  });

  it('shows the month totals', async () => {
    const view = await renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByText('Workouts')).toBeTruthy();
    expect(view.getByText('Sets')).toBeTruthy();
  });

  it('steps back a month and forward again', async () => {
    const view = await renderScreen();
    await view.findByText(formatMonthTitle(TODAY));

    const previousMonth = addLocalDays(startOfLocalMonth(TODAY), -1);
    await fireEvent.press(view.getByLabelText(/previous month/i));
    await waitFor(() => {
      expect(view.getByText(formatMonthTitle(previousMonth))).toBeTruthy();
    });

    await fireEvent.press(view.getByLabelText(/next month/i));
    await waitFor(() => {
      expect(view.getByText(formatMonthTitle(TODAY))).toBeTruthy();
    });
  });

  it('opens the day detail when a date is tapped', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText(/Completed$/));
    expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {date: TODAY});
  });
});
