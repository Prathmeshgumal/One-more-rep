import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NavigationContainer} from '@react-navigation/native';
import {sql} from 'drizzle-orm';
import {runMigrations} from '@/db/migrate';
import {createPlan, getActivePlan} from '@/repositories/planRepo';
import {ThemeProvider} from '@/theme';
import {DatabaseContextTestProvider} from '@/providers/DatabaseGate';
import {ExercisePickerScreen} from '@/features/plan/ExercisePickerScreen';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({goBack: mockGoBack, navigate: mockNavigate}),
  useRoute: () => ({params: {weekday: 0}}),
}));

describe('ExercisePickerScreen', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let client: QueryClient;

  const renderScreen = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DatabaseContextTestProvider db={ctx.db}>
            <NavigationContainer>
              <ExercisePickerScreen />
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
          VALUES ('bench','Bench Press','chest','[]','barbell','strength',1,0,0),
                 ('fly','Cable Fly','chest','[]','cable','strength',1,0,0),
                 ('pushup','Push-up','chest','[]','body only','strength',0,0,0)`,
    );
    await createPlan(ctx.db);
    client = new QueryClient({
      defaultOptions: {queries: {retry: false, gcTime: 0}},
    });
    mockGoBack.mockClear();
  });

  afterEach(() => {
    client.clear();
    ctx.close();
  });

  it('lists the library', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Bench Press')).toBeTruthy();
    expect(view.getByText('Push-up')).toBeTruthy();
  });

  // Section 26 and the design: bodyweight is flagged where you choose, because
  // that is what decides whether volume ever applies.
  it('flags an exercise that carries no weight', async () => {
    const view = await renderScreen();
    await view.findByText('Push-up');
    expect(view.getByText('No weight')).toBeTruthy();
  });

  it('starts with nothing selected and the button disabled', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    const button = view.getByRole('button', {name: /Add 0 exercises/});
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('counts the selection as it grows', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Bench Press'));
    await fireEvent.press(view.getByText('Cable Fly'));
    expect(view.getByText('2 selected')).toBeTruthy();
    expect(view.getByText('Add 2 exercises')).toBeTruthy();
  });

  it('deselects on a second tap', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Bench Press'));
    await fireEvent.press(view.getByText('Bench Press'));
    expect(view.getByText('0 selected')).toBeTruthy();
  });

  it('adds the selection at 3 x 10 and goes back', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Bench Press'));
    await fireEvent.press(view.getByText('Cable Fly'));
    await fireEvent.press(view.getByText('Add 2 exercises'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());

    const plan = await getActivePlan(ctx.db);
    const day = plan!.days[0]!;
    expect(day.exercises.map(e => e.name)).toEqual(['Bench Press', 'Cable Fly']);
    expect(day.exercises[0]!.sets).toHaveLength(3);
    expect(day.exercises[0]!.sets[0]).toEqual({
      setNumber: 1,
      targetReps: 10,
      targetWeight: null,
    });
  });

  it('narrows the list as the user searches', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'fly',
    );
    await waitFor(() => {
      expect(view.queryByText('Bench Press')).toBeNull();
      expect(view.getByText('Cable Fly')).toBeTruthy();
    });
  });

  // A selection made before searching must survive the filter changing, or
  // building a day across two searches silently loses half of it.
  it('keeps a selection that the current filter hides', async () => {
    const view = await renderScreen();
    await fireEvent.press(await view.findByText('Bench Press'));
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'fly',
    );
    await waitFor(() => {
      expect(view.queryByText('Bench Press')).toBeNull();
    });
    expect(view.getByText('1 selected')).toBeTruthy();
  });
});
