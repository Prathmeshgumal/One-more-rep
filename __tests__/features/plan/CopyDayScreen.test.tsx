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
import {CopyDayScreen} from '@/features/plan/CopyDayScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: jest.fn(), addListener: () => () => {}}),
  useRoute: () => ({params: {weekday: 0}}),
}));

describe('CopyDayScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <CopyDayScreen />
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
    await createPlan(ctx.db);
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, 0, 'Push Day'), 0, ['bench']),
    );
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('describes what is being copied', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Copy from Monday')).toBeTruthy();
    expect(view.getByText('Push Day')).toBeTruthy();
    expect(view.getByText(/1 exercise · 3 sets · targets included/)).toBeTruthy();
  });

  it('offers the other six days and not the source', async () => {
    const view = await renderScreen();
    await view.findByText('Copy from Monday');
    for (const name of ['Tuesday', 'Wednesday', 'Sunday']) {
      expect(view.getByText(name)).toBeTruthy();
    }
    expect(view.queryByLabelText('Copy to Monday')).toBeNull();
  });

  // Copying overwrites, and that should never be a surprise.
  it('warns about a destination that already has exercises', async () => {
    await editPlan(ctx.db, d =>
      addExercises(renameDay(d, 3, 'Leg Day'), 3, ['bench']),
    );
    const view = await renderScreen();
    await view.findByText('Copy from Monday');
    expect(view.getByText("Replaces what's there now")).toBeTruthy();
  });

  it('copies to the selected days and goes back', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Copy to Thursday'));
    await fireEvent.press(view.getByLabelText('Copy to Sunday'));
    await fireEvent.press(view.getByText('Copy to 2 days'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    const plan = await getActivePlan(ctx.db);
    for (const weekday of [3, 6]) {
      expect(plan!.days[weekday]!.customName).toBe('Push Day');
      expect(plan!.days[weekday]!.exercises.map(e => e.name)).toEqual([
        'Bench Press',
      ]);
    }
    // The source is untouched.
    expect(plan!.days[0]!.exercises).toHaveLength(1);
  });

  it('overwrites a rest day without complaint', async () => {
    await editPlan(ctx.db, d => setRestDay(d, 2, true));
    const view = await renderScreen();
    await fireEvent.press(await view.findByLabelText('Copy to Wednesday'));
    await fireEvent.press(view.getByText('Copy to 1 day'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    const plan = await getActivePlan(ctx.db);
    expect(plan!.days[2]!.isRestDay).toBe(false);
    expect(plan!.days[2]!.exercises).toHaveLength(1);
  });

  it('cannot copy to nothing', async () => {
    const view = await renderScreen();
    const button = await view.findByRole('button', {name: /Copy to 0 days/});
    expect(button.props.accessibilityState.disabled).toBe(true);
  });
});
