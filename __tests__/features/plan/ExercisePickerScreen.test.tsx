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
import {useLastCreatedExercise} from '@/features/exercises/useLastCreatedExercise';
import {createTestDb} from '../../helpers/testDb';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
    addListener: () => () => {},
  }),
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

  // Found on the device: the back control had been inserted into the row
  // renderer, so every exercise card drew its own chevron. A structural test
  // that only asks "is there a BackButton" cannot see this. Writing the test
  // also turned up why the control is called "Go back" — this screen has a
  // "Back" muscle filter, and both were announced identically.
  it('draws one back control, not one per row', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.getAllByLabelText('Go back')).toHaveLength(1);
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
    expect(day.exercises.map(e => e.name)).toEqual([
      'Bench Press',
      'Cable Fly',
    ]);
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

  // Complaint 5: you had to leave, go to the Exercises tab, create it, come
  // back and find it again.
  it('offers to create the exercise that was searched for and not found', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'Zercher Squat',
    );
    await waitFor(() =>
      expect(view.getByText('Create "Zercher Squat"')).toBeTruthy(),
    );
  });

  it('offers it without a search too', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    expect(view.getByText('Create a new exercise')).toBeTruthy();
  });

  /**
   * It was the list's footer, under four hundred exercises, which is the same
   * as not existing — reported from the phone as "there is no option to add a
   * custom exercise". It belongs above the results, where you can see it
   * without scrolling the whole library.
   */
  it('pins it above the results rather than under them', async () => {
    const view = await renderScreen();
    const first = await view.findByText('Bench Press');
    const create = view.getByLabelText('Create a new exercise');

    expect(first).toBeTruthy();
    expect(create).toBeTruthy();

    // Reading order in the rendered tree, which is the whole complaint: the
    // row existed, it was just four hundred results further down.
    const strings: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        strings.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === 'object' && 'children' in node) {
        walk((node as {children: unknown}).children);
      }
    };
    walk(view.toJSON());

    expect(strings.indexOf('Create a new exercise')).toBeGreaterThan(-1);
    expect(strings.indexOf('Create a new exercise')).toBeLessThan(
      strings.indexOf('Bench Press'),
    );
  });

  it('carries the search text into the editor', async () => {
    const view = await renderScreen();
    await view.findByText('Bench Press');
    await fireEvent.changeText(
      view.getByPlaceholderText('Search exercises'),
      'Zercher Squat',
    );
    await waitFor(() =>
      expect(view.getByText('Create "Zercher Squat"')).toBeTruthy(),
    );
    await fireEvent.press(view.getByText('Create "Zercher Squat"'));

    expect(mockNavigate).toHaveBeenCalledWith('ExerciseEditor', {
      initialName: 'Zercher Squat',
    });
  });

  it('pre-selects an exercise created from here', async () => {
    useLastCreatedExercise.getState().set('bench');
    const view = await renderScreen();
    await waitFor(() => expect(view.getByText('1 selected')).toBeTruthy());
    // Consumed, so coming back later does not select it all over again.
    expect(useLastCreatedExercise.getState().id).toBeNull();
  });
});
