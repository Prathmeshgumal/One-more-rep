import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, editPlan, getActivePlan} from '@/repositories/planRepo';
import {addExercises, renameDay, setRestDay} from '@/domain/planDraft';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {PlanWeekScreen} from '@/features/plan/PlanWeekScreen';
import {createTestDb} from '../../helpers/testDb';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn(), addListener: () => () => {}}),
}));

describe('PlanWeekScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <PlanWeekScreen />
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

  it('offers to create a plan when there is none', async () => {
    const view = await renderScreen();
    expect(await view.findByText(/Your week is empty/i)).toBeTruthy();
    expect(view.getByText('Create plan')).toBeTruthy();
  });

  it('creates a plan and shows the week', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Create plan'));

    await waitFor(async () => {
      expect(await getActivePlan(ctx.db)).toBeDefined();
    });
    expect(await view.findByText('Your week')).toBeTruthy();
  });

  it('lists all seven days, Monday first', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    await view.findByText('Your week');
    for (const abbr of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(view.getByText(abbr)).toBeTruthy();
    }
  });

  it('shows a named day with its exercise and set counts', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']));

    const view = await renderScreen();
    expect(await view.findByText('Push Day')).toBeTruthy();
    expect(view.getByText('1 exercise · 3 sets')).toBeTruthy();
  });

  // Section 6 and the design: a rest day and an unconfigured day must not look
  // the same, or the week's rhythm is unreadable.
  it('distinguishes a rest day from a day that is not set up', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => setRestDay(d, 2, true));

    const view = await renderScreen();
    expect(await view.findByText('Rest day')).toBeTruthy();
    expect(view.getAllByText('Not set up').length).toBeGreaterThan(0);
  });

  it('summarises the week in the header', async () => {
    await createPlan(ctx.db);
    await editPlan(ctx.db, d => addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']));

    const view = await renderScreen();
    expect(await view.findByText('1 workout day · 1 exercise')).toBeTruthy();
  });

  it('opens a day when its tile is tapped', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Monday, not set up'));
    expect(mockNavigate).toHaveBeenCalledWith('PlanDay', {weekday: 0});
  });

  it('opens plan history from the header', async () => {
    await createPlan(ctx.db);
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Plan history'));
    expect(mockNavigate).toHaveBeenCalledWith('PlanHistory');
  });
});
