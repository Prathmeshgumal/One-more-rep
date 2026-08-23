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
  finishWorkout,
} from '@/repositories/sessionRepo';
import {addLocalDays, startOfLocalDay, weekdayIndex} from '@/domain/weekday';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {HistoryTimelineScreen} from '@/features/history/HistoryTimelineScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()}),
}));

// Anchored to the real today, so the fixture lands correctly whenever it runs.
const TODAY = startOfLocalDay(Date.now());
const daysAgo = (n: number) => addLocalDays(TODAY, -n);
const weekdayOf = (ms: number) => weekdayIndex(new Date(ms));

describe('HistoryTimelineScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <HistoryTimelineScreen />
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
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  /** A plan from 35 days ago: one training weekday, one rest weekday. */
  const seedPlan = async () => {
    await createPlan(ctx.db, {now: daysAgo(35)});
    await editPlan(
      ctx.db,
      d =>
        setRestDay(
          addExercises(
            renameDay(d, weekdayOf(daysAgo(7)), 'Push Day'),
            weekdayOf(daysAgo(7)),
            ['bench'],
          ),
          weekdayOf(daysAgo(6)),
          true,
        ),
      daysAgo(35),
    );
  };

  const trainOn = async (date: number) => {
    const session = await startWorkout(ctx.db, {now: date + 9 * 3600_000});
    for (const set of session.exercises[0]!.sets) {
      await completeSet(ctx.db, set.id, {actualReps: 10, actualWeight: 30});
    }
    await finishWorkout(ctx.db, session.id);
    return session;
  };

  it('invites a first workout when nothing has been recorded', async () => {
    const view = await renderScreen();
    expect(
      await view.findByText(/completed workouts will appear here/i),
    ).toBeTruthy();
  });

  it('shows the week adherence card', async () => {
    await seedPlan();
    const view = await renderScreen();
    expect(await view.findByText('Adherence')).toBeTruthy();
  });

  it('lists a finished workout with its name and set count', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('1 exercise · 3 of 3 sets')).toBeTruthy();
    expect(view.getByText('Complete')).toBeTruthy();
  });

  it('shows rest days between the workouts', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = await renderScreen();
    expect(await view.findAllByText('Rest day')).not.toHaveLength(0);
  });

  it('leaves out days that had no plan at all', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = await renderScreen();
    await view.findByText('Push Day');
    // Only two weekdays were configured, so five of every seven days are not
    // in the list — an unconfigured day asked nothing of you and says nothing.
    expect(view.queryByText('Nothing recorded')).toBeNull();
  });

  it('reveals older days, and their misses, on request', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = await renderScreen();
    await view.findByText('Push Day');
    // The default window is a fortnight, and the only training day in it was
    // done. Older ones were not.
    expect(view.queryByText('Missed')).toBeNull();

    await fireEvent.press(view.getByText(/show earlier/i));
    await waitFor(() => {
      expect(view.getAllByText('Missed').length).toBeGreaterThan(0);
    });
  });

  it('opens the day detail when a recorded day is tapped', async () => {
    await seedPlan();
    await trainOn(daysAgo(7));

    const view = await renderScreen();
    await view.findByText('Push Day');
    await fireEvent.press(view.getByText('Push Day'));

    expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {date: daysAgo(7)});
  });

  it('opens the calendar from the heading', async () => {
    await seedPlan();
    const view = await renderScreen();
    await view.findByText('Adherence');
    await fireEvent.press(view.getByLabelText(/calendar/i));
    expect(mockNavigate).toHaveBeenCalledWith('HistoryCalendar');
  });
});
