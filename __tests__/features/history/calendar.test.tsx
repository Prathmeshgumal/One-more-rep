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

  it('shows the month totals, sets against what was planned', async () => {
    const view = await renderScreen();
    await view.findByText(formatMonthTitle(TODAY));
    expect(view.getByText('Workouts')).toBeTruthy();
    expect(view.getByText('Sets')).toBeTruthy();
    // Against what was planned, not a bare count. The month holds several
    // occurrences of the training weekday and only today's was done, so the
    // denominator is whatever the month asked for -- the point is that there
    // is one.
    expect(await view.findByText(/^3 \/ \d+$/)).toBeTruthy();
  });

  // These moved here when the timeline screen was folded in. The month is the
  // unit throughout now, so the list below the grid describes the same month
  // the grid draws.
  describe('the month, day by day', () => {
    it('reports adherence for the month, not for this week', async () => {
      const view = await renderScreen();
      expect(await view.findByText('Adherence')).toBeTruthy();
      // A real percentage rather than the em dash that means "nothing was
      // planned". The month includes training days that were missed, which is
      // exactly why it is not 100%.
      const percent = await view.findByText(/^\d+%$/);
      expect(percent).toBeTruthy();
      expect(view.queryByText('100%')).toBeNull();
    });

    it('does not repeat the totals it just showed', async () => {
      const view = await renderScreen();
      await view.findByText('Adherence');
      // The grid above already says "1 / 1" and "3 / 3"; the timeline's own
      // "1 of 1 workouts" row would be the same thing twice over.
      expect(view.queryByText(/of 1 workouts/)).toBeNull();
    });

    it('lists a finished workout with its name and set count', async () => {
      const view = await renderScreen();
      expect(await view.findAllByText('Push Day')).not.toHaveLength(0);
      expect(view.getByText('1 exercise · 3 of 3 sets')).toBeTruthy();
      expect(view.getByText('Complete')).toBeTruthy();
    });

    it('opens the day detail from the list, not just the grid', async () => {
      const view = await renderScreen();
      const cards = await view.findAllByText('Push Day');
      // Newest first, so the first card is today's -- the one just finished.
      await fireEvent.press(cards[0]!);
      expect(mockNavigate).toHaveBeenCalledWith('DayDetail', {date: TODAY});
    });

    it('leaves out days that had no plan at all', async () => {
      const view = await renderScreen();
      const cards = await view.findAllByText('Push Day');
      // One weekday is configured, so a month lists at most five days rather
      // than thirty. An unconfigured day asked nothing of you and says
      // nothing here.
      expect(cards.length).toBeLessThanOrEqual(5);
    });

    // The chevrons page the month, which is what "Show earlier" was for.
    it('offers no "show earlier", because the month is the window', async () => {
      const view = await renderScreen();
      await view.findAllByText('Push Day');
      expect(view.queryByText(/show earlier/i)).toBeNull();
    });
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
